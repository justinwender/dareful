/**
 * What this device can do for the person the session says is here. Pure, so the rule has a test: the 2A
 * version of this decision was one line inside a click handler, it called every state "still setting up", and
 * two of four real accounts were stuck behind it.
 */
import { WORDS } from "@/lib/ui/errors";

export type Me = { dynamicUserId: string; ledgerWallet: string; governanceWallet: string; /** Pass the phone is on (3.45): the server holds a share of the ledger wallet, so a device without the login can still act. */ passThePhone?: boolean };

export type DeviceState =
  /** The SDK has not said anything yet. Say nothing; never a refusal. */
  | "checking"
  /** Both keys are in reach. */
  | "ready"
  /** A Dareful session and no Dynamic login in this runtime. The ordinary state of a second device. */
  | "signed-out"
  /** Dynamic is logged in as somebody else. The login bootstrap swaps the session to match it. */
  | "other-account"
  /** The right Dynamic login, given time, and the recorded keys never appeared. Permanent until they sign in again. */
  | "keys-missing";

export function deviceState(input: { me: Me | null; sdkHasLoaded: boolean; sdkUserId: string | null; addresses: readonly string[]; graceOver: boolean }): DeviceState {
  const { me, sdkHasLoaded, sdkUserId, addresses, graceOver } = input;
  if (!me || !sdkHasLoaded) return "checking";
  if (!sdkUserId) return "signed-out";
  if (sdkUserId !== me.dynamicUserId) return "other-account";
  const have = new Set(addresses.map((a) => a.toLowerCase()));
  if (have.has(me.ledgerWallet.toLowerCase()) && have.has(me.governanceWallet.toLowerCase())) return "ready";
  return graceOver ? "keys-missing" : "checking";
}

/** A user agent reduced to the one thing a sign-in problem turns on. Nothing finer is kept. */
export function platformOf(userAgent: string | null): "ios" | "android" | "desktop" | "other" {
  const ua = userAgent ?? "";
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Macintosh|Windows NT|X11|CrOS/.test(ua)) return "desktop";
  return "other";
}

/**
 * Whether the server should be asked to sign instead of the device (docs/design.md 3.45; 3.41 amended
 * 2026-09-28): only on a device without the login (never the phone that holds it), only with pass the phone on,
 * only for a named routine action, and only for the ledger wallet. Pure, so the rule has a test.
 */
export function serverMaySign(input: { via: boolean; state: DeviceState; me: Me | null; address: string }): boolean {
  return input.via && input.state === "signed-out" && input.me?.passThePhone === true && input.address.toLowerCase() === input.me.ledgerWallet.toLowerCase();
}

/** The sentence for a login whose keys never arrive: a failure that waiting will not fix (Principle 9). */
export const KEYS_MISSING_WORDS = "Something's wrong with your sign-in on this device, and waiting won't fix it. Sign in again from the top of the screen. Nothing was sent.";

/**
 * What a tap that needs a signature says when this device ends up unable to make one (the field round, 1.6 and
 * the owner's day-31 check): Dynamic ends its login thirty days after the first sign-in whatever the Dareful
 * cookie says, so a person still signed in to Dareful finds a vote asking for one fresh sign-in in its place,
 * and if they leave that step the words are the table's for a signed-out person. Pure.
 */
export function signerFailure(state: DeviceState): string {
  return state === "keys-missing" ? KEYS_MISSING_WORDS : WORDS.signedOut;
}

/**
 * Whether a tap that opened the sign-in step should stop waiting for it (pure): the step was opened, it is closed
 * again, the device still holds no login, and a moment has passed for the step to have drawn at all. Without
 * this a person who closed the step watched the control run for three minutes.
 */
export function signInAbandoned(input: { opened: boolean; authOpen: boolean; state: DeviceState; sinceOpenedMs: number }): boolean {
  return input.opened && !input.authOpen && (input.state === "signed-out" || input.state === "other-account") && input.sinceOpenedMs >= 1500;
}
