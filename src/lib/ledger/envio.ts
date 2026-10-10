/**
 * The only chain reader. Every query is Zod-validated at the boundary. Addresses and ids are lowercase hex
 * on both sides, so rows join with Postgres without normalization.
 */
import { z } from "zod";
import { timed } from "@/lib/timing";
import { noteRefusal } from "@/lib/ops/state";

/** Whether the indexer said no for its rate: HTTP 429, or a rate limit named in its errors. Pure. */
export function indexerRefused(status: number, said: string): boolean {
  return status === 429 || /rate.?limit|too many requests/i.test(said);
}

const EnvioObligation = z.object({
  id: z.string(),
  tokenId: z.string(),
  groupId: z.string(),
  denomId: z.string(),
  debtor: z.string(),
  creditor: z.string(),
  qty: z.string(),
  remaining: z.string(),
  settled: z.string(),
  forgiven: z.string(),
  netted: z.string(),
  unique: z.boolean(),
  confirmedAt: z.number(),
  lastClosedAt: z.number().nullable(),
});
export type EnvioObligation = z.infer<typeof EnvioObligation>;

const FIELDS = "id tokenId groupId denomId debtor creditor qty remaining settled forgiven netted unique confirmedAt lastClosedAt";

async function query<T>(gql: string, variables: Record<string, unknown>, shape: z.ZodType<T>): Promise<T> {
  const url = process.env.ENVIO_GRAPHQL_URL;
  if (!url) throw new Error("ENVIO_GRAPHQL_URL is not set");
  const name = /query (\w+)/.exec(gql)?.[1] ?? "query";
  const res = await timed(`indexer ${name}`, () =>
    fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: gql, variables }),
      cache: "no-store",
    }),
  );
  if (!res.ok) {
    // The hosted endpoint answers 100 queries a minute: a refusal holds its runway line at urgent (the ops round, section 1).
    if (indexerRefused(res.status, "")) void noteRefusal("indexer", "too many queries a minute");
    throw new Error(`indexer responded ${res.status}`);
  }
  const json = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> };
  if (json.errors?.length) {
    const said = json.errors.map((e) => e.message).join("; ");
    if (indexerRefused(res.status, said)) void noteRefusal("indexer", "too many queries a minute");
    throw new Error(`indexer error: ${said}`);
  }
  return shape.parse(json.data);
}

/** PLANNING.md section 10: open edges between two ledger wallets, either direction, any group. */
export async function openBetween(a: string, b: string): Promise<EnvioObligation[]> {
  const data = await query(
    `query OpenBetween($a: String!, $b: String!) {
      Obligation(where: { remaining: { _gt: "0" }, _or: [
        { debtor: { _eq: $a }, creditor: { _eq: $b } },
        { debtor: { _eq: $b }, creditor: { _eq: $a } }
      ] }) { ${FIELDS} }
    }`,
    { a: a.toLowerCase(), b: b.toLowerCase() },
    z.object({ Obligation: z.array(EnvioObligation) }),
  );
  return data.Obligation;
}

/** Every open edge touching one ledger wallet, any group. */
export async function openTouching(a: string): Promise<EnvioObligation[]> {
  const data = await query(
    `query OpenTouching($a: String!) {
      Obligation(where: { remaining: { _gt: "0" }, _or: [ { debtor: { _eq: $a } }, { creditor: { _eq: $a } } ] }) { ${FIELDS} }
    }`,
    { a: a.toLowerCase() },
    z.object({ Obligation: z.array(EnvioObligation) }),
  );
  return data.Obligation;
}

/** Every open edge in one group. Squareness is computed from this, never declared. */
export async function openInGroup(groupOnchainId: string): Promise<EnvioObligation[]> {
  const data = await query(
    `query OpenInGroup($g: String!) {
      Obligation(where: { remaining: { _gt: "0" }, groupId: { _eq: $g } }) { ${FIELDS} }
    }`,
    { g: groupOnchainId.toLowerCase() },
    z.object({ Obligation: z.array(EnvioObligation) }),
  );
  return data.Obligation;
}

/** The indexed state of specific obligations (open or not), by bytes16 id. */
export async function obligationsById(ids: string[]): Promise<Map<string, EnvioObligation>> {
  if (ids.length === 0) return new Map();
  const data = await query(
    `query ByIds($ids: [String!]!) { Obligation(where: { id: { _in: $ids } }) { ${FIELDS} } }`,
    { ids: ids.map((i) => i.toLowerCase()) },
    z.object({ Obligation: z.array(EnvioObligation) }),
  );
  return new Map(data.Obligation.map((o) => [o.id, o]));
}

