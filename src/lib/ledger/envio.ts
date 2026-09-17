/**
 * The only chain reader. Every query is Zod-validated at the boundary. Addresses and ids are lowercase hex
 * on both sides, so rows join with Postgres without normalization.
 */
import { z } from "zod";

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
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: gql, variables }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`indexer responded ${res.status}`);
  const json = (await res.json()) as { data?: unknown; errors?: Array<{ message: string }> };
  if (json.errors?.length) throw new Error(`indexer error: ${json.errors.map((e) => e.message).join("; ")}`);
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
