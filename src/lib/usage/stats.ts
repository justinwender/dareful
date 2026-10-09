/**
 * The numbers (the field round, 3.1): what real groups do, counted from `usage_events` and the ledger's own
 * tables, with every excluded account left out (`users.excluded_from_counts`) and every market an excluded
 * account asked left out with it. Each number has a definition the page prints beside it, two windows (since
 * launch and the last seven days), and a daily snapshot the owner can take or backfill, kept in
 * `usage_snapshots` so the week's line survives the events table growing. A day is an Eastern day.
 */
import { sql } from "drizzle-orm";
import { db, schema } from "@/db";

export type StatKey =
  | "accounts"
  | "active_people"
  | "askers"
  | "questions"
  | "questions_two_in"
  | "entries"
  | "guest_entries"
  | "reached_voting"
  | "settled_by_vote"
  | "settled_by_tiebreaker"
  | "settled_by_feed"
  | "expired"
  | "link_opens"
  | "shares"
  | "notices_push"
  | "notices_email"
  | "notices_none"
  | "notices_opened"
  | "errors_shown"
  | "with_channel"
  | "channel_share"
  | "link_to_asker"
  | "sets_two_questions"
  | "clean_rate"
  | "media_added";

export const STATS: ReadonlyArray<{ key: StatKey; label: string; definition: string }> = [
  { key: "accounts", label: "Accounts", definition: "Accounts made in the window, excluded ones left out." },
  { key: "active_people", label: "Active people", definition: "Distinct accounts with any counted event in the window." },
  { key: "askers", label: "Askers", definition: "Distinct accounts that asked a question in the window." },
  { key: "questions", label: "Questions asked", definition: "Questions sent in the window, by counted askers." },
  { key: "questions_two_in", label: "Questions with two or more in", definition: "Questions asked in the window that reached two entries." },
  { key: "entries", label: "Entries", definition: "Numbers put on questions in the window, by accounts and through pass the phone." },
  { key: "guest_entries", label: "Guest entries", definition: "Numbers put on questions in the window by people with no account." },
  { key: "reached_voting", label: "Reached voting", definition: "Questions closed in the window, by the asker, the time or both sides in." },
  { key: "settled_by_vote", label: "Settled by vote", definition: "Questions the people in them decided in the window." },
  { key: "settled_by_tiebreaker", label: "Settled by the tiebreaker", definition: "Questions the tiebreaker called in the window." },
  { key: "settled_by_feed", label: "Settled by the final score", definition: "Questions the feed's backstop settled in the window." },
  { key: "expired", label: "Expired", definition: "Questions that ended with nothing decided in the window." },
  { key: "link_opens", label: "Link opens", definition: "Links opened in the window, once per person or device per link, fetchers never." },
  { key: "shares", label: "Shares", definition: "Taps on share, copy, the result's share, the chalk and the relay in the window." },
  { key: "notices_push", label: "Notices by push", definition: "Notifications that went out by push (or by both) in the window." },
  { key: "notices_email", label: "Notices by email", definition: "Notifications that went out by email alone in the window." },
  { key: "notices_none", label: "Notices to nobody", definition: "Notifications with no channel to send on in the window." },
  { key: "notices_opened", label: "Notices opened", definition: "Taps on a notification's link in the window, by channel." },
  { key: "errors_shown", label: "Errors shown", definition: "Problems shown on a screen in the window, by cause." },
  { key: "with_channel", label: "People with a channel", definition: "Counted accounts a notice can reach, by a push subscription or an email sign-in: of everyone since launch, and of the people active in the window otherwise." },
  { key: "channel_share", label: "Share with a channel", definition: "People with a channel as a percent of the same people: everyone since launch, or the people active in the window." },
  { key: "link_to_asker", label: "Came by a link, then asked", definition: "Counted accounts whose first question was asked in the window and who were already in a question someone else asked before it: they arrived through a friend's question and went on to ask their own." },
  { key: "sets_two_questions", label: "Sets with two or more questions", definition: "Sets of people in which two or more questions were asked in the window by counted askers; a game's questions count once, and a question called off does not count." },
  { key: "clean_rate", label: "Clean resolutions", definition: "Of the counted askers' questions two or more people were in that ended in the window by a vote, the tiebreaker or the final score, the percent that ended with an answer, as the profile counts it: a void by vote or tiebreaker counts against it, and an expiry or the final score's own void is in neither number." },
  { key: "media_added", label: "Photos and stickers added", definition: "Photos put on a question or a settlement, and stickers made, in the window by counted accounts." },
];

