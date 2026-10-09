/**
 * Runs once when a server instance starts (Next's instrumentation hook). It puts the key redaction in front of the
 * console (the submission round, section 4: production's error logs carried the RPC's key in full), before anything
 * the instance serves can log.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { guardConsole } = await import("./lib/redact-console");
  guardConsole();
}
