import type { Obligation } from "envio";

/** Lowercase hex so every address and byte string joins with the Postgres columns directly. */
export const lc = (s: string): string => s.toLowerCase();

/**
 * A bytes16 as the contracts emit it. HyperSync decodes fixed-size bytes right-padded to 32 bytes, so an
 * obligation id arrives as 64 hex characters with sixteen trailing zero bytes. Store the canonical 16 bytes,
 * which is the same 128 bits as the Postgres uuid.
 */
export const bytes16 = (s: string): string => {
  const h = lc(s);
  if (!h.startsWith("0x") || h.length < 34) throw new Error(`not a bytes16: ${s}`);
  return h.slice(0, 34);
};

export const eventId = (e: { chainId: number; block: { number: number }; logIndex: number }): string =>
  `${e.chainId}_${e.block.number}_${e.logIndex}`;

/** Oldest first, then by id for a stable order within a block. */
export function fifo(rows: Obligation[]): Obligation[] {
  return [...rows].sort((x, y) => x.confirmedAt - y.confirmedAt || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}

export type ObligationStore = {
  getWhere: (filter: { debtor: { _eq: string } }) => Promise<Obligation[]>;
  set: (o: Obligation) => void;
};

/** Open fungible obligations on one directed edge, oldest first. */
export async function openEdge(
  store: ObligationStore,
  groupId: string,
  denomId: string,
  debtor: string,
  creditor: string,
): Promise<Obligation[]> {
  const rows = await store.getWhere({ debtor: { _eq: debtor } });
  return fifo(
    rows.filter(
      (o) => o.groupId === groupId && o.denomId === denomId && o.creditor === creditor && !o.unique && o.remaining > 0n,
    ),
  );
}

/**
 * Reduce the open obligations on an edge by `qty`, oldest first, attributing the reduction to the given
 * counter (`settled`, `forgiven`, or `netted`). Throws if the edge cannot absorb it: the chain's balance
 * check makes that impossible, so reaching it means the index has drifted and must stop rather than lie.
 */
export function drain(
  rows: Obligation[],
  qty: bigint,
  counter: "settled" | "forgiven" | "netted",
  at: number,
  store: ObligationStore,
  label: string,
): void {
  let left = qty;
  for (const o of rows) {
    if (left === 0n) break;
    const take = o.remaining < left ? o.remaining : left;
    store.set({
      ...o,
      remaining: o.remaining - take,
      [counter]: o[counter] + take,
      lastClosedAt: at,
    });
    left -= take;
  }
  if (left !== 0n) {
    throw new Error(`${label}: ${left} units could not be attributed to any open obligation`);
  }
}
