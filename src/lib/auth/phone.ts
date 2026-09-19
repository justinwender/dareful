import { createHmac } from "node:crypto";
import { parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js";

/**
 * Salted, deterministic, irreversible hash of a phone number. PHONE_HASH_SALT is permanent: once one hash is
 * stored it can never change. The same is true of the normalization below, because a different spelling of one
 * number is a different hash: it was settled before the first hash was stored (docs/decisions.md 2026-09-18).
 * The raw number is used once, here, and never stored or logged.
 */
export function hashPhone(raw: string, defaultRegion?: string): Buffer {
  const salt = process.env.PHONE_HASH_SALT;
  if (!salt) throw new Error("PHONE_HASH_SALT is not set");
  return createHmac("sha256", salt).update(normalizeE164(raw, defaultRegion)).digest();
}

/** Null instead of a throw, for input a person typed or a contact card supplied. */
export function tryHashPhone(raw: string, defaultRegion?: string): Buffer | null {
  try {
    return hashPhone(raw, defaultRegion);
  } catch {
    return null;
  }
}

/**
 * The one canonical spelling of a number: E.164. A login arrives with its country code; a contact card usually
 * does not ("(555) 123-4567"), so a number in national format is read in `defaultRegion`, the country the
 * person who picked it is in. Two spellings of one phone must hash the same or a ghost silently never binds,
 * so anything that does not parse to a valid number throws rather than hashing as something.
 */
export function normalizeE164(raw: string, defaultRegion?: string): string {
  const region = defaultRegion && /^[A-Za-z]{2}$/.test(defaultRegion) ? (defaultRegion.toUpperCase() as CountryCode) : undefined;
  const parsed = parsePhoneNumberFromString(raw, region);
  if (!parsed || !parsed.isValid()) throw new Error("not a phone number");
  return parsed.number;
}

/** The region to read national-format numbers in, from the platform's geo header. US when there is none. */
export function regionFromHeaders(h: Headers): string {
  const country = h.get("x-vercel-ip-country");
  return country && /^[A-Za-z]{2}$/.test(country) ? country.toUpperCase() : "US";
}
