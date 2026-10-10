/**
 * The relayer's balance, watched from the tick. The development machine shares the relayer with production,
 * so local test runs spend the same gas that people on dareful.app depend on. The tick's own report carries the reading
 * every minute; the owner is told by the runway lines (src/lib/ops/runway.ts, the ops round), into which the hourly
 * email for under three days or under the floor is folded: warned under ten MON, urgent under five or three days, once
 * per crossing. Nothing here can fail the tick: a balance that cannot be read is reported as unread.
 */
import { formatEther, parseTransaction, type Hex } from "viem";
import { and, gt, inArray, lt } from "drizzle-orm";
import { db, schema } from "@/db";
import { relayer } from "./relayer";

/** Three MON. One full run of the database suites costs about half a MON; the floor is a few runs of warning. */
export const RELAYER_FLOOR = 3n * 10n ** 18n;
/**
 * What the test suites leave the relayer (the touch-ups round, section 0): they share it with production, and a suite
 * that signs anything refuses to start under this. Five MON is weeks of what people spend.
 */
export const TEST_FLOOR = 5n * 10n ** 18n;
export const TEST_FLOOR_MARK = "relayer under the test floor";

/** The runway the owner is told to keep: three days of use at the past week's rate. */
export const RUNWAY_DAYS = 3n;
const WEEK_MS = 7 * 24 * 3_600_000;

/** Low: under the floor, or under three days of use at the rate given (wei a day). Pure. */
export function relayerLow(balance: bigint, floor = RELAYER_FLOOR, perDay = 0n): boolean {
  return balance < floor || (perDay > 0n && balance < perDay * RUNWAY_DAYS);
}

/** The email goes out on the tick at the top of the hour, so a low balance is said once an hour, not once a minute. */
export function hourly(now: Date): boolean {
  return now.getUTCMinutes() === 0;
}

/** Whole MON and two decimals, from the integer wei, so no float touches the number. */
export function monOf(balance: bigint): string {
  const [whole, frac = ""] = formatEther(balance).split(".");
  return `${whole}.${(frac + "00").slice(0, 2)}`;
}

/** Days the balance covers at a rate, to a tenth, from integers; null when nothing was spent. Pure. */
export function daysCovered(balance: bigint, perDay: bigint): number | null {
  if (perDay <= 0n) return null;
  return Number((balance * 10n) / perDay) / 10;
}

/**
 * What one signed transaction cost: Monad charges the gas limit, not the gas used, at the price the transaction
 * pays, which is the base fee and its tip, capped by its own maximum. Pure.
 */
export function costOf(raw: Hex, baseFee: bigint): bigint {
  const tx = parseTransaction(raw);
  const gas = tx.gas ?? 0n;
  const tip = tx.maxPriorityFeePerGas ?? 0n;
  const cap = tx.maxFeePerGas ?? tx.gasPrice ?? baseFee + tip;
  const price = baseFee + tip < cap ? baseFee + tip : cap;
  return gas * price;
}

/** The past week's spend, a day's worth of it, from every transaction the relayer signed that the chain charged (mined or reverted), test runs included, since they share it. */
export async function spendPerDay(now: Date, baseFee: bigint): Promise<{ perDay: bigint; week: bigint; writes: number }> {
  const W = schema.chainWrites;
  const rows = await db
    .select({ raw: W.raw })
    .from(W)
    .where(and(gt(W.createdAt, new Date(now.getTime() - WEEK_MS)), lt(W.createdAt, now), inArray(W.status, ["mined", "reverted"])));
  let week = 0n;
  for (const r of rows) week += costOf(`0x${r.raw.toString("hex")}`, baseFee);
  return { perDay: week / 7n, week, writes: rows.length };
}

export type RelayerWatch = { mon: string; low: boolean };

/** The balance now, with the days it covers at the past week's rate: what the owner's page shows. */
export async function relayerRunway(now: Date): Promise<{ balance: bigint; perDay: bigint; days: number | null; writes: number }> {
  const { account, publicClient } = relayer();
  const [balance, block] = await Promise.all([publicClient.getBalance({ address: account.address }), publicClient.getBlock()]);
  const spend = await spendPerDay(now, block.baseFeePerGas ?? 0n);
  return { balance, perDay: spend.perDay, days: daysCovered(balance, spend.perDay), writes: spend.writes };
}

export async function watchRelayer(): Promise<RelayerWatch> {
  const { account, publicClient } = relayer();
  const balance = await publicClient.getBalance({ address: account.address });
  const low = relayerLow(balance);
  if (low) console.warn(`relayer: ${monOf(balance)} MON, under the ${monOf(RELAYER_FLOOR)} MON floor`);
  return { mon: monOf(balance), low };
}
