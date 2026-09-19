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
import { recipientsAfterVote, resultNotice, voteRequest, type Notice } from "./messages";

/** Claims the (person, market, kind, count) slot; false if it was already told. This is what makes a retry silent. */
export async function claimNotice(userId: string, dareId: string, kind: "vote_request" | "result", seq: number, causedBy: string): Promise<string | null> {
  const [row] = await db.insert(schema.notificationLog).values({ userId, dareId, kind, seq, causedBy }).onConflictDoNothing().returning({ id: schema.notificationLog.id });
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
