import { keccak256, stringToHex, type Hex } from "viem";

/** An offchain uuid as the bytes16 the contracts carry in `data` and events. */
export function uuidToBytes16(uuid: string): Hex {
  const hex = uuid.replace(/-/g, "").toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`not a uuid: ${uuid}`);
  return `0x${hex}`;
}

/** The inverse: a bytes16 hex string back to the uuid form Postgres uses. */
export function bytes16ToUuid(hex: string): string {
  const h = hex.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{32}$/.test(h)) throw new Error(`not bytes16: ${hex}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Deterministic onchain group id from the offchain uuid, so registration needs no round trip. */
export function groupOnchainId(groupUuid: string): Hex {
  return keccak256(stringToHex(`dareful:group:${groupUuid}`));
}

/** Deterministic onchain denomination id from the offchain uuid. Group-scoped by construction. */
export function denomOnchainId(denomUuid: string): Hex {
  return keccak256(stringToHex(`dareful:denom:${denomUuid}`));
}

export function hexToBuffer(hex: Hex): Buffer {
  return Buffer.from(hex.slice(2), "hex");
}

export function bufferToHex(b: Buffer): Hex {
  return `0x${b.toString("hex")}`;
}
