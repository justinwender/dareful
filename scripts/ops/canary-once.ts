/**
 * One canary run from this machine against production's own systems (the ops round, section 4): the shared database, the
 * relayer, the model API and the hosted indexer, as /api/canary runs it every six hours once deployed. For a walk, and
 * for the owner to run one by hand. Prints the steps, their times and the transactions; never a key or an address of a
 * person.
 *
 *   ENVIO_GRAPHQL_URL=<the hosted endpoint> npx tsx --env-file=.env.local scripts/ops/canary-once.ts
 *
 * Node's --env-file never overrides a variable already set, so the hosted endpoint given on the line wins over the local
 * indexer in .env.local. The run spends the relayer's MON (one `create` and one `resolve`, about 1M gas).
 */
import { db } from "@/db";
import { flushRpcUsage } from "@/lib/ops/rpc-usage";
import { canaryOff, runCanary } from "@/lib/ops/canary";

async function main(): Promise<void> {
  const off = canaryOff();
  if (off) throw new Error(`the canary is off: ${off}`);
  const endpoint = new URL(process.env.ENVIO_GRAPHQL_URL ?? "http://localhost");
  console.log(`indexer: ${endpoint.hostname}`);
  const r = await runCanary({ mnemonic: process.env.CANARY_MNEMONIC as string });
  console.log(`run ${r.id}: ${r.ok ? "passed" : `failed at ${r.step}: ${r.error}`}`);
  for (const s of r.steps) console.log(`  ${s.step.padEnd(9)} ${(s.ms / 1000).toFixed(1)}s`);
  for (const t of r.txs) console.log(`  ${t.step}: ${t.hash}`);
  await flushRpcUsage();
}

main()
  .then(() => db.$client.end())
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message.split("\n")[0] : "failed");
    await db.$client.end();
    process.exit(1);
  });
