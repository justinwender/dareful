/**
 * The vote cascade (PLANNING.md 8d). Every vote tells the rest of the quorum, with the count; reaching the
 * threshold tells everyone who had not voted the result instead, and the ballot is closed. Nothing here is
 * caused by time passing: every row in `notification_log` names the person whose act caused it, and the column
 * is not nullable. There is no scheduler in 2B, so the creator's deadline notice is the "Needs you" row.
 *
 * Never throws. A notification that fails costs nobody their vote, and the pull path ("Needs you") carries
 * everything a channel drops.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Address } from "viem";
import { db, schema } from "@/db";
import { marketById, quorumOf, tally, VOID_OUTCOME, votesOf, type DareRow } from "@/lib/ledger/markets";
import { firstName } from "@/lib/ui/copy";
import { sendEmail, sendPush } from "./channels";
import { positionsOf } from "@/lib/ledger/markets";
import { record } from "@/lib/usage";
import { allInNotice, backstopResultNotice, backstopWarningNotice, closedNotice, deadlineNotice, voteReminderNotice, votingOpenedNotice, enteredFromNotice, rulingNotice, joinedNotice, nettedNotice, nudgeNotice, nudgeSeq, nudgeTargets, openedNotice, pinLockedNotice, pushElseEmail, recipientsAfterVote, resultNotice, voteRequest, type BackstopHow, type Notice, type WarningFlavour } from "./messages";

/** Claims the (person, market, kind, count) slot; false if it was already told. This is what makes a retry silent. */
export async function claimNotice(userId: string, dareId: string, kind: "vote_request" | "result" | "opened" | "joined" | "nudge" | "deadline" | "ruling" | "backstop_warning" | "backstop_result" | "entered_from" | "voting_opened" | "vote_reminder" | "all_in", seq: number, causedBy: string): Promise<string | null> {
  const [row] = await db.insert(schema.notificationLog).values({ userId, dareId, kind, seq, causedBy }).onConflictDoNothing().returning({ id: schema.notificationLog.id });
  return row?.id ?? null;
}

/** The same slot, for an obligation: settled or forgiven is told once. */
export async function claimObligationNotice(userId: string, obligationId: string, kind: "settled" | "forgiven", causedBy: string): Promise<string | null> {
  const [row] = await db.insert(schema.notificationLog).values({ userId, obligationId, kind, seq: 0, causedBy }).onConflictDoNothing().returning({ id: schema.notificationLog.id });
  return row?.id ?? null;
}

/** A netting is about two people and no one row: once per pair per six-hour window, the nudge's window. */
export async function claimPairNotice(userId: string, causedBy: string, now: Date): Promise<string | null> {
  const [row] = await db.insert(schema.notificationLog).values({ userId, kind: "netted", seq: nudgeSeq(now), causedBy }).onConflictDoNothing().returning({ id: schema.notificationLog.id });
  return row?.id ?? null;
}

/**
 * Sends on the channels. The two backstop notices go by push where the person allowed it, else by email, never
 * both (docs/design.md 4.10); everything else goes on every channel that takes it, since a channel that drops it
 * is the reason "Needs you" exists.
 */
async function deliver(userId: string, logId: string, notice: Notice, mode: "every" | "push-else-email" = "every"): Promise<void> {
  let push = false;
  let email = false;
  // Each channel's link says which it was (`via`) and which notice (`n`), so a tap can be counted by channel; the page takes both off the address at once.
  const byPush = { ...notice, url: viaChannel(notice.url, "push", logId) };
  const byEmail = { ...notice, url: viaChannel(notice.url, "email", logId) };
  if (mode === "push-else-email") {
    ({ push, email } = await pushElseEmail(() => sendPush(userId, byPush), () => sendEmail(userId, byEmail)));
  } else {
    [push, email] = await Promise.all([sendPush(userId, byPush).catch(() => false), sendEmail(userId, byEmail).catch(() => false)]);
  }
  const channels = [push ? "push" : null, email ? "email" : null].filter((c): c is string => c !== null);
  if (channels.length > 0) await db.update(schema.notificationLog).set({ channels }).where(eq(schema.notificationLog.id, logId));
  const [row] = await db.select({ kind: schema.notificationLog.kind, dareId: schema.notificationLog.dareId }).from(schema.notificationLog).where(eq(schema.notificationLog.id, logId)).limit(1);
  await record("notification_sent", { kind: row?.kind ?? "unknown", channel: push && email ? "both" : push ? "push" : email ? "email" : "none" }, { userId }, { dareId: row?.dareId ?? null });
}

