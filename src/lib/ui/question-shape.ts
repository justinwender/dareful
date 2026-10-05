/**
 * The market type follows the question's shape (the first-contact round, 2026-10-04, the owner's rule): "which" and
 * "who" are pick one, "how many" and "how much" are a number, and a question that asks whether (will, is, does, can
 * and the like) is yes or no. Anything else leaves the type as it was. The asker can still change it; the next time
 * the question's shape changes, the type follows again.
 */
export type MarketKind = "binary" | "numeric" | "categorical";

export function kindForQuestion(line: string): MarketKind | null {
  const s = line.trim().toLowerCase().replace(/^[^a-z]+/, "");
  if (/^(which|who|whose|whom)\b/.test(s)) return "categorical";
  if (/^how\s+(many|much|long|far|old|high|tall|fast|big)\b/.test(s)) return "numeric";
  if (/^(will|is|are|was|were|does|do|did|can|could|would|should|shall|has|have|had|whether|won't|isn't|doesn't|can't)\b/.test(s)) return "binary";
  return null;
}
