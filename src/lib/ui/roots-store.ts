/**
 * When each root was last drawn in this session, and who is waiting for one to land (docs/design.md 9.6, 9.7):
 * a root read within the router's thirty seconds is at hand, so going back to it from a market can hold the old
 * snapshot for the few frames the landing takes and shrink the ink into the row; a root older than that is
 * fetched, and back is a plain fade, since a transition that waits on a fetch would freeze the screen. Pure
 * state, in one place, so the rule has a test.
 */
export const ROOT_FRESH_MS = 30_000;

const seenAt = new Map<string, number>();
const waiters = new Map<string, Array<() => void>>();

/** A root has just rendered (its scroll restored first): anyone waiting on it hears. */
export function rootMounted(path: string, now = Date.now()): void {
  seenAt.set(path, now);
  const w = waiters.get(path) ?? [];
  waiters.delete(path);
  for (const f of w) f();
}

/** Whether a root was drawn recently enough that the router still holds it (9.6). */
export function rootFresh(path: string, now = Date.now(), within = ROOT_FRESH_MS): boolean {
  const t = seenAt.get(path);
  return t !== undefined && now - t < within;
}

/** Resolves the next time the root at `path` mounts. */
export function whenRootMounts(path: string): Promise<void> {
  return new Promise<void>((resolve) => waiters.set(path, [...(waiters.get(path) ?? []), resolve]));
}

/** For tests: forget everything. */
export function resetRoots(): void {
  seenAt.clear();
  waiters.clear();
}