/** The notice's address with the channel and the notice named in its query, before any fragment. */
export function viaChannel(url: string, via: "push" | "email", logId: string): string {
  const [base, hash] = url.split("#", 2);
  const sep = (base ?? "").includes("?") ? "&" : "?";
  return `${base}${sep}via=${via}&n=${encodeURIComponent(logId)}${hash ? `#${hash}` : ""}`;
}

export type VoteCounts = { cast: number; quorum: number; threshold: number; leading: number };

/** The counts a voter's own nudge and everyone's notification share. */
export async function voteCounts(dareId: string): Promise<VoteCounts | null> {
  const d = await marketById(dareId);
  if (!d) return null;
  const [votes, quorum] = await Promise.all([votesOf(dareId), d.resolvedAt ? Promise.resolve([]) : quorumOf(d).catch(() => [])]);
  return { cast: votes.length, quorum: quorum.length || votes.length, threshold: d.threshold, leading: tally(votes)[0]?.votes ?? 0 };
}

export async function notifyAfterVote(dareId: string, voterId: string): Promise<void> {
  try {
    const d = await marketById(dareId);
    if (!d || !d.lockedAt) return;
    const resolved = d.resolvedAt !== null;
    const [votes, voterRow] = await Promise.all([votesOf(dareId), db.select({ displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, voterId)).limit(1)]);
    // The quorum is the chain's snapshot. After resolution the group's account-holders stand in for it: the
    // result goes to people who could have voted, and an extra recipient of a result harms nobody.
    const quorumWallets = resolved ? [] : await quorumOf(d);
    const quorumUsers = resolved
      ? await db.select({ id: schema.users.id }).from(schema.users).innerJoin(schema.groupMembers, eq(schema.groupMembers.userId, schema.users.id)).where(and(eq(schema.groupMembers.groupId, d.groupId), sql`${schema.groupMembers.leftAt} is null`, sql`${schema.groupMembers.joinedAt} <= ${d.lockedAt}`))
      : quorumWallets.length
        ? await db.select({ id: schema.users.id }).from(schema.users).where(inArray(sql`lower(${schema.users.governanceWallet})`, quorumWallets.map((w) => w.toLowerCase())))
        : [];
    const { requests, results } = recipientsAfterVote({ quorumUserIds: quorumUsers.map((u) => u.id), votedUserIds: votes.map((v) => v.userId), voterId, resolved });
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";
    const voterName = firstName(voterRow[0]?.displayName ?? "Someone");
    const leading = tally(votes)[0]?.votes ?? 0;

    await Promise.all([
      ...requests.map(async (userId) => {
        const id = await claimNotice(userId, dareId, "vote_request", votes.length, voterId);
        if (id) await deliver(userId, id, voteRequest({ voterName, title: d.title, cast: votes.length, quorum: quorumUsers.length, threshold: d.threshold, leading, marketId: d.id, appUrl }));
      }),
      ...results.map(async (userId) => {
        const id = await claimNotice(userId, dareId, "result", 0, voterId);
        const outcome = d.resolvedOutcome === VOID_OUTCOME ? "void" : d.kind === "numeric" ? "number" : d.kind === "categorical" ? "answer" : d.resolvedOutcome === 1n ? "yes" : "no";
        if (id) await deliver(userId, id, resultNotice({ deciderName: voterName, title: d.title, outcome, marketId: d.id, appUrl }));
      }),
    ]);
  } catch (err) {
    console.error("notifying after a vote failed", { dareId, err });
  }
}

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";

async function nameOf(userId: string): Promise<string> {
  const [row] = await db.select({ displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, userId)).limit(1);
  return firstName(row?.displayName ?? "Someone");
}

