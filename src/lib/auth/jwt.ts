/**
 * Verification of Dynamic login tokens on the server. The token is an RS256 JWT signed by Dynamic; the public
 * keys come from the environment's JWKS endpoint. Nothing here trusts the client beyond the signature.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";
import { normalizeE164 } from "@/lib/auth/phone";

const VerifiedCredential = z
  .object({
    id: z.string().optional(),
    address: z.string().optional(),
    chain: z.string().optional(),
    format: z.string().optional(),
    wallet_name: z.string().optional(),
    wallet_provider: z.string().optional(),
    email: z.string().optional(),
    // Dynamic serializes most credential keys in snake_case and these three in camelCase (see
    // JwtVerifiedCredentialToJSON in @dynamic-labs/sdk-api-core). Reading the snake_case spelling found
    // nothing, silently, and no phone login ever stored a hash (docs/decisions.md 2026-09-19).
    phoneNumber: z.string().optional(),
    phoneCountryCode: z.string().optional(),
    isoCountryCode: z.string().optional(),
  })
  .passthrough();

const DynamicClaims = z
  .object({
    sub: z.string().min(1),
    email: z.string().optional(),
    scope: z.string().optional(),
    environment_id: z.string().optional(),
    given_name: z.string().optional(),
    family_name: z.string().optional(),
    verified_credentials: z.array(VerifiedCredential).default([]),
  })
  .passthrough();

export type DynamicClaims = z.infer<typeof DynamicClaims>;

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksEnv: string | undefined;

function environmentId(): string {
  const env = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID;
  if (!env) throw new Error("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not set");
  return env;
}

function keySet(env: string) {
  if (!jwks || jwksEnv !== env) {
    jwks = createRemoteJWKSet(new URL(`https://app.dynamic.xyz/api/v0/sdk/${env}/.well-known/jwks`));
    jwksEnv = env;
  }
  return jwks;
}

export class InvalidLoginToken extends Error {
  constructor(reason: string) {
    super(`invalid login token: ${reason}`);
    this.name = "InvalidLoginToken";
  }
}

export async function verifyDynamicToken(token: string): Promise<DynamicClaims> {
  const env = environmentId();
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(token, keySet(env), { algorithms: ["RS256"] }));
  } catch (err) {
    throw new InvalidLoginToken(err instanceof Error ? err.message : "signature");
  }
  const parsed = DynamicClaims.safeParse(payload);
  if (!parsed.success) throw new InvalidLoginToken("unexpected claims shape");
  const claims = parsed.data;
  if (claims.environment_id && claims.environment_id !== env) throw new InvalidLoginToken("wrong environment");
  if (claims.scope && !claims.scope.split(" ").includes("user:basic")) throw new InvalidLoginToken("missing user:basic scope");
  return claims;
}

/** Lowercase EVM addresses the token vouches for. */
export function evmAddressesOf(claims: DynamicClaims): string[] {
  return claims.verified_credentials
    .filter((c) => c.format === "blockchain" && (c.chain === "eip155" || c.chain === "EVM" || c.chain === undefined))
    .map((c) => c.address?.toLowerCase())
    .filter((a): a is string => Boolean(a));
}

/**
 * The E.164 phone number the token vouches for, if phone login was used. Dynamic sends the national number and
 * the country code separately, so the number is the code followed by the national number. Guessing from a
 * shared prefix is wrong where national numbers legitimately begin with the country code's digits (+7 7xx),
 * and a wrong spelling here is a ghost that silently never binds. The bare digits are accepted only if the
 * joined form is not a valid number, in case a token ever carries the code inside the number.
 */
export function phoneOf(claims: DynamicClaims): string | undefined {
  const c = claims.verified_credentials.find((x) => x.format === "phoneNumber" && x.phoneNumber);
  if (!c?.phoneNumber) return undefined;
  const code = c.phoneCountryCode ? c.phoneCountryCode.replace(/[^\d]/g, "") : "";
  const digits = c.phoneNumber.replace(/[^\d]/g, "");
  for (const candidate of [`+${code}${digits}`, `+${digits}`]) {
    try {
      return normalizeE164(candidate);
    } catch {
      // try the next spelling
    }
  }
  // A phone login whose number cannot be read is a ghost that will never bind. Say so where someone will see it.
  console.error("a phone credential was present and could not be normalized", { sub: claims.sub });
  return undefined;
}

/**
 * A first name to offer in the "what do your friends call you" step, when Dynamic happens to know one.
 * Never the local part of an email address: that is an identifier, not a name, and it would end up on
 * share cards in other people's group chats.
 */
export function suggestedNameOf(claims: DynamicClaims): string | undefined {
  const first = claims.given_name?.trim().split(/\s+/)[0];
  return first ? first.slice(0, 40) : undefined;
}
