/**
 * Accounts made with Dynamic's test sign-ins, left out of every count (pre-submission bug fixes 1, section 3). A new one
 * is left out when it is made (`isTestSignIn` in src/app/api/session/route.ts); this finds those made before. Each
 * account's sign-in is read from Dynamic (`DYNAMIC_API_TOKEN`, read-only): the record's email and phone, which the list
 * answers with. Addresses and numbers stay inside this process: only ids, when each account was made and whether it is
 * already left out are printed.
 *
 *   npx tsx --env-file=.env.local scripts/ops/test-sign-ins.ts           lists them
 *   npx tsx --env-file=.env.local scripts/ops/test-sign-ins.ts --apply   leaves them out of every count
 */
import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { isTestEmail, isTestPhone } from "@/lib/auth/test-sign-in";

const Listed = z.object({
  count: z.number(),
  users: z.array(z.object({ id: z.string(), email: z.string().nullish(), phoneNumber: z.string().nullish() }).passthrough()),
});

/** Every user in the environment, a page at a time. */
async function dynamicUsers(): Promise<z.infer<typeof Listed>["users"]> {
  const env = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  const token = process.env.DYNAMIC_API_TOKEN;
  if (!env || !token) throw new Error("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID and DYNAMIC_API_TOKEN are needed");
  const out: z.infer<typeof Listed>["users"] = [];
  for (let offset = 0; ; offset += 100) {
    const res = await fetch(`https://app.dynamicauth.com/api/v0/environments/${env}/users?limit=100&offset=${offset}`, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Dynamic answered ${res.status}`);
    const page = Listed.parse(await res.json());
    out.push(...page.users);
    if (page.users.length < 100 || out.length >= page.count) return out;
  }
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const listed = await dynamicUsers();
  // A phone sign-in's number is the record's, written as Dynamic writes it ("+15551234242"); `isTestPhone` reads any spelling.
  const tests = new Set(listed.filter((u) => isTestEmail(u.email) || isTestPhone(u.phoneNumber)).map((u) => u.id));
  console.log(`Dynamic holds ${listed.length} users; ${tests.size} signed in with a test sign-in.`);
  if (tests.size === 0) return;
  const rows = await db.select({ id: schema.users.id, dyn: schema.users.dynamicUserId, at: schema.users.createdAt, excluded: schema.users.excludedFromCounts }).from(schema.users).where(inArray(schema.users.dynamicUserId, [...tests]));
  for (const r of rows.sort((a, b) => a.at.getTime() - b.at.getTime())) console.log(`${r.id}  made ${r.at.toISOString().slice(0, 16)}Z  ${r.excluded ? "already left out" : "counted"}`);
  console.log(`${tests.size - rows.length} of them have no account here (signed in with Dynamic, never finished the name step).`);
  const counted = rows.filter((r) => !r.excluded).map((r) => r.id);
  if (!apply) {
    console.log(counted.length ? `\n${counted.length} counted. Run again with --apply to leave them out.` : "\nNone counted.");
    return;
  }
  if (counted.length) await db.update(schema.users).set({ excludedFromCounts: true }).where(inArray(schema.users.id, counted));
  console.log(`\nLeft out: ${counted.length}.`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
