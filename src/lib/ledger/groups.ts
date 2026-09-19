import { and, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { randomUUID } from "node:crypto";
import { derivedToken, hashToken } from "@/lib/ledger/tokens";

export type GroupRow = typeof schema.groups.$inferSelect;
export type UserRow = typeof schema.users.$inferSelect;

export type GroupMember = {
  userId: string | null;
  claimId: string | null;
  displayName: string;
  ledgerWallet: string | null;
  joinedAt: Date;
  /** For a ghost, who added them: only that person can link, merge, or let them go. Null for account-holders. */
  addedBy: string | null;
};

export async function groupsForUser(userId: string): Promise<Array<GroupRow & { members: GroupMember[] }>> {
  const memberships = await db
    .select({ groupId: schema.groupMembers.groupId })
    .from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.userId, userId), isNull(schema.groupMembers.leftAt)));
  const ids = memberships.map((m) => m.groupId);
  if (ids.length === 0) return [];
  const groups = await db.select().from(schema.groups).where(inArray(schema.groups.id, ids)).orderBy(desc(schema.groups.createdAt));
  const members = await membersOfGroups(ids);
  return groups.map((g) => ({ ...g, members: members.get(g.id) ?? [] }));
}

export async function membersOfGroups(groupIds: string[]): Promise<Map<string, GroupMember[]>> {
  const out = new Map<string, GroupMember[]>();
  if (groupIds.length === 0) return out;
  const rows = await db
    .select({
      groupId: schema.groupMembers.groupId,
      userId: schema.groupMembers.userId,
      claimId: schema.groupMembers.claimId,
      joinedAt: schema.groupMembers.joinedAt,
      userName: schema.users.displayName,
      ledgerWallet: schema.users.ledgerWallet,
      claimName: schema.participantClaims.displayName,
      claimAddedBy: schema.participantClaims.createdBy,
    })
    .from(schema.groupMembers)
    .leftJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id))
    .leftJoin(schema.participantClaims, eq(schema.groupMembers.claimId, schema.participantClaims.id))
    .where(and(inArray(schema.groupMembers.groupId, groupIds), isNull(schema.groupMembers.leftAt)))
    .orderBy(schema.groupMembers.joinedAt);
  for (const r of rows) {
    const list = out.get(r.groupId) ?? [];
    list.push({
      userId: r.userId,
      claimId: r.claimId,
      displayName: r.userName ?? r.claimName ?? "Friend",
      ledgerWallet: r.ledgerWallet,
      joinedAt: r.joinedAt,
      addedBy: r.claimId ? r.claimAddedBy : null,
    });
    out.set(r.groupId, list);
  }
  return out;
}

export async function groupWithMembers(groupId: string): Promise<(GroupRow & { members: GroupMember[] }) | null> {
  const [g] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId)).limit(1);
  if (!g) return null;
  const members = await membersOfGroups([groupId]);
  return { ...g, members: members.get(groupId) ?? [] };
}

export async function isMember(groupId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ groupId: schema.groupMembers.groupId })
    .from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId), isNull(schema.groupMembers.leftAt)))
    .limit(1);
  return Boolean(row);
}

export async function createGroup(input: { name: string; createdBy: string; memberUserIds?: string[] }): Promise<GroupRow> {
  const name = input.name.trim();
  if (!name) throw new Error("a group needs a name");
  const memberIds = Array.from(new Set([input.createdBy, ...(input.memberUserIds ?? [])]));
  return db.transaction(async (tx) => {
    const [group] = await tx.insert(schema.groups).values({ name, isDyad: false, createdBy: input.createdBy }).returning();
    if (!group) throw new Error("could not create group");
    await tx.insert(schema.groupMembers).values(memberIds.map((userId) => ({ groupId: group.id, userId })));
    return group;
  });
}

/**
 * The implicit two-person group between two account-holders, created lazily on first obligation. The oldest
 * one wins: binding a ghost to someone the creator already had a dyad with leaves the pair with two, and
 * every caller must land on the same one (docs/decisions.md 2026-09-18).
 */
