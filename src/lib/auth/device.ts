/**
 * What this device can do for the person the session says is here. Pure, so the rule has a test: the 2A
 * version of this decision was one line inside a click handler, it called every state "still setting up", and
 * two of four real accounts were stuck behind it.
 */
export type Me = { dynamicUserId: string; ledgerWallet: string; governanceWallet: string };

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
