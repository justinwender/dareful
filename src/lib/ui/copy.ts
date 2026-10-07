/**
 * Copy rules (docs/design.md 2.1 and 4.6). An obligation belongs to the person who picks up next, and the
 * sentence is forward-looking: "Gabe's got you." "You've got him." "John's got Theo." Never owes, debt,
 * balance, outstanding, overdue, net, or "settle up" as a noun.
 */
export type Person = { id: string; displayName: string };

/**
 * What the app is, in the owner's words (2026-09-29, superseding Round C's line). The signed-out screen says both
 * sentences under "Who's got the next one?"; the plain card's footer, the description on a dead link, the app's own
 * description and the manifest's say the first alone. One constant, read everywhere, so the four cannot drift.
 */
export const ABOUT_FIRST = "Ask your friends what’ll happen, from who falls asleep first to who wins on Sunday.";
export const ABOUT = `${ABOUT_FIRST} Everyone makes their call, and Dareful keeps track of who’s got who.`;
/** The line under the signed-out screen's questions (the field round, 1.9): the owner's words, never changing while the questions turn. */
export const FIRST_LINE = "Ask your friends. Everyone says how sure they are, with a beer or a few dollars riding on it, and Dareful keeps score.";

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

/** "Time’s up": the clock of an open market past its close that nothing has closed yet (the field round, 1.2), never "Closes soon", which promises what has not happened. */
export const TIMES_UP = "Time’s up";

