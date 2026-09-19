/**
 * Binary markets, end to end (PLANNING.md 5a, 5b, 6, 8; corrections in docs/decisions.md). A market is a
 * question with a scoring rule: no sides, no pot, no price. This file is the offchain half of its life and the
 * only place that moves it between states.
 *
 *   draft      the creator has terms and has not signed. Only they can see it.
 *   open       the creator signed `Create`; people in the group enter a stake and a number, each signing `Enter`
 *              (which carries their consent to the stalemate rule). Signatures wait here. Nothing is onchain.
 *   locked     one atomic `create` carried the market and every position with its signature. First chain write.
 *   resolved   `threshold` governance-wallet votes for one outcome went to `resolve`, in a transaction of its
 *              own. The contract scored everyone and minted one obligation per nonzero pairwise transfer.
 *   voided     the quorum voted that nobody can tell. Nothing minted; the toll is the permanent record of it.
 *
 * Three rules hold throughout. The server never casts a vote: a vote is a signature from a governance wallet the
 * server does not hold, verified here and again by the contract. Nothing goes onchain for a position nobody
 * signed: every position in `create` carries its owner's own signature. And one resolution per transaction.
 */
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { decodeEventLog, keccak256, stringToHex, verifyTypedData, type Address, type Hex } from "viem";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { gasFor } from "@/lib/chain/gas";
import { relayer, submit } from "@/lib/chain/relayer";
import { daresDomain, daresTypes, Kind, Pace, Stalemate, VOID } from "@/lib/chain/typed-data";
import { denominationById } from "./denominations";
import { dareByOnchainId } from "./envio";
import { isMember } from "./groups";
import { bufferToHex, bytes16ToUuid, dareOnchainId, denomOnchainId, groupOnchainId, hexToBuffer } from "./ids";
import { ensureDenomOnchain, ensureGroupOnchain } from "./registry";

export type DareRow = typeof schema.dares.$inferSelect;
export type PositionRow = typeof schema.darePositions.$inferSelect;
export type VoteRow = typeof schema.dareVotes.$inferSelect;

/** "Nobody can tell", offchain. The chain spells it as the largest uint256; a bigint column cannot hold that. */
export const VOID_OUTCOME = -1n;
export const toChainOutcome = (o: bigint): bigint => (o === VOID_OUTCOME ? VOID : o);
export const MAX_POSITIONS = 12;

export class MarketError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "not_yours" | "not_member" | "wrong_state" | "bad_input" | "bad_signature" | "chain",
  ) {
    super(message);
    this.name = "MarketError";
  }
}

export type MarketState = "draft" | "open" | "locked" | "resolved" | "voided";
export function stateOf(d: DareRow): MarketState {
  if (d.resolvedAt) return d.resolvedOutcome === VOID_OUTCOME ? "voided" : "resolved";
  if (d.lockedAt) return "locked";
  return d.creatorSignature ? "open" : "draft";
}

// ------------------------------------------------------------------------------------------------ reading

export async function marketById(id: string): Promise<DareRow | null> {
  const [row] = await db.select().from(schema.dares).where(eq(schema.dares.id, id)).limit(1);
  return row ?? null;
}

/** Positions that count: acknowledged and not dismissed, in the order they were entered (the order signed at lock). */
export async function positionsOf(dareId: string): Promise<PositionRow[]> {
  return db
    .select()
    .from(schema.darePositions)
    .where(and(eq(schema.darePositions.dareId, dareId), isNotNull(schema.darePositions.acknowledgedAt), isNull(schema.darePositions.dismissedAt)))
    .orderBy(asc(schema.darePositions.enteredAt), asc(schema.darePositions.userId));
}

export async function votesOf(dareId: string): Promise<VoteRow[]> {
  return db.select().from(schema.dareVotes).where(eq(schema.dareVotes.dareId, dareId)).orderBy(asc(schema.dareVotes.signedAt));
}

