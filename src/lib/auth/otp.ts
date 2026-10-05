import { parsePhoneNumberFromString } from "libphonenumber-js";

/**
 * The account step's fields (the first-contact round, 2026-10-04; docs/design.md 3.17 as amended), pure so they have
 * tests: what a typed address or number must look like before a code is asked for, in the shape Dynamic's own
 * one-time-code sign-in takes. Text messages reach the US and Canada only (the sign-in's own setting), so a number
 * is one with country code 1.
 */
export function emailLooksRight(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(raw.trim());
}

export type PhoneData = { phone: string; iso2: string; dialCode: string };

/** The number as Dynamic's text sign-in takes it, or null for anything that is not a US or Canadian number. */
export function phoneDataOf(raw: string): PhoneData | null {
  const parsed = parsePhoneNumberFromString(raw.trim(), "US");
  if (!parsed || !parsed.isValid() || parsed.countryCallingCode !== "1") return null;
  return { phone: parsed.nationalNumber, iso2: (parsed.country ?? "US").toLowerCase(), dialCode: "1" };
}

/** A code as typed: its six digits, whatever was pasted around them, or null while it is not six. */
export function codeOf(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  return digits.length === 6 ? digits : null;
}

/** What a failed step says, at its field (5.1): a refused code is the person's to fix; anything else is ours. */
export function otpProblem(err: unknown, stage: "address" | "code"): string {
  const text = err instanceof Error ? `${err.name} ${err.message}` : String(err);
  if (stage === "code" && /invalid|incorrect|expired|verif|otp|code/i.test(text)) return "That code didn’t match. Try it again, or send a new one.";
  if (stage === "address" && /invalid|email|phone|format/i.test(text)) return "That didn’t go through. Check it and try again.";
  return "That didn’t go through on our end. Try again.";
}
