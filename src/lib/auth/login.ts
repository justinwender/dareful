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
  /** `refused`: what was typed is an identifier, not a name; the step stays up with the refusal at the field, and nothing is stored under it. Absent when nothing was typed. */
  | { kind: "need-name"; refused?: true }
  | { kind: "refuse"; reason: string };

/**
 * What is not a name (docs/decisions.md 2026-09-19: the local part of an email address is an identifier, and it
 * was landing on share cards in other people's group chats): an address or a tag (an "@" or a "+" anywhere), a
 * phone number (digits and phone punctuation only, five or more), or a handle (one token with dots or
 * underscores inside it, "justin.wender", "dana_q"). A dot at the end ("J.R.") or a space ("Dr. K") is not a
 * handle, and a hyphen or an apostrophe ("Mary-Jane", "D’Arcy") is a name's own. One rule at every door: the
 * sign-up step, the rename, and the link page's "Your name".
 */
export function isIdentifier(name: string): boolean {
  const n = name.trim();
  if (/[@+]/.test(n)) return true;
  if (/^[\d\s().-]{5,}$/.test(n)) return true;
  return /^[\p{L}\d]+(?:[._][\p{L}\d]+)+$/u.test(n);
}

/**
 * Whether a stored name is one the person gave: not the placeholder, and not an identifier (the Phase 1 build
 * stored an email's local part, and nothing re-asked it). An account whose name is not settled is asked
 * "What do your friends call you?" once at its next login on the phone that holds it; the session's facts and
 * the login's decision read this one rule, so they never disagree about whether the step is owed.
 */
export function nameSettled(displayName: string): boolean {
  return displayName !== PLACEHOLDER_NAME && !isIdentifier(displayName);
}

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
    if (nameSettled(existing.displayName)) return { kind: "session" };
    // Asked once. A typed identifier is refused and never stored, so the ask does not come back on every load.
    return !name ? { kind: "need-name" } : isIdentifier(name) ? { kind: "need-name", refused: true } : { kind: "rename", displayName: name };
  }
  // A new person. Wallets are counted from the signed token, never from the client, and never created for an
  // account that already exists: that is what made two extra wallets on every new device.
  const [ledgerWallet, governanceWallet] = vouched;
  if (!ledgerWallet || !governanceWallet) return { kind: "need-wallets", have: vouched.length };
  if (!name) return { kind: "need-name" };
  // A typed address, tag, number or handle is not a name: no account is made under it.
  if (isIdentifier(name)) return { kind: "need-name", refused: true };
  // Two fresh embedded wallets are interchangeable until one is recorded, so the server assigns them.
  return { kind: "create", ledgerWallet, governanceWallet, displayName: name };
}

/** How this login was made, for the count (the first-contact round adds Google): the phone, an email, Google, or something else. */
export function loginMethod(claims: { email?: string; verified_credentials: Array<{ format?: string } & Record<string, unknown>> }): "phone" | "email" | "google" | "other" {
  if (claims.verified_credentials.some((c) => c.format === "oauth" && c.oauth_provider === "google")) return "google";
  if (claims.verified_credentials.some((c) => c.format === "phoneNumber" && typeof c.phoneNumber === "string" && c.phoneNumber.length > 0)) return "phone";
  return claims.email ? "email" : "other";
}
