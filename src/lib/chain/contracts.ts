/**
 * ABIs and addresses. Everything here comes from the environment; nothing is hardcoded.
 * Server-only: MONAD_RPC_URL carries the Alchemy key and must never reach the client bundle.
 */
import { defineChain, isAddress, type Address, type Chain } from "viem";
import { darefulDaresAbi } from "./abi/DarefulDares";
import { darefulLedgerAbi } from "./abi/DarefulLedger";

export { darefulDaresAbi, darefulLedgerAbi };

export const MONAD_TESTNET_CHAIN_ID = 10143;
export const MONAD_MAINNET_CHAIN_ID = 143;

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

function assertServer(): void {
  if (typeof window !== "undefined") {
    throw new Error("chain configuration is server-only; it must not be imported into a Client Component");
  }
}

export function chainId(): number {
  const raw = requireEnv("MONAD_CHAIN_ID");
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`MONAD_CHAIN_ID is not a chain id: ${raw}`);
  return id;
}

export function rpcUrl(): string {
  assertServer();
  return requireEnv("MONAD_RPC_URL");
}

export function monadChain(): Chain {
  const id = chainId();
  const name = id === MONAD_MAINNET_CHAIN_ID ? "Monad" : id === MONAD_TESTNET_CHAIN_ID ? "Monad Testnet" : `Monad (${id})`;
  return defineChain({
    id,
    name,
    nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl()] } },
    testnet: id !== MONAD_MAINNET_CHAIN_ID,
  });
}

function addressFromEnv(name: string): Address {
  const v = requireEnv(name);
  if (!isAddress(v)) throw new Error(`${name} is not an address: ${v}`);
  return v;
}

export function ledgerAddress(): Address {
  return addressFromEnv("DAREFUL_LEDGER_ADDRESS");
}

export function daresAddress(): Address {
  return addressFromEnv("DAREFUL_DARES_ADDRESS");
}

/** Both contracts for the configured chain, resolved once per call from the environment. */
export function contracts() {
  return {
    chainId: chainId(),
    ledger: { address: ledgerAddress(), abi: darefulLedgerAbi },
    dares: { address: daresAddress(), abi: darefulDaresAbi },
  } as const;
}
