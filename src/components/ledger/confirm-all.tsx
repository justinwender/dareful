"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TypedDataDomain } from "viem";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import { Button } from "@/components/ui/button";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { confirmManyAction } from "@/lib/actions/proposals";
import { enterMarketAction, leaveEntriesAction } from "@/lib/actions/markets";
import { daresTypes, ledgerTypes } from "@/lib/chain/typed-data";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { ProblemSummary } from "@/components/ledger/problem";
import type { InkName } from "@/lib/ui/ink";
import type { MarkRef } from "@/lib/ui/mark";

type Hex = `0x${string}`;

export type ConfirmAllPayload = {
  /** In the order they are signed in. The server rebuilds the same batch from these ids and checks it. */
  proposalIds: string[];
  ledgerWallet: string;
  domain: TypedDataDomain;
  message: { groupIds: Hex[]; denomIds: Hex[]; creditors: Hex[]; qtys: string[]; obligationIds: Hex[]; uniques: boolean[] };
};

/** An entry made from a link before this person had an account (docs/design.md 3.17, 3.38): theirs to keep, which signs it, or leave out. */
export type LinkEntryRow = {
  dareId: string;
  title: string;
  /** "You're in at 70% · 2 beers" */
  line: string;
  /** The name it was typed under. */
  name: string;
  mark: MarkRef | null;
  ink: InkName;
  ledgerWallet: string;
  domain: TypedDataDomain;
  dareOnchainId: Hex;
  stalemate: 0 | 1;
  confidenceBps: number;
  stake: string;
  value: string;
  position: { stake: string; valueBps?: number; number?: string; answer?: number };
};

/**
 * Confirm-all: one prompt for everything listed. The claim moment is the one time a person confirms many
 * things at once, so it is a single approval over the whole batch, and the whole batch lands or none of it
 * does. Entries made from a link (3.38) are rows here too, pressed by default: keeping one is its signature
 * (the same numbers, signed by this account), and an unpressed one goes back to a fresh ghost under the name it
 * was typed with and never becomes this person's. A failure keeps the screen and says so.
 */
export function ConfirmAll({ payload, entries = [] }: { payload: ConfirmAllPayload | null; entries?: LinkEntryRow[] }) {
  const router = useRouter();
  const sign = useSigner();
  const [state, setState] = useState<"idle" | "signing" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<Set<string>>(() => new Set(entries.map((e) => e.dareId)));
  const n = (payload?.proposalIds.length ?? 0) + entries.length;
  const pressed = (payload?.proposalIds.length ?? 0) + entries.filter((e) => kept.has(e.dareId)).length;

  async function confirmAll() {
    setError(null);
    try {
      setState("signing");
      let batchSignature: Hex | null = null;
      if (payload) batchSignature = await sign(payload.ledgerWallet, { domain: payload.domain, types: ledgerTypes, primaryType: "ConfirmMany", message: { ...payload.message, qtys: payload.message.qtys.map((q) => BigInt(q)) } }, "confirmmany");
      const entrySignatures: Array<{ entry: LinkEntryRow; signature: Hex }> = [];
      for (const e of entries) {
        if (!kept.has(e.dareId)) continue;
        const signature = await sign(e.ledgerWallet, { domain: e.domain, types: daresTypes, primaryType: "Enter", message: { dareId: e.dareOnchainId, stake: BigInt(e.stake), value: BigInt(e.value), confidenceBps: e.confidenceBps, stalemate: e.stalemate } }, "approve number");
        entrySignatures.push({ entry: e, signature });
      }
      setState("sending");
      if (payload && batchSignature) {
        const result = await confirmManyAction(payload.proposalIds, batchSignature);
        if ("error" in result) {
          setError(result.error);
          setState("idle");
          return;
        }
      }
      for (const { entry, signature } of entrySignatures) {
        const r = await enterMarketAction(entry.dareId, entry.position, signature);
        if ("error" in r) {
          setError(r.error);
          setState("idle");
          return;
        }
      }
      const left = entries.filter((e) => !kept.has(e.dareId)).map((e) => e.dareId);
      if (left.length > 0) {
        const r = await leaveEntriesAction(left);
        if ("error" in r) {
          setError(r.error);
          setState("idle");
          return;
        }
      }
      setState("done");
      router.replace("/");
      router.refresh();
    } catch (err) {
      setError(signingProblem(err));
      setState("idle");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {entries.length > 0 ? (
        <section className="flex flex-col gap-3" data-link-entries="">
          <h2 className="text-body-strong text-ink">From a link</h2>
          <ul className="flex flex-col">
            {entries.map((e) => {
              const on = kept.has(e.dareId);
              return (
                <li key={e.dareId} className="grid grid-cols-[28px_minmax(0,1fr)_44px] items-center gap-3 py-3" data-link-entry={e.dareId}>
                  <MarkRefStamp mark={e.mark} size={28} ink={e.ink} />
                  <span className="flex min-w-0 flex-col">
                    <span className="text-body-strong text-ink">{e.line}</span>
                    <span className="truncate text-caption text-ink-3">{e.title}</span>
                  </span>
                  {/* A 44px target holding a 24px chalk circle with the check, pressed by default; unpressed, a ring, and the entry stays under the typed name in stone (3.38). */}
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    aria-label={`Keep: ${e.line}`}
                    disabled={state !== "idle"}
                    onClick={() =>
                      setKept((k) => {
                        const next = new Set(k);
                        if (next.has(e.dareId)) next.delete(e.dareId);
                        else next.add(e.dareId);
                        return next;
                      })
                    }
                    className="flex h-11 w-11 items-center justify-center rounded-pill"
                  >
                    {on ? (
                      <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-chalk text-on-chalk">
                        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M5 12.5l4.5 4.5L19 7.5" />
                        </svg>
                      </span>
                    ) : (
                      <span className="h-6 w-6 rounded-pill border-[1.5px] border-line-strong" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {error ? <ProblemSummary messages={[error]} /> : null}
      <PinnedSheet
        label="Confirm"
        low={
          <Button variant="primary" onClick={confirmAll} loading={state !== "idle"} disabled={state === "done" || pressed === 0} data-confirm-all="">
            {n === 1 ? "Yep, that’s right" : pressed === n ? `Yep, all ${n} are right` : `Yep, these ${pressed} are right`}
          </Button>
        }
      />
    </div>
  );
}
