/**
 * Removes the questions the development machine's own walks left in production (the final round, 2026-10-09), with
 * everything that hangs off them: their positions, votes, statements, agreements, disputes, close calls, codes,
 * notices, usage rows and the proposals they left; the guests made for them; and the sets made for them, once nothing
 * else is in those. Every one of these was asked by the development account, which is left out of every count, and
 * none is on the chain (checked again here: a question on the chain is never removed, since the chain keeps it).
 *
 * Two batches. The touch-ups round's walk (the Everest argument with its guest's claim and pending proposal, and the
 * two Boone test questions) runs on the owner's go-ahead, given with the final round's brief. The final round's own
 * walk (a game question and a question of one's own on the Rays at Yankees game, the own question's row on that game,
 * the kettle question eight guests joined from the simulators, with those guests, and the unit the walk made on the
 * development account) is listed and waits for the owner.
 *
 *   npx tsx --env-file=.env.local scripts/ops/sweep-walk-rows.ts                  lists both batches
 *   npx tsx --env-file=.env.local scripts/ops/sweep-walk-rows.ts --apply touch-ups removes the touch-ups round's
 *   npx tsx --env-file=.env.local scripts/ops/sweep-walk-rows.ts --apply final     removes the final round's
 */
import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

/** The development account, whose walks these were. */
const DEV = "7fc0ce05-885a-457b-8a5e-6e8768379cd2";

type Batch = { key: "touch-ups" | "final"; name: string; dares: string[]; ownUnits?: string[] };
const BATCHES: Batch[] = [
  {
    key: "touch-ups",
    name: "the touch-ups round's walk (2026-10-08, evening, Eastern): the Everest argument with its guest, and the two Boone questions",
    dares: ["2dd98a50-e299-4af7-b4de-ab68c3dd4627", "d54bd78f-7e78-4d0d-baf8-9fd0e1613621", "dbd4b533-8a64-495e-b07b-71993ecb235d"],
  },
  {
    key: "final",
    name: "the final round's walk (2026-10-09, night, Eastern): the Rays at Yankees game question, the question of one's own on it, and the kettle question the simulators' guests joined",
    dares: ["d14d1832-2841-4e61-ada1-079299654f46", "0d3bff62-c96c-4905-8576-27b203e1069e", "1855a046-3dd7-41f9-8bac-126e28d9a8ec"],
    ownUnits: ["pizzas"],
  },
];

type Db = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/** What a batch would remove, read fresh: its questions, their guests, their sets, and their own questions' rows on a game. */
async function plan(tx: Db, b: Batch) {
  const D = schema.dares;
  const rows = await tx.select({ id: D.id, title: D.title, groupId: D.groupId, creatorId: D.creatorId, onchainId: D.onchainId, templateId: D.templateId }).from(D).where(inArray(D.id, b.dares));
  for (const r of rows) {
    if (r.creatorId !== DEV) throw new Error(`${r.id} was not asked by the development account; nothing is removed`);
    if (r.onchainId) throw new Error(`${r.id} is on the chain; nothing is removed`);
  }
  const ids = rows.map((r) => r.id);
  // The guests in them, made by the development account, and in nothing else.
  const P = schema.darePositions;
  const guests = ids.length ? (await tx.selectDistinct({ id: P.claimId }).from(P).where(and(inArray(P.dareId, ids), sql`${P.claimId} is not null`))).map((r) => r.id as string) : [];
  const C = schema.participantClaims;
  const ownGuests = guests.length ? (await tx.select({ id: C.id }).from(C).where(and(inArray(C.id, guests), eq(C.createdBy, DEV)))).map((r) => r.id) : [];
  const elsewhere = ownGuests.length ? (await tx.selectDistinct({ id: P.claimId }).from(P).where(and(inArray(P.claimId, ownGuests), notInArray(P.dareId, ids)))).map((r) => r.id as string) : [];
  const claims = ownGuests.filter((c) => !elsewhere.includes(c));
  // The sets made for them: nothing else asked in them, nothing owed in them, and nobody in them but the development account and these guests.
  const groups: string[] = [];
  for (const g of [...new Set(rows.map((r) => r.groupId))]) {
    const [other] = await tx.select({ n: sql<number>`count(*)::int` }).from(D).where(and(eq(D.groupId, g), notInArray(D.id, ids)));
    const [owed] = await tx.select({ n: sql<number>`count(*)::int` }).from(schema.obligations).where(eq(schema.obligations.groupId, g));
    const members = await tx.select({ userId: schema.groupMembers.userId, claimId: schema.groupMembers.claimId }).from(schema.groupMembers).where(eq(schema.groupMembers.groupId, g));
    const onlyUs = members.every((m) => m.userId === DEV || (m.claimId !== null && claims.includes(m.claimId)));
    const [grp] = await tx.select({ onchainId: schema.groups.onchainId, createdBy: schema.groups.createdBy }).from(schema.groups).where(eq(schema.groups.id, g));
    if ((other?.n ?? 0) === 0 && (owed?.n ?? 0) === 0 && onlyUs && grp && !grp.onchainId && grp.createdBy === DEV) groups.push(g);
  }
  // A question of one's own has a row of its own on its game, named for it.
  const ownRows = ids.length ? (await tx.select({ id: schema.publicQuestions.id }).from(schema.publicQuestions).where(or(...ids.map((id) => eq(schema.publicQuestions.key, `own:${id}`))))).map((r) => r.id) : [];
  return { rows, ids, claims, groups, ownRows };
}

