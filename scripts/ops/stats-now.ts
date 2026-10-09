/**
 * Every number /stats shows, as it stands, read the way the page reads it (the submission round, sections 3 and 6):
 * each count since launch and over the last seven days, with every excluded account and guest left out, and the chain's
 * counts for real use. Used to record the numbers before the mutation audit and read them again after it, and for the
 * facts sheet's fixed numbers. The chain's counts come from whichever indexer `ENVIO_GRAPHQL_URL` names.
 *
 *   npx tsx --env-file=.env.local scripts/ops/stats-now.ts          a table
 *   npx tsx --env-file=.env.local scripts/ops/stats-now.ts --json   one line of JSON
 */
import { onchainCounts } from "@/lib/ledger/envio";
import { countedOnchain, countStats, PERCENT_STATS, STATS, windowFor } from "@/lib/usage/stats";

async function main(): Promise<void> {
  const now = new Date();
  const [launch, week] = await Promise.all([countStats(windowFor("launch", now)), countStats(windowFor("week", now))]);
  const counted = await countedOnchain();
  const chain = await onchainCounts(counted, counted.questionGroups);
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ at: now.toISOString(), launch, week, chain }));
    return;
  }
  console.log(`read at ${now.toISOString()}`);
  for (const s of STATS) {
    const unit = PERCENT_STATS.has(s.key) ? "%" : "";
    console.log(`${s.label.padEnd(36)} ${String(launch[s.key]).padStart(6)}${unit} since launch  ${String(week[s.key]).padStart(6)}${unit} this week`);
  }
  console.log(`On the chain, from real use: ${chain.obligations} obligations, ${chain.questions} questions, ${chain.people} people, ${chain.sets} sets, ${chain.questionGroups} question groups`);
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message.split("\n")[0] : "failed");
    process.exit(1);
  });
