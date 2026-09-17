/**
 * EIP-712 domains and types. These must match the typehash strings in the contracts byte for byte;
 * the seed script and the Foundry tests both exercise the pairing.
 */
import type { Address, TypedDataDomain } from "viem";

export function ledgerDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: "DarefulLedger", version: "1", chainId, verifyingContract };
}

export function daresDomain(chainId: number, verifyingContract: Address): TypedDataDomain {
  return { name: "DarefulDares", version: "1", chainId, verifyingContract };
}

export const ledgerTypes = {
  Confirm: [
    { name: "groupId", type: "bytes32" },
    { name: "denomId", type: "bytes32" },
    { name: "creditor", type: "address" },
    { name: "qty", type: "uint256" },
    { name: "obligationId", type: "bytes16" },
    { name: "unique", type: "bool" },
  ],
  ConfirmMany: [
    { name: "groupIds", type: "bytes32[]" },
    { name: "denomIds", type: "bytes32[]" },
    { name: "creditors", type: "address[]" },
    { name: "qtys", type: "uint256[]" },
    { name: "obligationIds", type: "bytes16[]" },
    { name: "uniques", type: "bool[]" },
  ],
  Close: [
    { name: "id", type: "uint256" },
    { name: "qty", type: "uint256" },
    { name: "reason", type: "uint8" },
    { name: "obligationId", type: "bytes16" },
    { name: "nonce", type: "uint256" },
  ],
  Net: [
    { name: "groupId", type: "bytes32" },
    { name: "denomId", type: "bytes32" },
    { name: "a", type: "address" },
    { name: "b", type: "address" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

export const daresTypes = {
  Create: [
    { name: "dareId", type: "bytes32" },
    { name: "groupId", type: "bytes32" },
    { name: "kind", type: "uint8" },
    { name: "pace", type: "uint8" },
    { name: "termsHash", type: "bytes32" },
    { name: "denomId", type: "bytes32" },
    { name: "range", type: "uint256" },
    { name: "options", type: "uint8" },
    { name: "stalemate", type: "uint8" },
    { name: "resolvesBy", type: "uint64" },
  ],
  Enter: [
    { name: "dareId", type: "bytes32" },
    { name: "stake", type: "uint256" },
    { name: "value", type: "uint256" },
    { name: "confidenceBps", type: "uint16" },
    { name: "stalemate", type: "uint8" },
  ],
  Vote: [
    { name: "dareId", type: "bytes32" },
    { name: "outcome", type: "uint256" },
  ],
} as const;

/** Enum encodings shared with the contracts. */
export const CloseReason = { Settled: 0, Forgiven: 1 } as const;
export const Kind = { Binary: 0, Numeric: 1, Categorical: 2 } as const;
export const Pace = { Dare: 0, Argument: 1 } as const;
export const Stalemate = { Arbitrate: 0, Void: 1 } as const;
export const Status = { Locked: 0, Resolved: 1, Voided: 2, Expired: 3 } as const;
/** Sentinel outcome a quorum may vote for: mints nothing, toll applies. */
export const VOID = (1n << 256n) - 1n;
export const BPS = 10_000n;
