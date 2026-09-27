/**
 * What the login token says about an embedded wallet, read on the client without verifying it: the client only
 * uses this to name a wallet of its own to Dynamic, which checks the login itself. The token's credentials are
 * spelled as Dynamic's serializer spells them (`verified_credentials`, snake_case), the shape the server verifies
 * in `src/lib/auth/jwt.ts`; the recorded credential in tests/fixtures is the reference.
 */
export function walletIdFromToken(token: string | null, address: string): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(b64.padEnd(Math.ceil(b64.length / 4) * 4, "="), "base64").toString("utf8");
    const claims = JSON.parse(json) as { verified_credentials?: Array<{ id?: string; address?: string; format?: string }> };
    const vc = (claims.verified_credentials ?? []).find((c) => c.format === "blockchain" && typeof c.address === "string" && c.address.toLowerCase() === address.toLowerCase());
    return typeof vc?.id === "string" && vc.id.length > 0 ? vc.id : null;
  } catch {
    return null;
  }
}
