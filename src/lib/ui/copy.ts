/**
 * Copy rules (docs/design.md 2.1 and 4.6). An obligation belongs to the person who picks up next, and the
 * sentence is forward-looking: "Gabe's got you." "You've got him." "John's got Theo." Never owes, debt,
 * balance, outstanding, overdue, net, or "settle up" as a noun.
 */
export type Person = { id: string; displayName: string };

/** `owner` picks up next (the debtor); `other` is who they have got (the creditor). */
export function gotSentence(owner: Person, other: Person, viewerId: string): string {
  if (owner.id === viewerId) return `You've got ${other.displayName}`;
  if (other.id === viewerId) return `${possessive(owner.displayName)} got you`;
  return `${possessive(owner.displayName)} got ${other.displayName}`;
}

export function possessive(name: string): string {
  return name.endsWith("s") ? `${name}'` : `${name}'s`;
}

/** "Sam got this one" for a cover, from the creditor's side. */
export function coveredSentence(creditor: Person, viewerId: string): string {
  return creditor.id === viewerId ? "You got this one" : `${creditor.displayName} got this one`;
}

/** A zone name the runtime accepts, or null. A cookie is input like any other. */
export function validZone(zone: string | null | undefined): string | null {
  if (!zone || zone.length > 64) return null;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

/** The calendar day of an instant in a zone, as a day count, so two instants can be compared by date. */
function dayNumber(at: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(at);
  const n = (type: string) => Number(parts.find((x) => x.type === type)?.value);
  return Math.floor(Date.UTC(n("year"), n("month") - 1, n("day")) / 86_400_000);
}

/**
 * Times are relative for the last week, "Sat, Sep 12" after that (4.6), always in the viewer's zone, never
 * the server's. "Yesterday" is the calendar day before today where the viewer is, not "24 to 48 hours ago":
 * something from last night must never read as two days old.
 */
export function whenLabel(at: Date, now: Date, timeZone: string): string {
  const ms = now.getTime() - at.getTime();
  const absolute = () => at.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
  if (ms < 0) return absolute();
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  const days = dayNumber(now, timeZone) - dayNumber(at, timeZone);
  if (days <= 0) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (days === 1) return "yesterday";
  if (days < 7) return at.toLocaleDateString("en-US", { timeZone, weekday: "long" });
  return absolute();
}

/**
 * When something closes, for a line that reads "Closes tonight": today, tomorrow, a weekday within the week,
 * a date after that, all in the viewer's zone. A time that has passed reads "soon", never as lateness: nothing
 * in the product reports how overdue anything is.
 */
export function closesLabel(at: Date, now: Date, timeZone: string): string {
  const days = dayNumber(at, timeZone) - dayNumber(now, timeZone);
  if (at.getTime() <= now.getTime()) return "soon";
  if (days <= 0) return Number(at.toLocaleString("en-US", { timeZone, hour: "numeric", hour12: false })) >= 17 ? "tonight" : "today";
  if (days === 1) return "tomorrow";
  if (days < 7) return at.toLocaleDateString("en-US", { timeZone, weekday: "long" });
  return at.toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });
}

/**
 * "until 10:40pm" on the day, "until tomorrow" or "until Friday" after it (docs/design.md 3.22, 3.24): the
 * clock a number can still change by, and the one a link still gets people in by. Never how long is left.
 */
export function untilLabel(at: Date, now: Date, timeZone: string): string {
  if (at.getTime() <= now.getTime()) return "until it closes";
  if (dayNumber(at, timeZone) === dayNumber(now, timeZone)) return `until ${clockOf(at, timeZone)}`;
  return `until ${closesLabel(at, now, timeZone)}`;
}

/** "10:40pm", "11pm": the time of day in the viewer's zone. */
export function clockOf(at: Date, timeZone: string): string {
  return at.toLocaleTimeString("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
}

/** The day, as the label at the top of a root: "Thursday, Sep 24", in the viewer's zone. */
export function todayLabel(now: Date, timeZone: string): string {
  return now.toLocaleDateString("en-US", { timeZone, weekday: "long", month: "short", day: "numeric" });
}

/** "Good until Oct 2", in the viewer's zone. */
export function dayLabel(at: Date, timeZone: string): string {
  return at.toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" });
}

/** A share card and its metadata carry a first name only, never a full display name. */
export function firstName(displayName: string): string {
  return displayName.trim().split(/\s+/)[0] ?? "";
}

export function firstInitial(name: string): string {
  const ch = name.trim().charAt(0);
  return ch ? ch.toUpperCase() : "";
}

const SIZE_WORDS = ["", "", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

/**
 * The caption under a set of people in "Who's in" (docs/design.md 3.20). It carries the difference between sets,
 * so the label never has to: "Last time, on Friday" against "Six of you, back in August". A number never opens
 * the line as a digit, and nothing here says how long it has been in a way that reads as neglect.
 */
export function setCaption(input: { size: number; lastAskedAt: Date | null; isMostRecent: boolean; now: Date; timeZone: string }): string {
  const size = `${SIZE_WORDS[input.size] ?? "A lot"} of you`;
  if (!input.lastAskedAt) return input.size === 2 ? "Just the two of you" : size;
  const days = dayNumber(input.now, input.timeZone) - dayNumber(input.lastAskedAt, input.timeZone);
  const when = days <= 0 ? "today" : days === 1 ? "yesterday" : days < 7 ? `on ${input.lastAskedAt.toLocaleDateString("en-US", { timeZone: input.timeZone, weekday: "long" })}` : days < 14 ? "last week" : days < 21 ? "two weeks ago" : null;
  if (when) return input.isMostRecent ? `Last time, ${when}` : when.charAt(0).toUpperCase() + when.slice(1);
  return `${size}, back in ${input.lastAskedAt.toLocaleDateString("en-US", { timeZone: input.timeZone, month: "long" })}`;
}

/** "Locked at 11pm" on the day, "Locked Sat, Sep 12" after it. In the viewer's zone, and never how long ago. */
export function lockedLabel(at: Date, now: Date, timeZone: string): string {
  if (dayNumber(now, timeZone) === dayNumber(at, timeZone)) return `Locked at ${clockOf(at, timeZone)}`;
  return `Locked ${at.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" })}`;
}

/**
 * "Add yours from Friday" (docs/design.md 3.25): the night a settled question belongs to, as a weekday while it is
 * still this week, "tonight" on the day, and "that night" once a weekday would be ambiguous. In the viewer's zone.
 */
export function fromThatNight(settledAt: Date, now: Date, timeZone: string): string {
  const days = dayNumber(now, timeZone) - dayNumber(settledAt, timeZone);
  if (days <= 0) return "tonight";
  if (days === 1) return "last night";
  if (days < 7) return settledAt.toLocaleDateString("en-US", { timeZone, weekday: "long" });
  return "that night";
}
