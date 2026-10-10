/**
 * Every daily snapshot already taken is brought in line with /stats's definitions as they stand (the submission round,
 * section 2; the ops round, section 6): new accounts, new guests, questions asked (without those called off before anyone
 * joined), questions settled, the questions played and how they stand, and the sets that came back for a second
 * question, each counted from when it happened by /stats's own queries (`definedCounts`), with every excluded account and
 * guest left out. The rest of each snapshot stays as it was taken.
 *
 *   npx tsx --env-file=.env.local scripts/ops/snapshot-people.ts           lists each day, before and after
 *   npx tsx --env-file=.env.local scripts/ops/snapshot-people.ts --apply   writes them
 */
import { refreshSnapshotPeople } from "@/lib/usage/stats";

async function main(): Promise<void> {
  const write = process.argv.includes("--apply");
  const days = await refreshSnapshotPeople(write);
  const show = (n: number | undefined) => (n === undefined ? "-" : String(n));
  for (const d of days) {
    const changed = (Object.keys(d.now) as Array<keyof typeof d.now>).filter((k) => d.was[k] !== d.now[k]).map((k) => `${k} ${show(d.was[k])} -> ${d.now[k]}`);
    console.log(`${d.day}  ${changed.length ? changed.join("  ") : "as it was"}`);
  }
  console.log(`${days.length} day(s)${write ? " written" : ", nothing written"}`);
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message.split("\n")[0] : "failed");
    process.exit(1);
  });