export async function ensureDyad(a: string, b: string): Promise<GroupRow> {
  if (a === b) throw new Error("a dyad needs two people");
  const found = await db.execute<{ id: string }>(sql`
    select g.id
    from ${schema.groups} g
    join ${schema.groupMembers} x on x.group_id = g.id and x.user_id = ${a}
    join ${schema.groupMembers} y on y.group_id = g.id and y.user_id = ${b}
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
    const [group] = await tx.insert(schema.groups).values({ name: null, isDyad: true, createdBy: a }).returning();
    if (!group) throw new Error("could not create dyad");
    await tx.insert(schema.groupMembers).values([
      { groupId: group.id, userId: a },
      { groupId: group.id, userId: b },
    ]);
    return group;
  });
}

/** Everyone the user shares a group with (account-holders only), for the people list. */
export async function peopleForUser(userId: string): Promise<Array<{ user: UserRow; sharedGroups: number }>> {
  const groups = await groupsForUser(userId);
  const counts = new Map<string, number>();
  for (const g of groups) {
    for (const m of g.members) {
      if (m.userId && m.userId !== userId) counts.set(m.userId, (counts.get(m.userId) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return [];
  const users = await db.select().from(schema.users).where(inArray(schema.users.id, Array.from(counts.keys())));
  return users
    .map((user) => ({ user, sharedGroups: counts.get(user.id) ?? 0 }))
    .sort((x, y) => x.user.displayName.localeCompare(y.user.displayName));
}

// ---------------------------------------------------------------------------------------------- invites
// A group invite is a row in group_invites, revocable and counted (docs/decisions.md 2026-09-18). Joining a
// group makes someone a quorum member in every later market there, so the link has to be something a member
// can turn off. Only the token's hash is stored, so a link is shown once, when it is made.

const INVITE_DAYS = 14;

export type InviteRow = typeof schema.groupInvites.$inferSelect;

export type ActiveInvite = {
  /** Hex of the token hash: identifies the row to revoke and cannot be turned back into a link. */
  id: string;
  createdBy: string;
  createdByName: string;
  createdAt: Date;
  expiresAt: Date;
  useCount: number;
  /**
   * The link itself, made again from its seed, for a member to send a second time. Null for a link made before
   * seeds existed, or if the derived token no longer matches what was stored (the secret changed): such a link
   * still works for whoever already has it, and can still be turned off.
   */
  token: string | null;
};

/** Makes a link for the group. The caller must be a current member. Returns the token, which is never readable again. */
export async function createInvite(groupId: string, createdBy: string): Promise<string> {
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId)).limit(1);
  if (!group || group.isDyad) throw new Error("that group cannot be joined by link");
  if (!(await isMember(groupId, createdBy))) throw new Error("only someone in the group can make a link");
  const seed = randomUUID();
  const token = derivedToken(seed);
  const tokenHash = hashToken(token);
  if (!tokenHash) throw new Error("could not make a link");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await db.insert(schema.groupInvites).values({ tokenHash, seed, groupId, createdBy, expiresAt });
  return token;
}

/** The live invite behind a token: exists, not revoked, not expired. Null otherwise, with no reason given. */
export async function readInvite(token: string): Promise<InviteRow | null> {
  const tokenHash = hashToken(token);
  if (!tokenHash) return null;
  const [row] = await db
    .select()
    .from(schema.groupInvites)
    .where(and(eq(schema.groupInvites.tokenHash, tokenHash), isNull(schema.groupInvites.revokedAt), gt(schema.groupInvites.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

/** The token for a stored seed, only if it still hashes to what was stored. Never a guess. */
function rederive(seed: string | null, tokenHash: Buffer): string | null {
  if (!seed) return null;
  const token = derivedToken(seed);
  const again = hashToken(token);
  return again && again.equals(tokenHash) ? token : null;
}

/**
 * Links that still work, newest first, for the group page. Only ever called for a current member (the page and
 * the actions check), because the result carries the links themselves.
 */
export async function activeInvites(groupId: string): Promise<ActiveInvite[]> {
  const rows = await db
    .select({
      tokenHash: schema.groupInvites.tokenHash,
      createdBy: schema.groupInvites.createdBy,
      createdByName: schema.users.displayName,
      createdAt: schema.groupInvites.createdAt,
      expiresAt: schema.groupInvites.expiresAt,
      useCount: schema.groupInvites.useCount,
      seed: schema.groupInvites.seed,
    })
    .from(schema.groupInvites)
    .innerJoin(schema.users, eq(schema.groupInvites.createdBy, schema.users.id))
    .where(and(eq(schema.groupInvites.groupId, groupId), isNull(schema.groupInvites.revokedAt), gt(schema.groupInvites.expiresAt, new Date())))
    .orderBy(desc(schema.groupInvites.createdAt));
  return rows.map((r) => ({
    id: r.tokenHash.toString("hex"),
    createdBy: r.createdBy,
    createdByName: r.createdByName,
    createdAt: r.createdAt,
    expiresAt: r.expiresAt,
    useCount: r.useCount,
    token: rederive(r.seed, r.tokenHash),
  }));
}

/** Any current member can turn off any of the group's links; there are no roles in a group. Idempotent. */
export async function revokeInvite(groupId: string, inviteId: string, userId: string): Promise<void> {
  if (!/^[0-9a-f]{64}$/.test(inviteId)) throw new Error("that link does not exist");
  if (!(await isMember(groupId, userId))) throw new Error("only someone in the group can turn off a link");
  await db
    .update(schema.groupInvites)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(schema.groupInvites.tokenHash, Buffer.from(inviteId, "hex")),
        eq(schema.groupInvites.groupId, groupId),
        isNull(schema.groupInvites.revokedAt),
      ),
    );
}

/**
 * Adds the user to the group if the invite is live. Returns the group. Idempotent for existing members, and
 * only an actual join counts as a use. The invite row is locked for the transaction so two redemptions of one
 * link (a double tap, or an effect that runs twice) serialize instead of both counting.
 */
export async function redeemInvite(token: string, userId: string): Promise<GroupRow | null> {
  const tokenHash = hashToken(token);
  if (!tokenHash) return null;
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .select()
      .from(schema.groupInvites)
      .where(and(eq(schema.groupInvites.tokenHash, tokenHash), isNull(schema.groupInvites.revokedAt), gt(schema.groupInvites.expiresAt, new Date())))
      .limit(1)
      .for("update");
    if (!invite) return null;
    const [group] = await tx.select().from(schema.groups).where(eq(schema.groups.id, invite.groupId)).limit(1);
    if (!group || group.isDyad) return null;
    const [existing] = await tx
      .select({ leftAt: schema.groupMembers.leftAt })
      .from(schema.groupMembers)
      .where(and(eq(schema.groupMembers.groupId, group.id), eq(schema.groupMembers.userId, userId)))
      .limit(1);
    if (existing && existing.leftAt === null) return group;
    if (existing) {
      await tx
        .update(schema.groupMembers)
        .set({ leftAt: null })
        .where(and(eq(schema.groupMembers.groupId, group.id), eq(schema.groupMembers.userId, userId)));
    } else {
      await tx.insert(schema.groupMembers).values({ groupId: group.id, userId });
    }
    await tx
      .update(schema.groupInvites)
      .set({ useCount: sql`${schema.groupInvites.useCount} + 1` })
      .where(eq(schema.groupInvites.tokenHash, tokenHash));
    return group;
  });
}

// ------------------------------------------------------------------------------------ groups as a consequence

/**
 * A group nobody set up: whoever ends up in a question asked with no group picked. It has no name, and may
 * never get one. Naming is what happens when an occasion turns out to recur (docs/design.md 4.7).
 */
export async function createOccasionGroup(createdBy: string): Promise<GroupRow> {
  return db.transaction(async (tx) => {
    const [group] = await tx.insert(schema.groups).values({ name: null, isDyad: false, createdBy }).returning();
    if (!group) throw new Error("could not create group");
    await tx.insert(schema.groupMembers).values({ groupId: group.id, userId: createdBy });
    return group;
  });
}

export const CHIP_TITLE_MAX = 28;

/** What an unnamed group is called, as pure data: its latest question, cut short; first names when it has none. */
export function occasionLabel(input: { latestTitle: string | null; memberNames: string[]; viewerName?: string }): string {
  const title = input.latestTitle?.trim().replace(/\?+$/, "");
  if (title) return title.length > CHIP_TITLE_MAX ? `${title.slice(0, CHIP_TITLE_MAX - 1).trimEnd()}…` : title;
  const firsts = input.memberNames.map((n) => (n === input.viewerName ? "You" : (n.trim().split(/\s+/)[0] ?? n))).sort((a, b) => (a === "You" ? -1 : b === "You" ? 1 : 0));
  if (firsts.length === 0) return "Just you";
  if (firsts.length === 1 && firsts[0] === "You") return "Just you";
  return firsts.length <= 3 ? firsts.join(", ") : `${firsts.slice(0, 3).join(", ")} +${firsts.length - 3}`;
}

export type GroupChip = {
  id: string;
  label: string;
  /** Named by a person. An unnamed group's label is derived and changes as things happen in it. */
  named: boolean;
  /** Came out of one occasion and has not recurred: drawn dashed, "has not happened yet" applied to a group. */
  once: boolean;
  /** Unnamed, and asked in more than once: the moment to offer a name. */
  worthNaming: boolean;
  archived: boolean;
  members: GroupMember[];
};

/** Every non-dyad group this person is in, as chips: labels, and whether each has recurred. */
export async function groupChipsFor(userId: string, viewerName: string): Promise<GroupChip[]> {
  const seats = await db
    .select({ groupId: schema.groupMembers.groupId, archivedAt: schema.groupMembers.archivedAt })
    .from(schema.groupMembers)
    .innerJoin(schema.groups, eq(schema.groups.id, schema.groupMembers.groupId))
    .where(and(eq(schema.groupMembers.userId, userId), isNull(schema.groupMembers.leftAt), eq(schema.groups.isDyad, false)));
  const ids = seats.map((s) => s.groupId);
  if (ids.length === 0) return [];
  const [groups, members, asked] = await Promise.all([
    db.select().from(schema.groups).where(inArray(schema.groups.id, ids)).orderBy(desc(schema.groups.createdAt)),
    membersOfGroups(ids),
    db
      .select({ groupId: schema.dares.groupId, title: schema.dares.title, createdAt: schema.dares.createdAt })
      .from(schema.dares)
      .where(and(inArray(schema.dares.groupId, ids), sql`${schema.dares.creatorSignature} is not null`))
      .orderBy(desc(schema.dares.createdAt)),
  ]);
  // An unnamed group with nothing asked in it is a draft somebody has not sent. It is not a group to anyone yet.
  return groups.filter((g) => g.name !== null || asked.some((a) => a.groupId === g.id)).map((g) => {
    const mine = asked.filter((a) => a.groupId === g.id);
    const people = members.get(g.id) ?? [];
    return {
      id: g.id,
      label: g.name ?? occasionLabel({ latestTitle: mine[0]?.title ?? null, memberNames: people.map((m) => m.displayName), viewerName }),
      named: g.name !== null,
      once: g.name === null && mine.length <= 1,
      worthNaming: g.name === null && mine.length >= 2,
      archived: seats.find((s) => s.groupId === g.id)?.archivedAt != null,
      members: people,
    };
  });
}

/** Naming is any member's to do, once, and again: a name is a label, never an identifier. */
export async function nameGroup(groupId: string, userId: string, rawName: string): Promise<void> {
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 40);
  if (name.length < 2) throw new Error("a name needs two characters");
  if (!(await isMember(groupId, userId))) throw new Error("not a member");
  await db.update(schema.groups).set({ name }).where(and(eq(schema.groups.id, groupId), eq(schema.groups.isDyad, false)));
}

/**
 * Archiving is this member's view preference and nothing else (PLANNING.md, "Group list and dormancy"): it
 * hides the group for them only, changes nothing for anyone else, and any new event there clears it.
 */
export async function setArchived(groupId: string, userId: string, archived: boolean): Promise<void> {
  await db
    .update(schema.groupMembers)
    .set({ archivedAt: archived ? new Date() : null })
    .where(and(eq(schema.groupMembers.groupId, groupId), eq(schema.groupMembers.userId, userId), isNull(schema.groupMembers.leftAt)));
}

/** Something new happened in a group, so nobody keeps it hidden. Called by whatever made the event. */
export async function unarchiveForEveryone(groupId: string): Promise<void> {
  await db.update(schema.groupMembers).set({ archivedAt: null }).where(and(eq(schema.groupMembers.groupId, groupId), sql`${schema.groupMembers.archivedAt} is not null`));
}