async function accountHolders(groupId: string): Promise<string[]> {
  const rows = await db.select({ userId: schema.groupMembers.userId }).from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, groupId), sql`${schema.groupMembers.userId} is not null`, sql`${schema.groupMembers.leftAt} is null`));
  return rows.map((r) => r.userId).filter((x): x is string => x !== null);
}

/** Someone asked something in a group: everyone else in it hears, once. A question asked with no group has nobody to tell yet. */
export async function notifyOpened(dareId: string, askerId: string): Promise<void> {
  try {
    const d = await marketById(dareId);
    if (!d || !d.creatorSignature) return;
    const [others, askerName] = await Promise.all([accountHolders(d.groupId), nameOf(askerId)]);
    await Promise.all(
      others.filter((id) => id !== askerId).map(async (userId) => {
        const id = await claimNotice(userId, dareId, "opened", 0, askerId);
        if (id) await deliver(userId, id, openedNotice({ askerName, title: d.title, marketId: d.id, appUrl: APP_URL() }));
      }),
    );
  } catch (err) {
    console.error("notifying that a question opened failed", { dareId, err });
  }
}

/** Someone got in: the person who asked hears, once per person who joins. Changing a number is not joining again. */
export async function notifyJoined(dareId: string, joinerId: string): Promise<void> {
  try {
    const d = await marketById(dareId);
    if (!d || d.creatorId === joinerId) return;
    const positions = await positionsOf(dareId);
    const order = positions.findIndex((p) => p.userId === joinerId);
    if (order < 0) return;
    const id = await claimNotice(d.creatorId, dareId, "joined", order + 1, joinerId);
    if (id) await deliver(d.creatorId, id, joinedNotice({ joinerName: await nameOf(joinerId), title: d.title, inCount: positions.length, askerIn: positions.some((p) => p.userId === d.creatorId), marketId: d.id, appUrl: APP_URL() }));
  } catch (err) {
    console.error("notifying that someone joined failed", { dareId, err });
  }
}

export type NudgeResult = { waitingOn: number; told: number; reached: number };

/**
 * "We're waiting on you", from one person who is in to whoever is not. It is a person acting, so it is allowed
 * where a timer would not be (Principle 1); and because a person can tap twice, each recipient hears about each
 * question at most once per six hours, whoever is asking. `reached` is how many a channel actually took, so the
 * screen can say so honestly and offer the person's own composer for the rest. `only` narrows it to one person,
 * for the nudge beside a name in who's in (docs/design.md 3.42, amended 2026-09-27); the same window applies.
 */
export async function sendNudge(dareId: string, nudgerId: string, now: Date, only: string | null = null): Promise<NudgeResult> {
  const d = await marketById(dareId);
  if (!d || !d.creatorSignature || d.resolvedAt) return { waitingOn: 0, told: 0, reached: 0 };
  const stage = d.lockedAt ? ("vote" as const) : ("enter" as const);
  const [positions, votes, members] = await Promise.all([positionsOf(dareId), votesOf(dareId), accountHolders(d.groupId)]);
  const quorumWallets = stage === "vote" ? await quorumOf(d).catch(() => []) : [];
  const quorumIds = quorumWallets.length ? (await db.select({ id: schema.users.id }).from(schema.users).where(inArray(sql`lower(${schema.users.governanceWallet})`, quorumWallets.map((w) => w.toLowerCase())))).map((u) => u.id) : [];
  const targets = nudgeTargets({ stage, nudgerId, nudgerIsIn: positions.some((p) => p.userId === nudgerId), memberIds: members, enteredIds: positions.map((p) => p.userId).filter((x): x is string => x !== null), quorumIds, votedIds: votes.map((v) => v.userId), only });
  const nudgerName = await nameOf(nudgerId);
  let told = 0;
  let reached = 0;
  await Promise.all(
    targets.map(async (userId) => {
      const id = await claimNotice(userId, dareId, "nudge", nudgeSeq(now), nudgerId);
      if (!id) return;
      told += 1;
      await deliver(userId, id, nudgeNotice({ nudgerName, title: d.title, stage, marketId: d.id, appUrl: APP_URL() }));
      const [row] = await db.select({ channels: schema.notificationLog.channels }).from(schema.notificationLog).where(eq(schema.notificationLog.id, id)).limit(1);
      if ((row?.channels.length ?? 0) > 0) reached += 1;
    }),
  );
  await record("nudge", { stage, told, reached }, { userId: nudgerId }, { dareId });
  return { waitingOn: targets.length, told, reached };
}

