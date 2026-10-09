/**
 * The relayer: one server-controlled EOA that submits every contract mutation and pays gas. It holds no
 * user keys and cannot originate an action; it forwards messages users have signed.
 *
 * Every submission carries an explicit `gas` from gas.ts. The call is simulated first (an eth_call, not an
 * estimate) so a revert is caught before the declared gas is charged, then submitted, then awaited, and a
 * receipt that is not `success` throws. Principle 9: a chain write that fails must fail loudly.
 */
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  keccak256,
  WaitForTransactionReceiptTimeoutError,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import { timed } from "@/lib/timing";
import { monadChain, rpcUrl } from "./contracts";
import { clearChainFailure, noteChainFailure } from "./failures";

export type Relayer = {
  account: PrivateKeyAccount;
  publicClient: PublicClient;
  walletClient: WalletClient;
};

let cached: Relayer | undefined;

export function relayer(): Relayer {
  if (cached) return cached;
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk || !pk.startsWith("0x")) throw new Error("RELAYER_PRIVATE_KEY is not set");
  const account = privateKeyToAccount(pk as Hex);
  const expected = process.env.RELAYER_ADDRESS;
  if (expected && expected.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error("RELAYER_PRIVATE_KEY does not match RELAYER_ADDRESS");
  }
  const chain = monadChain();
  // Transient HTTP failures (rate limits, gateway hiccups) retry with backoff before anything fails loudly.
  const transport = http(rpcUrl(), { retryCount: 6, retryDelay: 1500, timeout: 30_000 });
  cached = {
    account,
    // Monad produces a block in well under a second. viem's default is to look for a receipt every four
    // seconds, so a receipt missed on the first look cost four seconds of someone staring at a button.
    publicClient: createPublicClient({ chain, transport, pollingInterval: 400 }),
    walletClient: createWalletClient({ account, chain, transport }),
  };
  return cached;
}

export class RelayerTransactionFailed extends Error {
  constructor(
    public readonly label: string,
    public readonly hash: Hex,
    public readonly receipt: TransactionReceipt,
  ) {
    super(`${label}: transaction ${hash} reverted in block ${receipt.blockNumber}`);
    this.name = "RelayerTransactionFailed";
  }
}

export type SubmitResult = { hash: Hex; receipt: TransactionReceipt };

/** What a write is for, so the tick can finish what the action would have once the receipt is in (`src/lib/ledger/completions.ts`). */
export type WriteKind = "confirm" | "close" | "net" | "create" | "resolve" | "arbitrate" | "feed" | "expire" | "register" | "other";
export type WriteRecord = {
  kind: WriteKind;
  subject: Record<string, unknown>;
  /** The person whose tap this is, so a drop after they were told it was on its way reaches their screen; null or absent for the scheduler. */
  actor?: string | null;
};

/** The subject as it is stored, so a later write for the same thing can be found by equality. */
export const subjectKey = (subject: Record<string, unknown>): string => JSON.stringify(subject, (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v));

/** How long a receipt is waited for in the person's own request before the write is left to the tick. Monad mines in under a second; this is the node being slow to answer, not the chain. */
export const RECEIPT_TIMEOUT_MS = 20_000;

/**
 * The transaction was signed and broadcast (or may have been), and no receipt came within the wait: the write is
 * pending in `chain_writes`, the tick reads its receipt and finishes it, and the person is told it is on its way.
 * Never a failure: the thing may well have gone through.
 */
export class SendPending extends Error {
  constructor(
    public readonly hash: Hex,
    public readonly label: string,
    public readonly kind: WriteKind = "other",
  ) {
    super(`${label}: sent as ${hash}, and the receipt has not come yet; the tick will finish it`);
    this.name = "SendPending";
  }
}

/** What the person is told when their send is pending (docs/decisions.md 2026-09-27): a state, not a refusal, and the design has not drawn it yet. */
export const SEND_PENDING_COPY = "Sent, and still going through. Nothing more to do here; it will show in a minute.";
/**
 * A pending registration (a group or a unit reaching the ledger for the first time) is setup, not the person's own
 * action: that was never sent, so they are not told it will show. The tick lands the registration and they go again.
 */
