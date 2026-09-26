/**
 * A market's pulse: one string that changes whenever what the voting screen shows would change, read from
 * Postgres alone. The market screen renders it into the page; a light poll fetches it again and re-reads the
 * screen only when it differs (src/components/markets/vote-poll.tsx). Nothing here reads the indexer: the hosted
 * endpoint allows a hundred queries a minute across everyone, and four people watching one market would spend
 * that on their own.
 */
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";

export function pulseOf(input: { votes: Array<{ userId: string; outcome: bigint; signedAt: Date }>; statements: Array<{ userId: string; statedAt: Date }>; resolvedAt: Date | null; aiProposedAt: Date | null; /** Screenshots attached to what happened: the claim card shows them. */ evidence?: string[] }): string {
  const votes = [...input.votes].sort((a, b) => a.userId.localeCompare(b.userId)).map((v) => `${v.userId}:${v.outcome.toString()}:${v.signedAt.getTime()}`);
  const said = [...input.statements].sort((a, b) => a.userId.localeCompare(b.userId)).map((s) => `${s.userId}:${s.statedAt.getTime()}`);
  const shots = [...(input.evidence ?? [])].sort();
  return `v[${votes.join(",")}] s[${said.join(",")}] e[${shots.join(",")}] r${input.resolvedAt?.getTime() ?? 0} p${input.aiProposedAt?.getTime() ?? 0}`;
}

/** The pulse of one market, from the database: votes, what was said, whether it has resolved, and whether the app has proposed. */
export async function pulseFor(dareId: string): Promise<{ pulse: string; resolved: boolean } | null> {
  const [d] = await db.select({ resolvedAt: schema.dares.resolvedAt, aiProposedAt: schema.dares.aiProposedAt }).from(schema.dares).where(eq(schema.dares.id, dareId)).limit(1);
  if (!d) return null;
  const [votes, statements, shots] = await Promise.all([
    db.select({ userId: schema.dareVotes.userId, outcome: schema.dareVotes.outcome, signedAt: schema.dareVotes.signedAt }).from(schema.dareVotes).where(eq(schema.dareVotes.dareId, dareId)),
    db.select({ userId: schema.dareStatements.userId, statedAt: schema.dareStatements.statedAt }).from(schema.dareStatements).where(and(eq(schema.dareStatements.dareId, dareId), eq(schema.dareStatements.kind, "update"))),
    db.select({ id: schema.media.id }).from(schema.media).where(and(eq(schema.media.dareId, dareId), eq(schema.media.role, "evidence"))),
  ]);
  return { pulse: pulseOf({ votes, statements, resolvedAt: d.resolvedAt, aiProposedAt: d.aiProposedAt, evidence: shots.map((s) => s.id) }), resolved: d.resolvedAt !== null };
}
