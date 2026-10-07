/**
 * When a question is decided (the first-contact round, 2026-10-04; docs/design.md 3.20 as amended): Tonight, This
 * week, This month, or a date. The write-up proposes a named date, the date chip carries it, and the terms and the
 * decide-by never disagree: a deadline the terms name ("by October 13") must be the decide-by date, which the terms
 * step keeps true as the chips change (`swapDateWords`) and the draft checks again (`deadlineMismatch`). A date the
 * model proposes past the furthest a question can run is never moved to fit (the second-pass round, 2026-10-06: a
 * thirty-year question moved to three years asks something else). The write-up says so in plain words and offers one
 * nearer version that can be measured by then (`pastTheLatest`), and the asker takes it or picks a date themselves.
 */
import { endOfDay, wallClock } from "./closings";

export type DecideBy = { key: "tonight" | "week" | "month" } | { key: "date"; date: string };
export const DECIDE_BY_SPANS = [
  { key: "tonight", label: "Tonight" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
] as const;
/** The furthest a question may be decided: three years from today, by the calendar (October 6 to October 6), as a person and a model both read "three years". */
export const LATEST_YEARS = 3;
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

/** The same calendar date some years on; February 29 falls back to February 28 in a year without one. */
export function addYears(date: string, years: number): string {
  const m = DATE.exec(date);
  if (!m) return date;
  const year = +m[1]! + years;
  const last = new Date(Date.UTC(year, +m[2]!, 0)).getUTCDate();
  return `${year}-${m[2]}-${String(Math.min(+m[3]!, last)).padStart(2, "0")}`;
}

/** The latest date a question can be decided by, in the asker's calendar. */
export function latestDate(now: Date, zone: string): string {
  return addYears(localDate(now, zone), LATEST_YEARS);
}

/** "October 6, 2029": a date with its year, for one that may be years away. */
export function longDateWords(date: string): string {
  const m = DATE.exec(date);
  return m ? `${dateWords(date)}, ${m[1]}` : date;
}

/**
 * A proposed date past the furthest a question can run: the date it could really be known, and that furthest date.
 * Null when it fits, or is no date. Pure.
 */
export function pastTheLatest(raw: string | null | undefined, now: Date, zone: string): { knownBy: string; latest: string } | null {
  if (!raw || !DATE.test(raw.trim())) return null;
  const latest = latestDate(now, zone);
  return daysBetween(latest, raw.trim()) > 0 ? { knownBy: raw.trim(), latest } : null;
}

/**
 * A proposed date the chips can start on: one already past is today, and one past the furthest a question can run is
 * none, never moved to fit (the second-pass round). Null for anything that is not a date.
 */
export function clampProposal(raw: string | null | undefined, now: Date, zone: string): string | null {
  if (!raw || !DATE.test(raw.trim())) return null;
  const today = localDate(now, zone);
  const date = raw.trim();
  if (daysBetween(today, date) < 0) return today;
  if (pastTheLatest(date, now, zone)) return null;
  return date;
}

/** Where the chips start: the write-up's date (today's is Tonight), else This week. */
export function fromProposal(date: string | null, now: Date, zone: string): DecideBy {
  const d = clampProposal(date, now, zone);
  if (!d) return { key: "week" };
  return d === localDate(now, zone) ? { key: "tonight" } : { key: "date", date: d };
}

const DEADLINE = /\b(by|before|until|till|through|on)\s+(?:the\s+)?(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day,?\s+)?(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/gi;

/**
 * The deadlines the terms name, as dates: one with its year written is that date ("October 6, 2029"), and one without
 * is the next time that month and day comes round, today included. `yearless` says which, since a yearless one also
 * agrees with the same month and day in a later year (the second-pass round: "We'll know by October 6" on a question
 * decided October 6, 2029).
 */
export function termsDeadlines(terms: string, now: Date, zone: string): Array<{ said: string; date: string; yearless: boolean }> {
  const today = localDate(now, zone);
  const year = +today.slice(0, 4);
  const out: Array<{ said: string; date: string; yearless: boolean }> = [];
  for (const m of terms.matchAll(DEADLINE)) {
    const month = MONTHS.findIndex((name) => name.toLowerCase().startsWith((m[2] ?? "").toLowerCase().slice(0, 3))) + 1;
    const day = Number(m[3]);
    if (month < 1 || day < 1 || day > 31) continue;
    const md = `${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (m[4]) {
      out.push({ said: `${m[2]} ${m[3]}, ${m[4]}`, date: `${m[4]}-${md}`, yearless: false });
      continue;
    }
    let date = `${year}-${md}`;
    if (daysBetween(today, date) < 0) date = `${year + 1}-${md}`;
    out.push({ said: `${m[2]} ${m[3]}`, date, yearless: true });
  }
  return out;
}

/**
 * The first deadline in the terms that is not the decide-by date, in the terms' own words, or null when they agree. A
 * deadline with its year must be that very date; one without agrees when its month and day are the decide-by's.
 */
export function deadlineMismatch(terms: string, decideDate: string, now: Date, zone: string): string | null {
  const off = termsDeadlines(terms, now, zone).find((d) => d.date !== decideDate && !(d.yearless && d.date.slice(5) === decideDate.slice(5)));
  return off ? off.said : null;
}

/** How a decide-by date is said in a sentence: "October 13" this year, "October 6, 2029" any other, so two dates never read alike. */
export function datePhrase(date: string, now: Date, zone: string): string {
  return date.slice(0, 4) === localDate(now, zone).slice(0, 4) ? dateWords(date) : longDateWords(date);
}

/** The terms with one date's words ("October 13", "Oct 13", "Oct. 13", "October 6, 2029") changed to another's, as the chips move; a year written stays written. */
export function swapDateWords(terms: string, from: string, to: string): string {
  const m = DATE.exec(from);
  if (!m || from === to) return terms;
  const month = MONTHS[+m[2]! - 1]!;
  const day = +m[3]!;
  const pattern = new RegExp(`\\b(${month}|${month.slice(0, 3)}\\.?)\\s+${day}(st|nd|rd|th)?(,?\\s+${m[1]})?\\b`, "g");
  return terms.replace(pattern, (_whole, _month: string, _suffix: string | undefined, year: string | undefined) => (year ? longDateWords(to) : dateWords(to)));
}