// ---------------------------------------------------------------------------------------------- typed data

export function termsHash(termsText: string): Hex {
  return keccak256(stringToHex(termsText));
}

function requireResolvesBy(d: DareRow): bigint {
  if (!d.resolvesBy) throw new MarketError("this one has no deadline yet", "wrong_state");
  return BigInt(Math.floor(d.resolvesBy.getTime() / 1000));
}

/** What the creator signs. Every field is final before anyone is asked to sign anything. */
export function createTypedData(d: DareRow) {
  const { chainId, dares } = contracts();
  return {
    domain: daresDomain(chainId, dares.address),
    types: daresTypes,
    primaryType: "Create" as const,
    message: {
      dareId: dareOnchainId(d.id),
      groupId: groupOnchainId(d.groupId),
      kind: Kind.Binary,
      pace: Pace.Dare,
      termsHash: termsHash(d.termsText),
      denomId: denomOnchainId(d.denomId),
      range: 0n,
      options: 0,
      stalemate: d.stalemate === "void" ? Stalemate.Void : Stalemate.Arbitrate,
      resolvesBy: requireResolvesBy(d),
    },
  };
}

/** What a participant signs: their stake, their number, and their consent to the stalemate rule, in one signature. */
export function enterTypedData(d: DareRow, stake: bigint, valueBps: bigint) {
  const { chainId, dares } = contracts();
  return {
    domain: daresDomain(chainId, dares.address),
    types: daresTypes,
    primaryType: "Enter" as const,
    message: { dareId: dareOnchainId(d.id), stake, value: valueBps, confidenceBps: 0, stalemate: d.stalemate === "void" ? Stalemate.Void : Stalemate.Arbitrate },
  };
}

/** What a quorum member signs with their governance wallet. The server holds no key that can make one. */
export function voteTypedData(d: DareRow, outcome: bigint) {
  const { chainId, dares } = contracts();
  return { domain: daresDomain(chainId, dares.address), types: daresTypes, primaryType: "Vote" as const, message: { dareId: dareOnchainId(d.id), outcome: toChainOutcome(outcome) } };
}

// ------------------------------------------------------------------------------------------------ creating

export type DraftInput = {
  creatorId: string;
  groupId: string;
  denomId: string;
  title: string;
  termsText: string;
  resolvesBy: Date;
  stalemate?: "arbitrate" | "void";
  revealMode?: "open" | "blind";
  anchorBps?: bigint | null;
  anchorRationale?: string | null;
  markEmoji?: string | null;
};

/** A draft: terms the creator can read and has not yet signed. Nobody else can see it. */
export async function draftMarket(input: DraftInput): Promise<DareRow> {
  const title = input.title.trim();
  const termsText = input.termsText.trim();
  if (title.length < 3 || title.length > 140) throw new MarketError("Ask it in a line.", "bad_input");
  if (termsText.length < 3 || termsText.length > 800) throw new MarketError("The terms need a sentence.", "bad_input");
  if (input.resolvesBy.getTime() <= Date.now()) throw new MarketError("Pick a time that hasn't passed.", "bad_input");
  if (!(await isMember(input.groupId, input.creatorId))) throw new MarketError("You're not in that group.", "not_member");
  const denom = await denominationById(input.denomId);
  if (!denom || denom.groupId !== input.groupId) throw new MarketError("That unit belongs to another group.", "bad_input");
  if (input.anchorBps != null && (input.anchorBps < 0n || input.anchorBps > 10_000n)) throw new MarketError("bad anchor", "bad_input");

  // The offchain mirror of the quorum: the group's account-holders now. The chain takes its own snapshot at lock
  // and that one governs; this is what the ballot shows until then.
  const [{ n } = { n: 0 }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.groupMembers)
    .where(and(eq(schema.groupMembers.groupId, input.groupId), isNotNull(schema.groupMembers.userId), isNull(schema.groupMembers.leftAt)));
  const mark = input.markEmoji?.trim() || null;
  const [row] = await db
    .insert(schema.dares)
    .values({
      groupId: input.groupId,
      kind: "binary",
      pace: "dare",
      creatorId: input.creatorId,
      title,
      termsText,
      outcomeLabels: ["no", "yes"],
      denomId: denom.id,
      stalemate: input.stalemate ?? "arbitrate",
      revealMode: input.revealMode ?? "open",
      anchorValue: input.anchorBps ?? null,
      anchorRationale: input.anchorRationale?.trim() || null,
      anchorAt: input.anchorBps != null ? new Date() : null,
      resolvesBy: input.resolvesBy,
      threshold: Math.floor(n / 2) + 1,
      markKind: mark ? "emoji" : null,
      markValue: mark,
    })
    .returning();
  if (!row) throw new MarketError("Couldn't save that.", "chain");
  return row;
}

