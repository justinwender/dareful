/**
 * The close chips on the terms step, and the moment each one means. The chip's word and the screen's word
 * have to agree: a "Tomorrow" that was thirty hours from now read "Closes Thursday" when asked after six on a
 * Tuesday evening, and a "Tonight" asked after four in the afternoon read "Closes tomorrow" (the QA round,
 * 2026-09-29). So Tonight is the end of today and Tomorrow the end of tomorrow, both a minute before midnight
 * in the asker's own zone, which is what `closesLabel` then reads back as "tonight" and "tomorrow". The week
 * and the month stay spans from now: their words are never read back as a day, so a span cannot contradict
 * them.
 */
export type Closing = "tonight" | "tomorrow" | "week" | "month";

export const CLOSINGS: ReadonlyArray<{ key: Closing; label: string }> = [
  { key: "tonight", label: "Tonight" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

/** What the write-up's hours are measured against when it suggests a chip. */
const SPAN_HOURS: Record<Closing, number> = { tonight: 8, tomorrow: 30, week: 24 * 7, month: 24 * 30 };

/** The chip nearest what the write-up suggested, in hours until they could know. */
export function nearestClosing(hours: number): Closing {
  let best: Closing = "tomorrow";
  for (const c of CLOSINGS) if (Math.abs(SPAN_HOURS[c.key] - hours) < Math.abs(SPAN_HOURS[best] - hours)) best = c.key;
  return best;
}

/** The moment a chip means, from now, in the asker's zone. */
export function closeMoment(key: Closing, now: Date, zone: string): Date {
  switch (key) {
    case "tonight":
      return endOfDay(now, zone, 0);
    case "tomorrow":
      return endOfDay(now, zone, 1);
    case "week":
      return new Date(now.getTime() + SPAN_HOURS.week * 3_600_000);
    case "month":
      return new Date(now.getTime() + SPAN_HOURS.month * 3_600_000);
  }
}

/** A minute before midnight, `plusDays` calendar days after now's date in the zone. */
function endOfDay(now: Date, zone: string, plusDays: number): Date {
  const d = wallClock(now, zone);
  // The wall time wanted, read as if the zone were UTC, then moved by the zone's offset at that moment (twice,
  // so a change of offset between the guess and the answer, a clock change that night, is followed).
  const wanted = Date.UTC(d.year, d.month - 1, d.day + plusDays, 23, 59, 0, 0);
  let at = wanted - offsetAt(wanted, zone);
  at = wanted - offsetAt(at, zone);
  return new Date(at);
}

/** The zone's offset from UTC at an instant, in milliseconds (positive east of Greenwich). */
function offsetAt(instant: number, zone: string): number {
  const w = wallClock(new Date(instant), zone);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - Math.floor(instant / 1000) * 1000;
}

function wallClock(at: Date, zone: string): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }).formatToParts(at);
  const n = (type: string) => Number(parts.find((x) => x.type === type)?.value);
  return { year: n("year"), month: n("month"), day: n("day"), hour: n("hour") % 24, minute: n("minute"), second: n("second") };
}