/**
 * The PIN was locked by wrong tries on someone's phone (3.45; docs/decisions.md 2026-09-28): the owner hears
 * once per lockout, on their own account, by push else email. Caused by the host, on whose phone it happened.
 */
export async function notifyPinLocked(ownerId: string, hostId: string, lockout: number): Promise<void> {
  const [row] = await db.insert(schema.notificationLog).values({ userId: ownerId, kind: "pin_locked", seq: lockout, causedBy: hostId }).onConflictDoNothing().returning({ id: schema.notificationLog.id });
  if (!row) return;
  await deliver(ownerId, row.id, pinLockedNotice({ hostName: firstName(await nameOf(hostId)), appUrl: APP_URL() }), "push-else-email");
}

/**
 * Someone got into a question from a friend's phone (3.45, frame 7): one notice on their own account, the
 * question as its title and whose phone, by push else email. Caused by the host, whose phone it was.
 */
export async function notifyEnteredFrom(ownerId: string, hostId: string, dareId: string): Promise<void> {
  const d = await marketById(dareId);
  if (!d) return;
  const id = await claimNotice(ownerId, dareId, "entered_from", 0, hostId);
  if (!id) return;
  await deliver(ownerId, id, enteredFromNotice({ hostName: firstName(await nameOf(hostId)), title: d.title, marketId: d.id, appUrl: APP_URL() }), "push-else-email");
}

/** The scheduler's one notice: the asker hears that the time they set has come. Caused by their own act of setting it. */
export async function notifyDeadline(dareId: string, creatorId: string): Promise<void> {
  try {
    const d = await marketById(dareId);
    if (!d || d.resolvedAt) return;
    const id = await claimNotice(creatorId, dareId, "deadline", 0, creatorId);
    if (id) await deliver(creatorId, id, deadlineNotice({ title: d.title, marketId: d.id, appUrl: APP_URL() }));
  } catch (err) {
    console.error("the deadline notice failed", { dareId, err });
  }
}

/** After an arbitration: everyone in it hears how it was called. `askedBy` is whoever pressed, or null for the backstop. */
export async function notifyRuling(dareId: string, askedBy: string | null): Promise<void> {
  try {
    const d = await marketById(dareId);
    if (!d || !d.resolvedAt || d.resolvedBy !== "arbitration") return;
    const positions = await positionsOf(dareId);
    const outcome = d.resolvedOutcome === VOID_OUTCOME ? "void" : d.kind === "numeric" ? "number" : d.kind === "categorical" ? "answer" : d.resolvedOutcome === 1n ? "yes" : "no";
    await Promise.all(
      positions.map((p) => p.userId).filter((x): x is string => x !== null && x !== askedBy).map(async (userId) => {
        const id = await claimNotice(userId, dareId, "ruling", 0, askedBy ?? d.creatorId);
        if (id) await deliver(userId, id, rulingNotice({ title: d.title, outcome, marketId: d.id, appUrl: APP_URL() }));
      }),
    );
  } catch (err) {
    console.error("the ruling notice failed", { dareId, err });
  }
}

/**
 * One warning before a backstop acts (docs/design.md 4.10), to everyone in the question who could still vote and
 * hasn't: the tiebreaker everyone agreed to, the final score, the play-by-play, or the void rule, about to act
 * for them. Caused, as the deadline notice is, by the asker's own act of setting the rule everyone then agreed
 * to; by push, else email, never both; and never a second.
 */
