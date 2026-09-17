import { createHmac } from "node:crypto";

/**
 * Salted, deterministic, irreversible hash of a phone number. PHONE_HASH_SALT is permanent: once one hash is
 * stored it can never change. The raw number is used once, here, and never stored.
 */
export function hashPhone(e164: string): Buffer {
  const salt = process.env.PHONE_HASH_SALT;
  if (!salt) throw new Error("PHONE_HASH_SALT is not set");
  const normalized = normalizeE164(e164);
  return createHmac("sha256", salt).update(normalized).digest();
}

/** Digits only with a leading plus. Throws on anything that is not a plausible E.164 number. */
export function normalizeE164(raw: string): string {
  const digits = raw.replace(/[^\d]/g, "");
  if (digits.length < 7 || digits.length > 15) throw new Error("not an E.164 phone number");
  return `+${digits}`;
}
