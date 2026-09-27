"use client";

import { useState } from "react";
import { ChainEnum, useWalletDelegation } from "@dynamic-labs/sdk-react-core";
import { useDevice } from "@/components/auth/device";
import { useDenyGovernanceDelegation } from "@/components/auth/governance-denied";
import { ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";

/**
 * The instrument for the delegation gate (docs/decisions.md 2026-09-27), on a development-only page: turns
 * silent signing on for the ledger wallet, by address, through Dynamic's own SDK call, and off again; and
 * shows what the SDK says about each of the person's two wallets, so the governance wallet can be seen to
 * stay where it was. The consent moment the product will ask at is not designed (docs/design.md has nothing
 * on it), so this is not that moment and carries none of its words.
 */
export function DelegationControl({ stored }: { stored: boolean }) {
  const { state, me } = useDevice();
  const { delegateKeyShares, revokeDelegation, getWalletsDelegatedStatus, delegatedAccessEnabled, requiresDelegation } = useWalletDelegation();
  const denyGovernance = useDenyGovernanceDelegation();
  const [busy, setBusy] = useState<"on" | "off" | "deny" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  if (!me) return null;
  const governanceWallet = me.governanceWallet;
  const statuses = getWalletsDelegatedStatus();
  const label = (address: string) => (address.toLowerCase() === me.ledgerWallet.toLowerCase() ? "ledger" : address.toLowerCase() === me.governanceWallet.toLowerCase() ? "governance" : "other");
  // The SDK matches a wallet by its own address and chain, exactly as it holds them (checksummed, `ChainEnum.Evm`); the
  // users row keeps the address lowercase, so the SDK's entry for the ledger wallet is found by address, never by case.
  const ledgerEntry = statuses.find((w) => label(w.address) === "ledger");
  const ledger = ledgerEntry ? { chainName: ledgerEntry.chain as ChainEnum, accountAddress: ledgerEntry.address } : { chainName: ChainEnum.Evm, accountAddress: me.ledgerWallet };

  async function run(which: "on" | "off" | "deny") {
    setBusy(which);
    setProblem(null);
    try {
      if (which === "on") await delegateKeyShares([ledger]);
      else if (which === "off") await revokeDelegation([ledger]);
      else if ((await denyGovernance(governanceWallet)) !== "denied") throw new Error("The login token names no credential for the governance wallet.");
      setTick((t) => t + 1);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : "That didn't go through.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-4" data-delegation-control="" data-tick={tick}>
      {/* The SDK answers these on the client only; the server's render says unknown, and this page is development's. */}
      <p className="text-caption text-ink-3" suppressHydrationWarning>
        Delegated access in this environment: {delegatedAccessEnabled === undefined ? "unknown" : delegatedAccessEnabled ? "on" : "off"}
        {requiresDelegation ? " (required)" : ""}. Stored on the server for this account: {stored ? "yes" : "no"}.
      </p>
      <ul className="flex flex-col gap-1 text-body text-ink-2">
        {statuses.length === 0 ? <li>The SDK lists no wallets here yet.</li> : null}
        {statuses.map((w) => (
          <li key={w.address} data-delegation-status={label(w.address)}>
            {label(w.address)} · {w.status}
          </li>
        ))}
      </ul>
      <ProblemSummary messages={[problem]} />
      <div className="flex gap-3">
        <Button variant="primary" onClick={() => void run("on")} loading={busy === "on"} disabled={state !== "ready" || busy !== null}>
          Turn on for the ledger wallet
        </Button>
        <Button variant="secondary" onClick={() => void run("off")} loading={busy === "off"} disabled={state !== "ready" || busy !== null}>
          Turn it off
        </Button>
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => void run("deny")} loading={busy === "deny"} disabled={state !== "ready" || busy !== null}>
          Mark the governance wallet denied
        </Button>
      </div>
      {state !== "ready" ? <p className="text-caption text-ink-3">This device has not checked it is you; the code step at the top of the screen comes first.</p> : null}
    </div>
  );
}
