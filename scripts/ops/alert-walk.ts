/**
 * A walk of the runway's alerts (the ops round, section 1), against production's own readings: every level read now,
 * the database's warning line lowered under today's reading so it is crossed, and the alert watched through its life,
 * told once, held while crossed, cleared when the real line is back, and told again when the lowered one is crossed
 * again. Its alerts live under `walk:` names, never production's, and are removed at the end.
 *
 *   npx tsx --env-file=.env.local scripts/ops/alert-walk.ts           prints what the owner would be told
 *   npx tsx --env-file=.env.local scripts/ops/alert-walk.ts --send    tells him, by OPS_EMAIL and a push to OWNER_USER_IDS
 */
import { like } from "drizzle-orm";
import { db, schema } from "@/db";
import { tellOwner, type Teller } from "@/lib/ops/alerts";
import { LINES } from "@/lib/ops/lines";
import { databaseBytes, percentLevel, readRunway, watchRunway } from "@/lib/ops/runway";
import { flushRpcUsage } from "@/lib/ops/rpc-usage";

const PREFIX = "walk:runway:";

async function main(): Promise<void> {
  const send = process.argv.includes("--send");
  const told: string[] = [];
  const capture: Teller = async (subject, text, push) => {
    told.push(`EMAIL "${subject}"\n${text.split("\n").map((l) => `    ${l}`).join("\n")}\nPUSH "${push.title}: ${push.body}"`);
    return true;
  };
  const teller = send ? tellOwner : capture;
  const now = new Date();
  const levels = await readRunway(now);
  for (const l of levels) console.log(`${l.state.padEnd(7)} ${l.what}: ${l.reading}`);
  const bytes = await databaseBytes();
  const lowered = { ...LINES.database, warnPercent: Math.max(1, Math.floor((100 * bytes) / LINES.database.limitBytes) - 3) };
  const crossed = levels.map((l) => (l.key === "database" ? percentLevel("database", bytes, lowered) : l));
  console.log(`\nThe database's warning line lowered from ${LINES.database.warnPercent}% to ${lowered.warnPercent}%.`);
  const at = (m: number) => new Date(now.getTime() + m * 60_000);
  try {
    const steps: Array<[string, Date, typeof levels]> = [
      ["crossed", at(0), crossed],
      ["still crossed", at(5), crossed],
      ["the real line, recovered", at(10), levels],
      ["crossed again", at(15), crossed],
    ];
    for (const [what, when, ls] of steps) {
      const r = await watchRunway(when, teller, ls, PREFIX);
      console.log(`${what}: told ${r.told.length ? r.told.join(", ") : "nothing"}`);
    }
  } finally {
    await db.delete(schema.opsAlerts).where(like(schema.opsAlerts.key, `${PREFIX}%`));
  }
  if (!send) console.log(`\nWhat the owner would have been told:\n\n${told.join("\n\n")}`);
}

main()
  .then(async () => {
    await flushRpcUsage();
    await db.$client.end();
  })
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message.split("\n")[0] : "failed");
    await db.$client.end();
    process.exit(1);
  });
