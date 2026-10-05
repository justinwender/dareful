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
    // People picked together join in the same instant; the name breaks the tie so a set always reads the same way.
    .orderBy(schema.groupMembers.joinedAt, schema.users.displayName);
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
 * The pair's set, created lazily on first obligation as a two-person group. One set per pair (the first-contact
 * round, 2026-10-04): any set whose current members are exactly these two is theirs, whatever made it (a dyad, or
 * a question sent to whoever opened its link that one friend joined), the dyad first and then the oldest, so every
 * caller lands on the same one (docs/decisions.md 2026-09-18). A dyad is made only when the pair has no set.
 */
export async function ensureDyad(a: string, b: string): Promise<GroupRow> {
  if (a === b) throw new Error("a dyad needs two people");
  const found = await db.execute<{ id: string }>(sql`
    select g.id
    from ${schema.groups} g
    join ${schema.groupMembers} x on x.group_id = g.id and x.user_id = ${a} and x.left_at is null
    join ${schema.groupMembers} y on y.group_id = g.id and y.user_id = ${b} and y.left_at is null
    where (select count(*) from ${schema.groupMembers} m where m.group_id = g.id and m.left_at is null) = 2
    order by g.is_dyad desc, g.created_at asc
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

/** Naming is any member's to do, once, and again: a name is a label, never an identifier. */
export async function nameGroup(groupId: string, userId: string, rawName: string): Promise<void> {
  const name = rawName.trim().replace(/\s+/g, " ").slice(0, 40);
  if (name.length < 2) throw new Error("a name needs two characters");
  if (!(await isMember(groupId, userId))) throw new Error("not a member");
  await db.update(schema.groups).set({ name }).where(and(eq(schema.groups.id, groupId), eq(schema.groups.isDyad, false)));
}

// ---------------------------------------------------------------------------------- a group is a set of people

/**
 * What a set of people is called (docs/design.md 3.19, 3.20). A named set shows its name. One nobody named is a
 * description of some people, never a field somebody forgot: first names, up to three, then "and you". Nothing
 * anywhere says unnamed or untitled, because most sets will never be named. (This replaces the 2B rule that an
 * unnamed group was called by its latest question; docs/decisions.md 2026-09-20.)
 */
export function setLabel(input: { name: string | null; isDyad: boolean; memberNames: string[]; viewerName: string }): string {
  if (input.name) return input.name;
  const others = input.memberNames.filter((n) => n !== input.viewerName).map((n) => n.trim().split(/\s+/)[0] ?? n);
  // A two-person set reads as its other person, "Rachel and you", like every set nobody named (the first-contact round; "Just you two" is gone).
  if (others.length === 0) return "Just you";
  if (others.length <= 3) return `${others.join(", ")} and you`;
  return `${others.slice(0, 3).join(", ")} and ${others.length - 3} more`;
}

/** A set of people as facts, for a sentence: its real name, and its account-holders in the order `membersOfGroups` reads them. Never the chip's label. */
export type SetFacts = { name: string | null; members: Array<{ id: string; displayName: string }> };

/** The facts of a set from its row's name and its members: the account-holders, in the order they were read. */
export function setFacts(name: string | null, members: Array<{ userId: string | null; displayName: string }>): SetFacts {
  return { name, members: members.flatMap((m) => (m.userId ? [{ id: m.userId, displayName: m.displayName }] : [])) };
}

/**
 * A set of people as the object of a sentence (docs/design.md 3.38, 4.6), from its facts and never from the chip's
 * label, which is written to stand alone. A named set is "the Friday crew"; a name that can't take "the" (a
 * possessive, or one that already starts with it) keeps its own words and is set `apart`, for the caller to write
 * after a middle dot. An unnamed set is its people around whoever the sentence is about: first names, up to
 * three, then "and 3 others", with the viewer last as "you". Null when nobody is left to name.
 */
export function setInSentence(set: SetFacts, viewerId: string | null, aboutId: string | null): { words: string; apart: boolean } | null {
  const name = set.name?.trim() ?? "";
  if (name) return /[’']s\b/.test(name) || /^the\b/i.test(name) ? { words: name, apart: true } : { words: `the ${name}`, apart: false };
  const others = set.members.filter((m) => m.id !== aboutId);
  const you = others.some((m) => m.id === viewerId);
  const names = others.filter((m) => m.id !== viewerId).map((m) => m.displayName.trim().split(/\s+/)[0] ?? m.displayName);
  if (names.length === 0) return you ? { words: "you", apart: false } : null;
  const list = (xs: string[]) => (xs.length === 1 ? (xs[0] as string) : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  if (names.length <= 3) return { words: list(you ? [...names, "you"] : names), apart: false };
  // Past three names the rest are counted, the viewer among them: "and 3 others" is everyone asked who was not named, and one left over is "1 other".
  const rest = names.length - 3 + (you ? 1 : 0);
  return { words: `${names.slice(0, 3).join(", ")} and ${rest} ${rest === 1 ? "other" : "others"}`, apart: false };
}

/**
 * The asker line on a market (docs/design.md 3.38): a named set as "Priya asked the Friday crew"; a name that can't
 * take "the", such as a possessive or one that already starts with it, as "Theo asked · Papa's birthday"; an
 * unnamed set by its people around the asker ("Priya asked Gabe, John and you", "You asked Priya, Gabe and John"),
 * with "and 3 others" past three; two people as "Priya asked you" and "You asked Priya"; and nothing after
 * "asked" while the set is only the asker. With no viewer (a link's visitor) the asker is always a first name.
 */
export function askerLine(asker: { id: string; displayName: string }, set: SetFacts, viewerId: string | null): string {
  const first = asker.id === viewerId ? "You" : (asker.displayName.trim().split(/\s+/)[0] ?? asker.displayName);
  const whom = setInSentence(set, viewerId, asker.id);
  if (!whom) return `${first} asked`;
  return whom.apart ? `${first} asked · ${whom.words}` : `${first} asked ${whom.words}`;
}

/** What's on's row for a game this person is on (3.32): "You’re on this with the Friday crew", a name that can't take "the" after the dot, and the words alone while the set is only them. */
export function onThisLine(set: SetFacts, viewerId: string): string {
  const whom = setInSentence(set, viewerId, viewerId);
  if (!whom) return "You’re on this";
  return whom.apart ? `You’re on this · ${whom.words}` : `You’re on this with ${whom.words}`;
}

/** A draft's band (3.25): "For the Friday crew", "For Priya, Gabe and John"; nothing while the set is only the asker, so the band keeps its own words for that. */
export function forWhomLine(set: SetFacts, askerId: string): string | null {
  const whom = setInSentence(set, askerId, askerId);
  return whom ? `For ${whom.words}` : null;
}

export type PeopleSet = {
  groupId: string;
  label: string;
  named: boolean;
  isDyad: boolean;
  members: GroupMember[];
  /** Questions this set has been asked, and when the last one was. */
  asked: number;
  lastAskedAt: Date | null;
  /** This set has been asked something before, has no name, and has not waved the question away twice. */
  offerName: boolean;
};

/**
 * The candidate sets for "Who's in" (docs/design.md 3.20): most recent first, then by how often that set has
 * asked something. Only sets with somebody else in them; a set of one is not a set.
 */
export async function peopleSetsFor(userId: string, viewerName: string): Promise<PeopleSet[]> {
  const seats = await db.select({ groupId: schema.groupMembers.groupId }).from(schema.groupMembers).where(and(eq(schema.groupMembers.userId, userId), isNull(schema.groupMembers.leftAt)));
  const ids = seats.map((s) => s.groupId);
  if (ids.length === 0) return [];
  const [groups, members, asked] = await Promise.all([
    db.select().from(schema.groups).where(inArray(schema.groups.id, ids)),
    membersOfGroups(ids),
    db.select({ groupId: schema.dares.groupId, createdAt: schema.dares.createdAt }).from(schema.dares).where(and(inArray(schema.dares.groupId, ids), sql`${schema.dares.creatorSignature} is not null`)),
  ]);
  const sets = groups
    .map((g) => {
      const everyone = members.get(g.id) ?? [];
      const people = everyone.filter((m) => m.userId !== null);
      const mine = asked.filter((a) => a.groupId === g.id);
      const last = mine.reduce<Date | null>((m, a) => (m === null || a.createdAt > m ? a.createdAt : m), null);
      // A guest is one of the set's people and is named with them: two sets that differ only by their guests read differently (the first-contact round).
      return { groupId: g.id, label: setLabel({ name: g.name, isDyad: g.isDyad, memberNames: everyone.map((m) => m.displayName), viewerName }), named: g.name !== null, isDyad: g.isDyad, members: people, asked: mine.length, lastAskedAt: last, offerName: g.name === null && !g.isDyad && mine.length >= 1 && g.namePromptDismissals < 2, createdAt: g.createdAt, key: membershipKey(everyone) };
    })
    .filter((s) => s.members.length >= 2);
  return oneRowPerPeople(sets)
    .sort((a, b) => (b.lastAskedAt?.getTime() ?? 0) - (a.lastAskedAt?.getTime() ?? 0) || b.asked - a.asked || b.createdAt.getTime() - a.createdAt.getTime())
    .map(({ createdAt: _createdAt, key: _key, ...s }) => s);
}

/** Who a set is, as one string: its current members' ids, accounts and guests alike, in one order. */
export function membershipKey(members: Array<{ userId: string | null; claimId: string | null }>): string {
  return members
    .map((m) => (m.userId ? `u:${m.userId}` : `c:${m.claimId}`))
    .sort()
    .join(",");
}

/**
 * One row per set of people (the first-contact round, 2026-10-04): sets an unnamed occasion and a pair's dyad left
 * with the same people read as one, the one a new question goes to (a named set first, then the dyad, then the
 * oldest), dated by the latest question any of them asked and counting all of them. A named set is its own row.
 */
export function oneRowPerPeople<T extends { key: string; named: boolean; isDyad: boolean; createdAt: Date; asked: number; lastAskedAt: Date | null }>(sets: T[]): T[] {
  const byKey = new Map<string, T[]>();
  const out: T[] = [];
  for (const s of sets) {
    if (s.named) out.push(s);
    else byKey.set(s.key, [...(byKey.get(s.key) ?? []), s]);
  }
  for (const same of byKey.values()) {
    const [first] = [...same].sort((a, b) => Number(b.isDyad) - Number(a.isDyad) || a.createdAt.getTime() - b.createdAt.getTime());
    if (!first) continue;
    const last = same.reduce<Date | null>((m, s) => (s.lastAskedAt && (m === null || s.lastAskedAt > m) ? s.lastAskedAt : m), null);
    out.push({ ...first, asked: same.reduce((n, s) => n + s.asked, 0), lastAskedAt: last });
  }
  return out;
}

/**
 * The set for exactly these people: the one that already exists, or a new one nobody has named. The asker must
 * already share something with each of them; an id alone is not a way to put a stranger into a question.
 */
export async function setForPeople(creatorId: string, otherIds: string[]): Promise<GroupRow> {
  const others = Array.from(new Set(otherIds)).filter((id) => id !== creatorId);
  if (others.length === 0) return createOccasionGroup(creatorId);
  const known = new Set((await peopleForUser(creatorId)).map((p) => p.user.id));
  if (!others.every((id) => known.has(id))) throw new Error("not someone you know here");
  if (others.length === 1 && others[0]) return ensureDyad(creatorId, others[0]);
  const want = [creatorId, ...others].sort().join(",");
  const mine = await db.select({ groupId: schema.groupMembers.groupId }).from(schema.groupMembers).innerJoin(schema.groups, eq(schema.groups.id, schema.groupMembers.groupId)).where(and(eq(schema.groupMembers.userId, creatorId), isNull(schema.groupMembers.leftAt), eq(schema.groups.isDyad, false)));
  const members = await membersOfGroups(mine.map((m) => m.groupId));
  for (const [groupId, list] of members) {
    if (list.some((m) => m.userId === null)) continue;
    if (list.map((m) => m.userId as string).sort().join(",") === want) {
      const [g] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId)).limit(1);
      if (g) return g;
    }
  }
  return db.transaction(async (tx) => {
    const [group] = await tx.insert(schema.groups).values({ name: null, isDyad: false, createdBy: creatorId }).returning();
    if (!group) throw new Error("could not create group");
    await tx.insert(schema.groupMembers).values([creatorId, ...others].map((userId) => ({ groupId: group.id, userId })));
    return group;
  });
}

/** "Not now" on the naming question. Twice, and the set is never asked again. */
export async function dismissNamePrompt(groupId: string, userId: string): Promise<void> {
  if (!(await isMember(groupId, userId))) return;
  await db.update(schema.groups).set({ namePromptDismissals: sql`least(${schema.groups.namePromptDismissals} + 1, 2)` }).where(eq(schema.groups.id, groupId));
}
