/**
 * Shared fixtures for the database layer. These tests run against the real database (there is no other one),
 * so every row a test makes is tracked by id at the moment it is made and removed in `cleanup`. Nothing is
 * ever deleted by "whatever is new since the run started": someone may be using the app at the same time.
 * Temporary users carry a `tmp-check:` Dynamic id and random addresses; phone numbers are fictional.
 */
import { randomBytes, randomUUID } from "node:crypto";
import { generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { eq, inArray, like, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import * as claims from "@/lib/ledger/claims";
import { ensureUsd } from "@/lib/ledger/denominations";
import { proposeCover } from "@/lib/ledger/proposals";
import { cents, units } from "@/lib/money";

export type User = typeof schema.users.$inferSelect;

const groupIds = new Set<string>();
const claimIds = new Set<string>();
const userIds = new Set<string>();

export const track = {
  group: (id: string) => (groupIds.add(id), id),
  claim: (id: string) => (claimIds.add(id), id),
};

export async function seedUsers(n: number): Promise<User[]> {
  const rows = await db.select().from(schema.users).where(like(schema.users.dynamicUserId, "seed:%")).orderBy(schema.users.createdAt).limit(n);
  if (rows.length < n) throw new Error(`need ${n} seed users, found ${rows.length}; run the seed first`);
  return rows;
}

export async function tempUser(name: string, phoneHash?: Buffer): Promise<User> {
  const [u] = await db
    .insert(schema.users)
    .values({ dynamicUserId: `tmp-check:${randomUUID()}`, ledgerWallet: `0x${randomBytes(20).toString("hex")}`, governanceWallet: `0x${randomBytes(20).toString("hex")}`, displayName: name, phoneHash })
    .returning();
  if (!u) throw new Error("temp user");
  userIds.add(u.id);
  return u;
}

export type Signer = { user: User; ledger: PrivateKeyAccount; governance: PrivateKeyAccount };

/** A temporary user whose two wallets have keys, for anything that has to be signed: entries, and votes. */
export async function tempSigner(name: string): Promise<Signer> {
  const ledger = privateKeyToAccount(generatePrivateKey());
  const governance = privateKeyToAccount(generatePrivateKey());
  const [u] = await db
    .insert(schema.users)
    .values({ dynamicUserId: `tmp-check:${randomUUID()}`, ledgerWallet: ledger.address.toLowerCase(), governanceWallet: governance.address.toLowerCase(), displayName: name })
    .returning();
  if (!u) throw new Error("temp signer");
  userIds.add(u.id);
  return { user: u, ledger, governance };
}

/** A fictional US number, unique within a run: 555-01xx is reserved for fiction; the area code varies. */
const AREAS = ["212", "213", "312", "415", "617", "206", "303", "404", "512", "702"];
let phoneSeq = Math.floor(Math.random() * 1000);
export function fictionalPhone(): string {
  phoneSeq = (phoneSeq + 1) % 1000;
  return `+1${AREAS[Math.floor(phoneSeq / 100)]}55501${String(phoneSeq % 100).padStart(2, "0")}`;
}

export async function ghost(creatorId: string, displayName: string, phoneHash: Buffer | null = null): Promise<string> {
  const p = await claims.resolvePicked({ creatorId, displayName, phoneHash });
  if (p.kind !== "claim") throw new Error("expected a ghost");
  return track.claim(p.claimId);
}

export async function ghostDyad(creatorId: string, claimId: string) {
  const g = await claims.ensureDyadWithClaim(creatorId, claimId);
  track.group(g.id);
  return g;
}

/** "I got this one" against a ghost, in dollars, in the pair's dyad. */
export async function cover(creatorId: string, claimId: string, memo: string, amount = 1200n) {
  const dyad = await ghostDyad(creatorId, claimId);
  const usd = await ensureUsd(dyad.id, creatorId);
  return proposeCover({ creditorId: creatorId, debtor: { kind: "claim", claimId }, groupId: dyad.id, denomId: usd.id, quantity: units(amount), amountCents: cents(amount), settleExpected: true, memo });
}

export async function proposal(id: string) {
  return (await db.select().from(schema.obligationProposals).where(eq(schema.obligationProposals.id, id)))[0];
}

export async function codeOf(fn: () => Promise<unknown>): Promise<string | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    if (err instanceof Error && err.name === "MarketError" && "code" in err) return String(err.code);
    return err instanceof claims.ClaimError ? err.code : `other:${err instanceof Error ? err.message : String(err)}`;
  }
}

export async function cleanup(): Promise<void> {
  try {
    await removeEverything();
  } finally {
    // Always, or a failed cleanup leaves the process alive forever with an open client.
    await db.$client.end();
  }
}

