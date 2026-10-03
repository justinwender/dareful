import { unstable_rethrow } from "next/navigation";
import { failureWords, offlineNow } from "./errors";

/**
 * Runs an action and answers words when it throws instead of answering (the field round, 1.6 as amended): a
 * request that never left a phone with no network says so, and anything else says the failure was on our end,
 * since a thrown action tells the browser nothing of why in production. Without this a throw inside a transition
 * reached the error boundary and replaced the screen. The framework's own throws (a redirect, a not-found) pass
 * through untouched: they are how a successful action navigates.
 */
export async function attempt<T>(run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (err) {
    unstable_rethrow(err);
    console.error("an action threw", err instanceof Error ? err.message : err);
    return { error: failureWords(!offlineNow()) };
  }
}
