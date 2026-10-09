/**
 * One transaction from real use for each kind of event the contracts emit (the submission round, sections 5 and 6),
 * with how many real use has of each. The test runs share the contracts, so real use is what Postgres says it is
 * (`countedOnchain`, as /stats counts the chain): the counted accounts' ledger wallets, the sets they are registered
 * in, and the questions on the chain with a counted account in them. A kind real use has none of says so; a test's
 * transaction never stands in for one. The indexer is whichever `ENVIO_GRAPHQL_URL` names.
 *
 *   npx tsx --env-file=.env.local scripts/ops/real-use-txs.ts
 */
import { z } from "zod";
import { countedOnchain } from "@/lib/usage/stats";

const EXPLORER = "https://testnet.monadexplorer.com";
const N = 1000;

async function gql<T>(query: string, variables: Record<string, unknown>, shape: z.ZodType<T>): Promise<T> {
  const url = process.env.ENVIO_GRAPHQL_URL;
  if (!url) throw new Error("ENVIO_GRAPHQL_URL is not set");
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query, variables }) });
  const json = (await res.json()) as { data?: unknown; errors?: unknown };
  if (!res.ok || json.errors) throw new Error(`indexer: ${JSON.stringify(json.errors ?? res.status).slice(0, 300)}`);
  return shape.parse(json.data);
}

const Ev = z.object({ tx: z.string(), timestamp: z.number() });
type Row = { kind: string; count: number; latest: z.infer<typeof Ev> | null };

async function main(): Promise<void> {
  const counted = await countedOnchain();
  const ledgers = counted.ledgers.map((l) => l.toLowerCase());
  const dares = counted.dareIds.map((d) => d.toLowerCase());
  const members = await gql(`query M($l: [String!]!, $n: Int!) { Member(where: {ledger: {_in: $l}}, limit: $n) { id } }`, { l: ledgers, n: N }, z.object({ Member: z.array(z.object({ id: z.string() })) }));
  const groups = [...new Set(members.Member.map((m) => (m.id.split("-")[0] ?? "").toLowerCase()).filter(Boolean))];
  const order = `order_by: {block: desc}`;
  const data = await gql(
    `query RealUse($l: [String!]!, $d: [String!]!, $g: [String!]!, $n: Int!) {
      groups: GroupCreatedEvent(where: {groupId: {_in: $g}}, ${order}, limit: $n) { tx timestamp }
      memberships: MemberAddedEvent(where: {ledger: {_in: $l}}, ${order}, limit: $n) { tx timestamp }
      units: DenomCreatedEvent(where: {groupId: {_in: $g}}, ${order}, limit: $n) { tx timestamp }
      created: DareCreatedEvent(where: {dareId: {_in: $d}}, ${order}, limit: $n) { tx timestamp }
      entered: EnteredEvent(where: {dareId: {_in: $d}, participant: {_in: $l}}, ${order}, limit: $n) { tx timestamp }
      resolved: DareResolvedEvent(where: {dareId: {_in: $d}}, ${order}, limit: $n) { tx timestamp }
      arbitrated: DareArbitratedEvent(where: {dareId: {_in: $d}, voided: {_eq: false}}, ${order}, limit: $n) { tx timestamp }
      arbitratedVoid: DareArbitratedEvent(where: {dareId: {_in: $d}, voided: {_eq: true}}, ${order}, limit: $n) { tx timestamp }
      voided: DareVoidedEvent(where: {dareId: {_in: $d}}, ${order}, limit: $n) { tx timestamp }
      expired: DareExpiredEvent(where: {dareId: {_in: $d}}, ${order}, limit: $n) { tx timestamp }
      scored: ScoredEvent(where: {dareId: {_in: $d}, participant: {_in: $l}}, ${order}, limit: $n) { tx timestamp }
      confirmed: Obligation(where: {debtor: {_in: $l}, dare_id: {_is_null: true}}, order_by: {confirmedAt: desc}, limit: $n) { confirmTx confirmedAt }
      minted: Obligation(where: {_or: [{debtor: {_in: $l}}, {creditor: {_in: $l}}], dare_id: {_is_null: false}}, order_by: {confirmedAt: desc}, limit: $n) { confirmTx confirmedAt }
      settled: ClosedEvent(where: {creditor: {_in: $l}, reason: {_eq: "SETTLED"}}, ${order}, limit: $n) { tx timestamp }
      forgiven: ClosedEvent(where: {creditor: {_in: $l}, reason: {_eq: "FORGIVEN"}}, ${order}, limit: $n) { tx timestamp }
      netted: NettedEvent(where: {_or: [{a: {_in: $l}}, {b: {_in: $l}}]}, ${order}, limit: $n) { tx timestamp }
    }`,
    { l: ledgers, d: dares, g: groups, n: N },
    z.object({
      groups: z.array(Ev),
      memberships: z.array(Ev),
      units: z.array(Ev),
      created: z.array(Ev),
      entered: z.array(Ev),
      resolved: z.array(Ev),
      arbitrated: z.array(Ev),
      arbitratedVoid: z.array(Ev),
      voided: z.array(Ev),
      expired: z.array(Ev),
      scored: z.array(Ev),
      confirmed: z.array(z.object({ confirmTx: z.string(), confirmedAt: z.number() })),
      minted: z.array(z.object({ confirmTx: z.string(), confirmedAt: z.number() })),
      settled: z.array(Ev),
      forgiven: z.array(Ev),
      netted: z.array(Ev),
    }),
  );
  const ob = (xs: Array<{ confirmTx: string; confirmedAt: number }>) => xs.map((x) => ({ tx: x.confirmTx, timestamp: x.confirmedAt }));
  const rows: Row[] = [
    ["A set registered (GroupCreated)", data.groups],
    ["A person registered in a set (MemberAdded)", data.memberships],
    ["A unit registered (DenomCreated)", data.units],
    ["A question created with its signed entries (DareCreated)", data.created],
    ["A signed entry (Entered)", data.entered],
    ["Decided by the vote of the people in (DareResolved)", data.resolved],
    ["Decided by arbitrate: the tiebreaker, the final score or the app's ruling standing (DareArbitrated)", data.arbitrated],
    ["Voided by arbitrate (DareArbitrated, voided)", data.arbitratedVoid],
    ["Voided by the vote (DareVoided)", data.voided],
    ["Expired (DareExpired)", data.expired],
    ["A person's score (Scored)", data.scored],
    ["An obligation a question's settlement minted (mintFromDare)", ob(data.minted)],
    ["An obligation confirmed by its debtor (confirm, confirmMany)", ob(data.confirmed)],
    ["Settled (Closed, SETTLED)", data.settled],
    ["Called even (Closed, FORGIVEN)", data.forgiven],
    ["Cancelled out (Netted)", data.netted],
  ].map(([kind, xs]) => {
    const list = xs as Array<z.infer<typeof Ev>>;
    const unique = [...new Map(list.map((e) => [e.tx, e])).values()];
    return { kind: kind as string, count: unique.length, latest: unique[0] ?? null };
  });
  console.log(`real use: ${ledgers.length} counted wallets, ${groups.length} sets, ${dares.length} questions on the chain`);
  for (const r of rows) console.log(`${r.kind}: ${r.latest ? `${r.count} transaction(s); latest ${new Date(r.latest.timestamp * 1000).toISOString()} ${EXPLORER}/tx/${r.latest.tx}` : "none from real use yet"}`);
}

main()
  .then(() => process.exit(0))
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message.split("\n")[0] : "failed");
    process.exit(1);
  });
