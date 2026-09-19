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