/** The creator's signature opens the market. Verified here against their ledger wallet; verified again onchain at lock. */
export async function openMarket(dareId: string, creatorId: string, signature: Hex): Promise<DareRow> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (d.creatorId !== creatorId) throw new MarketError("Only the person who asked it can open it.", "not_yours");
  if (stateOf(d) !== "draft") return d;
  const [creator] = await db.select().from(schema.users).where(eq(schema.users.id, creatorId)).limit(1);
  if (!creator) throw new MarketError("unknown user", "not_found");
  const ok = await verifyTypedData({ ...createTypedData(d), address: creator.ledgerWallet as Address, signature });
  if (!ok) throw new MarketError("That didn't come from your account.", "bad_signature");
  const [row] = await db.update(schema.dares).set({ creatorSignature: hexToBuffer(signature) }).where(and(eq(schema.dares.id, dareId), isNull(schema.dares.creatorSignature))).returning();
  return row ?? d;
}

// ------------------------------------------------------------------------------------------------ entering

/**
 * A position: a stake and a number, signed by the person whose position it is. One per person per market; it
 * can be changed until lock, and each change is a fresh signature over the new numbers, because the signature is
 * what goes onchain.
 */
export async function enterMarket(input: { dareId: string; userId: string; stake: bigint; valueBps: bigint; signature: Hex }): Promise<PositionRow> {
  const d = await marketById(input.dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (stateOf(d) !== "open") throw new MarketError(stateOf(d) === "draft" ? "It isn't open yet." : "Numbers are locked.", "wrong_state");
  if (!(await isMember(d.groupId, input.userId))) throw new MarketError("This one is for the people in its group.", "not_member");
  if (input.valueBps < 0n || input.valueBps > 10_000n) throw new MarketError("A number from 0 to 100.", "bad_input");
  const denom = await denominationById(d.denomId);
  if (!denom) throw new MarketError("unknown unit", "not_found");
  // An unquantifiable unit ("a next time") forces every stake to 1; the contract refuses anything else.
  if (!denom.quantifiable && input.stake !== 1n) throw new MarketError("With this unit everyone puts up exactly one.", "bad_input");
  if (input.stake <= 0n) throw new MarketError("Put something on it.", "bad_input");

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
  if (!user) throw new MarketError("unknown user", "not_found");
  const ok = await verifyTypedData({ ...enterTypedData(d, input.stake, input.valueBps), address: user.ledgerWallet as Address, signature: input.signature });
  if (!ok) throw new MarketError("That didn't come from your account.", "bad_signature");

  const existing = await positionsOf(d.id);
  if (!existing.some((p) => p.userId === input.userId) && existing.length >= MAX_POSITIONS) throw new MarketError(`This one is full at ${MAX_POSITIONS}.`, "wrong_state");

  const now = new Date();
  const [row] = await db
    .insert(schema.darePositions)
    .values({ dareId: d.id, userId: input.userId, stake: input.stake, value: input.valueBps, enterSignature: hexToBuffer(input.signature), enteredBy: input.userId, acknowledgedAt: now })
    .onConflictDoUpdate({ target: [schema.darePositions.dareId, schema.darePositions.userId], set: { stake: input.stake, value: input.valueBps, enterSignature: hexToBuffer(input.signature) } })
    .returning();
  if (!row) throw new MarketError("Couldn't save that.", "chain");
  return row;
}

// ------------------------------------------------------------------------------------------------- locking

/**
 * Lock: the first chain write. One `create` carries the market and every position with its owner's signature, or
 * nothing lands at all. The quorum is whatever the ledger says the group is at that moment, never anything sent
 * from here, and the threshold the contract computed is mirrored back.
 */
export async function lockMarket(dareId: string, byUserId: string): Promise<{ txHash: Hex; threshold: number; quorum: Address[] }> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (d.creatorId !== byUserId) throw new MarketError("Only the person who asked it can lock it.", "not_yours");
  if (stateOf(d) !== "open" || !d.creatorSignature) throw new MarketError("It can't be locked right now.", "wrong_state");
  const positions = await positionsOf(d.id);
  if (positions.length < 2) throw new MarketError("It takes two to lock it in.", "wrong_state");
  if (positions.some((p) => !p.userId || !p.enterSignature)) throw new MarketError("Someone in it hasn't signed their number.", "wrong_state");

  const users = await db.select().from(schema.users).where(inArray(schema.users.id, positions.map((p) => p.userId as string)));
  const ledgerOf = new Map(users.map((u) => [u.id, u.ledgerWallet as Address]));
  const [creator] = await db.select().from(schema.users).where(eq(schema.users.id, d.creatorId)).limit(1);
  if (!creator) throw new MarketError("unknown creator", "not_found");

  // Registration first: every account-holder in the group, and the unit. Both are idempotent.
  await ensureGroupOnchain(d.groupId);
  await ensureDenomOnchain(d.denomId);

  const typed = createTypedData(d);
  const { dares } = contracts();
  const { publicClient } = relayer();
  const quorumNow = (await publicClient.readContract({ address: contracts().ledger.address, abi: contracts().ledger.abi, functionName: "governanceOf", args: [typed.message.groupId] })) as readonly Address[];

  const dareStruct = {
    id: typed.message.dareId,
    groupId: typed.message.groupId,
    kind: typed.message.kind,
    pace: typed.message.pace,
    creator: creator.ledgerWallet as Address,
    termsHash: typed.message.termsHash,
    denomId: typed.message.denomId,
    range: 0n,
    options: 0,
    stalemate: typed.message.stalemate,
    quorum: [] as Address[], // ignored by the contract, which reads the ledger
    threshold: 0,
    resolvesBy: typed.message.resolvesBy,
    status: 0,
    outcome: 0n,
  };
  const ps = positions.map((p) => {
    const ledger = ledgerOf.get(p.userId as string);
    if (!ledger) throw new MarketError("someone in it has no account", "wrong_state");
    return { ledger, stake: p.stake, value: p.value, confidenceBps: 0 };
  });
  const sigs = positions.map((p) => bufferToHex(p.enterSignature as Buffer));

  let txHash: Hex;
  let minedIn: bigint | undefined;
  try {
    const result = await submit({
      label: `create market ${d.id}`,
      address: dares.address,
      abi: dares.abi,
      functionName: "create",
      args: [dareStruct, ps, sigs, bufferToHex(d.creatorSignature)],
      gas: gasFor.create(ps.length, quorumNow.length),
    });
    txHash = result.hash;
    minedIn = result.receipt.blockNumber;
  } catch (err) {
    // A retry after a lock whose mirror never got written finds the market already there. That is a lock.
    const already = /DareExists/.test(err instanceof Error ? err.message : "");
    if (!already) throw new MarketError(`Locking it didn't go through. Nothing changed. (${err instanceof Error ? (err.message.split("\n")[0] ?? "") : "unknown"})`, "chain");
    txHash = "0x" as Hex;
  }

  // It is locked the moment the transaction succeeds; record that first, so nothing after this line can leave a
  // market locked onchain and open here.
  await db.update(schema.dares).set({ onchainId: hexToBuffer(typed.message.dareId), lockedAt: new Date() }).where(and(eq(schema.dares.id, d.id), isNull(schema.dares.lockedAt)));

  // Read what the contract decided, at the block it was mined in: a load-balanced RPC can otherwise answer from
  // a node that has not seen that block yet and say the market does not exist.
  const onchain = (await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "dareOf", args: [typed.message.dareId], blockNumber: minedIn })) as { threshold: number; quorum: readonly Address[] };
  await db.update(schema.dares).set({ threshold: onchain.threshold }).where(eq(schema.dares.id, d.id));
  return { txHash, threshold: onchain.threshold, quorum: [...onchain.quorum] };
}

