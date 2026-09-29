/**
 * Keeping the first screen's door warm (docs/decisions.md 2026-09-29, the logo round). The installed app opens on
 * Now, and the server that answers for Now goes to sleep between visits: measured on production, waking it took
 * about 2.7 seconds before a single byte of the page, which no amount of drawing the shell first can hide, since
 * the shell is what that server sends. The scheduler already knocks once a minute, so it also asks for Now's
 * address once, as nobody: no cookie, no secret, and the signed-out screen in reply, which reads nothing. A
 * request a minute is what keeps one instance awake.
 *
 * Like every job behind the scheduler's door it may run twice, late or not at all, and it never fails the tick:
 * a miss costs one slow start and nothing else. Nothing here is a fact about anyone.
 */
export type Warmed = { ok: boolean; ms: number } | null;

export const WARM_TIMEOUT_MS = 5_000;
/** The header that says who is asking, so the visit can be told apart in the logs. It opens nothing. */
export const WARM_HEADER = "x-dareful-warm";

export async function keepWarm(opts: { origin?: string | undefined; fetcher?: typeof fetch } = {}): Promise<Warmed> {
  const origin = opts.origin ?? process.env.NEXT_PUBLIC_APP_URL;
  if (!origin) return null;
  const fetcher = opts.fetcher ?? fetch;
  const started = performance.now();
  try {
    const res = await fetcher(new URL("/", origin), { method: "GET", headers: { [WARM_HEADER]: "1", accept: "text/html" }, cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(WARM_TIMEOUT_MS) });
    // The reply is read to its end, so the render that was asked for is one that finished.
    await res.arrayBuffer().catch(() => undefined);
    return { ok: res.ok, ms: Math.round(performance.now() - started) };
  } catch {
    return null;
  }
}