async function removeEverything(): Promise<void> {
  const u = [...userIds];
  // Broken code can make rows the test never saw (that is what the audit does on purpose), so anything a
  // temporary user created or claimed is this run's, tracked or not.
  if (u.length) {
    const C = schema.participantClaims;
    for (const r of await db.select({ id: C.id }).from(C).where(or(inArray(C.createdBy, u), inArray(C.claimedBy, u)))) claimIds.add(r.id);
    for (const r of await db.select({ id: schema.groups.id }).from(schema.groups).where(inArray(schema.groups.createdBy, u))) groupIds.add(r.id);
  }
  const c = [...claimIds];
  // Dyads a temporary user or a tracked ghost sits in are this run's by construction (a fold can move a
  // ghost's rows into a dyad the test never saw created). Named groups are only ever removed by tracked id.
  if (u.length || c.length) {
    const M = schema.groupMembers;
    const seats = await db
      .select({ id: schema.groups.id })
      .from(schema.groups)
      .innerJoin(M, eq(M.groupId, schema.groups.id))
      .where(sql`${schema.groups.isDyad} and (${u.length ? inArray(M.userId, u) : sql`false`} or ${c.length ? inArray(M.claimId, c) : sql`false`})`);
    for (const s of seats) groupIds.add(s.id);
  }
  const g = [...groupIds];
  await db.transaction(async (tx) => {
    // Markets hang off groups and users; positions, votes, statements and minted-edge shadows hang off markets.
    const D = schema.dares;
    const asked = await tx.select({ id: D.id }).from(D).where(or(u.length ? inArray(D.creatorId, u) : sql`false`, g.length ? inArray(D.groupId, g) : sql`false`));
    if (asked.length) {
      const ids = asked.map((d) => d.id);
      await tx.delete(schema.notificationLog).where(inArray(schema.notificationLog.dareId, ids));
      await tx.delete(schema.roomCodes).where(inArray(schema.roomCodes.dareId, ids));
      await tx.delete(schema.dareNumberSeries).where(inArray(schema.dareNumberSeries.dareId, ids));
      await tx.delete(schema.dareVotes).where(inArray(schema.dareVotes.dareId, ids));
      await tx.delete(schema.dareStatements).where(inArray(schema.dareStatements.dareId, ids));
      await tx.delete(schema.darePositions).where(inArray(schema.darePositions.dareId, ids));
      await tx.delete(schema.obligations).where(inArray(schema.obligations.originId, ids));
      await tx.delete(D).where(inArray(D.id, ids));
    }
    if (u.length) {
      await tx.delete(schema.codeAttempts).where(inArray(schema.codeAttempts.userId, u));
      await tx.delete(schema.deviceStates).where(inArray(schema.deviceStates.userId, u));
      await tx.delete(schema.pushSubscriptions).where(inArray(schema.pushSubscriptions.userId, u));
      await tx.delete(schema.notificationLog).where(or(inArray(schema.notificationLog.userId, u), inArray(schema.notificationLog.causedBy, u)));
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
    const conds = [];
    if (g.length) conds.push(inArray(P.groupId, g));
    if (u.length) conds.push(inArray(P.fromUser, u), inArray(P.toUser, u));
    if (c.length) conds.push(inArray(P.fromClaim, c), inArray(P.toClaim, c), inArray(P.fromBoundClaim, c), inArray(P.toBoundClaim, c));
    if (conds.length) await tx.delete(P).where(or(...conds));
    if (c.length) {
      await tx.delete(schema.claimTokens).where(inArray(schema.claimTokens.claimId, c));
      await tx.delete(schema.claimLinks).where(inArray(schema.claimLinks.claimId, c));
      await tx.delete(schema.groupMembers).where(inArray(schema.groupMembers.claimId, c));
    }
    if (u.length) {
      await tx.delete(schema.contactResolutions).where(inArray(schema.contactResolutions.userId, u));
      await tx.delete(schema.groupMembers).where(inArray(schema.groupMembers.userId, u));
    }
    if (g.length) {
      await tx.delete(schema.groupInvites).where(inArray(schema.groupInvites.groupId, g));
      await tx.delete(schema.groupMembers).where(inArray(schema.groupMembers.groupId, g));
      await tx.delete(schema.denominations).where(inArray(schema.denominations.groupId, g));
      await tx.delete(schema.groups).where(inArray(schema.groups.id, g));
    }
    if (c.length) {
      await tx.update(schema.participantClaims).set({ mergedInto: null }).where(inArray(schema.participantClaims.id, c));
      await tx.delete(schema.participantClaims).where(inArray(schema.participantClaims.id, c));
    }
    if (u.length) {
      await tx.delete(schema.denominations).where(inArray(schema.denominations.createdBy, u));
      await tx.delete(schema.users).where(inArray(schema.users.id, u));
    }
  });
  const left = await db.execute<{ tmp_users: number }>(sql`select count(*)::int as tmp_users from users where dynamic_user_id like 'tmp-check:%'`);
  const n = Array.from(left)[0]?.tmp_users ?? 0;
  if (n > 0) console.error(`cleanup left ${n} temporary users behind (another run's, or run npm run test:sweep)`);
}
