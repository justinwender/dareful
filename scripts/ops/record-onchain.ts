/**
 * How each question that settled off the chain would be recorded on it (the games-and-the-reveal round, 2026-10-07,
 * section 0). It reads and prints; it sends nothing and changes no row. Recording one takes, in order: every entry
 * signed (a guest signs up and keeps theirs, a bound entry is kept), someone in it signing the terms over the
 * question's own group, none of its proposals already confirmed (a confirmed one is an edge on the chain already, and
 * the market would mint it again), and then five steps: register the question's own group with exactly the people in,
 * register its unit there, `create` with every entry and that `Create`, then `resolve` with the votes it was decided
 * by (they are the chain's own `Vote` signatures) or `arbitrate` with the ruling or the final score as recorded, and
 * last, here, its pending proposals withdrawn for the minted edges. Each blocker is printed by name.
 *
 *   npx tsx --env-file=.env.local scripts/ops/record-onchain.ts                  since the first-contact deploy
 *   npx tsx --env-file=.env.local scripts/ops/record-onchain.ts 2026-09-23T00:00Z since that moment
 */
import { and, eq, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { questionGroupOnchainId } from "@/lib/ledger/ids";
import { votesOf } from "@/lib/ledger/markets";
import { VOID_OUTCOME } from "@/lib/ledger/provisional";

/** The first deploy that decided questions off the chain by rule (docs/decisions.md 2026-10-04 and 2026-10-06). */
const FIRST_CONTACT_DEPLOY = "2026-10-05T23:05:00Z";

async function main() {
  const since = new Date(process.argv[2] ?? FIRST_CONTACT_DEPLOY);
  const all = await db
    .select()
    .from(schema.dares)
    .where(and(isNotNull(schema.dares.lockedAt), isNull(schema.dares.onchainId), isNotNull(schema.dares.resolvedAt), gte(schema.dares.resolvedAt, since), inArray(schema.dares.resolvedBy, ["provisional", "arbitration", "feed"])))
    .orderBy(schema.dares.resolvedAt);
  // The test suites' own questions (temporary accounts, swept after every run) are nobody's to record.
  const askers = all.length ? await db.select({ id: schema.users.id, dynamicId: schema.users.dynamicUserId }).from(schema.users).where(inArray(schema.users.id, Array.from(new Set(all.map((d) => d.creatorId))))) : [];
  const temporary = new Set(askers.filter((u) => u.dynamicId.startsWith("tmp-check:")).map((u) => u.id));
  const settled = all.filter((d) => !temporary.has(d.creatorId));
  console.log(`Settled off the chain since ${since.toISOString()}: ${settled.length}\n`);
  for (const d of settled) {
    const positions = await db.select().from(schema.darePositions).where(and(eq(schema.darePositions.dareId, d.id), isNotNull(schema.darePositions.acknowledgedAt), isNull(schema.darePositions.dismissedAt)));
    const names = new Map<string, string>();
    const userIds = positions.map((p) => p.userId).filter((x): x is string => x !== null);
    const claimIds = positions.map((p) => p.claimId).filter((x): x is string => x !== null);
    for (const u of userIds.length ? await db.select({ id: schema.users.id, name: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, userIds)) : []) names.set(u.id, u.name);
    for (const c of claimIds.length ? await db.select({ id: schema.participantClaims.id, name: schema.participantClaims.displayName }).from(schema.participantClaims).where(inArray(schema.participantClaims.id, claimIds)) : []) names.set(c.id, `${c.name} (a guest)`);
    const nameOf = (p: (typeof positions)[number]) => names.get(p.userId ?? p.claimId ?? "") ?? "someone";
    const proposals = await db.select({ status: schema.obligationProposals.status }).from(schema.obligationProposals).where(and(eq(schema.obligationProposals.origin, "dare"), eq(schema.obligationProposals.originId, d.id)));
    const blockers: string[] = [];
    const unsigned = positions.filter((p) => p.userId === null || p.enterSignature === null);
    if (unsigned.length) blockers.push(`entries nobody signed: ${unsigned.map(nameOf).join(", ")} (each signs up, or is bound, and keeps theirs)`);
    if (!positions.some((p) => p.questionSignature !== null)) blockers.push("nobody in it signed the terms over its own group, and one of them would have to (no screen asks for it once a question is settled)");
    const confirmed = proposals.filter((p) => p.status === "confirmed").length;
    if (confirmed) blockers.push(`${confirmed} of its ${proposals.length} proposals were confirmed: those edges are on the chain already, and the market would mint them again`);
    const votes = d.resolvedBy === "provisional" ? await votesOf(d.id) : [];
    const outcome = d.resolvedOutcome === VOID_OUTCOME ? "void" : String(d.resolvedOutcome);
    const decide =
      d.resolvedBy === "provisional"
        ? `resolve(dareId, ${outcome === "void" ? "VOID" : outcome}, the ${votes.filter((v) => v.outcome === d.resolvedOutcome).length} votes it was decided by)`
        : `arbitrate(dareId, ${outcome === "void" ? "0, voided" : `${outcome}, not voided`}, the ruling's hash as recorded) (${d.resolvedBy === "feed" ? "the final score" : "the tiebreaker"})`;
    console.log(`${d.id}  "${d.title}"`);
    console.log(`  in it: ${positions.map(nameOf).join(", ")}; decided ${d.resolvedBy} at ${d.resolvedAt?.toISOString()}; ${proposals.length} proposals (${proposals.map((p) => p.status).join(", ") || "none"})`);
    console.log(`  steps: createGroup(${questionGroupOnchainId(d.id).slice(0, 12)}…, the ${positions.length} in); createDenom(its unit there); create(every entry, one Create over that group); ${decide}; then its pending proposals withdrawn for the minted edges`);
    console.log(blockers.length ? `  blocked: ${blockers.join("; ")}\n` : "  ready: nothing blocks it\n");
  }
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