// -------------------------------------------------------------------------------------------------- voting

/** The quorum as the chain snapshotted it at lock: governance wallets. The ballot is only ever offered to these. */
export async function quorumOf(d: DareRow): Promise<Address[]> {
  if (!d.onchainId) return [];
  const { dares } = contracts();
  const onchain = (await relayer().publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "dareOf", args: [bufferToHex(d.onchainId)] })) as { quorum: readonly Address[] };
  return onchain.quorum.map((a) => a.toLowerCase() as Address);
}

/** One line from anyone in the group about what happened. It is what the outcome proposal reads. */
export async function sayWhatHappened(dareId: string, userId: string, statement: string): Promise<void> {
  const d = await marketById(dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (stateOf(d) !== "locked") throw new MarketError("It isn't waiting on an answer.", "wrong_state");
  if (!(await isMember(d.groupId, userId))) throw new MarketError("This one is for the people in its group.", "not_member");
  const text = statement.trim().slice(0, 280);
  if (text.length < 2) throw new MarketError("Say what happened in a line.", "bad_input");
  await db
    .insert(schema.dareStatements)
    .values({ dareId, userId, statement: text })
    .onConflictDoUpdate({ target: [schema.dareStatements.dareId, schema.dareStatements.userId], set: { statement: text, statedAt: new Date() } });
}

export type Tally = { outcome: bigint; votes: number }[];
export function tally(votes: Pick<VoteRow, "outcome">[]): Tally {
  const by = new Map<bigint, number>();
  for (const v of votes) by.set(v.outcome, (by.get(v.outcome) ?? 0) + 1);
  return Array.from(by, ([outcome, n]) => ({ outcome, votes: n })).sort((a, b) => b.votes - a.votes);
}

/**
 * A vote: a governance-wallet signature over (market, outcome), from someone in the quorum the chain snapshotted.
 * One per person, changeable until it resolves. When `threshold` signatures agree, this submits `resolve`, in a
 * transaction of its own, with exactly those signatures. The server relays votes; it cannot make one.
 */
export async function castVote(input: { dareId: string; userId: string; outcome: bigint; signature: Hex }): Promise<{ resolved: boolean; txHash?: Hex }> {
  const d = await marketById(input.dareId);
  if (!d) throw new MarketError("That one doesn't exist.", "not_found");
  if (stateOf(d) !== "locked") throw new MarketError(d.resolvedAt ? "It's already decided." : "It isn't locked yet.", "wrong_state");
  if (input.outcome !== 0n && input.outcome !== 1n && input.outcome !== VOID_OUTCOME) throw new MarketError("Yes, no, or nobody can tell.", "bad_input");

  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, input.userId)).limit(1);
  if (!user) throw new MarketError("unknown user", "not_found");
  const quorum = await quorumOf(d);
  if (!quorum.includes(user.governanceWallet.toLowerCase() as Address)) throw new MarketError("This one was locked before you joined the group, so it isn't yours to call.", "not_member");
  const ok = await verifyTypedData({ ...voteTypedData(d, input.outcome), address: user.governanceWallet as Address, signature: input.signature });
  if (!ok) throw new MarketError("That didn't come from your account.", "bad_signature");

  await db
    .insert(schema.dareVotes)
    .values({ dareId: d.id, userId: input.userId, outcome: input.outcome, signature: hexToBuffer(input.signature) })
    .onConflictDoUpdate({ target: [schema.dareVotes.dareId, schema.dareVotes.userId], set: { outcome: input.outcome, signature: hexToBuffer(input.signature), signedAt: new Date() } });

  const votes = await votesOf(d.id);
  const leading = tally(votes)[0];
  if (!leading || leading.votes < d.threshold) return { resolved: false };
  const txHash = await resolveMarket(d, leading.outcome, votes.filter((v) => v.outcome === leading.outcome));
  return { resolved: true, txHash };
}

