/**
 * Where the time goes, in the browser. `mark("label")` returns a function to call when the step ends; the
 * duration goes to the console at debug level and onto the Performance timeline (visible in any profiler and
 * readable with `performance.getEntriesByType("measure")`). Measure before optimizing: the slow steps in this
 * app are other people's round trips, and which one dominates is not guessable.
 */
export function mark(label: string): () => void {
  if (typeof performance === "undefined") return () => {};
  const start = performance.now();
  return () => {
    const ms = Math.round(performance.now() - start);
    try {
      performance.measure(`dareful ${label}`, { start, duration: ms });
    } catch {
      // Older engines lack the options form; the console line below is enough.
    }
    console.debug(`[timing] ${label}: ${ms}ms`);
  };
}
