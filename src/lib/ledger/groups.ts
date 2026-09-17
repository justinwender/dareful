import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db, schema } from "@/db";

export type GroupRow = typeof schema.groups.$inferSelect;
export type UserRow = typeof schema.users.$inferSelect;

export type GroupMember = {
  userId: string | null;
  claimId: string | null;
  displayName: string;
  ledgerWallet: string | null;
  joinedAt: Date;
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

/** The implicit two-person group between two account-holders, created lazily on first obligation. */
export async function ensureDyad(a: string, b: string): Promise<GroupRow> {
  if (a === b) throw new Error("a dyad needs two people");
  const candidates = await db
    .select({ id: schema.groups.id })
    .from(schema.groups)
    .where(eq(schema.groups.isDyad, true));
  if (candidates.length > 0) {
    const ids = candidates.map((c) => c.id);
    const rows = await db
      .select({ groupId: schema.groupMembers.groupId, userId: schema.groupMembers.userId, claimId: schema.groupMembers.claimId })
      .from(schema.groupMembers)
      .where(inArray(schema.groupMembers.groupId, ids));
    const byGroup = new Map<string, Array<string | null>>();
    for (const r of rows) {
      const list = byGroup.get(r.groupId) ?? [];
      list.push(r.userId ?? (r.claimId ? `claim:${r.claimId}` : null));
      byGroup.set(r.groupId, list);
    }
    for (const [groupId, members] of byGroup) {
      if (members.length === 2 && members.includes(a) && members.includes(b)) {
        const [g] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId)).limit(1);
        if (g) return g;
      }
    }
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
// A group invite is a signed, expiring token with no table behind it (docs/decisions.md 2026-09-17).

function inviteSecret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return Buffer.from(`invite:${s}`);
}

const INVITE_DAYS = 14;

export function createInviteToken(groupId: string, invitedBy: string): string {
  const exp = Math.floor(Date.now() / 1000) + INVITE_DAYS * 86_400;
  const payload = Buffer.from(JSON.stringify({ g: groupId, u: invitedBy, exp })).toString("base64url");
  const mac = createHmac("sha256", inviteSecret()).update(payload).digest("base64url");
  return `${payload}.${mac}`;
}

export function readInviteToken(token: string): { groupId: string; invitedBy: string } | null {
  const [payload, mac] = token.split(".");
  if (!payload || !mac) return null;
  const expected = createHmac("sha256", inviteSecret()).update(payload).digest("base64url");
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { g?: string; u?: string; exp?: number };
    if (!parsed.g || !parsed.u || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return { groupId: parsed.g, invitedBy: parsed.u };
  } catch {
    return null;
  }
}

/** Adds the user to the group if the invite is valid. Returns the group. Idempotent for existing members. */
export async function redeemInvite(token: string, userId: string): Promise<GroupRow | null> {
  const invite = readInviteToken(token);
  if (!invite) return null;
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, invite.groupId)).limit(1);
  if (!group || group.isDyad) return null;
  if (!(await isMember(group.id, userId))) {
    await db
      .insert(schema.groupMembers)
      .values({ groupId: group.id, userId })
      .onConflictDoUpdate({ target: [schema.groupMembers.groupId, schema.groupMembers.userId], set: { leftAt: null } });
  }
  return group;
}

export const groupSql = sql;
