/**
 * Removes what an interrupted test run left behind. Touches only rows tied to temporary users (Dynamic id
 * `tmp-check:`), which only the tests create: those users, the ghosts they made, the groups they made, the
 * dyads they sit in, and everything hanging off those. Safe to run at any time.   npm run test:sweep
 */
import { inArray, like, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";

async function main(): Promise<void> {
  const u = (await db.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.dynamicUserId, "tmp-check:%"))).map((r) => r.id);
  if (u.length === 0) {
    console.log("nothing to sweep");
    return;
  }
  const c = (await db.select({ id: schema.participantClaims.id }).from(schema.participantClaims).where(or(inArray(schema.participantClaims.createdBy, u), inArray(schema.participantClaims.claimedBy, u)))).map((r) => r.id);
  const M = schema.groupMembers;
  const g = Array.from(
    new Set([
      ...(await db.select({ id: schema.groups.id }).from(schema.groups).where(inArray(schema.groups.createdBy, u))).map((r) => r.id),
      ...(await db.select({ id: M.groupId }).from(M).innerJoin(schema.groups, sql`${schema.groups.id} = ${M.groupId} and ${schema.groups.isDyad}`).where(inArray(M.userId, u))).map((r) => r.id),
    ]),
  );
  await db.transaction(async (tx) => {
    // Markets hang off groups and users; positions, votes, statements and minted-edge shadows hang off markets.
    const D = schema.dares;
    const asked = await tx.select({ id: D.id }).from(D).where(or(u.length ? inArray(D.creatorId, u) : sql`false`, g.length ? inArray(D.groupId, g) : sql`false`));
    if (asked.length) {
      const ids = asked.map((d) => d.id);
      await tx.delete(schema.dareVotes).where(inArray(schema.dareVotes.dareId, ids));
      await tx.delete(schema.dareStatements).where(inArray(schema.dareStatements.dareId, ids));
      await tx.delete(schema.darePositions).where(inArray(schema.darePositions.dareId, ids));
      await tx.delete(schema.obligations).where(inArray(schema.obligations.originId, ids));
      await tx.delete(D).where(inArray(D.id, ids));
    }
    if (u.length) {
      // A settlement photo hangs off an obligation and the obligation points back at it: unhook, then remove both.
      await tx.update(schema.obligations).set({ mediaId: null }).where(or(inArray(schema.obligations.fromUser, u), inArray(schema.obligations.toUser, u)));
      await tx.delete(schema.media).where(inArray(schema.media.authorId, u));
      await tx.delete(schema.obligations).where(or(inArray(schema.obligations.fromUser, u), inArray(schema.obligations.toUser, u)));
    }
    const P = schema.obligationProposals;
    // Expenses hang off groups and users, and their items and claims hang off them.
    const E = schema.expenses;
    const spent = await tx.select({ id: E.id }).from(E).where(or(u.length ? inArray(E.payerId, u) : sql`false`, g.length ? inArray(E.groupId, g) : sql`false`));
    if (spent.length) {
      const ids = spent.map((e) => e.id);
      const items = (await tx.select({ id: schema.expenseItems.id }).from(schema.expenseItems).where(inArray(schema.expenseItems.expenseId, ids))).map((i) => i.id);
      if (items.length) await tx.delete(schema.itemClaims).where(inArray(schema.itemClaims.expenseItemId, items));
      await tx.delete(schema.expenseItems).where(inArray(schema.expenseItems.expenseId, ids));
      await tx.delete(P).where(inArray(P.originId, ids));
      await tx.delete(E).where(inArray(E.id, ids));
    }
    const conds = [inArray(P.fromUser, u), inArray(P.toUser, u)];
    if (g.length) conds.push(inArray(P.groupId, g));
    if (c.length) conds.push(inArray(P.fromClaim, c), inArray(P.toClaim, c), inArray(P.fromBoundClaim, c), inArray(P.toBoundClaim, c));
    await tx.delete(P).where(or(...conds));
    if (c.length) {
      await tx.delete(schema.claimTokens).where(inArray(schema.claimTokens.claimId, c));
      await tx.delete(schema.claimLinks).where(inArray(schema.claimLinks.claimId, c));
      await tx.delete(M).where(inArray(M.claimId, c));
    }
    await tx.delete(schema.contactResolutions).where(inArray(schema.contactResolutions.userId, u));
    await tx.delete(M).where(inArray(M.userId, u));
    if (g.length) {
      await tx.delete(schema.groupInvites).where(inArray(schema.groupInvites.groupId, g));
      await tx.delete(M).where(inArray(M.groupId, g));
      await tx.delete(schema.denominations).where(inArray(schema.denominations.groupId, g));
      await tx.delete(schema.groups).where(inArray(schema.groups.id, g));
    }
    await tx.delete(schema.denominations).where(inArray(schema.denominations.createdBy, u));
    if (c.length) {
      await tx.update(schema.participantClaims).set({ mergedInto: null }).where(inArray(schema.participantClaims.id, c));
      await tx.delete(schema.participantClaims).where(inArray(schema.participantClaims.id, c));
    }
    await tx.delete(schema.users).where(inArray(schema.users.id, u));
  });
  console.log(`swept ${u.length} temporary users, ${c.length} ghosts, ${g.length} groups`);
}

main()
  .then(() => db.$client.end())
  .catch(async (err) => {
    console.error(err);
    await db.$client.end();
    process.exit(1);
  });
