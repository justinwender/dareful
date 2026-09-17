"use client";

import { useMemo, type ReactNode } from "react";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { monadEvmNetworks } from "@/lib/dynamic/networks";
import { WalletBootstrap } from "@/components/auth/wallet-bootstrap";

const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "";

/**
 * Dynamic auth with two embedded wallets per user on Monad. Monad testnet is not a dashboard toggle, so the
 * network is registered here through `overrides.evmNetworks`. Nothing on any screen says wallet, chain, or
 * signature; the login is an email or phone step.
 */
export function Providers({ children }: { children: ReactNode }) {
  const evmNetworks = useMemo(() => (environmentId ? monadEvmNetworks() : []), []);
  if (!environmentId) {
    // Misconfigured deployment: render the app without auth rather than failing the build's prerender.
    // Every signed-in path still requires a session, so nothing leaks; the sign-in button just cannot work.
    if (typeof window !== "undefined") console.error("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID is not set");
    return <>{children}</>;
  }
  return (
    <DynamicContextProvider
      settings={{
        environmentId,
        walletConnectors: [EthereumWalletConnectors],
        overrides: { evmNetworks },
        initialAuthenticationMode: "connect-and-sign",
        // No visible wallet ceremony: the modal offers email or phone and nothing that says "wallet".
        walletsFilter: (wallets) => wallets.filter((w) => w.walletConnector.isEmbeddedWallet),
      }}
      theme="dark"
    >
      <WalletBootstrap />
      {children}
    </DynamicContextProvider>
  );
}
