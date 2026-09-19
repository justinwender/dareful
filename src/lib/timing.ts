/**
 * Where the time goes, on the server. `timed("label", fn)` runs `fn` and writes one line per step to the
 * function log: `[timing] label 412ms`. Always on: a line per chain write and per indexer query is cheap, and
 * the question "why did that tap take three seconds" should be answerable from yesterday's logs, not by
 * redeploying with instrumentation. Measure before optimizing.
 */
export async function timed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    console.log(`[timing] ${label} ${Math.round(performance.now() - start)}ms`);
  }
}
