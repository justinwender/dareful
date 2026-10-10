/**
 * The numbers (the field round, 3.1): what real groups do, counted from `usage_events` and the ledger's own
 * tables, with every excluded account left out (`users.excluded_from_counts`) and every market an excluded
 * account asked left out with it. Each number has a definition the page prints beside it, two windows (since
 * launch and the last seven days), and a daily snapshot the owner can take or backfill, kept in
 * `usage_snapshots` so the week's line survives the events table growing. A day is an Eastern day.
 */
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { bufferToHex, questionGroupOnchainId } from "@/lib/ledger/ids";
import { allInTurns } from "@/lib/ops/turns";

export type StatKey =
  | "accounts"
  | "guests"
  | "active_people"
  | "askers"
  | "questions"
  | "settled"
  | "questions_two_in"
  | "played_settled"
  | "played_open"
  | "played_undecided"
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
  { key: "guests", label: "Guests", definition: "People who first joined a question in the window with a name and no account, on a question someone counted asked; a guest who has since made an account counts as that account, and excluded guests are left out." },
  { key: "active_people", label: "Active people", definition: "Distinct accounts with any counted event in the window." },
  { key: "askers", label: "Askers", definition: "Distinct accounts that asked a question in the window." },
  { key: "questions", label: "Questions asked", definition: "Questions sent in the window by counted askers, from the ledger's own table, which holds every question since the first; a question its asker called off before anyone joined is not counted." },
  { key: "settled", label: "Questions settled", definition: "Questions by counted askers that ended in a decision in the window: by the vote of the people in, the tiebreaker, the final score or the app's ruling standing, \"nobody can tell\" included; one called off or expired is not settled." },
  { key: "questions_two_in", label: "Questions played", definition: "Questions asked in the window that someone besides their asker got into: two or more in, counting counted people and guests only." },
  { key: "played_settled", label: "Played, settled", definition: "Of the questions played in the window, those that have ended in a decision: by the vote of the people in, the tiebreaker, the final score or the app's ruling standing, \"nobody can tell\" included." },
  { key: "played_open", label: "Played, still open", definition: "Of the questions played in the window, those that have not ended yet: open, or closed and waiting on the call." },
  { key: "played_undecided", label: "Played, ended without a decision", definition: "Of the questions played in the window, those that ended with nothing decided: nobody called it in time." },
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

/**
 * Where "since launch" begins: midnight Eastern on September 13, 2026, the day the build began; the first question came
 * on the 19th. Nothing real is older, and a test that counts keeps its rows in a window long before it, so a run never
 * moves a number since launch (the submission round, section 3).
 */
export const LAUNCH = new Date("2026-09-13T04:00:00Z");