export async function notifyBackstopWarning(dareId: string, flavour: WarningFlavour, actsAt: Date, now: Date = new Date()): Promise<void> {
  try {
    const d = await marketById(dareId);
    if (!d || d.resolvedAt) return;
    const [positions, votes] = await Promise.all([positionsOf(dareId), votesOf(dareId)]);
    const voted = new Set(votes.map((v) => v.userId));
    await Promise.all(
      positions.map((p) => p.userId).filter((x): x is string => x !== null && !voted.has(x)).map(async (userId) => {
        const id = await claimNotice(userId, dareId, "backstop_warning", 0, d.creatorId);
        if (id) await deliver(userId, id, backstopWarningNotice({ title: d.title, flavour, actsAt, now, zone: d.zone ?? "UTC", marketId: d.id, appUrl: APP_URL() }), "push-else-email");
      }),
    );
  } catch (err) {
    console.error("the backstop warning failed", { dareId, err });
  }
}

/**
 * The one notice after a backstop has acted (docs/design.md 4.10): the feed settled it or could not, the tick's
 * tiebreaker ruled or found the terms don't decide it, or the void rule let it go unsettled. To everyone in it,
 * once, in place of the ordinary result notice; by push, else email.
 */
export async function notifyBackstopResult(dareId: string): Promise<void> {
  try {
    const d = await marketById(dareId);
    if (!d || !d.resolvedAt) return;
    const how: BackstopHow | null =
      d.resolvedBy === "expired"
        ? "expired"
        : d.resolvedBy === "feed"
          ? ((d.feedEnding as BackstopHow | null) ?? (d.resolvedOutcome === VOID_OUTCOME ? "conflict" : "agreed"))
          : d.resolvedBy === "arbitration"
            ? d.resolvedOutcome === VOID_OUTCOME
              ? "tiebreaker_void"
              : "tiebreaker"
            : null;
    if (!how) return;
    const positions = await positionsOf(dareId);
    await Promise.all(
      positions.map((p) => p.userId).filter((x): x is string => x !== null).map(async (userId) => {
        const id = await claimNotice(userId, dareId, "backstop_result", 0, d.creatorId);
        if (id) await deliver(userId, id, backstopResultNotice({ title: d.title, how, marketId: d.id, appUrl: APP_URL() }), "push-else-email");
      }),
    );
  } catch (err) {
    console.error("the backstop notice failed", { dareId, err });
  }
}

/** The creditor closed it: the person who had it hears, once, which one and how (Principle 1). */
export async function notifyClosed(obligationId: string, reason: "settled" | "forgiven", byUserId: string): Promise<void> {
  try {
    const [o] = await db.select({ fromUser: schema.obligations.fromUser, toUser: schema.obligations.toUser, memo: schema.obligations.memo }).from(schema.obligations).where(eq(schema.obligations.id, obligationId)).limit(1);
    if (!o || o.toUser !== byUserId) return;
    const [name, id] = await Promise.all([nameOf(byUserId), claimObligationNotice(o.fromUser, obligationId, reason, byUserId)]);
    if (id) await deliver(o.fromUser, id, closedNotice({ name, reason, memo: o.memo, personId: byUserId, appUrl: APP_URL() }));
  } catch (err) {
    console.error("notifying that an obligation closed failed", { obligationId, err });
  }
}

/** One person cancelled out what went both ways: the other hears, once per window. */
export async function notifyNetted(otherUserId: string, byUserId: string, denomId: string): Promise<void> {
  try {
    const [name, id] = await Promise.all([nameOf(byUserId), claimPairNotice(otherUserId, byUserId, new Date())]);
    if (id) await deliver(otherUserId, id, nettedNotice({ name, personId: byUserId, appUrl: APP_URL() }));
  } catch (err) {
    console.error("notifying that obligations were netted failed", { otherUserId, denomId, err });
  }
}

/** The quorum's account-holders, by their governance wallets as the chain (or a provisional market) holds them. */
async function quorumUserIds(d: DareRow): Promise<string[]> {
  const wallets = await quorumOf(d).catch(() => [] as Address[]);
  if (wallets.length === 0) return [];
  const rows = await db.select({ id: schema.users.id }).from(schema.users).where(inArray(sql`lower(${schema.users.governanceWallet})`, wallets.map((w) => w.toLowerCase())));
  return rows.map((r) => r.id);
}

