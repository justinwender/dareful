/**
 * The vote cascade (PLANNING.md 8d). Every vote tells the rest of the quorum, with the count; reaching the
 * threshold tells everyone who had not voted the result instead, and the ballot is closed. Nothing here is
 * caused by time passing: every row in `notification_log` names the person whose act caused it, and the column
 * is not nullable. There is no scheduler in 2B, so the creator's deadline notice is the "Needs you" row.
 *
 * Never throws. A notification that fails costs nobody their vote, and the pull path ("Needs you") carries
 * everything a channel drops.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { marketById, quorumOf, tally, VOID_OUTCOME, votesOf } from "@/lib/ledger/markets";
import { firstName } from "@/lib/ui/copy";
import { sendEmail, sendPush } from "./channels";
import { positionsOf } from "@/lib/ledger/markets";
import { closedNotice, deadlineNotice, rulingNotice, joinedNotice, nettedNotice, nudgeNotice, nudgeSeq, nudgeTargets, openedNotice, recipientsAfterVote, resultNotice, voteRequest, type Notice } from "./messages";

/** Claims the (person, market, kind, count) slot; false if it was already told. This is what makes a retry silent. */
export async function claimNotice(userId: string, dareId: string, kind: "vote_request" | "result" | "opened" | "joined" | "nudge" | "deadline" | "ruling", seq: number, causedBy: string): Promise<string | null> {
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

async function deliver(userId: string, logId: string, notice: Notice): Promise<void> {
  const [push, email] = await Promise.all([sendPush(userId, notice).catch(() => false), sendEmail(userId, notice).catch(() => false)]);
  const channels = [push ? "push" : null, email ? "email" : null].filter((c): c is string => c !== null);
  if (channels.length > 0) await db.update(schema.notificationLog).set({ channels }).where(eq(schema.notificationLog.id, logId));
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
        const outcome = d.resolvedOutcome === VOID_OUTCOME ? "void" : d.resolvedOutcome === 1n ? "yes" : "no";
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
    if (id) await deliver(d.creatorId, id, joinedNotice({ joinerName: await nameOf(joinerId), title: d.title, inCount: positions.length, marketId: d.id, appUrl: APP_URL() }));
  } catch (err) {
    console.error("notifying that someone joined failed", { dareId, err });
  }
}

export type NudgeResult = { waitingOn: number; told: number; reached: number };

/**
 * "We're waiting on you", from one person who is in to whoever is not. It is a person acting, so it is allowed
 * where a timer would not be (Principle 1); and because a person can tap twice, each recipient hears about each
 * question at most once per six hours, whoever is asking. `reached` is how many a channel actually took, so the
 * screen can say so honestly and offer the person's own composer for the rest.
 */
export async function sendNudge(dareId: string, nudgerId: string, now: Date): Promise<NudgeResult> {
  const d = await marketById(dareId);
  if (!d || !d.creatorSignature || d.resolvedAt) return { waitingOn: 0, told: 0, reached: 0 };
  const stage = d.lockedAt ? ("vote" as const) : ("enter" as const);
  const [positions, votes, members] = await Promise.all([positionsOf(dareId), votesOf(dareId), accountHolders(d.groupId)]);
  const quorumWallets = stage === "vote" ? await quorumOf(d).catch(() => []) : [];
  const quorumIds = quorumWallets.length ? (await db.select({ id: schema.users.id }).from(schema.users).where(inArray(sql`lower(${schema.users.governanceWallet})`, quorumWallets.map((w) => w.toLowerCase())))).map((u) => u.id) : [];
  const targets = nudgeTargets({ stage, nudgerId, nudgerIsIn: positions.some((p) => p.userId === nudgerId), memberIds: members, enteredIds: positions.map((p) => p.userId).filter((x): x is string => x !== null), quorumIds, votedIds: votes.map((v) => v.userId) });
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
  return { waitingOn: targets.length, told, reached };
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
    const outcome = d.resolvedOutcome === VOID_OUTCOME ? "void" : d.resolvedOutcome === 1n ? "yes" : "no";
    const askerName = askedBy ? await nameOf(askedBy) : null;
    await Promise.all(
      positions.map((p) => p.userId).filter((x): x is string => x !== null && x !== askedBy).map(async (userId) => {
        const id = await claimNotice(userId, dareId, "ruling", 0, askedBy ?? d.creatorId);
        if (id) await deliver(userId, id, rulingNotice({ askerName, title: d.title, outcome, marketId: d.id, appUrl: APP_URL() }));
      }),
    );
  } catch (err) {
    console.error("the ruling notice failed", { dareId, err });
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
