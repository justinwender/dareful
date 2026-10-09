/**
 * The room code, and joining (PLANNING.md section 4, "The room code"; docs/design.md 3.16, 4.7). A signed-in
 * person could not join anything from inside the app: they had to leave, find the link in their messages, and
 * come back through it (docs/testing.md, session 3). A code someone reads out is most of the fix.
 *
 * A code belongs to one market and lives while that market is open. Joining puts an account-holder into the
 * market's group at once (docs/decisions.md 2026-09-19), which is the same thing a group link does; from there
 * they enter like anyone else, and their number is their own signature. Ghosts and the pending rule are 2D.
 */
import { randomInt } from "node:crypto";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { isMember } from "./groups";
import { marketById, MarketError, stateOf, type DareRow } from "./markets";
import { CODE_ALPHABET, CODE_LENGTH, readCode } from "./room-code";

export const CODE_GUESSES_PER_HOUR = 20;

function newCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

/** The market's live code, made on first ask. Anyone in the market's group can read it out; one code per market. */
export async function roomCodeFor(dareId: string, userId: string): Promise<string> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (stateOf(d) !== "open") throw new MarketError("Codes only work while people can still get in.", "wrong_state");
  if (!(await isMember(d.groupId, userId))) throw new MarketError("This one is for the people in its group.", "not_member");
  const [live] = await db.select().from(schema.roomCodes).where(and(eq(schema.roomCodes.dareId, dareId), isNull(schema.roomCodes.closedAt))).limit(1);
  if (live) return live.code;
  for (let tries = 0; tries < 6; tries += 1) {
    const [made] = await db.insert(schema.roomCodes).values({ code: newCode(), dareId, openedBy: userId }).onConflictDoNothing().returning();
    if (made) return made.code;
  }
  throw new MarketError("Couldn't make a code. Try again.", "chain");
}

/**
 * Who a wrong code is counted against: an account by its id; a guest, who has none, by a keyed hash of the network the
 * code came from (the submission round, section 0), which cannot be cleared the way a cookie can and is never the
 * address itself.
 */
export type Guesser = { userId: string } | { network: string };

async function spendGuess(who: Guesser): Promise<void> {
  const key = "userId" in who ? `user:${who.userId}` : `network:${who.network}`;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`code-guess:${key}`}, 0))`);
    const rows =
      "userId" in who
        ? await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${schema.codeAttempts} where user_id = ${who.userId} and created_at > now() - interval '1 hour'`)
        : await tx.execute<{ n: number }>(sql`select count(*)::int as n from ${schema.codeAttempts} where network_hash = ${who.network} and created_at > now() - interval '1 hour'`);
    if ((Array.from(rows)[0]?.n ?? 0) >= CODE_GUESSES_PER_HOUR) throw new MarketError("That's a lot of codes. Give it a while, or ask for the link.", "slow_down");
    // A guest's misses older than a day count for nothing, so they are not kept.
    if ("network" in who) await tx.delete(schema.codeAttempts).where(sql`${schema.codeAttempts.networkHash} is not null and ${schema.codeAttempts.createdAt} < now() - interval '1 day'`);
    await tx.insert(schema.codeAttempts).values("userId" in who ? { userId: who.userId } : { networkHash: who.network });
  });
}

/**
 * Makes this person a member of the market's group, if they are not one. Rejoining clears a departure; any join
 * un-archives, because something new is happening there (PLANNING.md, "Group list and dormancy").
 */
export async function joinGroupOf(d: DareRow, userId: string): Promise<{ joined: boolean }> {
  if (stateOf(d) === "draft") throw new MarketError("That one doesn't exist.", "not_found");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`group-join:${d.groupId}:${userId}`}, 0))`);
    const [seat] = await tx.select().from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, d.groupId), eq(schema.groupMembers.userId, userId))).limit(1);
    if (seat && !seat.leftAt) {
      if (seat.archivedAt) await tx.update(schema.groupMembers).set({ archivedAt: null }).where(and(eq(schema.groupMembers.groupId, d.groupId), eq(schema.groupMembers.userId, userId)));
      return { joined: false };
    }
    if (seat) await tx.update(schema.groupMembers).set({ leftAt: null, archivedAt: null, joinedAt: new Date() }).where(and(eq(schema.groupMembers.groupId, d.groupId), eq(schema.groupMembers.userId, userId)));
    else await tx.insert(schema.groupMembers).values({ groupId: d.groupId, userId });
    // A third person joining a question asked between two is the set growing: a dyad is the pair's own (their covers
    // land in it, `ensureDyad` finds it by its two members), so from here the set is an ordinary one named by its
    // people, and the pair's next cover makes them a fresh dyad. Before this, "Just you two" went on naming a set of
    // five (the field round, 2026-10-02).
    await tx.update(schema.groups).set({ isDyad: false }).where(and(eq(schema.groups.id, d.groupId), eq(schema.groups.isDyad, true)));
    return { joined: true };
  });
}

/**
 * A typed code. A wrong shape is refused before it costs a guess; a code that matches nothing costs one, so
 * codes cannot be walked. Already a member is not an error at all: straight in (docs/design.md 3.16).
 */
export async function joinByCode(raw: string, userId: string): Promise<{ marketId: string; joined: boolean }> {
  const d = await marketForCode(raw, { userId });
  const { joined } = await joinGroupOf(d, userId);
  return { marketId: d.id, joined };
}

/**
 * The question a typed code is for, joining nobody (the submission round, section 0): a code stands for its question's
 * link, so for a guest it opens that question, or its game's page, where they join with a name exactly as from the link.
 * A wrong shape costs nothing; a code that matches nothing costs a guess, counted against `who`.
 */
export async function marketForCode(raw: string, who: Guesser): Promise<DareRow> {
  const read = readCode(raw);
  if ("problem" in read) throw new MarketError(read.problem, "bad_input");
  const [room] = await db.select().from(schema.roomCodes).where(and(eq(schema.roomCodes.code, read.code), isNull(schema.roomCodes.closedAt))).limit(1);
  const d = room ? await marketById(room.dareId) : null;
  if (!room || !d || stateOf(d) !== "open") {
    await spendGuess(who);
    throw new MarketError("No market with that code. Worth checking the last two characters.", "not_found");
  }
  return d;
}

/** A pasted or tapped market link, for someone signed in. The id is the secret, as it is for every share link. */
export async function joinByMarketLink(marketId: string, userId: string): Promise<{ marketId: string; joined: boolean }> {
  const d = await marketById(marketId);
  if (!d || stateOf(d) === "draft") throw new MarketError("That link doesn't go anywhere. Ask them to send it again.", "not_found");
  const { joined } = await joinGroupOf(d, userId);
  return { marketId: d.id, joined };
}