/**
 * Voting opened (the field round, 1.8): everyone in the quorum but the person whose act closed it hears, once per
 * question, whichever path closed it. The action that closed it calls this at once; the tick calls it for every
 * locked question not yet asked, within a minute, with `claimed` since it holds the claim already. A lock still on
 * its way is not yet a close: nothing is claimed, and the tick sends once the mirror is written.
 */
export async function notifyVotingOpened(dareId: string, causedBy: string | null, by: "asker" | "time" | "both_in", opts: { claimed?: boolean; actorName?: string } = {}): Promise<void> {
  try {
    const d = await marketById(dareId);
    if (!d || !d.lockedAt || d.resolvedAt) return;
    if (!opts.claimed) {
      const [row] = await db.update(schema.dares).set({ voteAskedAt: new Date() }).where(and(eq(schema.dares.id, dareId), isNull(schema.dares.voteAskedAt))).returning({ id: schema.dares.id });
      if (!row) return;
    }
    const actor = causedBy ?? d.creatorId;
    const name = opts.actorName ? firstName(opts.actorName) : await nameOf(actor);
    const ids = (await quorumUserIds(d)).filter((id) => id !== actor);
    await Promise.all(
      ids.map(async (userId) => {
        const id = await claimNotice(userId, dareId, "voting_opened", 0, actor);
        if (id) await deliver(userId, id, votingOpenedNotice({ by, name, title: d.title, marketId: d.id, appUrl: APP_URL() }));
      }),
    );
  } catch (err) {
    console.error("the voting-opened notice failed", { dareId, err });
  }
}

/**
 * Twelve hours into voting (the field round, 1.8): everyone still to vote is reminded once, by push and email,
 * never at night in the asker's zone; the tick works out the moment and claims it. Nothing is sent once the votes
 * already decide it.
 */
export async function notifyVoteReminder(dareId: string, opts: { claimed?: boolean } = {}): Promise<void> {
  try {
    const d = await marketById(dareId);
    if (!d || !d.lockedAt || d.resolvedAt) return;
    if (!opts.claimed) {
      const [row] = await db.update(schema.dares).set({ voteRemindedAt: new Date() }).where(and(eq(schema.dares.id, dareId), isNull(schema.dares.voteRemindedAt))).returning({ id: schema.dares.id });
      if (!row) return;
    }
    const votes = await votesOf(dareId);
    if ((tally(votes)[0]?.votes ?? 0) >= d.threshold) return;
    const voted = new Set(votes.map((v) => v.userId));
    const quorum = await quorumUserIds(d);
    const name = await nameOf(d.creatorId);
    await Promise.all(
      quorum
        .filter((id) => !voted.has(id))
        .map(async (userId) => {
          const id = await claimNotice(userId, dareId, "vote_reminder", 0, d.creatorId);
          if (id) await deliver(userId, id, voteReminderNotice({ name, title: d.title, cast: votes.length, quorum: quorum.length, marketId: d.id, appUrl: APP_URL() }));
        }),
    );
  } catch (err) {
    console.error("the vote reminder failed", { dareId, err });
  }
}

/**
 * The asker hears once when the last person they asked is in (the field round, 1.8): everyone the set holds has a
 * number on it, the set is more than the asker, the question is still open (an argument locks on its second
 * entry and says so instead), and the last in was somebody else, since one's own entry is no news.
 */
export async function notifyAllIn(dareId: string, lastInId: string): Promise<void> {
  try {
    const d = await marketById(dareId);
    if (!d || d.lockedAt || d.resolvedAt || lastInId === d.creatorId) return;
    const asked = (await accountHolders(d.groupId)).filter((id) => id !== d.creatorId);
    if (asked.length === 0) return;
    const inIt = new Set((await positionsOf(d.id)).map((p) => p.userId));
    if (!asked.every((id) => inIt.has(id))) return;
    const id = await claimNotice(d.creatorId, dareId, "all_in", 0, lastInId);
    if (id) await deliver(d.creatorId, id, allInNotice({ lastName: await nameOf(lastInId), title: d.title, count: inIt.size, marketId: d.id, appUrl: APP_URL() }));
  } catch (err) {
    console.error("the all-in notice failed", { dareId, err });
  }
}