export const SETUP_PENDING_COPY = "Still setting things up. Nothing was recorded; try again in a minute.";
export const pendingCopy = (err: SendPending): string => (err.kind === "register" ? SETUP_PENDING_COPY : SEND_PENDING_COPY);

/** What the node says when it already holds the transaction: the broadcast counted, whatever the answer looked like. */
export function isAlreadyKnown(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 8; e = (e as { cause?: unknown }).cause, depth += 1) {
    const message = typeof (e as { message?: unknown }).message === "string" ? (e as { message: string }).message : "";
    if (/already known|already imported|known transaction|alreadyknown/i.test(message)) return true;
  }
  return false;
}

/**
 * The failures the network answers when two senders raced for one nonce, or a lagging node has not yet seen
 * the last send: the only ones a resend with the next nonce can fix. Anything else is a real failure.
 */
export function isNonceProblem(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 8; e = (e as { cause?: unknown }).cause, depth += 1) {
    const name = typeof (e as { name?: unknown }).name === "string" ? (e as { name: string }).name : "";
    const message = typeof (e as { message?: unknown }).message === "string" ? (e as { message: string }).message : "";
    if (name === "NonceTooLowError") return true;
    if (/nonce too low|nonce is too low|already known|replacement transaction underpriced|invalid nonce|existing transaction had higher priority/i.test(message)) return true;
  }
  return false;
}

/** Sends with the nonce the network reports; on a nonce collision sends again with the next one, a few times; any other failure is thrown at once. */
export async function sendWithNonceRetry<T>(send: (nonce: number) => Promise<T>, base: number, attempts = 3): Promise<T> {
  for (let k = 0; ; k += 1) {
    try {
      return await send(base + k);
    } catch (err) {
      if (k + 1 >= attempts || !isNonceProblem(err)) throw err;
    }
  }
}

/** How long the locked part of a send may take: a nonce read and one broadcast, seconds when the node answers, before the lock is given up rather than held by a hung call. */
export const SEND_TIMEOUT_MS = 15_000;

export class SendTimedOut extends Error {
  constructor(ms: number) {
    super(`the send did not finish within ${ms}ms; the lock was released, and the transaction may or may not have been broadcast`);
    this.name = "SendTimedOut";
  }
}

/** The promise, or `SendTimedOut` once `ms` have passed, whichever is first; the late result is dropped. */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clock = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SendTimedOut(ms)), ms);
  });
  return Promise.race([p, clock]).finally(() => clearTimeout(timer));
}

/**
 * One relayer key, many senders: every serverless instance, the tick, the development machine and its tests.
 * Two of them reading the pending nonce in the same second would send with the same one, and the second would
 * fail loudly for a person (docs/decisions.md 2026-09-27). So the nonce is read and the transaction sent under
 * one transaction-scoped lock in the shared database, the only thing every sender shares; the receipt is
 * waited for outside it, and a process that dies holding it releases it with its transaction. A hung node
 * cannot hold it either: the locked part is given up after `SEND_TIMEOUT_MS`, so one stalled call never stalls
 * every send behind it (a transaction that was broadcast before the stall is counted by the next sender's
 * pending-nonce read, or caught by its retry).
 */
