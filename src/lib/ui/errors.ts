import { browserSaysOffline } from "./connection";
/**
 * The words for what went wrong, by cause (the field round, 2026-10-02, 1.6): one table, read by the actions on
 * the server and by the controls in the browser, so the same failure says the same thing everywhere. Each one
 * says what happened and what to do, as a statement (docs/design.md 5.1); "Try again" inside the words is what
 * makes the summary block draw its own Try again, so a failure a retry cannot put right never says it.
 *
 * A write that is still going is never shown failed: the control keeps its runner and says so, because the
 * request may land after the words, and a tap again would send it twice.
 */
export const WORDS = {
  /** The phone has no network: nothing was sent, so trying again once it is back is safe. */
  offline: "You’re offline. Try again once you’re back.",
  /** A screen asked for and not answered in ten seconds; asking again changes nothing. */
  readTimeout: "That’s taking longer than it should. Try again.",
  /** A write past three seconds; it is still on its way, and nothing here offers a second send. */
  writeStillGoing: "Still going. This one takes a few seconds.",
  /** The server answered with a failure of its own, or threw; a minute later is a different request. */
  server: "Something broke on our end. Try again in a minute.",
  /** The session is gone: the request reached the server as nobody. */
  signedOut: "You’ve been signed out. Sign in to finish this.",
  /** The thing changed under the person (closed, decided, taken) between the screen and the tap; the screen is read again. */
  changed: "This changed while you were on it. Here’s the latest.",
  /** A rate limit: the next try is a minute away. */
  tooMany: "Too many tries. Give it a minute.",
} as const;

/** "Only JP can close this one.": the one person who may, by first name, and the verb the control carried. */
export function notAllowed(firstName: string, verb: string): string {
  return `Only ${firstName} can ${verb} this one.`;
}

/**
 * The words for a request that threw in the browser rather than answering: a phone with no network gets the
 * offline words, since nothing was sent; anything else is the server's, since what the phone can read of a thrown
 * action in production is nothing but that it threw.
 */
export function failureWords(online: boolean): string {
  return online ? WORDS.server : WORDS.offline;
}

/** Whether the browser says it is offline right now, unless a request on this page has shown that wrong; on the server, never. */
export function offlineNow(): boolean {
  return browserSaysOffline();
}
