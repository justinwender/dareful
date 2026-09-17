/**
 * Verification of Dynamic login tokens on the server. The token is an RS256 JWT signed by Dynamic; the public
 * keys come from the environment's JWKS endpoint. Nothing here trusts the client beyond the signature.
 */
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { z } from "zod";

const VerifiedCredential = z
  .object({
    id: z.string().optional(),
    address: z.string().optional(),
    chain: z.string().optional(),
    format: z.string().optional(),
    wallet_name: z.string().optional(),
    wallet_provider: z.string().optional(),
    email: z.string().optional(),
    phone_number: z.string().optional(),
    phone_country_code: z.string().optional(),
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

/** The E.164 phone number the token vouches for, if phone login was used. */
export function phoneOf(claims: DynamicClaims): string | undefined {
  const c = claims.verified_credentials.find((x) => x.format === "phoneNumber" && x.phone_number);
  if (!c?.phone_number) return undefined;
  const code = c.phone_country_code ? c.phone_country_code.replace(/[^\d]/g, "") : "";
  const digits = c.phone_number.replace(/[^\d]/g, "");
  return `+${digits.startsWith(code) && code ? digits : code + digits}`;
}

/** A display name to start with. Principle 7: a first name is all anyone types. */
export function suggestedNameOf(claims: DynamicClaims): string | undefined {
  if (claims.given_name) return claims.given_name;
  const email = claims.email ?? claims.verified_credentials.find((c) => c.format === "email")?.email;
  if (email) return email.split("@")[0];
  return undefined;
}
