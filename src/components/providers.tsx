"use client";

import { Suspense, useMemo, type ReactNode } from "react";
import { DynamicContextProvider } from "@dynamic-labs/sdk-react-core";
import { EthereumWalletConnectors } from "@dynamic-labs/ethereum";
import { monadEvmNetworks } from "@/lib/dynamic/networks";
import { WalletBootstrap } from "@/components/auth/wallet-bootstrap";
import { DeviceNotice, MeProvider, useSessionFacts } from "@/components/auth/device";
import { SessionRefresh } from "@/components/auth/session-refresh";
import type { SessionFacts } from "@/lib/auth/session-facts";
import { OpenFromNotification } from "@/components/notify/open-from-notification";
import { Refresh } from "@/components/ui/refresh";
import { Shells } from "@/components/ui/shells";
import { Traversals } from "@/components/ui/traversals";
import { ZoneReporter } from "@/components/ui/zone-reporter";
import { NotificationOpened } from "@/components/ui/usage";
import { ColdMarks } from "@/components/ui/cold-marks";

const environmentId = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "";

/**
 * Dynamic auth with two embedded wallets per user on Monad. Monad testnet is not a dashboard toggle, so the
 * network is registered here through `overrides.evmNetworks`. Nothing on any screen says wallet, chain, or
 * signature; the login is an email or phone step.
 */
export function Providers({ children, facts }: { children: ReactNode; /** The session's facts, still on their way when the first screen's shell goes out (11.5). */ facts: Promise<SessionFacts> }) {
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
      <MeProvider facts={facts}>
        {/* The two pieces of the frame that read the session wait for it here, under everything and in nobody's way. */}
        <Suspense fallback={null}>
          <SessionPieces />
          <SessionRefresh />
        </Suspense>
        <ColdMarks />
        <OpenFromNotification />
        <Refresh />
        <Traversals />
        <ZoneReporter />
        <NotificationOpened />
        <Shells />
        {children}
      </MeProvider>
    </DynamicContextProvider>
  );
}

/** The login bootstrap and the notice about this device, once the session's facts have arrived. */
function SessionPieces() {
  const { settled, me } = useSessionFacts();
  return (
    <>
      <WalletBootstrap settled={settled} sessionDynamicUserId={me?.dynamicUserId ?? null} />
      <DeviceNotice />
    </>
  );
}
