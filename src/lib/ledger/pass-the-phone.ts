/**
 * Pass the phone (docs/design.md 3.45; 3.41 amended 2026-09-28; docs/decisions.md 2026-09-28). Delegation
 * reshaped around the one case it is for: a person's routine actions signed by the server's share of their
 * ledger wallet when the device in hand cannot sign, which is a friend's phone (3.45) or a second device of
 * their own without the Dynamic login. On the phone holding the login, signing stays on the device. Turning it
 * on, from the person's own phone, delegates the ledger wallet and sets a PIN in one flow; turning it off
 * revokes the delegation, wipes the stored material and clears the PIN.
 *
 * The PIN: four digits, stored under scrypt with a salt of its own, never logged and never returned; five
 * wrong tries in a row lock it for an hour, and the person hears on their own account when that happens
 * (a person acting on someone's phone, so Principle 1 allows the notice). Everything the delegation gate
 * established holds: a delegated signature only for that person's own authenticated request, recorded against
 * it; the governance wallet refused in three places; the signer answering a signature or nothing.
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { Address, Hex } from "viem";
import { db, schema } from "@/db";
import { hasDelegation, trySignWithDelegation, wipeDelegation, type SignerLoad } from "@/lib/chain/delegated-signer";
import { closeState, closeTypedData, netNonce, netTypedData } from "./closes";
import { denomOnchainId, groupOnchainId } from "./ids";
import { createTypedData, enterTypedData, marketById, stateOf } from "./markets";
import { confirmManyTypedData, confirmTypedData } from "./proposals";
import type { Via } from "./via";

const scrypt = promisify(scryptCallback) as (password: string, salt: Buffer, keylen: number, options: { N: number; r: number; p: number }) => Promise<Buffer>;

export const PIN_LENGTH = 4;
/** Wrong tries in a row before the PIN locks. 3.45 ends a handoff at three; the PIN itself takes a few more before it locks for everyone. */
export const LOCK_AFTER = 5;
export const LOCK_FOR_MS = 60 * 60_000;
/** scrypt at 2^14, 8, 1: tens of milliseconds a try, which is nothing for a person and everything for a guess. */
const SCRYPT = { N: 16_384, r: 8, p: 1 };
const KEY_BYTES = 32;

export class PassThePhoneError extends Error {
  constructor(
    message: string,
    public readonly code: "bad_pin" | "not_set" | "not_yours" | "wrong_state",
  ) {
    super(message);
    this.name = "PassThePhoneError";
  }
}

/** Exactly four digits. Pure. */
export function validPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

export async function hashPin(pin: string, salt: Buffer): Promise<Buffer> {
  return scrypt(pin, salt, KEY_BYTES, SCRYPT);
}

export type LockState = { failedTries: number; lockedUntil: Date | null; lockouts: number };

/** Pure: whether the PIN is locked at this moment. */
export function isLocked(s: Pick<LockState, "lockedUntil">, now: Date): boolean {
  return s.lockedUntil !== null && s.lockedUntil.getTime() > now.getTime();
}

/** Pure: the state after a wrong try. The fifth in a row locks it for an hour and counts a lockout; the tries start again after. */
export function afterWrongTry(s: LockState, now: Date): LockState & { lockedNow: boolean } {
  const failedTries = s.failedTries + 1;
  if (failedTries >= LOCK_AFTER) return { failedTries: 0, lockedUntil: new Date(now.getTime() + LOCK_FOR_MS), lockouts: s.lockouts + 1, lockedNow: true };
  return { failedTries, lockedUntil: s.lockedUntil, lockouts: s.lockouts, lockedNow: false };
}

/** Sets or replaces the PIN, and clears any lock and its count of tries. The PIN itself is hashed here and never stored or logged. */
export async function setPin(userId: string, pin: string): Promise<void> {
  if (!validPin(pin)) throw new PassThePhoneError(`A PIN is ${PIN_LENGTH} digits.`, "bad_pin");
  const pinSalt = randomBytes(16);
  const pinHash = await hashPin(pin, pinSalt);
  const values = { userId, pinHash, pinSalt, setAt: new Date(), failedTries: 0, lockedUntil: null };
  await db.insert(schema.passThePhone).values(values).onConflictDoUpdate({ target: schema.passThePhone.userId, set: values });
}

export async function clearPin(userId: string): Promise<void> {
  await db.delete(schema.passThePhone).where(eq(schema.passThePhone.userId, userId));
}