type Settlement = { outcome: bigint; txHash: Hex; scores: Map<string, number>; edges: Array<{ tokenId: bigint; debtor: string; creditor: string; qty: bigint; obligationId: Hex; unique: boolean }> };

/** One resolution, one transaction. Then the chain's answer is mirrored: scores, nets, and one shadow row per edge. */
async function resolveMarket(d: DareRow, outcome: bigint, agreeing: VoteRow[]): Promise<Hex> {
  if (!d.onchainId) throw new MarketError("It isn't locked yet.", "wrong_state");
  const positions = await positionsOf(d.id);
  const { dares, ledger } = contracts();
  let result;
  try {
    result = await submit({
      label: `resolve market ${d.id}`,
      address: dares.address,
      abi: dares.abi,
      functionName: "resolve",
      args: [bufferToHex(d.onchainId), toChainOutcome(outcome), agreeing.map((v) => bufferToHex(v.signature))],
      // A void mints nothing, and Monad charges what is declared: it never pays for edges it cannot mint.
      gas: outcome === VOID_OUTCOME ? gasFor.resolveVoid(agreeing.length) : gasFor.resolve(positions.length, agreeing.length),
    });
  } catch (err) {
    // Two last votes can arrive together; the second finds the market already resolved. That is not a failure.
    if (await reconcileFromIndexer(d.id)) return "0x" as Hex;
    throw new MarketError(`The votes are in, but recording it didn't go through. Tap again to retry. (${err instanceof Error ? (err.message.split("\n")[0] ?? "") : "unknown"})`, "chain");
  }

  // Read the settlement out of the receipt: who scored what, and which edges were minted.
  const settlement: Settlement = { outcome, txHash: result.hash, scores: new Map(), edges: [] };
  for (const log of result.receipt.logs) {
    const addr = log.address.toLowerCase();
    try {
      if (addr === dares.address.toLowerCase()) {
        const ev = decodeEventLog({ abi: dares.abi, data: log.data, topics: log.topics });
        if (ev.eventName === "Scored") settlement.scores.set((ev.args as { participant: Address }).participant.toLowerCase(), Number((ev.args as { score: number }).score));
      } else if (addr === ledger.address.toLowerCase()) {
        const ev = decodeEventLog({ abi: ledger.abi, data: log.data, topics: log.topics });
        if (ev.eventName === "Confirmed") {
          const a = ev.args as { debtor: Address; creditor: Address; id: bigint; qty: bigint; obligationId: Hex; unique: boolean };
          settlement.edges.push({ tokenId: a.id, debtor: a.debtor.toLowerCase(), creditor: a.creditor.toLowerCase(), qty: a.qty, obligationId: a.obligationId.slice(0, 34) as Hex, unique: a.unique });
        }
      }
    } catch {
      // A log with another event signature; not ours to read.
    }
  }
  await mirrorSettlement(d, settlement);
  return result.hash;
}