/** The numbers shown as a percent. */
export const PERCENT_STATS: ReadonlySet<StatKey> = new Set<StatKey>(["channel_share", "clean_rate"]);

/** A share as a whole percent, zero of nobody. Pure. */
export function shareOf(part: number, whole: number): number {
  return whole <= 0 ? 0 : Math.round((100 * part) / whole);
}

/** Where a day is counted (the field round, the owner's check): Eastern, so one 8pm evening never becomes two days. */
export const STATS_ZONE = "America/New_York";

export type StatWindow = { from: Date | null; to: Date };
export type Counts = Record<StatKey, number>;

/** The last seven days to `now`, or everything since launch. Pure. */
export function windowFor(which: "launch" | "week", now: Date): StatWindow {
  return which === "week" ? { from: new Date(now.getTime() - 7 * 86_400_000), to: now } : { from: null, to: now };
}

const easternParts = (at: Date): Record<string, string> => Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: STATS_ZONE, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(at).map((p) => [p.type, p.value]));

/** The Eastern day a moment falls in, as YYYY-MM-DD. Pure. */
export function dayOf(at: Date): string {
  const p = easternParts(at);
  return `${p.year}-${p.month}-${p.day}`;
}

/** The day after a calendar day, by the calendar alone. Pure. */
export function nextDay(day: string): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** Midnight in Eastern at the start of a day: Eastern is four or five hours behind UTC, and the one whose wall clock reads midnight on that day is it. */
function easternMidnight(day: string): Date {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  for (const hours of [4, 5]) {
    const at = new Date(Date.UTC(y, m - 1, d, hours));
    if (dayOf(at) === day && easternParts(at).hour === "00") return at;
  }
  return new Date(Date.UTC(y, m - 1, d, 5));
}

/** One calendar day in Eastern, as a window: midnight to midnight there, twenty-three or twenty-five hours on the two days the clocks change. Pure. */
export function dayWindow(day: string): StatWindow {
  return { from: easternMidnight(day), to: easternMidnight(nextDay(day)) };
}

// The driver takes a moment as text, never as a Date (a Date is refused as a parameter), so each bound is ISO 8601 cast back.
function inWindow(col: string, w: StatWindow) {
  const to = sql`${w.to.toISOString()}::timestamptz`;
  return w.from ? sql`${sql.raw(col)} >= ${w.from.toISOString()}::timestamptz and ${sql.raw(col)} < ${to}` : sql`${sql.raw(col)} < ${to}`;
}

/** Events in the window by counted actors: an excluded account's events never count, and a guest's or a device's always do. */
function events(name: string, w: StatWindow, extra = sql``) {
  return sql`select count(*)::int as n from usage_events e left join users u on u.id = e.user_id where e.name = ${name} and coalesce(u.excluded_from_counts, false) = false and ${inWindow("e.at", w)} ${extra}`;
}