export async function pinStatus(userId: string): Promise<{ set: boolean; lockedUntil: Date | null }> {
  const [row] = await db.select({ lockedUntil: schema.passThePhone.lockedUntil }).from(schema.passThePhone).where(eq(schema.passThePhone.userId, userId));
  return { set: Boolean(row), lockedUntil: row?.lockedUntil ?? null };
}

export type PinCheck = { ok: true } | { ok: false; locked: true; until: Date } | { ok: false; locked: false; triesLeft: number };

/**
 * A PIN offered on someone else's phone: right, wrong with tries left, or locked. Tries are counted under a
 * row lock so two phones cannot share the allowance, and the fifth wrong try in a row locks the PIN for an
 * hour and tells its owner, once per lockout, naming whose phone it was on. A right PIN clears the count.
 * Nobody learns the PIN from a wrong try beyond that it was wrong; nothing here logs what was typed.
 */
export async function checkPin(userId: string, pin: string, ctx: { hostUserId: string; now?: Date }): Promise<PinCheck> {
  const now = ctx.now ?? new Date();
  if (!validPin(pin)) return { ok: false, locked: false, triesLeft: LOCK_AFTER };
  const result = await db.transaction(async (tx) => {
    const [row] = await tx.select().from(schema.passThePhone).where(eq(schema.passThePhone.userId, userId)).for("update");
    if (!row) return { check: { ok: false, locked: false, triesLeft: 0 } as PinCheck, tell: null as number | null };
    if (isLocked(row, now)) return { check: { ok: false, locked: true, until: row.lockedUntil as Date } as PinCheck, tell: null };
    const given = await hashPin(pin, row.pinSalt);
    if (given.length === row.pinHash.length && timingSafeEqual(given, row.pinHash)) {
      await tx.update(schema.passThePhone).set({ failedTries: 0, lockedUntil: null }).where(eq(schema.passThePhone.userId, userId));
      return { check: { ok: true } as PinCheck, tell: null };
    }
    const next = afterWrongTry(row, now);
    await tx.update(schema.passThePhone).set({ failedTries: next.failedTries, lockedUntil: next.lockedUntil, lockouts: next.lockouts }).where(eq(schema.passThePhone.userId, userId));
    if (next.lockedNow) return { check: { ok: false, locked: true, until: next.lockedUntil as Date } as PinCheck, tell: next.lockouts };
    return { check: { ok: false, locked: false, triesLeft: LOCK_AFTER - next.failedTries } as PinCheck, tell: null };
  });
  if (result.tell !== null) {
    const { notifyPinLocked } = await import("@/lib/notify");
    await notifyPinLocked(userId, ctx.hostUserId, result.tell).catch((err: unknown) => console.error("the lockout notice did not go out", err instanceof Error ? err.message : err));
  }
  return result.check;
}

/** Pass the phone is on when the ledger wallet is delegated and a PIN is set; the row on You says which half is missing. */
export async function passThePhoneStatus(userId: string): Promise<{ on: boolean; delegated: boolean; pinSet: boolean }> {
  const [delegated, pin] = await Promise.all([hasDelegation(userId), pinStatus(userId)]);
  return { on: delegated && pin.set, delegated, pinSet: pin.set };
}

/** Turning it off: the stored material wiped here and now (Dynamic's own revocation event lands after, and finds nothing), and the PIN cleared. */
export async function turnOffPassThePhone(userId: string): Promise<void> {
  await wipeDelegation(userId);
  await clearPin(userId);
}

/** The people among `userIds` who have pass the phone on, for "Who's joining?" (3.45): a delegation and a PIN, both. */
export async function whoHasPassThePhone(userIds: readonly string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .select({ userId: schema.passThePhone.userId })
    .from(schema.passThePhone)
    .innerJoin(schema.delegations, eq(schema.delegations.userId, schema.passThePhone.userId))
    .where(and(inArray(schema.passThePhone.userId, [...userIds]), sql`${schema.delegations.revokedAt} is null`, sql`length(${schema.delegations.encryptedShare}) > 0`));
  return new Set(rows.map((r) => r.userId));
}

// --------------------------------------------------------------------------------------- signing from the server

/**
 * The typed data a named action would have the person sign, rebuilt from the ids alone: the same builders the
 * actions verify against, so a signature made here passes the action's own check, and nothing a client sends is
 * ever signed as given. Refuses anything that is not this person's to sign. Pure of the signer, so it has tests
 * against the real rows.
 */
