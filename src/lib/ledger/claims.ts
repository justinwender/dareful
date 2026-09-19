/**
 * Accountless participation (PLANNING.md section 4). A claim is a first-class participant: a ghost the creator
 * named, who can be a group member and the debtor of pending proposals before they exist as a user. Nothing
 * mints for a ghost. Binding rewrites every reference to the claim into the user, in one transaction, and
 * everything the person then confirms goes through the ordinary confirm path.
 *
 * Three rules hold throughout. A link never authenticates: a claim link says who the creator thinks the
 * recipient is, and only the recipient can say the creator is right. A browser token is issued only on an
 * explicit "that's me", never on a page view, so holding one always means someone tapped in that browser.
 * A phone hash is never exposed: a creator learns that a picked contact resolved to someone, never a way to
 * ask whether an arbitrary number is here.
 */
import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashToken, newToken } from "./tokens";

export type ClaimRow = typeof schema.participantClaims.$inferSelect;
export type GroupRow = typeof schema.groups.$inferSelect;
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Someone a cover can be logged against: an account-holder, or a ghost. */
export type Person = { kind: "user"; userId: string } | { kind: "claim"; claimId: string };

export class ClaimError extends Error {
  constructor(
    message: string,
    public readonly code: "not_yours" | "is_you" | "already_claimed" | "unknown" | "not_allowed" | "slow_down",
  ) {
    super(message);
    this.name = "ClaimError";
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "23505";
}

// ------------------------------------------------------------------------------------------------ resolving

/**
 * Turns a picked contact or a typed name into a person. A phone hash that matches an account resolves to that
 * user; otherwise the creator's existing ghost for that hash is reused, or a new ghost is made. A typed name
 * always makes a new ghost: the creator picks an existing one by id when they mean the same person.
 */
export async function resolvePicked(input: { creatorId: string; displayName: string; phoneHash: Buffer | null }): Promise<Person> {
  const displayName = input.displayName.trim().slice(0, 40);
  if (!displayName) throw new ClaimError("who is it?", "unknown");
  const { creatorId, phoneHash } = input;

  if (phoneHash) {
    const [user] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.phoneHash, phoneHash)).limit(1);
    if (user) {
      if (user.id === creatorId) throw new ClaimError("that one is you", "is_you");
      return { kind: "user", userId: user.id };
    }
    const mine = () =>
      db
        .select({ id: schema.participantClaims.id })
        .from(schema.participantClaims)
        .where(
          and(
            eq(schema.participantClaims.createdBy, creatorId),
            eq(schema.participantClaims.phoneHash, phoneHash),
            isNull(schema.participantClaims.claimedBy),
            isNull(schema.participantClaims.mergedInto),
          ),
        )
        .limit(1);
    const [existing] = await mine();
    if (existing) return { kind: "claim", claimId: existing.id };
    try {
      const [made] = await db.insert(schema.participantClaims).values({ displayName, phoneHash, createdBy: creatorId }).returning({ id: schema.participantClaims.id });
      if (made) return { kind: "claim", claimId: made.id };
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
    }
    // Lost a race with the same creator picking the same contact; the other insert is the ghost.
    const [raced] = await mine();
    if (!raced) throw new ClaimError("could not add that person", "unknown");
    return { kind: "claim", claimId: raced.id };
  }

  const [made] = await db.insert(schema.participantClaims).values({ displayName, phoneHash: null, createdBy: creatorId }).returning({ id: schema.participantClaims.id });
  if (!made) throw new ClaimError("could not add that person", "unknown");
  return { kind: "claim", claimId: made.id };
}

/** Resolutions carrying a phone number that one person may make in an hour. A night out adds a handful. */
export const CONTACT_RESOLUTIONS_PER_HOUR = 20;

/**
 * Spends one of this hour's resolutions, or refuses. Whether a number resolves to an account or to a ghost is
 * an account-existence oracle for anyone who can submit arbitrary numbers; this caps how fast it can be asked.
 * The count and the insert share a transaction under a per-user advisory lock, so a burst of parallel requests
 * cannot all read "nineteen" and all pass. Records who asked and when, never anything about the number.
 */