/** "Closes tonight", "Closes Friday", or "Time’s up" once the close has passed with the market still open. */
export function closesClock(at: Date, now: Date, timeZone: string): string {
  return at.getTime() <= now.getTime() ? TIMES_UP : `Closes ${closesLabel(at, now, timeZone)}`;
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

/**
 * A share card and its metadata carry a first name only, never a full display name. A first word with no capital
 * in it that reads like part of an address or a handle ("justin.wender", "sam@example.com", the names the first
 * build stored) is cut before its first separator, less trailing digits, and capitalised: that is what friends
 * read until the person answers the name step. "J.R.", "Mary-Jane", "D’Arcy" and "sam" stand as they are, and a
 * word with nothing before its separator stands too.
 */
export function firstName(displayName: string): string {
  const word = displayName.trim().split(/\s+/)[0] ?? "";
  if (/\p{Lu}/u.test(word) || !/[._+@]/.test(word)) return word;
  const piece = (word.split(/[._+@]/)[0] ?? "").replace(/\d+$/, "");
  return piece ? piece.charAt(0).toUpperCase() + piece.slice(1) : word;
}

export function firstInitial(name: string): string {
  const ch = name.trim().charAt(0);
  return ch ? ch.toUpperCase() : "";
}

const SIZE_WORDS = ["", "", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve"];

/**
 * How many are in, before you are (docs/design.md 3.14, 3.17, 3.38): "Nobody’s in yet" at zero, since a count of
 * zero is never rendered; "One friend is in" at one; then "Three friends are in" in words on the link page (3.17)
 * or "3 friends are in" in digits on a member's screen (3.38, where the count is the subject), by `style`. One
 * function, so the screens cannot drift from each other and none of them can say a zero.
 */
export function friendsIn(n: number, style: "words" | "digits"): string {
  if (n <= 0) return "Nobody’s in yet";
  if (n === 1) return "One friend is in";
  if (style === "digits") return `${n} friends are in`;
  const word = SIZE_WORDS[n];
  return word ? `${word} friends are in` : "A lot of friends are in";
}

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

/**
 * When something ended, after the fact (docs/design.md 3.15, 3.37): "at 6:52pm" on the day, "Sun at 6:52pm" within
 * the week, "Sep 12 at 6:52pm" after. In the viewer's zone, and never how long ago; a moment in the past is never
 * "soon", which is what `closesLabel` says of one.
 */
export function endedLabel(at: Date, now: Date, timeZone: string): string {
  const days = dayNumber(now, timeZone) - dayNumber(at, timeZone);
  if (days <= 0) return `at ${clockOf(at, timeZone)}`;
  if (days < 7) return `${at.toLocaleDateString("en-US", { timeZone, weekday: "short" })} at ${clockOf(at, timeZone)}`;
  return `${at.toLocaleDateString("en-US", { timeZone, month: "short", day: "numeric" })} at ${clockOf(at, timeZone)}`;
}

/** "locked at 11pm" on the day, "locked Sat, Sep 12" after it, for the entry line's caption (3.22: "2 beers · locked at 10:40pm"). In the viewer's zone, and never how long ago. */
/**
 * The band's clock once a market has ended (docs/design.md 3.37, 3.38; Round C part 2): "Settled Sat at 12:14am",
 * "Voided Sat at 1:05am", "Called off Sun at 6:52pm" for a removal, "Closed for good Sun at 9am" for an expiry.
 * Null while it runs: the running clocks are the screen's own. In the viewer's zone, never how long ago.
 */
export function endedClock(state: "resolved" | "voided" | "expired", resolvedBy: string | null, at: Date, now: Date, timeZone: string): string {
  const when = endedLabel(at, now, timeZone);
  if (state === "resolved") return `Settled ${when}`;
  if (state === "expired") return `Closed for good ${when}`;
  return `${resolvedBy === "removed" ? "Called off" : "Voided"} ${when}`;
}

const COUNT_WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

/** How long a span of dates ran, in words for the claimant's line (3.38): "One night", "A few days", "Two weeks", "Three months". */
export function spanWords(from: Date, to: Date): string {
  const days = Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
  if (days < 1) return "One night";
  if (days < 7) return "A few days";
  if (days < 14) return "A week";
  if (days < 28) return `${COUNT_WORDS[Math.round(days / 7)]?.replace(/^./, (c) => c.toUpperCase()) ?? Math.round(days / 7)} weeks`;
  const months = Math.max(1, Math.round(days / 30));
  if (months === 1) return "A month";
  return `${COUNT_WORDS[months]?.replace(/^./, (c) => c.toUpperCase()) ?? months} months`;
}

/** "You were already in 6 stories." (3.38), or one story. */
export function alreadyInLine(n: number): string {
  return n === 1 ? "You were already in one story." : `You were already in ${n} stories.`;
}
/** The ballot's count line before anyone has said (3.35): "Nobody has said yet. Two of you and it settles." */
export function nobodyYetLine(threshold: number): string {
  const n = COUNT_WORDS[threshold] ?? String(threshold);
  return `Nobody has said yet. ${n.charAt(0).toUpperCase()}${n.slice(1)} of you and it settles.`;
}

export function lockedLabel(at: Date, now: Date, timeZone: string): string {
  if (dayNumber(now, timeZone) === dayNumber(at, timeZone)) return `locked at ${clockOf(at, timeZone)}`;
  return `locked ${at.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" })}`;
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

/** Whole calendar days from `from` to `to` in a zone, the way "yesterday" is counted: one from the moment the day turns. */
export function daysBetween(from: Date, to: Date, timeZone: string): number {
  return dayNumber(to, timeZone) - dayNumber(from, timeZone);
}

/** "Sat, Aug 22": the date where a clock was, on a market opened as a memory (docs/design.md 3.37). */
export function dateLabel(at: Date, timeZone: string): string {
  return at.toLocaleDateString("en-US", { timeZone, weekday: "short", month: "short", day: "numeric" });
}

/**
 * How many are in, for a count beside a clock: "3 of 6 in" while someone asked is still out, "4 in" once everyone
 * named is in or when nobody was named (the field round, 2.7), and "nobody's in yet" before anyone is (3.14: never a
 * zero). The second number only when it is real. Pure.
 */
export function inCount(people: number, groupSize: number): string {
  if (people === 0) return "nobody’s in yet";
  return groupSize > people ? `${people} of ${groupSize} in` : `${people} in`;
}

/**
 * The set's size for that count: its account-holders, and the asker only once they are in, since nobody asks
 * themselves (the second-pass round: a new game its asker had not entered read "0 of 1 in"). Pure.
 */
export function countedSetSize(memberIds: readonly string[], askerId: string, askerIn: boolean): number {
  return memberIds.filter((id) => id !== askerId || askerIn).length;
}