export async function typedDataFor(userId: string, via: Via) {
  const [user] = await db.select({ ledgerWallet: schema.users.ledgerWallet }).from(schema.users).where(eq(schema.users.id, userId));
  if (!user) throw new PassThePhoneError("No such person.", "not_yours");
  const ledger = user.ledgerWallet as Address;
  switch (via.action) {
    case "enter": {
      const d = await marketById(via.dareId);
      if (!d || stateOf(d) !== "open") throw new PassThePhoneError("That one isn't open.", "wrong_state");
      return { typedData: enterTypedData(d, BigInt(via.stake), BigInt(via.value)), subject: d.id, address: ledger };
    }
    case "create": {
      const d = await marketById(via.dareId);
      if (!d || d.creatorId !== userId) throw new PassThePhoneError("Only the person who asked it can send it.", "not_yours");
      if (d.creatorSignature) throw new PassThePhoneError("It's already been sent.", "wrong_state");
      return { typedData: createTypedData(d), subject: d.id, address: ledger };
    }
    case "confirm": {
      const [p] = await db.select().from(schema.obligationProposals).where(eq(schema.obligationProposals.id, via.proposalId));
      if (!p || p.fromUser !== userId) throw new PassThePhoneError("That isn't yours to confirm.", "not_yours");
      if (!p.toUser) throw new PassThePhoneError("The other person has no account yet.", "wrong_state");
      const [creditor] = await db.select({ ledgerWallet: schema.users.ledgerWallet }).from(schema.users).where(eq(schema.users.id, p.toUser));
      if (!creditor) throw new PassThePhoneError("The other person has no account yet.", "wrong_state");
      return { typedData: confirmTypedData(p, creditor.ledgerWallet as Address), subject: p.id, address: ledger };
    }
    case "confirm_many": {
      const rows = await db.select().from(schema.obligationProposals).where(inArray(schema.obligationProposals.id, via.proposalIds));
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ps = via.proposalIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
      if (ps.length !== via.proposalIds.length || ps.some((p) => p.fromUser !== userId)) throw new PassThePhoneError("Those aren't yours to confirm.", "not_yours");
      const creditorIds = Array.from(new Set(ps.map((p) => p.toUser).filter((x): x is string => x !== null)));
      const creditors = creditorIds.length ? await db.select({ id: schema.users.id, ledgerWallet: schema.users.ledgerWallet }).from(schema.users).where(inArray(schema.users.id, creditorIds)) : [];
      return { typedData: confirmManyTypedData(ps, new Map(creditors.map((c) => [c.id, c.ledgerWallet as Address]))), subject: via.proposalIds.join(","), address: ledger };
    }
    case "close": {
      const [o] = await db.select({ toUser: schema.obligations.toUser }).from(schema.obligations).where(eq(schema.obligations.id, via.obligationId));
      if (!o || o.toUser !== userId) throw new PassThePhoneError("Only the person who is owed this can close it.", "not_yours");
      const state = await closeState(via.obligationId);
      if (state.remaining === 0n) throw new PassThePhoneError("Nothing is open on this one any more.", "wrong_state");
      return { typedData: closeTypedData({ obligationId: via.obligationId, tokenId: state.tokenId, qty: state.remaining, reason: via.reason, nonce: state.nonce }), subject: via.obligationId, address: ledger };
    }
    case "net": {
      const [them] = await db.select({ ledgerWallet: schema.users.ledgerWallet }).from(schema.users).where(eq(schema.users.id, via.otherUserId));
      if (!them) throw new PassThePhoneError("No such person.", "not_yours");
      const g = groupOnchainId(via.groupId);
      const dn = denomOnchainId(via.denomId);
      const b = them.ledgerWallet as Address;
      const nonce = await netNonce(g, dn, ledger, b);
      return { typedData: netTypedData({ groupId: g, denomId: dn, a: ledger, b, nonce }), subject: `${via.groupId}:${via.denomId}:${via.otherUserId}`, address: ledger };
    }
  }
}

/**
 * A delegated signature for a named routine action of this person's, or null, which means the device signs
 * as before. Used only where the device cannot sign: a friend's phone, or a second device without the login.
 */
export async function delegatedSignatureFor(userId: string, via: Via, request: string, deps: { load?: SignerLoad } = {}): Promise<Hex | null> {
  const { typedData, subject, address } = await typedDataFor(userId, via);
  return trySignWithDelegation({ userId, address, typedData, request: { action: via.action, subject, request } }, deps);
}
