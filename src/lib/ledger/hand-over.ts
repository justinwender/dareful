/**
 * Handing over the phone (docs/design.md 3.45; 3.17's shared joining steps): at the table, a friend whose phone
 * is dead gets into a market from the host's phone. The steps are the link page's (the market as anyone sees it
 * before they're in, the entry sheet, "Who's joining?", then in); the proof is a pick and a PIN instead of a
 * name and a number. Only entering. Only after the PIN checks does the server sign the friend's entry with the
 * friend's own delegated share, recorded against that request; the host's session is the request's, and the
 * friend's is never made here. Nothing of the friend's stays on the host's phone: no session, nothing cached.
 *
 * A watched PIN stays fixable: in an open market the friend changes the entry from their own phone until the
 * close; a blind entry is final, so its owner can withdraw it from their own phone before the close and cannot
 * enter again (`withdrewHostedEntry`), so the remedy is never a way around blind.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Hex } from "viem";
import { db, schema } from "@/db";
import type { SignerLoad } from "@/lib/chain/delegated-signer";
import { peopleForUser } from "./groups";
import { enterMarket, marketById, MarketError, positionsOf, stateOf, type PositionRow } from "./markets";
import { checkPin, delegatedSignatureFor, whoHasPassThePhone, type PinCheck } from "./pass-the-phone";

export type Candidate = { id: string; name: string; /** Has pass the phone on, so can be picked; the rest show at 0.45 with "Not set up for this yet". */ ready: boolean };

/** Whether this person may hand the phone over on this market: in it, and it is open. */
export async function canHandOver(dareId: string, hostId: string): Promise<boolean> {
  const d = await marketById(dareId);
  if (!d || stateOf(d) !== "open") return false;
  return (await positionsOf(d.id)).some((p) => p.userId === hostId);
}

/**
 * "Who's joining?" (3.45, frame 4): the people the market was sent to who aren't in yet, with whether each can be
 * picked. When nobody was named, or everyone named is already in, the list falls back to the host's own people who
 * have pass the phone on (Round C, pre-approved): the PIN is the proof of identity either way, so limiting it to
 * the named people added no protection, and a question asked of "whoever I send it to" still has friends at the
 * table. Names only; nothing of anyone's answer.
 */
export async function handOverCandidates(dareId: string, hostId: string): Promise<Candidate[]> {
  const d = await marketById(dareId);
  if (!d) return [];
  const [seats, positions] = await Promise.all([
    db.select({ userId: schema.groupMembers.userId }).from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, d.groupId), isNull(schema.groupMembers.leftAt))),
    positionsOf(d.id),
  ]);
  const inIds = new Set(positions.map((p) => p.userId).filter((x): x is string => x !== null));
  const named = seats.map((s) => s.userId).filter((x): x is string => x !== null && !inIds.has(x) && x !== hostId);
  if (named.length > 0) {
    const [users, ready] = await Promise.all([db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, named)), whoHasPassThePhone(named)]);
    return users.map((u) => ({ id: u.id, name: u.displayName, ready: ready.has(u.id) })).sort((a, b) => Number(b.ready) - Number(a.ready) || a.name.localeCompare(b.name));
  }
  // The fallback: the host's own people, ready only, since nobody here was named and a dimmed row would name nobody's absence.
  const mine = (await peopleForUser(hostId)).map((p) => p.user).filter((u) => !inIds.has(u.id));
  if (mine.length === 0) return [];
  const ready = await whoHasPassThePhone(mine.map((u) => u.id));
  return mine.filter((u) => ready.has(u.id)).map((u) => ({ id: u.id, name: u.displayName, ready: true })).sort((a, b) => a.name.localeCompare(b.name));
}

export type HostedEntry = { ok: true; position: PositionRow } | { ok: false; pin: PinCheck & { ok: false } } | { ok: false; refused: string };

/**
 * The friend's entry from the host's phone. The host must be in the market and it must be open; the friend must
 * be one of the people it was sent to, not in, with pass the phone on. The PIN is checked first, and counted
 * against the friend's lock with the host named; only a right PIN reaches the signer, whose signature is the
 * friend's delegated share over the entry the server itself built, recorded against this request.
 */
export async function enterFromHost(input: { dareId: string; hostId: string; friendId: string; stake: bigint; value: bigint; pin: string; request: string; deps?: { load?: SignerLoad } }): Promise<HostedEntry> {
  if (input.hostId === input.friendId) return { ok: false, refused: "That's you. Use your own entry." };
  if (!(await canHandOver(input.dareId, input.hostId))) return { ok: false, refused: "The phone can be handed over on a question you're in, while it's open." };
  const candidate = (await handOverCandidates(input.dareId, input.hostId)).find((c) => c.id === input.friendId);
  if (!candidate) return { ok: false, refused: "They're in already, or this wasn't sent to them." };
  if (!candidate.ready) return { ok: false, refused: "They haven't set up pass the phone on their own phone yet." };
  const pin = await checkPin(input.friendId, input.pin, { hostUserId: input.hostId });
  if (!pin.ok) return { ok: false, pin };
  let signature: Hex | null;
  try {
    signature = await delegatedSignatureFor(input.friendId, { action: "enter", dareId: input.dareId, stake: input.stake.toString(), value: input.value.toString() }, input.request, input.deps ?? {});
  } catch (err) {
    return { ok: false, refused: err instanceof MarketError ? err.message : "That didn't go through. Try again." };
  }
  if (!signature) return { ok: false, refused: "Their setup isn't reachable right now. They can get in from their own phone." };
  try {
    const position = await enterMarket({ dareId: input.dareId, userId: input.friendId, stake: input.stake, value: input.value, signature, enteredBy: input.hostId });
    return { ok: true, position };
  } catch (err) {
    return { ok: false, refused: err instanceof MarketError ? err.message : "That didn't go through. Try again." };
  }
}

/**
 * Withdrawing a blind entry made on a friend's phone, from the person's own (3.45): the position is dismissed,
 * counts for nothing, and nothing of theirs comes into this market again. An open market needs no withdrawal:
 * the entry is theirs to change until the close. Only the owner, only while open, only on a hosted entry.
 */
export async function withdrawHostedEntry(dareId: string, userId: string): Promise<void> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (stateOf(d) !== "open") throw new MarketError("It's closed, so nothing can come out now.", "wrong_state");
  if (d.revealMode !== "blind") throw new MarketError("Change it instead: it's yours to change until it closes.", "wrong_state");
  const mine = (await positionsOf(d.id)).find((p) => p.userId === userId);
  if (!mine) throw new MarketError("You're not in this one.", "wrong_state");
  if (!mine.enteredBy || mine.enteredBy === userId) throw new MarketError("Only an entry made on a friend's phone can be withdrawn.", "wrong_state");
  await db.update(schema.darePositions).set({ dismissedAt: new Date() }).where(and(eq(schema.darePositions.dareId, dareId), eq(schema.darePositions.userId, userId)));
}
