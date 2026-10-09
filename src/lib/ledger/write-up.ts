/**
 * The write-up (PLANNING.md 8a; docs/design.md 9.8): one line into terms a group can resolve, for a yes-or-no
 * question, a number question or a pick-one question, with the plain fallback when the model is slow, down or
 * wrong-shaped. One function behind the server action (`scopeMarketAction`) and the streaming route
 * (`/api/m/write-up`), which hands each piece of the model's answer to `onDelta` as it is written, so the terms
 * step can show the words at the pace they arrive.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { aboutGameLine, plainNumberScope, plainPickOneScope, plainScope, scopeMarket, scopeNumber, scopePickOne } from "@/lib/ai/markets";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { checkScale } from "@/lib/ledger/scale";
import { MAX_ANSWER_LENGTH, MAX_ANSWERS, MIN_ANSWERS } from "@/lib/ledger/pick-one";
import { outcomeWordsFrom } from "@/lib/ui/outcome-words";
import { clampProposal, latestDate, longDateWords, pastTheLatest } from "@/lib/ledger/decide-by";
import { drawable } from "@/lib/ui/emoji-ink";

/** A suggested mark the app can use: one emoji the link tiles can draw, else none. Pure. */
export function markOf(raw: string | null | undefined): string | null {
  const m = (raw ?? "").trim();
  return m.length > 0 && m.length <= 16 && drawable(m) ? m : null;
}

export type ScopeResult = { title: string; terms: string; ambiguous: boolean; criteria: string[]; /** The date the write-up proposes deciding it by, YYYY-MM-DD in the asker's zone; null when it proposed none, or one past the furthest a question can run (`clampProposal`). */ decideBy: string | null; /** A question that cannot be known before the furthest a question can run (the second-pass round): when it could be known, that furthest date, and one nearer version that can be decided by then, or none. Never moved to fit. */ tooFar: TooFar | null; plain: boolean; number: NumberScopeResult | null; /** The outcomes in the question's own words (3.25), when the write-up gave four usable phrasings. */ outcomes: [string, string, string, string] | null; /** The mark it suggests for a question asked without one (the final round, section 7): one emoji the tiles can draw, or none. */ mark: string | null };
export type TooFar = { knownBy: string; latest: string; nearer: { title: string; terms: string; decideBy: string } | null };

/**
 * The date a write-up starts on, and what to say when it is too far off (the second-pass round, 2026-10-06): a date
 * past the furthest a question can run is not moved to fit, since a thirty-year question moved to three years asks
 * something else. It comes back as none, with when it could be known and the nearer version, kept only when its
 * own date fits. Pure.
 */
export function datesOf(scope: { decideBy: string; nearer?: { title: string; terms: string; decideBy: string } | null }, now: Date, zone: string): { decideBy: string | null; tooFar: TooFar | null } {
  const far = pastTheLatest(scope.decideBy, now, zone);
  if (!far) return { decideBy: clampProposal(scope.decideBy, now, zone), tooFar: null };
  const n = scope.nearer;
  const nearerDate = n ? clampProposal(n.decideBy, now, zone) : null;
  return { decideBy: null, tooFar: { ...far, nearer: n && nearerDate ? { title: n.title, terms: n.terms, decideBy: nearerDate } : null } };
}
/**
 * A number question's write-up carries its unit and, when the model's scale passed the check, that scale under a
 * token only this server can mint for this person: the draft that comes back with it is stored as the model's
 * scale, which is never shown, so a scale nobody but the server chose must not be able to wear that label.
 */
export type NumberScopeResult = { unit: { singular: string; plural: string }; model: { range: string | null; typical: string; token: string } | null };

/** The token covers the model's scale (null when it failed the check) and its most likely answer together. */
export function scaleToken(userId: string, range: string | null, typical: string): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("SESSION_SECRET is not set or too short");
  return createHmac("sha256", secret).update(`dareful:ai-scale:v2:${userId}:${range ?? ""}:${typical}`).digest("base64url");
}
export function scaleTokenValid(userId: string, range: string | null, typical: string, token: string): boolean {
  const want = Buffer.from(scaleToken(userId, range, typical));
  const got = Buffer.from(token);
  return want.length === got.length && timingSafeEqual(want, got);
}


export const WriteUpInput = z.object({
  line: z.string().trim().min(3).max(280),
  criterion: z.string().trim().min(3).max(120).optional(),
  // A question under Help define the terms is answered yes or no, or by one of its own two answers (the touch-ups round).
  answers: z.array(z.object({ question: z.string().trim().min(3).max(160), yes: z.boolean(), answer: z.string().trim().min(1).max(40).optional() })).max(3).optional(),
  kind: z.enum(["binary", "numeric", "categorical"]).optional(),
  choices: z.array(z.string().trim().min(1).max(MAX_ANSWER_LENGTH)).max(MAX_ANSWERS).optional(),
  /** A question asked on a game page (the final round, section 5): the game it is about. */
  gameId: z.string().uuid().optional(),
});
export type WriteUpRequest = { line: string; criterion?: string; answers?: Array<{ question: string; yes: boolean }>; kind?: "binary" | "numeric" | "categorical"; choices?: string[]; gameId?: string };

