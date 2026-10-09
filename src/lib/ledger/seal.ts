/**
 * An argument's ruling, made at the ask and sealed (the touch-ups round, section 2; docs/design.md 3.24 as amended
 * 2026-10-08). An argument's ruling turns on no one's call, so when the check at the ask finds that facts can settle it,
 * the app rules then, with the model that proposes outcomes, and seals it: the ruling's text with a random salt is
 * hashed, and the hash goes into the terms everyone signs, so the ruling is fixed before the first call and goes on the
 * chain with the question (inside the terms' hash, in `create`). Nobody sees it before the close, the asker included,
 * since a visible ruling would decide everyone's call. At the close it is shown, with the salt and the text exactly as
 * hashed, so anyone can check it against the terms they signed.
 */
import { randomBytes } from "node:crypto";
import { concat, keccak256, stringToHex, toHex, type Hex } from "viem";
import { ruleAnswerClaim, ruleClaim } from "@/lib/ai/settler";

/** The outcome in the chain's encoding: 1 yes, 0 no, an answer's index, or minus one when the facts cannot settle it. */
export type SealedRuling = { outcome: bigint; confidenceBps: number; rationale: string };

const CANNOT = -1n;

/** The verdict as it is sealed: "yes", "no", "cannot decide", or "answer: " and the answer's own words. Pure. */
export function verdictOf(outcome: bigint, answers: readonly string[] | null): string {
  if (outcome === CANNOT) return "cannot decide";
  if (answers) return `answer: ${answers[Number(outcome)] ?? ""}`;
  return outcome === 1n ? "yes" : "no";
}

/** The ruling's text exactly as it is hashed: the verdict on its own line, then the reasons. Pure. */
export function sealedText(outcome: bigint, rationale: string, answers: readonly string[] | null): string {
  return `${verdictOf(outcome, answers)}\n${rationale}`;
}

/** The seal: keccak-256 of the salt's 32 bytes followed by the text's UTF-8 bytes. Pure. */
export function sealOf(salt: Hex, text: string): Hex {
  return keccak256(concat([salt, stringToHex(text)]));
}

/** The rule a sealed ruling's people sign: silence agrees with it. Only terms that carry it are settled by silence (the final round, section 8). */
export const SILENCE_CLAUSE = "It stands unless someone in it sees it differently within a day of the close";

/** The line the terms carry, which everyone signs: the seal, and the rule that consent rests on. Pure. */
export function sealLine(seal: Hex): string {
  return `The app’s ruling is sealed until it closes: ${seal}. ${SILENCE_CLAUSE}, and then the tiebreaker decides.`;
}

/** Whether the terms its people signed let silence agree with the app's ruling. Pure. */
export function silenceSigned(terms: string): boolean {
  return terms.includes(SILENCE_CLAUSE);
}

/** The seal a set of terms carries, or null. Pure. */
export function sealInTerms(terms: string): Hex | null {
  const m = /sealed until it closes: (0x[0-9a-f]{64})\b/.exec(terms);
  return m ? (m[1] as Hex) : null;
}

/** The check anyone can run at the reveal: the salt and the text, hashed, are the seal in the terms they signed. Pure. */
export function sealHolds(terms: string, salt: Hex, text: string): boolean {
  const seal = sealInTerms(terms);
  return seal !== null && seal === sealOf(salt, text);
}

export function newSalt(): Hex {
  return toHex(randomBytes(32));
}

/**
 * Rules an argument at the ask and seals it: the ruling, its salt and seal, and the terms with the seal's line at their
 * end. Null when the ruling did not come (the model slow, down or refusing): the argument is then ruled at the close, as
 * one that needs what its people saw is, and nothing is sealed. A model is never on the critical path.
 */
export async function sealRuling(input: { title: string; terms: string; criterion: string | null; answers: string[] | null }): Promise<{ ruling: SealedRuling; salt: Hex; seal: Hex; terms: string } | null> {
  let ruling: SealedRuling;
  try {
    if (input.answers) {
      const r = await ruleAnswerClaim({ title: input.title, terms: input.terms, criterion: input.criterion, answers: input.answers });
      ruling = { outcome: r.index === null ? CANNOT : BigInt(r.index), confidenceBps: r.confidencePercent * 100, rationale: r.rationale };
    } else {
      const r = await ruleClaim({ title: input.title, terms: input.terms, criterion: input.criterion });
      ruling = { outcome: r.outcome === "yes" ? 1n : r.outcome === "no" ? 0n : CANNOT, confidenceBps: r.confidencePercent * 100, rationale: r.rationale };
    }
  } catch (err) {
    console.error("the ruling at the ask did not come; it is ruled at the close instead", err instanceof Error ? err.message : err);
    return null;
  }
  const salt = newSalt();
  const seal = sealOf(salt, sealedText(ruling.outcome, ruling.rationale, input.answers));
  return { ruling, salt, seal, terms: `${input.terms.trim()}\n\n${sealLine(seal)}` };
}
