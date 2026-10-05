/**
 * When a question is decided (the first-contact round, 2026-10-04; docs/design.md 3.20 as amended): Tonight, This
 * week, This month, or a date. The write-up proposes a named date, the date chip carries it, and the terms and the
 * decide-by never disagree: a deadline the terms name ("by October 13") must be the decide-by date, which the terms
 * step keeps true as the chips change (`swapDateWords`) and the draft checks again (`deadlineMismatch`). A date the
 * model proposes beyond the furthest the app accepts is moved to it, never a reason to throw the write-up away (the
 * country question's "The write-up didn't come through" was a decide-by past 120 days failing the parse).
 */
import { endOfDay, wallClock } from "./closings";

export type DecideBy = { key: "tonight" | "week" | "month" } | { key: "date"; date: string };
export const DECIDE_BY_SPANS = [
  { key: "tonight", label: "Tonight" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
] as const;
/** The furthest a question may be decided: about three years out. */
export const LATEST_DAYS = 3 * 365;
const SPAN_DAYS = { week: 7, month: 30 } as const;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The calendar date at an instant in a zone, as YYYY-MM-DD. */
export function localDate(at: Date, zone: string): string {
  const w = wallClock(at, zone);
  return `${w.year}-${String(w.month).padStart(2, "0")}-${String(w.day).padStart(2, "0")}`;
}

/** Whole days from one calendar date to another (negative before). */
export function daysBetween(from: string, to: string): number {
  const a = DATE.exec(from);
  const b = DATE.exec(to);
  if (!a || !b) return 0;
  return Math.round((Date.UTC(+b[1]!, +b[2]! - 1, +b[3]!) - Date.UTC(+a[1]!, +a[2]! - 1, +a[3]!)) / 86_400_000);
}

export function addDays(date: string, days: number): string {
  const m = DATE.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(+m[1]!, +m[2]! - 1, +m[3]! + days));
  return d.toISOString().slice(0, 10);
}

/** "October 13": how the terms and the decide-by name a date, the one spelling both use. */
export function dateWords(date: string): string {
  const m = DATE.exec(date);
  if (!m) return date;
  return `${MONTHS[+m[2]! - 1]} ${+m[3]!}`;
}

/** "Oct 13", for the chip. */
export function shortDateWords(date: string): string {
  const m = DATE.exec(date);
  if (!m) return date;
  return `${MONTHS[+m[2]! - 1]!.slice(0, 3)} ${+m[3]!}`;
}

/** The moment a decide-by means: Tonight a minute before midnight, the spans a week and a month from now, a date a minute before its midnight, all in the asker's zone. */
export function decideByMoment(d: DecideBy, now: Date, zone: string): Date {
  if (d.key === "tonight") return endOfDay(now, zone, 0);
  if (d.key === "date") return endOfDay(now, zone, Math.max(0, daysBetween(localDate(now, zone), d.date)));
  return new Date(now.getTime() + SPAN_DAYS[d.key] * 86_400_000);
}

/** The calendar date a decide-by lands on, in the asker's zone. */
export function decideByDate(d: DecideBy, now: Date, zone: string): string {
  return localDate(decideByMoment(d, now, zone), zone);
}

/** A proposed date moved into what the app accepts: not before today, not past `LATEST_DAYS`. Null for anything that is not a date. */
export function clampProposal(raw: string | null | undefined, now: Date, zone: string): string | null {
  if (!raw || !DATE.test(raw.trim())) return null;
  const today = localDate(now, zone);
  const date = raw.trim();
  if (daysBetween(today, date) < 0) return today;
  if (daysBetween(today, date) > LATEST_DAYS) return addDays(today, LATEST_DAYS);
  return date;
}

/** Where the chips start: the write-up's date (today's is Tonight), else This week. */
export function fromProposal(date: string | null, now: Date, zone: string): DecideBy {
  const d = clampProposal(date, now, zone);
  if (!d) return { key: "week" };
  return d === localDate(now, zone) ? { key: "tonight" } : { key: "date", date: d };
}

const DEADLINE = /\b(by|before|until|till|through|on)\s+(?:the\s+)?(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s+)?(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?\b/gi;

/** The deadlines the terms name, as dates: each the next time that month and day comes round, today included. */
export function termsDeadlines(terms: string, now: Date, zone: string): Array<{ said: string; date: string }> {
  const today = localDate(now, zone);
  const year = +today.slice(0, 4);
  const out: Array<{ said: string; date: string }> = [];
  for (const m of terms.matchAll(DEADLINE)) {
    const month = MONTHS.findIndex((name) => name.toLowerCase().startsWith((m[2] ?? "").toLowerCase().slice(0, 3))) + 1;
    const day = Number(m[3]);
    if (month < 1 || day < 1 || day > 31) continue;
    let date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (daysBetween(today, date) < 0) date = `${year + 1}${date.slice(4)}`;
    out.push({ said: `${m[2]} ${m[3]}`, date });
  }
  return out;
}

/** The first deadline in the terms that is not the decide-by date, in the terms' own words, or null when they agree. */
export function deadlineMismatch(terms: string, decideDate: string, now: Date, zone: string): string | null {
  const off = termsDeadlines(terms, now, zone).find((d) => d.date !== decideDate);
  return off ? off.said : null;
}

/** The terms with one date's words ("October 13", "Oct 13", "Oct. 13") changed to another's, as the chips move. */
export function swapDateWords(terms: string, from: string, to: string): string {
  const m = DATE.exec(from);
  if (!m || from === to) return terms;
  const month = MONTHS[+m[2]! - 1]!;
  const day = +m[3]!;
  const pattern = new RegExp(`\\b(${month}|${month.slice(0, 3)}\\.?)\\s+${day}(st|nd|rd|th)?\\b`, "g");
  return terms.replace(pattern, dateWords(to));
}
