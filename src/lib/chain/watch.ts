/**
 * The relayer's balance, watched from the tick. The development machine shares the relayer with production,
 * so local test runs spend the same gas that people on dareful.app depend on; below the floor the operator
 * hears about it by email, once an hour while it lasts, and the tick's own report carries the reading every
 * minute. Nothing here can fail the tick: a balance that cannot be read is reported as unread.
 */
import { formatEther } from "viem";
import { sendOps } from "@/lib/notify/channels";
import { relayer } from "./relayer";

/** Three MON. One full run of the database suites costs about half a MON; the floor is a few runs of warning. */
export const RELAYER_FLOOR = 3n * 10n ** 18n;

export function relayerLow(balance: bigint, floor = RELAYER_FLOOR): boolean {
  return balance < floor;
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

export type RelayerWatch = { mon: string; low: boolean; told: boolean };

export async function watchRelayer(now: Date): Promise<RelayerWatch> {
  const { account, publicClient } = relayer();
  const balance = await publicClient.getBalance({ address: account.address });
  const mon = monOf(balance);
  const low = relayerLow(balance);
  let told = false;
  if (low) {
    console.warn(
      `relayer: ${mon} MON, under the ${monOf(RELAYER_FLOOR)} MON floor`,
    );
    if (hourly(now))
      told = await sendOps(
        `The relayer has ${mon} MON`,
        `The relayer at ${account.address} has ${mon} MON, under its ${monOf(RELAYER_FLOOR)} MON floor. Every chain write on dareful.app (lock, resolve, expire, confirm) fails once it is empty. Refill it from the Monad testnet faucet.\n\nThis is the scheduler's hourly check; it repeats at the top of every hour while the balance is under the floor.`,
      );
  }
  return { mon, low, told };
}
