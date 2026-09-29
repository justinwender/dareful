/**
 * Where a cold start's time goes, as the page itself can see it (docs/decisions.md 2026-09-29; docs/testing.md,
 * the logo round): an instrument, read from "Measure the screen", that leaves with it. Every figure is
 * milliseconds from the moment the page began to load, which on the installed app is a moment after the tap on
 * the icon: the launch image covers what comes before, and only a screen recording can time that part. Pure.
 */
export const COLD_MARKS = {
  /** The first screen's shell has painted and the opening's two fades begin (11.5). */
  shell: "dareful:shell",
  /** Now's content arrived into the shell and began to fade in. */
  content: "dareful:content",
  /** The scripts have loaded and the screen answers to a touch. */
  live: "dareful:live",
  /** The sign-in's own code has finished starting, which is what approving anything waits for. */
  sdk: "dareful:sdk",
} as const;

/** The switch the instrument sets to open without the count, so the two can be timed against each other. */
export const TALLY_KEY = "dareful.tally";

export type ColdStart = {
  /** The first byte of the page arrived. */
  firstByte: number | null;
  /** The browser's own first paint of anything with content. */
  firstPaint: number | null;
  shell: number | null;
  content: number | null;
  live: number | null;
  sdk: number | null;
  /** The server's own share of the content, as it timed itself: the account's row, then Now. */
  server: { session: number; now: number } | null;
  /** Whether the count was drawn this time. */
  counted: boolean;
};

/** The server's two figures, as the content carries them ("session:45,now:612"). */
export function serverTimes(raw: string | null | undefined): ColdStart["server"] {
  const m = /^session:(\d+),now:(\d+)$/.exec(raw ?? "");
  return m ? { session: Number(m[1]), now: Number(m[2]) } : null;
}

const ms = (n: number | null): string => (n === null ? "not seen" : `${Math.round(n)}ms`);

/** The reading, as rows for the instrument. What was never seen says so rather than showing a nought. */
export function coldStartRows(c: ColdStart): Array<[string, string]> {
  const rows: Array<[string, string]> = [
    ["opening", c.counted ? "counted" : "without the count"],
    ["first byte", ms(c.firstByte)],
    ["first paint", ms(c.firstPaint)],
    ["shell painted, fades begin", ms(c.shell)],
    ["content arrived", ms(c.content)],
    ["screen answers", ms(c.live)],
    ["sign-in ready", ms(c.sdk)],
  ];
  if (c.server) rows.push(["server: account, then Now", `${c.server.session}ms, ${c.server.now}ms`]);
  if (c.shell !== null && c.content !== null) rows.push(["content after shell", `${Math.round(c.content - c.shell)}ms`]);
  return rows;
}

/** How long something took, beside what it answered. */
export async function timed<T>(run: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const value = await run();
  return [value, Math.round(performance.now() - start)];
}
