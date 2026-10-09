/**
 * What share of the contracts' transactions came from tests (the final round, section 0). The test suites and the
 * mutation audit run against the production contracts with the production relayer, so the chain's history holds both.
 * Read-only: the indexer's events, grouped by the transaction that emitted them, and Postgres for whose wallets they
 * name. A transaction is
 *
 *   real use   when it names a counted person's wallet, or a question or a set with a counted person in it
 *   testing    when, failing that, it names an account left out of the counts: the owner's and the simulators' own
 *              test accounts, and the development accounts
 *   the seed   when it names only the seed script's people
 *   the suites when it names no account at all: the suites' people are made for a run and removed after it
 *
 * Events only exist for transactions that went through; a reverted one is counted from `chain_writes`, kept since
 * 2026-09-27. The relayer's transaction count is printed beside the total as a check.
 *
 *   npx tsx --env-file=.env.local scripts/ops/chain-tests.ts
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { relayer } from "@/lib/chain/relayer";

type Class = "real" | "testing" | "seed" | "suites";
const RANK: Record<Class, number> = { suites: 0, seed: 1, testing: 2, real: 3 };
const higher = (a: Class, b: Class): Class => (RANK[a] >= RANK[b] ? a : b);

const ENTITIES: Record<string, string> = {
  ConfirmedEvent: "tx debtor creditor groupId",
  ClosedEvent: "tx creditor",
  NettedEvent: "tx a b groupId",
  GroupCreatedEvent: "tx groupId ledgers",
  MemberAddedEvent: "tx groupId ledger",
  DenomCreatedEvent: "tx groupId",
  DareCreatedEvent: "tx dareId groupId creator",
  EnteredEvent: "tx dareId participant",
  DareVoidedEvent: "tx dareId",
  DareResolvedEvent: "tx dareId",
  DareArbitratedEvent: "tx dareId",
  DareExpiredEvent: "tx dareId",
  ScoredEvent: "tx dareId participant",
};
type Row = { tx: string; block?: number; debtor?: string; creditor?: string; a?: string; b?: string; ledger?: string; ledgers?: string[]; creator?: string; participant?: string; groupId?: string; dareId?: string };

async function all(entity: string, fields: string): Promise<Row[]> {
  const url = process.env.ENVIO_GRAPHQL_URL;
  if (!url) throw new Error("ENVIO_GRAPHQL_URL is not set");
  const out: Row[] = [];
  for (let offset = 0; ; offset += 1000) {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: `{ ${entity}(limit: 1000, offset: ${offset}, order_by: {id: asc}) { ${fields} block } }` }) });
    const body = z.object({ data: z.record(z.string(), z.array(z.record(z.string(), z.unknown()))) }).parse(await res.json());
    const page = (body.data[entity] ?? []) as Row[];
    out.push(...page);
    if (page.length < 1000) return out;
  }
}

async function main() {
  const users = await db.select({ ledger: schema.users.ledgerWallet, governance: schema.users.governanceWallet, excluded: schema.users.excludedFromCounts, dynamicUserId: schema.users.dynamicUserId }).from(schema.users);
  const wallet = new Map<string, Class>();
  for (const u of users) {
    const c: Class = !u.excluded ? "real" : u.dynamicUserId?.startsWith("seed:") ? "seed" : "testing";
    for (const w of [u.ledger, u.governance]) if (w) wallet.set(w.toLowerCase(), c);
  }
  const byEntity = new Map<string, Row[]>();
  for (const [entity, fields] of Object.entries(ENTITIES)) byEntity.set(entity, await all(entity, fields));
  const of = (addr: string | undefined): Class => (addr ? (wallet.get(addr.toLowerCase()) ?? "suites") : "suites");

  // A question or a set is as real as the most real person in it.
  const dareClass = new Map<string, Class>();
  const groupClass = new Map<string, Class>();
  const bump = (m: Map<string, Class>, k: string | undefined, c: Class) => k && m.set(k.toLowerCase(), higher(m.get(k.toLowerCase()) ?? "suites", c));
  for (const r of byEntity.get("DareCreatedEvent") ?? []) bump(dareClass, r.dareId, of(r.creator));
  for (const r of [...(byEntity.get("EnteredEvent") ?? []), ...(byEntity.get("ScoredEvent") ?? [])]) bump(dareClass, r.dareId, of(r.participant));
  for (const r of byEntity.get("GroupCreatedEvent") ?? []) for (const l of r.ledgers ?? []) bump(groupClass, r.groupId, of(l));
  for (const r of byEntity.get("MemberAddedEvent") ?? []) bump(groupClass, r.groupId, of(r.ledger));

  const tx = new Map<string, Class>();
  for (const rows of byEntity.values())
    for (const r of rows) {
      let c: Class = "suites";
      for (const a of [r.debtor, r.creditor, r.a, r.b, r.ledger, r.creator, r.participant, ...(r.ledgers ?? [])]) if (a) c = higher(c, of(a));
      if (r.dareId) c = higher(c, dareClass.get(r.dareId.toLowerCase()) ?? "suites");
      if (r.groupId) c = higher(c, groupClass.get(r.groupId.toLowerCase()) ?? "suites");
      tx.set(r.tx.toLowerCase(), higher(tx.get(r.tx.toLowerCase()) ?? "suites", c));
    }
  const counts: Record<Class, number> = { real: 0, testing: 0, seed: 0, suites: 0 };
  for (const c of tx.values()) counts[c] += 1;
  const total = tx.size;
  const pct = (n: number) => `${((100 * n) / Math.max(1, total)).toFixed(1)}%`;
  console.log(`transactions that went through: ${total}`);
  for (const c of ["real", "testing", "seed", "suites"] as const) console.log(`  ${c.padEnd(8)} ${String(counts[c]).padStart(6)}  ${pct(counts[c])}`);
  console.log(`  tests (the suites and testing by hand together): ${counts.suites + counts.testing}  ${pct(counts.suites + counts.testing)}`);

  const reverted = await db.select({ hash: schema.chainWrites.hash }).from(schema.chainWrites).where(eq(schema.chainWrites.status, "reverted"));
  console.log(`reverted, from chain_writes (since 2026-09-27): ${reverted.length}`);
  try {
    const { publicClient, account } = relayer();
    const sent = await publicClient.getTransactionCount({ address: account.address });
    console.log(`the relayer's transaction count: ${sent}`);
  } catch {
    console.log("the relayer's transaction count could not be read");
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message.split("\n")[0] : "failed");
  process.exit(1);
});
