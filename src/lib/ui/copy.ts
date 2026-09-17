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

/** Times are relative for the last week, "Sat, Sep 12" after that (4.6). */
export function whenLabel(at: Date, now = new Date()): string {
  const ms = now.getTime() - at.getTime();
  const day = 86_400_000;
  if (ms < 0) return at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  if (ms < 60_000) return "just now";
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} min ago`;
  if (ms < day) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 2 * day) return "yesterday";
  if (ms < 7 * day) return at.toLocaleDateString("en-US", { weekday: "long" });
  return at.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function firstInitial(name: string): string {
  const ch = name.trim().charAt(0);
  return ch ? ch.toUpperCase() : "";
}