/**
 * The offchain mirror of a settlement, written once and idempotently: the outcome, each person's score and net,
 * and one shadow `obligations` row per minted edge (the edge's onchain id is its uuid, so the two sides join the
 * way every other obligation does). A partial result is refused rather than recorded.
 */
async function mirrorSettlement(d: DareRow, s: Settlement): Promise<void> {
  const positions = await positionsOf(d.id);
  const users = await db.select().from(schema.users).where(inArray(schema.users.id, positions.map((p) => p.userId as string)));
  const byLedger = new Map(users.map((u) => [u.ledgerWallet.toLowerCase(), u]));
  const denom = await denominationById(d.denomId);
  const voided = s.outcome === VOID_OUTCOME;
  if (!voided && s.scores.size !== positions.length) throw new MarketError(`the settlement scored ${s.scores.size} of ${positions.length} people; refusing to record a partial result`, "chain");
  if (voided && s.edges.length > 0) throw new MarketError("a voided market minted something; refusing to record it", "chain");

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(schema.dares).set({ resolvedOutcome: s.outcome, resolvedBy: "quorum", resolvedAt: now }).where(and(eq(schema.dares.id, d.id), isNull(schema.dares.resolvedAt)));
    for (const p of positions) {
      const wallet = users.find((x) => x.id === p.userId)?.ledgerWallet.toLowerCase() ?? "";
      const net = s.edges.reduce((a, e) => a + (e.creditor === wallet ? e.qty : 0n) - (e.debtor === wallet ? e.qty : 0n), 0n);
      await tx
        .update(schema.darePositions)
        .set({ score: voided ? null : (s.scores.get(wallet) ?? null), net: voided ? null : net })
        .where(and(eq(schema.darePositions.dareId, d.id), eq(schema.darePositions.userId, p.userId as string)));
    }
    for (const e of s.edges) {
      const from = byLedger.get(e.debtor);
      const to = byLedger.get(e.creditor);
      if (!from || !to) throw new MarketError("the settlement minted an edge to someone who is not in the market", "chain");
      await tx
        .insert(schema.obligations)
        .values({
          id: bytes16ToUuid(e.obligationId),
          tokenId: e.tokenId,
          groupId: d.groupId,
          fromUser: from.id,
          toUser: to.id,
          denomId: d.denomId,
          quantity: denom?.quantifiable === false ? null : e.qty,
          uniqueObligation: e.unique,
          amountCents: denom?.monetary ? e.qty : null,
          origin: "dare",
          originId: d.id,
          settleExpected: denom?.monetary ?? false,
          memo: null,
          confirmTx: hexToBuffer(s.txHash),
          createdAt: now,
        })
        .onConflictDoNothing();
    }
  });
}

