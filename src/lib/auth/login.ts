/**
 * What a verified login means, as a pure decision, so it can be tested without a Dynamic token. The inputs
 * are all things the server knows for itself: the account row if there is one, the embedded wallet addresses
 * the signed token vouches for (in the token's order), and the name the person typed, if any.
 */
export const PLACEHOLDER_NAME = "Friend";

export type ExistingAccount = { ledgerWallet: string; governanceWallet: string; displayName: string };

export type LoginDecision =
  | { kind: "session" }
  | { kind: "rename"; displayName: string }
  | { kind: "create"; ledgerWallet: string; governanceWallet: string; displayName: string }
  | { kind: "need-wallets"; have: number }
  | { kind: "need-name" }
  | { kind: "refuse"; reason: string };

export function decideLogin(input: { existing: ExistingAccount | null; vouched: string[]; displayName?: string }): LoginDecision {
  const vouched = Array.from(new Set(input.vouched.map((a) => a.toLowerCase())));
  const name = input.displayName?.trim();
  const { existing } = input;
  if (existing) {
    // The pairing is permanent (the ledger contract enforces the same rule). The login must still vouch for
    // the recorded pair; whatever else it vouches for (an orphan wallet from an old bug) is ignored.
    if (!vouched.includes(existing.ledgerWallet.toLowerCase()) || !vouched.includes(existing.governanceWallet.toLowerCase())) {
      return { kind: "refuse", reason: "wallets do not match this account" };
    }
    if (existing.displayName === PLACEHOLDER_NAME) return name ? { kind: "rename", displayName: name } : { kind: "need-name" };
    return { kind: "session" };
  }
  // A new person. Wallets are counted from the signed token, never from the client, and never created for an
  // account that already exists: that is what made two extra wallets on every new device.
  const [ledgerWallet, governanceWallet] = vouched;
  if (!ledgerWallet || !governanceWallet) return { kind: "need-wallets", have: vouched.length };
  if (!name) return { kind: "need-name" };
  // Two fresh embedded wallets are interchangeable until one is recorded, so the server assigns them.
  return { kind: "create", ledgerWallet, governanceWallet, displayName: name };
}