const EnvioDare = z.object({
  id: z.string(),
  status: z.enum(["LOCKED", "RESOLVED", "VOIDED", "EXPIRED"]),
  outcome: z.string().nullable(),
  votes: z.number().nullable(),
  voided: z.boolean(),
  resolveTx: z.string().nullable(),
  /** Present only when the arbitrator decided it; the hash of the written ruling. */
  rulingHash: z.string().nullable(),
  positions: z.array(z.object({ participant: z.string(), stake: z.string(), value: z.string(), score: z.number().nullable() })),
  edges: z.array(z.object({ id: z.string(), tokenId: z.string(), debtor: z.string(), creditor: z.string(), qty: z.string(), unique: z.boolean(), confirmTx: z.string() })),
});
export type EnvioDare = z.infer<typeof EnvioDare>;

/** A market as the chain recorded it: status, outcome, every position's score, and the edges it minted. */
export async function dareByOnchainId(dareId: string): Promise<EnvioDare | null> {
  const data = await query(
    `query DareById($id: String!) {
      Dare(where: { id: { _eq: $id } }) {
        id status outcome votes voided resolveTx rulingHash
        positions { participant stake value score }
        edges { id tokenId debtor creditor qty unique confirmTx }
      }
    }`,
    { id: dareId.toLowerCase() },
    z.object({ Dare: z.array(EnvioDare) }),
  );
  return data.Dare[0] ?? null;
}

const Ids = z.array(z.object({ id: z.string() }));
const OnchainCounts = z.object({ Obligation: Ids, Dare: z.array(z.object({ id: z.string(), groupId: z.string() })), Member: z.array(z.object({ id: z.string(), ledger: z.string() })) });
/** How many rows of each kind one read asks for; a count that reaches it is said as "or more". */
export const ONCHAIN_COUNT_CAP = 1000;

/**
 * What the contracts hold from real use, counted from the indexer (the field round, 3.1; the final round, section 0):
 * the questions closed onto the chain with someone counted in them, the obligations with a counted person on either
 * side, the counted people registered and the sets they are registered in. The test runs share the contracts, and the
 * chain has no notion of an excluded account, so the indexer is asked only for what Postgres says is real use: the
 * questions by their onchain ids, and the people by their ledger addresses. A question created in a group of its own
 * (the games-and-the-reveal round) is a group too, so groups are counted as sets and as questions' own.
 */
export async function onchainCounts(counted: { dareIds: string[]; ledgers: string[] }, questionGroups: ReadonlySet<string>): Promise<{ obligations: number; questions: number; people: number; sets: number; questionGroups: number }> {
  const data = await query(
    `query OnchainCounts($dares: [String!]!, $ledgers: [String!]!, $n: Int!) {
      Dare(where: {id: {_in: $dares}}, limit: $n) { id groupId }
      Member(where: {ledger: {_in: $ledgers}}, limit: $n) { id ledger }
      Obligation(where: {_or: [{debtor: {_in: $ledgers}}, {creditor: {_in: $ledgers}}]}, limit: $n) { id }
    }`,
    { dares: counted.dareIds.map((d) => d.toLowerCase()), ledgers: counted.ledgers.map((l) => l.toLowerCase()), n: ONCHAIN_COUNT_CAP },
    OnchainCounts,
  );
  return onchainTally(data, questionGroups);
}

/** The counts from what the indexer answered for real use: a member's group is the part of its id before the address; a question's own group is one of `questionGroups`. Pure. */
export function onchainTally(data: { Obligation: Array<{ id: string }>; Dare: Array<{ id: string; groupId: string }>; Member: Array<{ id: string; ledger: string }> }, questionGroups: ReadonlySet<string>): { obligations: number; questions: number; people: number; sets: number; questionGroups: number } {
  const own = new Set(data.Dare.map((d) => d.groupId.toLowerCase()).filter((g) => questionGroups.has(g)));
  const groups = new Set(data.Member.map((m) => (m.id.split("-")[0] ?? "").toLowerCase()).filter((g) => g.length > 0));
  return { obligations: data.Obligation.length, questions: data.Dare.length, people: new Set(data.Member.map((m) => m.ledger.toLowerCase())).size, sets: [...groups].filter((g) => !questionGroups.has(g)).length, questionGroups: own.size };
}