/**
 * `zone` is the asker's, so the date the model proposes is a date in their calendar; `onReset` says a streamed
 * answer starts over (a quick answer that failed its shape, asked again of the careful model).
 */
export async function writeUp(raw: WriteUpRequest, userId: string, zone: string, onDelta?: (partialJson: string) => void, onReset?: () => void): Promise<ScopeResult | { error: string }> {
  const line = z.string().trim().min(3).max(280).safeParse(raw.line);
  if (!line.success) return { error: "Ask it in a line." };
  const criterion = raw.criterion ? z.string().trim().min(3).max(120).safeParse(raw.criterion) : null;
  const now = new Date();
  // Help define the terms' answers, for every type (the first-contact round): what the asker settled about the edge cases.
  const answered = z.array(z.object({ question: z.string().trim().min(3).max(160), yes: z.boolean(), answer: z.string().trim().min(1).max(40).optional() })).max(3).safeParse(raw.answers ?? []);
  const answers = answered.success && answered.data.length > 0 ? answered.data : undefined;
  const latest = { date: latestDate(now, zone), words: longDateWords(latestDate(now, zone)) };
  // A question asked on a game page is about that game alone (the final round, section 5).
  const game = raw.gameId && z.string().uuid().safeParse(raw.gameId).success ? ((await db.select({ name: schema.sportsGames.name, startsAt: schema.sportsGames.startsAt }).from(schema.sportsGames).where(eq(schema.sportsGames.id, raw.gameId)).limit(1))[0] ?? null) : null;
  const about = game ? aboutGameLine({ name: game.name, startsAt: game.startsAt, started: game.startsAt.getTime() <= now.getTime() }, zone) : undefined;
  if (raw.kind === "categorical") {
    // A pick-one question (3.29): the write-up is given the answers and leaves them exactly as the asker wrote them.
    const choices = z.array(z.string().trim().min(1).max(MAX_ANSWER_LENGTH)).min(MIN_ANSWERS).max(MAX_ANSWERS).safeParse(raw.choices ?? []);
    if (!choices.success) return { error: `Two to ${MAX_ANSWERS} answers, a few words each.` };
    try {
      const s = await scopePickOne({ line: line.data, answers: choices.data, edges: answers, now, zone, latest, about, onDelta, onReset });
      return { title: s.title, terms: s.terms, ambiguous: false, criteria: [], ...datesOf(s, now, zone), plain: false, number: null, outcomes: null, mark: markOf(s.mark) };
    } catch (err) {
      console.error("scoping a pick-one question failed; using the line as typed", err);
      const p = plainPickOneScope(line.data);
      return { ...p, ambiguous: false, criteria: [], decideBy: null, tooFar: null, plain: true, number: null, outcomes: null, mark: null };
    }
  }
  if (raw.kind === "numeric") {
    try {
      const s = await scopeNumber({ line: line.data, answers, now, zone, latest, about, onDelta, onReset });
      const unit = { singular: s.unit.singular.toLowerCase(), plural: s.unit.plural.toLowerCase() };
      // The model's scale is used only when it passes the check; otherwise the asker sets one (src/lib/ledger/scale.ts).
      const checked = checkScale({ low: s.low, high: s.high, typical: s.typical });
      if (!checked.ok) console.warn("number scale proposal refused", { why: checked.why, low: s.low, high: s.high, typical: s.typical });
      const range = checked.ok ? checked.range.toString() : null;
      const typical = Number.isInteger(s.typical) && s.typical >= 0 ? String(s.typical) : "0";
      return { title: s.title, terms: s.terms, ambiguous: false, criteria: [], ...datesOf(s, now, zone), plain: false, number: { unit, model: { range, typical, token: scaleToken(userId, range, typical) } }, outcomes: null, mark: markOf(s.mark) };
    } catch (err) {
      console.error("scoping a number question failed; using the line as typed", err);
      const p = plainNumberScope(line.data);
      return { ...p, ambiguous: false, criteria: [], decideBy: null, tooFar: null, plain: true, number: { unit: { singular: "", plural: "" }, model: null }, outcomes: null, mark: null };
    }
  }
  try {
    const s = await scopeMarket({ line: line.data, criterion: criterion?.success ? criterion.data : undefined, answers, now, zone, latest, about, onDelta, onReset });
    return { title: s.title, terms: s.terms, ambiguous: s.ambiguous && s.criteria.length > 0, criteria: s.criteria, ...datesOf(s, now, zone), plain: false, number: null, outcomes: outcomeWordsFrom(s.outcomes), mark: markOf(s.mark) };
  } catch (err) {
    console.error("scoping failed; using the line as typed", err);
    const p = plainScope(line.data);
    return { ...p, ambiguous: false, criteria: [], decideBy: null, tooFar: null, plain: true, number: null, outcomes: null, mark: null };
  }
}
