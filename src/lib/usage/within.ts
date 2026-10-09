/**
 * A read with a time limit (the touch-ups round, section 1): the owner's page reads each of its sections on its own,
 * and a section that has not come back in its time says so on its own line instead of holding the page. The read
 * itself is not stopped; the page just stops waiting for it.
 */
export class TookTooLong extends Error {
  constructor(ms: number) {
    super(`took longer than ${ms}ms`);
    this.name = "TookTooLong";
  }
}

/** Each section's time: the counts are forty queries in two windows; the rest are one read each, from a node, the indexer or a table. */
export const SECTION_LIMIT_MS = { counts: 10_000, relayer: 6_000, chain: 6_000, days: 6_000 } as const;

/** The promise's value, or `TookTooLong` once `ms` have passed, whichever is first. */
export function within<T>(ms: number, p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clock = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TookTooLong(ms)), ms);
  });
  return Promise.race([p, clock]).finally(() => clearTimeout(timer));
}