async function one(q: ReturnType<typeof sql>): Promise<number> {
  const rows = (await db.execute(q)) as unknown as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

/** What the profile's clean-resolution rate counts as ended (`CLEAN_COUNTED_ENDINGS` and `TWO_OR_MORE_IN` in settle.ts, PLANNING.md 8e): a vote (a guest's question's quorum included), the tiebreaker or the final score, without the final score's own void, on a question two or more were in. "Nobody can tell" is minus one here. */
const CLEAN_ENDED = sql`d.resolved_at is not null and d.resolved_by in ('quorum', 'provisional', 'arbitration', 'feed', 'ruling') and not (d.resolved_by = 'feed' and d.resolved_outcome = -1) and (select count(*) from dare_positions cp where cp.dare_id = d.id and cp.acknowledged_at is not null and cp.dismissed_at is null) >= 2`;

/** Every number for one window, counted now. */
export async function countStats(w: StatWindow): Promise<Counts> {
  const [accounts, active, askers, questions, twoIn, entries, guests, voting, byVote, byTiebreaker, byFeed, expired, links, shares, push, email, none, opened, errors] = await Promise.all([
    one(sql`select count(*)::int as n from users u where not u.excluded_from_counts and ${inWindow("u.created_at", w)}`),
    one(sql`select count(distinct e.user_id)::int as n from usage_events e join users u on u.id = e.user_id where not u.excluded_from_counts and ${inWindow("e.at", w)}`),
    one(sql`select count(distinct e.user_id)::int as n from usage_events e join users u on u.id = e.user_id where e.name = 'asked' and not u.excluded_from_counts and ${inWindow("e.at", w)}`),
    one(events("asked", w)),
    one(sql`select count(*)::int as n from dares d join users u on u.id = d.creator_id where not u.excluded_from_counts and d.creator_signature is not null and ${inWindow("d.created_at", w)} and (select count(*) from dare_positions p where p.dare_id = d.id and p.acknowledged_at is not null and p.dismissed_at is null) >= 2`),
    one(events("entered", w, sql`and e.props->>'as' <> 'guest'`)),
    one(events("entered", w, sql`and e.props->>'as' = 'guest'`)),
    one(events("closed", w)),
    one(events("settled", w, sql`and e.props->>'by' = 'vote'`)),
    one(events("settled", w, sql`and e.props->>'by' = 'tiebreaker'`)),
    one(events("settled", w, sql`and e.props->>'by' = 'feed'`)),
    one(events("settled", w, sql`and e.props->>'by' = 'expired'`)),
    one(events("link_opened", w)),
    one(events("share", w)),
    one(events("notification_sent", w, sql`and e.props->>'channel' in ('push', 'both')`)),
    one(events("notification_sent", w, sql`and e.props->>'channel' = 'email'`)),
    one(events("notification_sent", w, sql`and e.props->>'channel' = 'none'`)),
    one(events("notification_opened", w)),
    one(events("error_shown", w)),
  ]);
  // People a notice can reach: of every counted account since launch, or of the people active in the window.
  const base = w.from
    ? sql`select distinct e.user_id as id from usage_events e join users u on u.id = e.user_id where not u.excluded_from_counts and ${inWindow("e.at", w)}`
    : sql`select u.id from users u where not u.excluded_from_counts and ${inWindow("u.created_at", w)}`;
  const [people, reachable] = await Promise.all([
    one(sql`select count(*)::int as n from (${base}) b`),
    one(sql`select count(*)::int as n from (${base}) b join users u on u.id = b.id where u.phone_hash is null or exists (select 1 from push_subscriptions s where s.user_id = u.id)`),
  ]);
  // The four the pitch quotes, from the ledger's own tables (the owner's ask, 2026-10-03).
  const [linkToAsker, sets, ended, clean, photos, stickers] = await Promise.all([
    one(sql`select count(*)::int as n from (select d.creator_id as id, min(d.created_at) as first_asked from dares d join users u on u.id = d.creator_id where not u.excluded_from_counts and d.creator_signature is not null group by d.creator_id) a where ${inWindow("a.first_asked", w)} and exists (select 1 from dare_positions p join dares o on o.id = p.dare_id where p.user_id = a.id and o.creator_id <> a.id and p.entered_at < a.first_asked)`),
    one(sql`select count(*)::int as n from (select d.group_id from dares d join users u on u.id = d.creator_id left join public_questions q on q.id = d.template_id where not u.excluded_from_counts and d.creator_signature is not null and coalesce(d.resolved_by, '') <> 'removed' and ${inWindow("d.created_at", w)} group by d.group_id having count(distinct coalesce(q.game_id::text, d.id::text)) >= 2) g`),
    one(sql`select count(*)::int as n from dares d join users u on u.id = d.creator_id where not u.excluded_from_counts and ${CLEAN_ENDED} and ${inWindow("d.resolved_at", w)}`),
    one(sql`select count(*)::int as n from dares d join users u on u.id = d.creator_id where not u.excluded_from_counts and ${CLEAN_ENDED} and d.resolved_outcome <> -1 and ${inWindow("d.resolved_at", w)}`),
    one(sql`select count(*)::int as n from media m join users u on u.id = m.author_id where not u.excluded_from_counts and ${inWindow("m.created_at", w)}`),
    one(sql`select count(*)::int as n from picture_marks k join users u on u.id = k.owner_id where not u.excluded_from_counts and k.kind = 'sticker' and ${inWindow("k.created_at", w)}`),
  ]);
  return {
    link_to_asker: linkToAsker,
    sets_two_questions: sets,
    clean_rate: shareOf(clean, ended),
    media_added: photos + stickers,
    accounts,
    active_people: active,
    askers,
    questions,
    questions_two_in: twoIn,
    entries,
    guest_entries: guests,
    reached_voting: voting,
    settled_by_vote: byVote,
    settled_by_tiebreaker: byTiebreaker,
    settled_by_feed: byFeed,
    expired,
    link_opens: links,
    shares,
    notices_push: push,
    notices_email: email,
    notices_none: none,
    notices_opened: opened,
    errors_shown: errors,
    with_channel: reachable,
    channel_share: shareOf(reachable, people),
  };
}

/** A day's numbers written once; taking the same day again replaces them. */
export async function takeSnapshot(day: string): Promise<Counts> {
  const counts = await countStats(dayWindow(day));
  await db.insert(schema.usageSnapshots).values({ day, counts }).onConflictDoUpdate({ target: schema.usageSnapshots.day, set: { counts, takenAt: new Date() } });
  return counts;
}

/** The first day with a counted event, or null with none. */
export async function firstDay(): Promise<string | null> {
  const rows = (await db.execute(sql`select min(e.at) as at from usage_events e`)) as unknown as Array<{ at: Date | string | null }>;
  const at = rows[0]?.at;
  return at ? dayOf(new Date(at)) : null;
}

/** The days from `from` to `to` inclusive, as YYYY-MM-DD. Pure. */
export function daysBetween(from: string, to: string): string[] {
  const out: string[] = [];
  for (let day = from; day <= to; day = nextDay(day)) out.push(day);
  return out;
}

/** Every day since the first event that has no snapshot yet gets one; days already taken are left as they were. */
export async function backfillSnapshots(now: Date): Promise<string[]> {
  const first = await firstDay();
  if (!first) return [];
  const have = new Set((await db.select({ day: schema.usageSnapshots.day }).from(schema.usageSnapshots)).map((r) => r.day));
  const taken: string[] = [];
  for (const day of daysBetween(first, dayOf(now))) {
    if (have.has(day)) continue;
    await takeSnapshot(day);
    taken.push(day);
  }
  return taken;
}

export async function snapshots(limit = 60): Promise<Array<{ day: string; takenAt: Date; counts: Counts }>> {
  const rows = await db.select().from(schema.usageSnapshots).orderBy(sql`${schema.usageSnapshots.day} desc`).limit(limit);
  return rows.map((r) => ({ day: r.day, takenAt: r.takenAt, counts: r.counts as Counts }));
}
