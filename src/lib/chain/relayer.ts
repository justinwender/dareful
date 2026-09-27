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
  http,
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
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { timed } from "@/lib/timing";
import { monadChain, rpcUrl } from "./contracts";

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

/**
 * The failures the network answers when two senders raced for one nonce, or a lagging node has not yet seen
 * the last send: the only ones a resend with the next nonce can fix. Anything else is a real failure.
 */
export function isNonceProblem(err: unknown): boolean {
  for (let e: unknown = err, depth = 0; e && typeof e === "object" && depth < 8; e = (e as { cause?: unknown }).cause, depth += 1) {
    const name = typeof (e as { name?: unknown }).name === "string" ? (e as { name: string }).name : "";
    const message = typeof (e as { message?: unknown }).message === "string" ? (e as { message: string }).message : "";
    if (name === "NonceTooLowError") return true;
    if (/nonce too low|nonce is too low|already known|replacement transaction underpriced|invalid nonce/i.test(message)) return true;
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

/**
 * Simulate, submit with explicit gas, wait, and verify. `gas` is required by type; there is no default.
 */
/** When this process last saw one of its own transactions mined; see the simulate retry below. */
let lastMinedAt = 0;

export async function submit<
  const TAbi extends Abi,
  TFn extends ContractFunctionName<TAbi, "nonpayable" | "payable">,
>(req: {
  label: string;
  address: Address;
  abi: TAbi;
  functionName: TFn;
  args: ContractFunctionArgs<TAbi, "nonpayable" | "payable", TFn>;
  gas: bigint;
}): Promise<SubmitResult> {
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

  const hash = await timed(`relayer ${req.label}: send`, () =>
    withSendLock(async () => {
      // Read under the lock, so it counts the previous sender's transaction; a lagging node is covered by the retry.
      const base = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" });
      return sendWithNonceRetry(
        (nonce) =>
          walletClient.writeContract({
            account,
            chain,
            address: req.address,
            abi: req.abi,
            functionName: req.functionName,
            args: req.args,
            gas: req.gas,
            nonce,
          } as Parameters<WalletClient["writeContract"]>[0]),
        base,
      );
    }),
  );

  const receipt = await timed(`relayer ${req.label}: wait for receipt`, () => publicClient.waitForTransactionReceipt({ hash }));
  if (process.env.RELAYER_LOG_GAS) {
    // Monad receipts report gasUsed equal to the declared limit, so this line only tells you whether the
    // limit was enough (success) or not (reverted). Size gas.ts from scripts/gas-survey.ts, not from here.
    console.log(`[relayer] ${req.label}: limit ${req.gas}, receipt gasUsed ${receipt.gasUsed}, ${receipt.status}`);
  }
  lastMinedAt = Date.now();
  if (receipt.status !== "success") throw new RelayerTransactionFailed(req.label, hash, receipt);
  return { hash, receipt };
}
