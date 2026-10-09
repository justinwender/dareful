/**
 * Every daily snapshot already taken gains the day's people and questions (the submission round, section 2): new
 * accounts, new guests, questions asked and questions settled, counted from when each account was made, each guest
 * first joined, each question was sent and each one was decided, by /stats's own definitions (`peopleAndQuestions`),
 * with every excluded account and guest left out. The rest of each snapshot stays as it was taken.
 *
 *   npx tsx --env-file=.env.local scripts/ops/snapshot-people.ts           lists each day, before and after
 *   npx tsx --env-file=.env.local scripts/ops/snapshot-people.ts --apply   writes them
 */
import { refreshSnapshotPeople } from "@/lib/usage/stats";

async function main(): Promise<void> {
  const write = process.argv.includes("--apply");
  const days = await refreshSnapshotPeople(write);
  const show = (n: number | undefined) => (n === undefined ? "-" : String(n));
  for (const d of days)
    console.log(
      `${d.day}  accounts ${show(d.was.accounts)} -> ${d.now.accounts}  guests ${show(d.was.guests)} -> ${d.now.guests}  questions ${show(d.was.questions)} -> ${d.now.questions}  settled ${show(d.was.settled)} -> ${d.now.settled}`,
    );
  console.log(`${days.length} day(s)${write ? " written" : ", nothing written"}`);
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message.split("\n")[0] : "failed");
    process.exit(1);
  });