export async function withSendLock<T>(fn: () => Promise<T>, timeoutMs = SEND_TIMEOUT_MS): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('relayer-send', 0))`);
    return withTimeout(fn(), timeoutMs);
  });
}

/** When this process last saw one of its own transactions mined; see the simulate retry below. */
let lastMinedAt = 0;

type SubmitRequest<TAbi extends Abi, TFn extends ContractFunctionName<TAbi, "nonpayable" | "payable">> = {
  label: string;
  address: Address;
  abi: TAbi;
  functionName: TFn;
  args: ContractFunctionArgs<TAbi, "nonpayable" | "payable", TFn>;
  gas: bigint;
  /** What this write is for, so the tick can finish it if the receipt outlives the request. */
  write?: WriteRecord;
};

/** The reverts that say the thing is already there: the write's purpose is met, whoever met it. */
export function alreadyThere(err: unknown): boolean {
  const message = err instanceof Error ? err.message : "";
  return /\b(DareExists|GroupExists|AlreadyMember|DenomExists|ObligationExists)\b/.test(message);
}

/** The key a failing write is filed under (src/lib/chain/failures.ts): the thing being written, never the attempt. */
export const failureKeyOf = (write: WriteRecord): string => `${write.kind}:${subjectKey(write.subject)}`;

/**
 * Simulate, submit with explicit gas, wait, and verify. `gas` is required by type; there is no default. A failure is
 * filed under the thing being written until a send for it succeeds (the touch-ups round), so one that goes on failing
 * reaches the owner; a receipt still to come is not a failure.
 */
export async function submit<
  const TAbi extends Abi,
  TFn extends ContractFunctionName<TAbi, "nonpayable" | "payable">,
>(req: SubmitRequest<TAbi, TFn>): Promise<SubmitResult> {
  const write = req.write ?? { kind: "other", subject: { label: req.label } };
  const key = failureKeyOf(write);
  try {
    const result = await submitOnce(req);
    await clearChainFailure(key);
    return result;
  } catch (err) {
    if (alreadyThere(err)) await clearChainFailure(key);
    else if (!(err instanceof SendPending)) await noteChainFailure({ key, kind: write.kind, label: req.label }, err);
    throw err;
  }
}

async function submitOnce<
  const TAbi extends Abi,
  TFn extends ContractFunctionName<TAbi, "nonpayable" | "payable">,
>(req: SubmitRequest<TAbi, TFn>): Promise<SubmitResult> {
  const { account, publicClient, walletClient } = relayer();
  const chain = monadChain();

  // eth_call with the relayer as sender: catches reverts before the declared gas is charged.
  // The RPC is load-balanced, and a node can lag the one that mined the relayer's previous transaction by a
  // block. A simulate that lands there reverts against stale state ("unknown group" a moment after the group was
  // registered). So a revert within a few seconds of the last mined transaction is asked again, briefly, before
  // it is believed. A revert that is real is still a revert half a second later.
  const simulate = () =>
    publicClient.simulateContract({
      account,
      address: req.address,
      abi: req.abi,
      functionName: req.functionName,
      args: req.args,
    } as Parameters<PublicClient["simulateContract"]>[0]);
  await timed(`relayer ${req.label}: simulate`, async () => {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await simulate();
      } catch (err) {
        if (attempt >= 2 || Date.now() - lastMinedAt > 5_000) throw err;
        await new Promise((r) => setTimeout(r, 450));
      }
    }
  });

  // Signed here, so the hash is known before anything is broadcast and a send the node never answered can still
  // be finished (docs/decisions.md 2026-09-27, "a send is never lost"). The lock covers the nonce read and the
  // broadcast alone; the receipt is waited for outside it.
  const data = encodeFunctionData({ abi: req.abi, functionName: req.functionName, args: req.args } as Parameters<typeof encodeFunctionData>[0]);
  const write = req.write ?? { kind: "other", subject: { label: req.label } };
  let last: { hash: Hex; raw: Hex } | null = null;
  const sign = async (nonce: number): Promise<{ hash: Hex; raw: Hex }> => {
    const prepared = await walletClient.prepareTransactionRequest({ account, chain, to: req.address, data, gas: req.gas, nonce } as Parameters<WalletClient["prepareTransactionRequest"]>[0]);
    const raw = await walletClient.signTransaction(prepared as Parameters<WalletClient["signTransaction"]>[0]);
    return { hash: keccak256(raw), raw };
  };
  let hash: Hex;
  try {
    hash = await timed(`relayer ${req.label}: send`, () =>
      withSendLock(async () => {
        // Read under the lock, so it counts the previous sender's transaction; a lagging node is covered by the retry.
        const base = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
        return sendWithNonceRetry(async (nonce) => {
          const signed = await sign(nonce);
          await recordWrite({ ...signed, label: req.label, nonce, kind: write.kind, subject: write.subject, actor: write.actor ?? null });
          last = signed;
          try {
            await publicClient.sendRawTransaction({ serializedTransaction: signed.raw });
          } catch (err) {
            if (isAlreadyKnown(err)) return signed.hash;
            // Never accepted: the record says so, and the retry (a collision) or the caller (anything else) takes it from here.
            await markWrite(signed.hash, "dropped");
            last = null;
            throw err;
          }
          return signed.hash;
        }, base);
      }),
    );
  } catch (err) {
    // The node stopped answering with a signed transaction in flight: the lock is released, and the send carries on
    // out here, where it may already have landed. Anything else, or nothing yet signed, is a plain failure.
    const inFlight = last as { hash: Hex; raw: Hex } | null;
    if (!(err instanceof SendTimedOut) || !inFlight) throw err;
    hash = inFlight.hash;
    await publicClient.sendRawTransaction({ serializedTransaction: inFlight.raw }).catch((again: unknown) => {
      if (!isAlreadyKnown(again) && !isNonceProblem(again)) throw again;
    });
  }

  let receipt: TransactionReceipt;
  try {
    receipt = await timed(`relayer ${req.label}: wait for receipt`, () => publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS }));
  } catch (err) {
    if (err instanceof WaitForTransactionReceiptTimeoutError) {
      // The person is about to be told it is on its way: a drop or a revert from here on has to reach their screen.
      if (write.kind !== "register") await markTold(hash);
      throw new SendPending(hash, req.label, write.kind);
    }
    throw err;
  }
  await markWrite(hash, receipt.status === "success" ? "mined" : "reverted", receipt.blockNumber);
  if (process.env.RELAYER_LOG_GAS) {
    // Monad receipts report gasUsed equal to the declared limit, so this line only tells you whether the
    // limit was enough (success) or not (reverted). Size gas.ts from scripts/gas-survey.ts, not from here.
    console.log(`[relayer] ${req.label}: limit ${req.gas}, receipt gasUsed ${receipt.gasUsed}, ${receipt.status}`);
  }
  lastMinedAt = Date.now();
  if (receipt.status !== "success") throw new RelayerTransactionFailed(req.label, hash, receipt);
  // The action's own mirror follows in the caller; the record says the chain's part is done.
  await markCompleted(hash);
  return { hash, receipt };
}

/** The record of a signed transaction, written before it is broadcast. */
async function recordWrite(w: { hash: Hex; raw: Hex; label: string; nonce: number; kind: WriteKind; subject: Record<string, unknown>; actor: string | null }): Promise<void> {
  await db
    .insert(schema.chainWrites)
    .values({ hash: Buffer.from(w.hash.slice(2), "hex"), raw: Buffer.from(w.raw.slice(2), "hex"), label: w.label.slice(0, 200), nonce: w.nonce, kind: w.kind, subject: subjectKey(w.subject), actorId: w.actor })
    .onConflictDoNothing();
}

/** The person was told the send is on its way (docs/decisions.md 2026-09-27): what becomes of it is theirs to hear (src/lib/ledger/again.ts). */
async function markTold(hash: Hex): Promise<void> {
  await db.update(schema.chainWrites).set({ toldAt: new Date(), updatedAt: new Date() }).where(eq(schema.chainWrites.hash, Buffer.from(hash.slice(2), "hex")));
}

/** Whether a send for this thing is still in flight, or mined and waiting on its mirror: a retry now would double it. */
export async function writeInFlight(kind: WriteKind, subject: Record<string, unknown>): Promise<boolean> {
  const W = schema.chainWrites;
  const rows = await db
    .select({ status: W.status, completedAt: W.completedAt })
    .from(W)
    .where(and(eq(W.kind, kind), eq(W.subject, subjectKey(subject)), or(eq(W.status, "pending"), and(eq(W.status, "mined"), isNull(W.completedAt)))))
    .limit(1);
  return rows.length > 0;
}

export async function markWrite(hash: Hex, status: "mined" | "reverted" | "dropped", blockNumber?: bigint): Promise<void> {
  await db.update(schema.chainWrites).set({ status, blockNumber: blockNumber ?? null, updatedAt: new Date() }).where(eq(schema.chainWrites.hash, Buffer.from(hash.slice(2), "hex")));
}

/** The caller's mirror was written in the same request, so the tick has nothing to finish. */
export async function markCompleted(hash: Hex): Promise<void> {
  await db.update(schema.chainWrites).set({ completedAt: new Date(), updatedAt: new Date() }).where(eq(schema.chainWrites.hash, Buffer.from(hash.slice(2), "hex")));
}
