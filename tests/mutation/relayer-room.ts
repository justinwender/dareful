/**
 * The mutation runner's one window onto the relayer (the submission round, section 3), run as its own process so the
 * runner never opens a connection itself:
 *
 *   npx tsx --env-file=.env.local tests/mutation/relayer-room.ts balance          the relayer's balance, in wei
 *   npx tsx --env-file=.env.local tests/mutation/relayer-room.ts ops "<subject>"  the line on stdin to OPS_EMAIL
 *   npx tsx --env-file=.env.local tests/mutation/relayer-room.ts ops --dry "..."  the same, said and not sent
 *
 * The balance is read on whatever `MONAD_RPC_URL` the audit runs with (never production's own key: the runner says so).
 * The email goes out through the app's own ops line (`sendOps`); with no `OPS_EMAIL` on this machine it goes to the
 * owner's sign-in address, read from Dynamic for the first id in `OWNER_USER_IDS` and never printed, from
 * `EMAIL_FROM` or the app's own domain.
 */
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { relayer } from "@/lib/chain/relayer";
import { emailOfDynamicUser, sendOps } from "@/lib/notify/channels";

async function ownerAddress(): Promise<string | null> {
  const id = (process.env.OWNER_USER_IDS ?? "").split(",")[0]?.trim();
  const env = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  const token = process.env.DYNAMIC_API_TOKEN;
  if (!id || !env || !token) return null;
  const [u] = await db.select({ dynamicUserId: schema.users.dynamicUserId }).from(schema.users).where(eq(schema.users.id, id)).limit(1);
  if (!u || u.dynamicUserId.includes(":")) return null;
  const res = await fetch(`https://app.dynamicauth.com/api/v0/environments/${env}/users/${u.dynamicUserId}`, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
  return res.ok ? emailOfDynamicUser(await res.json()) : null;
}

async function main(): Promise<void> {
  const [what, ...rest] = process.argv.slice(2);
  if (what === "balance") {
    const { account, publicClient } = relayer();
    console.log((await publicClient.getBalance({ address: account.address })).toString());
    return;
  }
  if (what === "ops") {
    const dry = rest[0] === "--dry";
    const subject = (dry ? rest.slice(1) : rest).join(" ");
    const text = readFileSync(0, "utf8");
    process.env.OPS_EMAIL ??= (await ownerAddress()) ?? undefined;
    process.env.EMAIL_FROM ??= "Dareful <ops@dareful.app>";
    if (!process.env.OPS_EMAIL) return console.log("off: no OPS_EMAIL here and no owner's address to read");
    if (dry) return console.log(`would send "${subject}" (${text.length} characters) to the owner's address`);
    console.log((await sendOps(subject, text)) ? "sent" : "not sent");
    return;
  }
  throw new Error("say balance or ops");
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message.split("\n")[0] : "failed");
    process.exit(1);
  });
