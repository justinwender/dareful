/**
 * Delegated signer: signs EIP-712 messages for a user's ledger wallet with the delegated share Dynamic
 * handed the server, so routine ledger actions are silent. Phase 3 deliverable.
 *
 * This is the only module allowed to read the `delegations` table. Nothing here may log, export, or
 * return a share or an API key. Governance wallets are never delegated, and the database refuses to store
 * a delegation for one.
 *
 * Until Phase 3, every ledger action is signed client-side with a prompt and this module refuses to sign.
 */
import type { Hex } from "viem";

export class DelegationUnavailable extends Error {
  constructor(userId: string) {
    super(`no active delegation for user ${userId}; sign client-side with a prompt`);
    this.name = "DelegationUnavailable";
  }
}

export type DelegatedSignRequest = {
  userId: string;
  /** The full EIP-712 payload, already built from `typed-data.ts`. */
  typedData: { domain: object; types: object; primaryType: string; message: object };
};

export async function signWithDelegation(req: DelegatedSignRequest): Promise<Hex> {
  // Phase 3: look up the active delegation row for req.userId, decrypt the share with the application
  // key, sign req.typedData with Dynamic's delegated-signing API, and return the signature.
  throw new DelegationUnavailable(req.userId);
}