/**
 * If the chain says a market is decided and this database does not, take the chain's word (through the indexer,
 * the only chain reader). Covers a mirror write that failed after the transaction succeeded, and two final votes
 * arriving at once. Returns whether the market is now recorded as decided.
 */
export async function reconcileFromIndexer(dareId: string): Promise<boolean> {
  const d = await marketById(dareId);
  if (!d || !d.onchainId) return false;
  if (d.resolvedAt) return true;
  const indexed = await dareByOnchainId(bufferToHex(d.onchainId)).catch(() => null);
  if (!indexed || (indexed.status !== "RESOLVED" && indexed.status !== "VOIDED") || !indexed.resolveTx) return false;
  await mirrorSettlement(d, {
    outcome: indexed.status === "VOIDED" ? VOID_OUTCOME : BigInt(indexed.outcome ?? "0"),
    txHash: indexed.resolveTx as Hex,
    scores: new Map(indexed.positions.filter((p) => p.score !== null).map((p) => [p.participant.toLowerCase(), p.score as number])),
    edges: indexed.edges.map((e) => ({ tokenId: BigInt(e.tokenId), debtor: e.debtor.toLowerCase(), creditor: e.creditor.toLowerCase(), qty: BigInt(e.qty), obligationId: e.id as Hex, unique: e.unique })),
  });
  return true;
}