async function remove(tx: Db, p: Awaited<ReturnType<typeof plan>>) {
  const { ids, claims, groups, ownRows } = p;
  if (ids.length) {
    await tx.delete(schema.notificationLog).where(inArray(schema.notificationLog.dareId, ids));
    await tx.delete(schema.roomCodes).where(inArray(schema.roomCodes.dareId, ids));
    await tx.delete(schema.personalLinks).where(inArray(schema.personalLinks.dareId, ids));
    await tx.delete(schema.nowArchive).where(inArray(schema.nowArchive.dareId, ids));
    await tx.delete(schema.dareNumberSeries).where(inArray(schema.dareNumberSeries.dareId, ids));
    await tx.delete(schema.media).where(inArray(schema.media.dareId, ids));
    await tx.delete(schema.dareVotes).where(inArray(schema.dareVotes.dareId, ids));
    await tx.delete(schema.dareCloseCalls).where(inArray(schema.dareCloseCalls.dareId, ids));
    await tx.delete(schema.dareStatements).where(inArray(schema.dareStatements.dareId, ids));
    await tx.delete(schema.dareAgreements).where(inArray(schema.dareAgreements.dareId, ids));
    await tx.delete(schema.dareDisputes).where(inArray(schema.dareDisputes.dareId, ids));
    await tx.delete(schema.usageEvents).where(inArray(schema.usageEvents.dareId, ids));
    await tx.delete(schema.darePositions).where(inArray(schema.darePositions.dareId, ids));
    await tx.delete(schema.obligationProposals).where(and(eq(schema.obligationProposals.origin, "dare"), inArray(schema.obligationProposals.originId, ids)));
    await tx.delete(schema.dares).where(inArray(schema.dares.id, ids));
  }
  if (ownRows.length) await tx.delete(schema.publicQuestions).where(inArray(schema.publicQuestions.id, ownRows));
  if (claims.length) {
    await tx.delete(schema.usageEvents).where(inArray(schema.usageEvents.claimId, claims));
    await tx.delete(schema.claimNumberAttempts).where(inArray(schema.claimNumberAttempts.claimId, claims));
    await tx.delete(schema.claimTokens).where(inArray(schema.claimTokens.claimId, claims));
    await tx.delete(schema.claimLinks).where(inArray(schema.claimLinks.claimId, claims));
    await tx.delete(schema.personalLinks).where(inArray(schema.personalLinks.claimId, claims));
    await tx.delete(schema.groupMembers).where(inArray(schema.groupMembers.claimId, claims));
    await tx.delete(schema.participantClaims).where(inArray(schema.participantClaims.id, claims));
  }
  if (groups.length) {
    await tx.delete(schema.groupInvites).where(inArray(schema.groupInvites.groupId, groups));
    await tx.delete(schema.groupMembers).where(inArray(schema.groupMembers.groupId, groups));
    await tx.delete(schema.denominations).where(inArray(schema.denominations.groupId, groups));
    await tx.delete(schema.groups).where(inArray(schema.groups.id, groups));
  }
}

async function main() {
  const apply = process.argv.indexOf("--apply");
  const which = apply >= 0 ? process.argv[apply + 1] : null;
  for (const b of BATCHES) {
    const p = await plan(db, b);
    console.log(`${b.name}:`);
    for (const r of p.rows) console.log(`  question ${r.id.slice(0, 8)} "${r.title}"`);
    console.log(`  ${p.claims.length} guest(s), ${p.groups.length} set(s), ${p.ownRows.length} own question row(s)${b.ownUnits ? `, and the unit(s) ${b.ownUnits.join(", ")} on the development account` : ""}`);
    if (which !== b.key) continue;
    await db.transaction(async (tx) => {
      await remove(tx, await plan(tx, b));
      if (b.ownUnits?.length) {
        const [me] = await tx.select({ ownUnits: schema.users.ownUnits }).from(schema.users).where(eq(schema.users.id, DEV));
        await tx.update(schema.users).set({ ownUnits: (me?.ownUnits ?? []).filter((u) => !b.ownUnits?.includes(u)) }).where(eq(schema.users.id, DEV));
      }
    });
    console.log("  removed");
  }
  process.exit(0);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message.split("\n")[0] : "failed");
  process.exit(1);
});
