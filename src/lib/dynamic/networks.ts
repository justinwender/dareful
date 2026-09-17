/**
 * Monad for the Dynamic SDK. Monad testnet is not a dashboard toggle, so the chain is registered in code through
 * the `overrides.evmNetworks` setting. Client-safe: everything here is a NEXT_PUBLIC value and none is a secret.
 * The RPC the wallet SDK reads through is the public one; the Alchemy key never reaches the browser.
 */
import type { EvmNetwork } from "@dynamic-labs/sdk-react-core";

const CHAIN_ID = Number(process.env.NEXT_PUBLIC_MONAD_CHAIN_ID);
const RPC_URL = process.env.NEXT_PUBLIC_MONAD_PUBLIC_RPC_URL;
const EXPLORER_URL = process.env.NEXT_PUBLIC_MONAD_EXPLORER_URL;

export function monadChainId(): number {
  if (!Number.isInteger(CHAIN_ID) || CHAIN_ID <= 0) {
    throw new Error("NEXT_PUBLIC_MONAD_CHAIN_ID is not set");
  }
  return CHAIN_ID;
}

export function monadEvmNetworks(): EvmNetwork[] {
  const chainId = monadChainId();
  if (!RPC_URL) throw new Error("NEXT_PUBLIC_MONAD_PUBLIC_RPC_URL is not set");
  const name = chainId === 143 ? "Monad" : "Monad Testnet";
  return [
    {
      blockExplorerUrls: EXPLORER_URL ? [EXPLORER_URL] : [],
      chainId,
      chainName: name,
      iconUrls: [],
      name,
      nativeCurrency: { decimals: 18, name: "Monad", symbol: "MON" },
      networkId: chainId,
      rpcUrls: [RPC_URL],
      vanityName: name,
    },
  ];
}