export async function spendContactResolution(userId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`contact-resolution:${userId}`}, 0))`);
    const rows = await tx.execute<{ n: number }>(sql`
      select count(*)::int as n from ${schema.contactResolutions}
      where user_id = ${userId} and created_at > now() - interval '1 hour'
    `);
    if ((Array.from(rows)[0]?.n ?? 0) >= CONTACT_RESOLUTIONS_PER_HOUR) {
      throw new ClaimError("too many new people at once", "slow_down");
    }
    await tx.insert(schema.contactResolutions).values({ userId });
  });
}

/** Follows merges to the ghost that survived. */
async function survivor(tx: Tx | typeof db, claimId: string): Promise<ClaimRow | null> {
  let id: string | null = claimId;
  for (let hops = 0; id && hops < 8; hops += 1) {
    const [row]: ClaimRow[] = await tx.select().from(schema.participantClaims).where(eq(schema.participantClaims.id, id)).limit(1);
    if (!row) return null;
    if (!row.mergedInto) return row;
    id = row.mergedInto;
  }
  return null;
}

export async function claimById(id: string): Promise<ClaimRow | null> {
  return survivor(db, id);
}

/** A live ghost the creator made: not yet claimed, not merged away. */
async function requireOwnGhost(tx: Tx | typeof db, claimId: string, creatorId: string): Promise<ClaimRow> {
  const claim = await survivor(tx, claimId);
  if (!claim) throw new ClaimError("that person does not exist", "unknown");
  if (claim.createdBy !== creatorId) throw new ClaimError("only the person who added them can do that", "not_yours");
  if (claim.claimedBy) throw new ClaimError("they have an account now", "already_claimed");
  return claim;
}

/** The creator's live ghosts, most recent first: offered before the picker is reopened. */
export async function ghostsForCreator(creatorId: string): Promise<Array<{ id: string; displayName: string }>> {
  return db
    .select({ id: schema.participantClaims.id, displayName: schema.participantClaims.displayName })
    .from(schema.participantClaims)
    .where(and(eq(schema.participantClaims.createdBy, creatorId), isNull(schema.participantClaims.claimedBy), isNull(schema.participantClaims.mergedInto)))
    .orderBy(desc(schema.participantClaims.createdAt));
}

// ---------------------------------------------------------------------------------------- groups and dyads

export async function isClaimMember(groupId: string, claimId: string): Promise<boolean> {
  const [row] = await db
    .select({ groupId: schema.groupMembers.groupId })
    .from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.claimId, claimId), isNull(schema.groupMembers.leftAt)))
    .limit(1);
  return Boolean(row);
}

/** The implicit two-person group between a user and a ghost, formed the way it is between two users. */
export async function ensureDyadWithClaim(userId: string, claimId: string): Promise<GroupRow> {
  const found = await db.execute<{ id: string }>(sql`
    select g.id
    from ${schema.groups} g
    join ${schema.groupMembers} a on a.group_id = g.id and a.user_id = ${userId}
    join ${schema.groupMembers} b on b.group_id = g.id and b.claim_id = ${claimId}
    where g.is_dyad
    order by g.created_at asc
    limit 1
  `);
  const hit = Array.from(found)[0];
  if (hit) {
    const [g] = await db.select().from(schema.groups).where(eq(schema.groups.id, hit.id)).limit(1);
    if (g) return g;
  }
  return db.transaction(async (tx) => {
    const [group] = await tx.insert(schema.groups).values({ name: null, isDyad: true, createdBy: userId }).returning();
    if (!group) throw new Error("could not create dyad");
    await tx.insert(schema.groupMembers).values([
      { groupId: group.id, userId },
      { groupId: group.id, claimId },
    ]);
    return group;
  });
}

/** Adds the creator's ghost to a named group they are in, so every later market there just has them. */
export async function addGhostToGroup(groupId: string, claimId: string, byUserId: string): Promise<void> {
  const claim = await requireOwnGhost(db, claimId, byUserId);
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId)).limit(1);
  if (!group || group.isDyad) throw new ClaimError("that group cannot take new people", "not_allowed");
  const [me] = await db
    .select({ groupId: schema.groupMembers.groupId })
    .from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, byUserId), isNull(schema.groupMembers.leftAt)))
    .limit(1);
  if (!me) throw new ClaimError("only someone in the group can add people", "not_allowed");
  await db
    .insert(schema.groupMembers)
    .values({ groupId, claimId: claim.id })
    .onConflictDoUpdate({ target: [schema.groupMembers.groupId, schema.groupMembers.claimId], set: { leftAt: null } });
}

// --------------------------------------------------------------------------------------------- claim links

/** A link the creator sends through their own composer. Returns the token, readable only now. */
export async function createClaimLink(claimId: string, creatorId: string): Promise<string> {
  const claim = await requireOwnGhost(db, claimId, creatorId);
  const token = newToken();
  const tokenHash = hashToken(token);
  if (!tokenHash) throw new Error("could not make a link");
  await db.insert(schema.claimLinks).values({ tokenHash, claimId: claim.id, createdBy: creatorId });
  return token;
}

/** The ghost a live link points at. Reading changes nothing: no token is issued and nobody is signed in. */
export async function readClaimLink(token: string): Promise<{ claim: ClaimRow; creatorName: string } | null> {
  const tokenHash = hashToken(token);
  if (!tokenHash) return null;
  const [link] = await db
    .select()
    .from(schema.claimLinks)
    .where(and(eq(schema.claimLinks.tokenHash, tokenHash), isNull(schema.claimLinks.revokedAt)))
    .limit(1);
  if (!link) return null;
  const claim = await survivor(db, link.claimId);
  if (!claim) return null;
  const [creator] = await db.select({ displayName: schema.users.displayName }).from(schema.users).where(eq(schema.users.id, claim.createdBy)).limit(1);
  return { claim, creatorName: creator?.displayName ?? "A friend" };
}

/**
 * "That's me", from someone without a session. Issues a fresh browser token for the ghost: two tokens, one
 * claim. The caller stores it in an httpOnly cookie; it binds on the next login in that browser.
 */
export async function issueBrowserToken(linkToken: string): Promise<{ claimId: string; browserToken: string } | null> {
  const link = await readClaimLink(linkToken);
  if (!link || link.claim.claimedBy) return null;
  const browserToken = newToken();
  const tokenHash = hashToken(browserToken);
  if (!tokenHash) return null;
  await db.insert(schema.claimTokens).values({ tokenHash, claimId: link.claim.id });
  return { claimId: link.claim.id, browserToken };
}

/** The live ghosts behind the browser tokens a cookie holds. Unknown and spent tokens are skipped. */
export async function claimsForBrowserTokens(tokens: string[]): Promise<ClaimRow[]> {
  const hashes = tokens.map(hashToken).filter((h): h is Buffer => h !== null);
  if (hashes.length === 0) return [];
  const rows = await db.select({ claimId: schema.claimTokens.claimId }).from(schema.claimTokens).where(inArray(schema.claimTokens.tokenHash, hashes));
  const out = new Map<string, ClaimRow>();
  for (const r of rows) {
    const claim = await survivor(db, r.claimId);
    if (claim && !claim.claimedBy) out.set(claim.id, claim);
  }
  return Array.from(out.values());
}

// ------------------------------------------------------------------------------------------------- binding

/**
 * Binding is one operation, applied everywhere. Every row that references the ghost is rewritten to the user
 * in a single transaction, and the proposals keep the one fact the rewrite would lose: which side used to be
 * a ghost. Nothing is onchain for a ghost, so there is nothing on the chain to rewrite.
 *
 * Misbinding is safe on the debtor side, because the person simply declines. On the creditor side the debtor
 * confirms afresh: their signature names the creditor's address, so it can only be made after the bind.
 */
export async function bindClaimToUser(claimId: string, userId: string): Promise<{ claimId: string; proposalIds: string[] } | null> {
  return db.transaction(async (tx) => {
    const found = await survivor(tx, claimId);
    if (!found) return null;
    const [claim] = await tx.select().from(schema.participantClaims).where(eq(schema.participantClaims.id, found.id)).limit(1).for("update");
    if (!claim) return null;
    if (claim.claimedBy) {
      if (claim.claimedBy === userId) return { claimId: claim.id, proposalIds: [] };
      throw new ClaimError("someone else already said that was them", "already_claimed");
    }
    // A creator is never their own ghost: every row between them would be a cover of oneself.
    if (claim.createdBy === userId) throw new ClaimError("that one is you", "is_you");

    // Group membership. Where the user is already in the group their own row stands, and the ghost's row goes.
    const memberships = await tx.select().from(schema.groupMembers).where(eq(schema.groupMembers.claimId, claim.id));
    for (const m of memberships) {
      // A ghost dyad whose pair already has a dyad folds into that one; two dyads for one pair could never net.
      if (await foldGhostDyad(tx, m.groupId, claim.id, userId)) continue;
      const [mine] = await tx
        .select({ leftAt: schema.groupMembers.leftAt })
        .from(schema.groupMembers)
        .where(and(eq(schema.groupMembers.groupId, m.groupId), eq(schema.groupMembers.userId, userId)))
        .limit(1);
      if (mine) {
        await tx.delete(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, m.groupId), eq(schema.groupMembers.claimId, claim.id)));
        if (mine.leftAt !== null && m.leftAt === null) {
          await tx.update(schema.groupMembers).set({ leftAt: null }).where(and(eq(schema.groupMembers.groupId, m.groupId), eq(schema.groupMembers.userId, userId)));
        }
      } else {
        await tx
          .update(schema.groupMembers)
          .set({ claimId: null, userId })
          .where(and(eq(schema.groupMembers.groupId, m.groupId), eq(schema.groupMembers.claimId, claim.id)));
      }
    }

    // Proposals, either side. A row that would become a cover of oneself is closed instead of rewritten into one.
    const now = new Date();
    await tx
      .update(schema.obligationProposals)
      .set({ status: "declined", resolvedAt: now })
      .where(
        and(
          eq(schema.obligationProposals.status, "pending"),
          or(
            and(eq(schema.obligationProposals.fromClaim, claim.id), eq(schema.obligationProposals.toUser, userId)),
            and(eq(schema.obligationProposals.toClaim, claim.id), eq(schema.obligationProposals.fromUser, userId)),
          ),
        ),
      );
    const asDebtor = await tx
      .update(schema.obligationProposals)
      .set({ fromClaim: null, fromUser: userId, fromBoundClaim: claim.id })
      .where(eq(schema.obligationProposals.fromClaim, claim.id))
      .returning({ id: schema.obligationProposals.id, status: schema.obligationProposals.status });
    const asCreditor = await tx
      .update(schema.obligationProposals)
      .set({ toClaim: null, toUser: userId, toBoundClaim: claim.id })
      .where(eq(schema.obligationProposals.toClaim, claim.id))
      .returning({ id: schema.obligationProposals.id, status: schema.obligationProposals.status });

    // Market positions and personal links. A position the user already holds in the same market stands.
    await tx.execute(sql`
      update ${schema.darePositions} p
      set claim_id = null, user_id = ${userId}, acknowledged_at = coalesce(p.acknowledged_at, now())
      where p.claim_id = ${claim.id}
        and not exists (select 1 from ${schema.darePositions} q where q.dare_id = p.dare_id and q.user_id = ${userId})
    `);
    await tx.update(schema.personalLinks).set({ claimId: null, userId }).where(eq(schema.personalLinks.claimId, claim.id));

    await tx.update(schema.participantClaims).set({ claimedBy: userId, claimedAt: now }).where(eq(schema.participantClaims.id, claim.id));

    const pending = [...asDebtor, ...asCreditor].filter((p) => p.status === "pending").map((p) => p.id);
    return { claimId: claim.id, proposalIds: pending };
  });
}

/**
 * One pair, one dyad. Obligations are scoped to a group in the token id, so two dyads between the same two
 * people could never net against each other. When a ghost binds to someone the other member already has a dyad
 * with, the ghost's dyad folds into that one: its units move (or map onto an equivalent unit already there),
 * every row that named it is repointed, and it is deleted. This is only possible because a ghost dyad has no
 * onchain state by construction (nothing mints for a ghost); that is checked, and a violation fails loudly
 * rather than orphaning a registered group. Returns whether the group was folded away.
 */
async function foldGhostDyad(tx: Tx, groupId: string, claimId: string, userId: string): Promise<boolean> {
  const [group] = await tx.select().from(schema.groups).where(eq(schema.groups.id, groupId)).limit(1).for("update");
  if (!group || !group.isDyad) return false;
  const others = await tx
    .select({ userId: schema.groupMembers.userId })
    .from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.groupId, groupId), sql`${schema.groupMembers.userId} is not null`));
  const other = others[0]?.userId;
  if (others.length !== 1 || !other || other === userId) return false;

  const existing = await tx.execute<{ id: string }>(sql`
    select g.id
    from ${schema.groups} g
    join ${schema.groupMembers} x on x.group_id = g.id and x.user_id = ${other}
    join ${schema.groupMembers} y on y.group_id = g.id and y.user_id = ${userId}
    where g.is_dyad and g.id <> ${groupId}
    order by g.created_at asc
    limit 1
  `);
  const target = Array.from(existing)[0]?.id;
  if (!target) return false;

  const denoms = await tx.select().from(schema.denominations).where(eq(schema.denominations.groupId, groupId));
  const [minted] = await tx.select({ id: schema.obligations.id }).from(schema.obligations).where(eq(schema.obligations.groupId, groupId)).limit(1);
  if (group.onchainId !== null || minted || denoms.some((d) => d.onchainId !== null)) {
    throw new Error(`ghost dyad ${groupId} has onchain state and cannot be folded; nothing should ever mint for a ghost`);
  }

  const targetDenoms = await tx.select().from(schema.denominations).where(eq(schema.denominations.groupId, target));
  for (const d of denoms) {
    const same = targetDenoms.find((t) =>
      d.template !== null
        ? t.template === d.template
        : t.template === null && t.label.trim().toLowerCase() === d.label.trim().toLowerCase() && t.quantifiable === d.quantifiable && t.monetary === d.monetary,
    );
    if (same) {
      await tx.update(schema.obligationProposals).set({ denomId: same.id }).where(eq(schema.obligationProposals.denomId, d.id));
      await tx.update(schema.dares).set({ denomId: same.id }).where(eq(schema.dares.denomId, d.id));
      await tx.delete(schema.denominations).where(eq(schema.denominations.id, d.id));
    } else {
      await tx.update(schema.denominations).set({ groupId: target }).where(eq(schema.denominations.id, d.id));
    }
  }
  await tx.update(schema.obligationProposals).set({ groupId: target }).where(eq(schema.obligationProposals.groupId, groupId));
  await tx.update(schema.dares).set({ groupId: target }).where(eq(schema.dares.groupId, groupId));
  await tx.update(schema.plans).set({ groupId: target }).where(eq(schema.plans.groupId, groupId));
  await tx.update(schema.expenses).set({ groupId: target }).where(eq(schema.expenses.groupId, groupId));
  await tx.delete(schema.groupInvites).where(eq(schema.groupInvites.groupId, groupId));
  await tx.delete(schema.groupMembers).where(eq(schema.groupMembers.groupId, groupId));
  await tx.delete(schema.groups).where(eq(schema.groups.id, groupId));
  // The pair may have left their old dyad's seats; being named together again reopens them.
  await tx.update(schema.groupMembers).set({ leftAt: null }).where(and(eq(schema.groupMembers.groupId, target), inArray(schema.groupMembers.userId, [other, userId])));
  return true;
}

/** Phone: every ghost carrying the hash binds, across every creator who ever picked them. Silent and exact. */
export async function bindByPhone(userId: string, phoneHash: Buffer): Promise<string[]> {
  const claims = await db
    .select({ id: schema.participantClaims.id })
    .from(schema.participantClaims)
    .where(
      and(
        eq(schema.participantClaims.phoneHash, phoneHash),
        isNull(schema.participantClaims.claimedBy),
        isNull(schema.participantClaims.mergedInto),
        ne(schema.participantClaims.createdBy, userId),
      ),
    );
  const bound: string[] = [];
  for (const c of claims) {
    const r = await bindClaimToUser(c.id, userId);
    if (r) bound.push(r.claimId);
  }
  return bound;
}

/** Token: the ghosts someone said "that's me" to in this browser bind on their next login here. */
export async function bindByBrowserTokens(userId: string, tokens: string[]): Promise<string[]> {
  const claims = await claimsForBrowserTokens(tokens);
  const bound: string[] = [];
  for (const c of claims) {
    if (c.createdBy === userId) continue;
    try {
      const r = await bindClaimToUser(c.id, userId);
      if (r) bound.push(r.claimId);
    } catch (err) {
      if (!(err instanceof ClaimError)) throw err; // someone else got there first: not this login's problem
    }
  }
  return bound;
}

// ------------------------------------------------------------------------------------------ merge and dismiss

/**
 * "This Gabe is that Gabe." The creator points their ghost at an account-holder they share a group with, or
 * at another of their ghosts. Into a user it is a bind; into a ghost, every reference moves to the survivor
 * and the browser tokens and links move with it, so whoever holds one still reaches the same person.
 */
export async function mergeGhost(creatorId: string, claimId: string, target: Person): Promise<void> {
  const source = await requireOwnGhost(db, claimId, creatorId);

  if (target.kind === "user") {
    if (target.userId === creatorId) throw new ClaimError("that one is you", "is_you");
    const shared = await db.execute<{ n: number }>(sql`
      select count(*)::int as n
      from ${schema.groupMembers} a
      join ${schema.groupMembers} b on a.group_id = b.group_id
      where a.user_id = ${creatorId} and b.user_id = ${target.userId} and a.left_at is null and b.left_at is null
    `);
    if ((Array.from(shared)[0]?.n ?? 0) === 0) throw new ClaimError("you can only point them at someone you share a group with", "not_allowed");
    await bindClaimToUser(source.id, target.userId);
    return;
  }

  const into = await requireOwnGhost(db, target.claimId, creatorId);
  if (into.id === source.id) return;
  await db.transaction(async (tx) => {
    const memberships = await tx.select().from(schema.groupMembers).where(eq(schema.groupMembers.claimId, source.id));
    for (const m of memberships) {
      const [already] = await tx
        .select({ groupId: schema.groupMembers.groupId })
        .from(schema.groupMembers)
        .where(and(eq(schema.groupMembers.groupId, m.groupId), eq(schema.groupMembers.claimId, into.id)))
        .limit(1);
      if (already) await tx.delete(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, m.groupId), eq(schema.groupMembers.claimId, source.id)));
      else await tx.update(schema.groupMembers).set({ claimId: into.id }).where(and(eq(schema.groupMembers.groupId, m.groupId), eq(schema.groupMembers.claimId, source.id)));
    }
    await tx.update(schema.obligationProposals).set({ fromClaim: into.id }).where(eq(schema.obligationProposals.fromClaim, source.id));
    await tx.update(schema.obligationProposals).set({ toClaim: into.id }).where(eq(schema.obligationProposals.toClaim, source.id));
    await tx.execute(sql`
      update ${schema.darePositions} p set claim_id = ${into.id}
      where p.claim_id = ${source.id}
        and not exists (select 1 from ${schema.darePositions} q where q.dare_id = p.dare_id and q.claim_id = ${into.id})
    `);
    await tx.update(schema.personalLinks).set({ claimId: into.id }).where(eq(schema.personalLinks.claimId, source.id));
    await tx.update(schema.claimTokens).set({ claimId: into.id }).where(eq(schema.claimTokens.claimId, source.id));
    await tx.update(schema.claimLinks).set({ claimId: into.id }).where(eq(schema.claimLinks.claimId, source.id));
    // The source leaves the partial unique index first, then the survivor may take its phone hash.
    await tx.update(schema.participantClaims).set({ mergedInto: into.id, phoneHash: null }).where(eq(schema.participantClaims.id, source.id));
    if (!into.phoneHash && source.phoneHash) {
      await tx.update(schema.participantClaims).set({ phoneHash: source.phoneHash }).where(eq(schema.participantClaims.id, into.id));
    }
  });
}

/**
 * The creator lets a ghost go. Nothing was minted for them, so nothing is unwound: their pending rows close,
 * they leave the groups, their links stop working, and the phone hash is deleted, which is the one deletion
 * the product makes because it was never ledger history. The ghost row stays for the record.
 */
export async function dismissGhost(creatorId: string, claimId: string): Promise<void> {
  const claim = await requireOwnGhost(db, claimId, creatorId);
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(schema.obligationProposals)
      .set({ status: "declined", resolvedAt: now })
      .where(and(eq(schema.obligationProposals.status, "pending"), or(eq(schema.obligationProposals.fromClaim, claim.id), eq(schema.obligationProposals.toClaim, claim.id))));
    await tx.update(schema.groupMembers).set({ leftAt: now }).where(and(eq(schema.groupMembers.claimId, claim.id), isNull(schema.groupMembers.leftAt)));
    await tx.update(schema.claimLinks).set({ revokedAt: now }).where(and(eq(schema.claimLinks.claimId, claim.id), isNull(schema.claimLinks.revokedAt)));
    await tx.update(schema.participantClaims).set({ phoneHash: null }).where(eq(schema.participantClaims.id, claim.id));
  });
}

// ------------------------------------------------------------------------------------------------- queries

export type ProposalRow = typeof schema.obligationProposals.$inferSelect;

/** Pending rows where the ghost is the one named: what they will see when they claim. */
export async function pendingForClaim(claimId: string): Promise<ProposalRow[]> {
  return db
    .select()
    .from(schema.obligationProposals)
    .where(and(eq(schema.obligationProposals.fromClaim, claimId), eq(schema.obligationProposals.status, "pending")))
    .orderBy(desc(schema.obligationProposals.createdAt));
}

/** Everything between a user and a ghost, newest first, for the creator's provisional timeline. */
export async function proposalsWithClaim(userId: string, claimId: string): Promise<ProposalRow[]> {
  return db
    .select()
    .from(schema.obligationProposals)
    .where(
      or(
        and(eq(schema.obligationProposals.fromClaim, claimId), eq(schema.obligationProposals.toUser, userId)),
        and(eq(schema.obligationProposals.toClaim, claimId), eq(schema.obligationProposals.fromUser, userId)),
      ),
    )
    .orderBy(desc(schema.obligationProposals.createdAt));
}

/**
 * The claimant's first screen: pending rows that arrived by binding, where this user is the one named.
 * Oldest first inside the batch, so the order signed over is stable between the page and the submit.
 */
export async function boundPendingForDebtor(userId: string): Promise<ProposalRow[]> {
  return db
    .select()
    .from(schema.obligationProposals)
    .where(
      and(
        eq(schema.obligationProposals.fromUser, userId),
        eq(schema.obligationProposals.status, "pending"),
        sql`${schema.obligationProposals.fromBoundClaim} is not null`,
        sql`${schema.obligationProposals.toUser} is not null`,
      ),
    )
    .orderBy(asc(schema.obligationProposals.createdAt), asc(schema.obligationProposals.id));
}

/** Pending rows where this user is named and the creditor used to be a ghost: they confirm who it turned out to be. */
export async function creditorReconfirmsForDebtor(userId: string): Promise<ProposalRow[]> {
  return db
    .select()
    .from(schema.obligationProposals)
    .where(
      and(
        eq(schema.obligationProposals.fromUser, userId),
        eq(schema.obligationProposals.status, "pending"),
        sql`${schema.obligationProposals.toBoundClaim} is not null`,
      ),
    )
    .orderBy(desc(schema.obligationProposals.createdAt));
}

/**
 * Claimant suggestion: unclaimed ghosts in groups this user belongs to whose name matches theirs. A suggestion
 * only, never automatic: "Justin has things with a Gabe. Is that you?"
 */
export async function suggestedGhostsFor(userId: string, displayName: string): Promise<Array<{ claimId: string; displayName: string; creatorName: string }>> {
  const first = displayName.trim().split(/\s+/)[0]?.toLowerCase();
  if (!first) return [];
  const rows = await db.execute<{ claim_id: string; display_name: string; creator_name: string }>(sql`
    select distinct c.id as claim_id, c.display_name, u.display_name as creator_name
    from ${schema.participantClaims} c
    join ${schema.groupMembers} gc on gc.claim_id = c.id and gc.left_at is null
    join ${schema.groupMembers} gu on gu.group_id = gc.group_id and gu.user_id = ${userId} and gu.left_at is null
    join ${schema.users} u on u.id = c.created_by
    where c.claimed_by is null and c.merged_into is null and c.created_by <> ${userId}
      and lower(split_part(trim(c.display_name), ' ', 1)) = ${first}
  `);
  return Array.from(rows).map((r) => ({ claimId: r.claim_id, displayName: r.display_name, creatorName: r.creator_name }));
}

/**
 * "Fine, you got me", from the browser holding the ghost's token. Recorded on the proposal as a provisional
 * acknowledgment with no binding force; it pre-selects confirm at claim time.
 */
export async function concede(proposalId: string, browserTokens: string[]): Promise<boolean> {
  const claims = await claimsForBrowserTokens(browserTokens);
  if (claims.length === 0) return false;
  const updated = await db
    .update(schema.obligationProposals)
    .set({ concededAt: new Date() })
    .where(
      and(
        eq(schema.obligationProposals.id, proposalId),
        eq(schema.obligationProposals.status, "pending"),
        inArray(
          schema.obligationProposals.fromClaim,
          claims.map((c) => c.id),
        ),
        isNull(schema.obligationProposals.concededAt),
      ),
    )
    .returning({ id: schema.obligationProposals.id });
  return updated.length > 0;
}