/** The last seven days to `now`, or everything since launch. Pure. */
export function windowFor(which: "launch" | "week", now: Date): StatWindow {
  return which === "week" ? { from: new Date(now.getTime() - 7 * 86_400_000), to: now } : { from: LAUNCH, to: now };
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

/**
 * Events in the window by counted actors: an excluded account's or an excluded guest's events never count, nor a guest's
 * who came in through an excluded account's link (a test's or a walk's guest, the submission round), and any other
 * guest's or a device's always do.
 */
function events(name: string, w: StatWindow, extra = sql``) {
  return sql`select count(*)::int as n from usage_events e left join users u on u.id = e.user_id left join participant_claims c on c.id = e.claim_id left join users cu on cu.id = c.created_by where e.name = ${name} and coalesce(u.excluded_from_counts, false) = false and coalesce(c.excluded_from_counts, false) = false and coalesce(cu.excluded_from_counts, false) = false and ${inWindow("e.at", w)} ${extra}`;
}

/** Counted accounts made in the window. */
const ACCOUNTS = (w: StatWindow) => sql`select count(*)::int as n from users u where not u.excluded_from_counts and ${inWindow("u.created_at", w)}`;

/**
 * Counted guests by the day they first joined (the submission round, section 2): a claim with an entry that counts on a
 * question a counted account asked, never bound to an account (a guest who made one counts as that account) and never
 * merged into another, an excluded guest left out; its day is its first such entry's.
 */
const GUESTS = (w: StatWindow) =>
  sql`select count(*)::int as n from (select c.id, min(p.entered_at) as first_in from participant_claims c join dare_positions p on p.claim_id = c.id join dares d on d.id = p.dare_id join users a on a.id = d.creator_id where c.claimed_by is null and c.merged_into is null and not c.excluded_from_counts and not a.excluded_from_counts and p.acknowledged_at is not null and p.dismissed_at is null group by c.id) g where ${inWindow("g.first_in", w)}`;

/**
 * Questions sent by counted askers, from the ledger's own table, which holds every question since the first (the events
 * table began on October 2). A question its asker called off before anyone joined (Now's Remove, `resolved_by =
 * 'removed'`) is not one anybody was asked (the ops round, section 6).
 */
const QUESTIONS = (w: StatWindow) => sql`select count(*)::int as n from dares d join users u on u.id = d.creator_id where not u.excluded_from_counts and d.creator_signature is not null and coalesce(d.resolved_by, '') <> 'removed' and ${inWindow("d.created_at", w)}`;

/** How a question that ended in a decision ended: the vote of the people in (a guest's question's quorum included), the tiebreaker, the final score, or the app's ruling standing. */
const DECIDED = sql.raw(`('quorum', 'provisional', 'arbitration', 'feed', 'ruling')`);

/**
 * The questions played (the ops round, section 6): asked in the window by a counted asker and got into by someone besides
 * them, which is two or more in, counting counted people and guests only; with how each stands now.
 */
const PLAYED = (w: StatWindow) =>
  sql`select count(*)::int as played, count(*) filter (where d.resolved_by in ${DECIDED})::int as settled, count(*) filter (where d.resolved_at is null)::int as open, count(*) filter (where d.resolved_at is not null and coalesce(d.resolved_by, '') not in ${DECIDED})::int as undecided from dares d join users u on u.id = d.creator_id where not u.excluded_from_counts and d.creator_signature is not null and ${inWindow("d.created_at", w)} and ${COUNTED_IN("d.id")} >= 2`;

/** Sets of people that asked a second question in the window: a game's questions count once, and a question called off does not count. */
const SETS_TWO = (w: StatWindow) =>
  sql`select count(*)::int as n from (select d.group_id from dares d join users u on u.id = d.creator_id left join public_questions q on q.id = d.template_id where not u.excluded_from_counts and d.creator_signature is not null and coalesce(d.resolved_by, '') <> 'removed' and ${inWindow("d.created_at", w)} group by d.group_id having count(distinct coalesce(q.game_id::text, d.id::text)) >= 2) g`;

/** Questions by counted askers that ended in a decision: the people in (a guest's question's quorum included), the tiebreaker, the final score or the app's ruling, "nobody can tell" included. */
const SETTLED = (w: StatWindow) => sql`select count(*)::int as n from dares d join users u on u.id = d.creator_id where not u.excluded_from_counts and d.resolved_at is not null and d.resolved_by in ('quorum', 'provisional', 'arbitration', 'feed', 'ruling') and ${inWindow("d.resolved_at", w)}`;

/**
 * The entries on a question that count toward "two or more in": a counted person's or a guest's, never an excluded
 * account's or an excluded guest's (the final round, section 9: a market counts only when someone counted is in it).
 */
function COUNTED_IN(dare: string) {
  return sql.raw(`(select count(*) from dare_positions cp left join users cu on cu.id = cp.user_id left join participant_claims cc on cc.id = cp.claim_id where cp.dare_id = ${dare} and cp.acknowledged_at is not null and cp.dismissed_at is null and not coalesce(cu.excluded_from_counts, false) and not coalesce(cc.excluded_from_counts, false))`);
}

async function one(q: ReturnType<typeof sql>): Promise<number> {
  const rows = (await db.execute(q)) as unknown as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

/** The questions played in a window, and how they stand now. */
export async function played(w: StatWindow): Promise<{ played: number; settled: number; open: number; undecided: number }> {
  const rows = (await db.execute(PLAYED(w))) as unknown as Array<{ played: number; settled: number; open: number; undecided: number }>;
  const r = rows[0];
  return { played: Number(r?.played ?? 0), settled: Number(r?.settled ?? 0), open: Number(r?.open ?? 0), undecided: Number(r?.undecided ?? 0) };
}

/** What the profile's clean-resolution rate counts as ended (`CLEAN_COUNTED_ENDINGS` and `TWO_OR_MORE_IN` in settle.ts, PLANNING.md 8e): a vote (a guest's question's quorum included), the tiebreaker or the final score, without the final score's own void, on a question two or more were in, anyone in counting as the profile counts them (the final round keeps this the profile's own rule; "Questions with two or more in" counts only the counted). "Nobody can tell" is minus one here. */
const CLEAN_ENDED = sql`d.resolved_at is not null and d.resolved_by in ('quorum', 'provisional', 'arbitration', 'feed', 'ruling') and not (d.resolved_by = 'feed' and d.resolved_outcome = -1) and (select count(*) from dare_positions cp where cp.dare_id = d.id and cp.acknowledged_at is not null and cp.dismissed_at is null) >= 2`;

/** Every number for one window, counted now. */
export async function countStats(w: StatWindow): Promise<Counts> {
  const [accounts, guestPeople, settled, active, askers, questions, twoIn, entries, guests, voting, byVote, byTiebreaker, byFeed, expired, links, shares, push, email, none, opened, errors] = await allInTurns([
    () => one(ACCOUNTS(w)),
    () => one(GUESTS(w)),
    () => one(SETTLED(w)),
    () => one(sql`select count(distinct e.user_id)::int as n from usage_events e join users u on u.id = e.user_id where not u.excluded_from_counts and ${inWindow("e.at", w)}`),
    () => one(sql`select count(distinct e.user_id)::int as n from usage_events e join users u on u.id = e.user_id where e.name = 'asked' and not u.excluded_from_counts and ${inWindow("e.at", w)}`),
    () => one(QUESTIONS(w)),
    () => played(w),
    () => one(events("entered", w, sql`and e.props->>'as' <> 'guest'`)),
    () => one(events("entered", w, sql`and e.props->>'as' = 'guest'`)),
    () => one(events("closed", w)),
    () => one(events("settled", w, sql`and e.props->>'by' = 'vote'`)),
    () => one(events("settled", w, sql`and e.props->>'by' = 'tiebreaker'`)),
    () => one(events("settled", w, sql`and e.props->>'by' = 'feed'`)),
    () => one(events("settled", w, sql`and e.props->>'by' = 'expired'`)),
    () => one(events("link_opened", w)),
    () => one(events("share", w)),
    () => one(events("notification_sent", w, sql`and e.props->>'channel' in ('push', 'both')`)),
    () => one(events("notification_sent", w, sql`and e.props->>'channel' = 'email'`)),
    () => one(events("notification_sent", w, sql`and e.props->>'channel' = 'none'`)),
    () => one(events("notification_opened", w)),
    () => one(events("error_shown", w)),
  ]);
  // People a notice can reach: of every counted account since launch, or of the people active in the window.
  const sinceLaunch = w.from === null || w.from.getTime() === LAUNCH.getTime();
  const base = !sinceLaunch
    ? sql`select distinct e.user_id as id from usage_events e join users u on u.id = e.user_id where not u.excluded_from_counts and ${inWindow("e.at", w)}`
    : sql`select u.id from users u where not u.excluded_from_counts and ${inWindow("u.created_at", w)}`;
  const [people, reachable] = await allInTurns([
    () => one(sql`select count(*)::int as n from (${base}) b`),
    () => one(sql`select count(*)::int as n from (${base}) b join users u on u.id = b.id where u.phone_hash is null or exists (select 1 from push_subscriptions s where s.user_id = u.id)`),
  ]);
  // The four the pitch quotes, from the ledger's own tables (the owner's ask, 2026-10-03).
  const [linkToAsker, sets, ended, clean, photos, stickers] = await allInTurns([
    () => one(sql`select count(*)::int as n from (select d.creator_id as id, min(d.created_at) as first_asked from dares d join users u on u.id = d.creator_id where not u.excluded_from_counts and d.creator_signature is not null group by d.creator_id) a where ${inWindow("a.first_asked", w)} and exists (select 1 from dare_positions p join dares o on o.id = p.dare_id where p.user_id = a.id and o.creator_id <> a.id and p.entered_at < a.first_asked)`),
    () => one(SETS_TWO(w)),
    () => one(sql`select count(*)::int as n from dares d join users u on u.id = d.creator_id where not u.excluded_from_counts and ${CLEAN_ENDED} and ${inWindow("d.resolved_at", w)}`),
    () => one(sql`select count(*)::int as n from dares d join users u on u.id = d.creator_id where not u.excluded_from_counts and ${CLEAN_ENDED} and d.resolved_outcome <> -1 and ${inWindow("d.resolved_at", w)}`),
    () => one(sql`select count(*)::int as n from media m join users u on u.id = m.author_id where not u.excluded_from_counts and ${inWindow("m.created_at", w)}`),
    () => one(sql`select count(*)::int as n from picture_marks k join users u on u.id = k.owner_id where not u.excluded_from_counts and k.kind = 'sticker' and ${inWindow("k.created_at", w)}`),
  ]);
  return {
    link_to_asker: linkToAsker,
    sets_two_questions: sets,
    clean_rate: shareOf(clean, ended),
    media_added: photos + stickers,
    accounts,
    guests: guestPeople,
    settled,
    active_people: active,
    askers,
    questions,
    questions_two_in: twoIn.played,
    played_settled: twoIn.settled,
    played_open: twoIn.open,
    played_undecided: twoIn.undecided,
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

/**
 * What the public numbers carry (the ops round, section 6, which leads them with questions played): accounts and guests
 * apart, the questions played and how they stand, and the sets of people that came back for a second question, each by
 * /stats's own definition and query.
 */
export type PublicCounts = Pick<Counts, "accounts" | "guests" | "questions_two_in" | "played_settled" | "played_open" | "played_undecided" | "sets_two_questions">;

export async function publicCounts(w: StatWindow): Promise<PublicCounts> {
  const [accounts, guests, p, sets] = await allInTurns([() => one(ACCOUNTS(w)), () => one(GUESTS(w)), () => played(w), () => one(SETS_TWO(w))]);
  return { accounts, guests, questions_two_in: p.played, played_settled: p.settled, played_open: p.open, played_undecided: p.undecided, sets_two_questions: sets };
}

/** Every number whose definition the submission round or the ops round set, for one window: what a day already written is brought in line with. */
export type DefinedCounts = PublicCounts & Pick<Counts, "questions" | "settled">;

export async function definedCounts(w: StatWindow): Promise<DefinedCounts> {
  const pub = await publicCounts(w);
  const [questions, settled] = await allInTurns([() => one(QUESTIONS(w)), () => one(SETTLED(w))]);
  return { ...pub, questions, settled };
}

/**
 * Every day already written is brought in line with the definitions set since it was taken (the submission round, section
 * 2; the ops round, section 6): the day's new accounts and guests, questions asked without those called off before anyone
 * joined, settled, the questions played and how they stand, and the sets that came back, each counted as it is counted
 * today; the day's other numbers are left as they were taken. Returns what each day held and holds now for those.
 * `write: false` only reads; `onlyDays` keeps it to those days (a test's own).
 */
export async function refreshSnapshotPeople(write: boolean, onlyDays?: readonly string[]): Promise<Array<{ day: string; was: Partial<DefinedCounts>; now: DefinedCounts }>> {
  const rows = (await db.select().from(schema.usageSnapshots).orderBy(schema.usageSnapshots.day)).filter((r) => !onlyDays || onlyDays.includes(r.day));
  const out: Array<{ day: string; was: Partial<DefinedCounts>; now: DefinedCounts }> = [];
  for (const r of rows) {
    const counts = r.counts as Partial<Counts>;
    const now = await definedCounts(dayWindow(r.day));
    const was: Partial<DefinedCounts> = {};
    for (const k of Object.keys(now) as Array<keyof DefinedCounts>) was[k] = counts[k];
    out.push({ day: r.day, was, now });
    if (write) await db.update(schema.usageSnapshots).set({ counts: { ...counts, ...now } }).where(eq(schema.usageSnapshots.id, r.id));
  }
  return out;
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

/**
 * What the chain's counts ask the indexer for (the final round, section 0): the questions on the chain with a counted
 * account in them, by their onchain ids, and the counted accounts, by their ledger addresses. The test runs share the
 * contracts, and the chain has no notion of an excluded account, so real use is what Postgres says it is. Every
 * question's own group is returned too, the only way to tell a set from one (the id it is made from is the question's
 * uuid).
 */
export async function countedOnchain(): Promise<{ dareIds: string[]; ledgers: string[]; questionGroups: Set<string> }> {
  const [questions, people, onchain] = await Promise.all([
    db
      .selectDistinct({ onchainId: schema.dares.onchainId })
      .from(schema.dares)
      .innerJoin(schema.darePositions, eq(schema.darePositions.dareId, schema.dares.id))
      .innerJoin(schema.users, eq(schema.users.id, schema.darePositions.userId))
      .where(and(isNotNull(schema.dares.onchainId), eq(schema.users.excludedFromCounts, false))),
    db.select({ ledger: schema.users.ledgerWallet }).from(schema.users).where(and(eq(schema.users.excludedFromCounts, false), isNotNull(schema.users.ledgerWallet))),
    db.select({ id: schema.dares.id }).from(schema.dares).where(isNotNull(schema.dares.onchainId)),
  ]);
  return {
    dareIds: questions.map((r) => bufferToHex(r.onchainId as Buffer).toLowerCase()),
    ledgers: people.map((r) => (r.ledger as string).toLowerCase()),
    questionGroups: new Set(onchain.map((r) => questionGroupOnchainId(r.id).toLowerCase())),
  };
}
