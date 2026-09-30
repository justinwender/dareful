"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { TypedDataDomain } from "viem";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import { Button } from "@/components/ui/button";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { confirmManyAction } from "@/lib/actions/proposals";
import { enterMarketAction, leaveEntriesAction } from "@/lib/actions/markets";
import { daresTypes, ledgerTypes } from "@/lib/chain/typed-data";
import { Avatar } from "@/components/ledger/avatar";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { ProblemSummary } from "@/components/ledger/problem";
import { StateMark } from "@/components/ledger/state-mark";
import type { DenominationRow } from "@/lib/ledger/denominations";
import { stillToSend } from "@/lib/ledger/retry-batch";
import { possessive } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
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

/** A cover logged under this person's name before they had an account (3.38): one claim row, unpressed until this person presses it (the owner's correction, Round D). */
export type ClaimRow = {
  proposalId: string;
  creditor: { id: string; displayName: string };
  /** "Covered · Sep 5" */
  kicker: string;
  /** The memo, or "Priya got this one". */
  subject: string;
  denomination: DenominationRow;
  quantity: string;
  conceded: boolean;
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
export function ConfirmAll({ payload, entries = [], claims = [], viewer }: { payload: ConfirmAllPayload | null; entries?: LinkEntryRow[]; /** The covers as rows with their checks (3.38), grouped by who they are with. */ claims?: ClaimRow[]; viewer: { id: string; displayName: string } }) {
  const router = useRouter();
  const sign = useSigner();
  const [state, setState] = useState<"idle" | "signing" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [kept, setKept] = useState<Set<string>>(() => new Set(entries.map((e) => e.dareId)));
  // A cover someone recorded against this person starts unpressed (the owner's correction, Round D): an account holder confirms each with a deliberate yep, and an unpressed one stays pending under the name it was logged with. The person's own entries start pressed, since they made them.
  const [keptClaims, setKeptClaims] = useState<Set<string>>(() => new Set());
  // What earlier taps landed, so Try again after a later failure sends only the rest.
  const landed = useRef<{ claims: Set<string>; entries: Set<string> }>({ claims: new Set(), entries: new Set() });
  // The rows on the screen: a row in the batch the page could not draw can never be pressed, so "all" counts what the person sees.
  const n = claims.length + entries.length;
  const pressedClaims = (payload?.proposalIds ?? []).filter((id) => keptClaims.has(id));
  const pressed = pressedClaims.length + entries.filter((e) => kept.has(e.dareId)).length;
  const toggle = (set: (f: (k: Set<string>) => Set<string>) => void, id: string) =>
    set((k) => {
      const next = new Set(k);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  async function confirmAll() {
    setError(null);
    try {
      setState("signing");
      let batchSignature: Hex | null = null;
      // The batch is the pressed rows not yet landed: the message's arrays are index-aligned with the ids, so the kept ones are filtered together and the server rebuilds the same batch from the ids it is sent.
      const todo = stillToSend({ claims: pressedClaims, entries: entries.filter((e) => kept.has(e.dareId)).map((e) => e.dareId) }, landed.current);
      const keep = (payload?.proposalIds ?? []).map((id, i) => [id, i] as const).filter(([id]) => todo.claims.includes(id)).map(([, i]) => i);
      const batch = payload && keep.length > 0 ? { ...payload, proposalIds: keep.map((i) => payload.proposalIds[i] as string), message: { groupIds: keep.map((i) => payload.message.groupIds[i] as Hex), denomIds: keep.map((i) => payload.message.denomIds[i] as Hex), creditors: keep.map((i) => payload.message.creditors[i] as Hex), qtys: keep.map((i) => payload.message.qtys[i] as string), obligationIds: keep.map((i) => payload.message.obligationIds[i] as Hex), uniques: keep.map((i) => payload.message.uniques[i] as boolean) } } : null;
      if (batch) batchSignature = await sign(batch.ledgerWallet, { domain: batch.domain, types: ledgerTypes, primaryType: "ConfirmMany", message: { ...batch.message, qtys: batch.message.qtys.map((q) => BigInt(q)) } }, "confirmmany", { action: "confirm_many", proposalIds: batch.proposalIds });
      const entrySignatures: Array<{ entry: LinkEntryRow; signature: Hex }> = [];
      for (const e of entries) {
        if (!todo.entries.includes(e.dareId)) continue;
        const signature = await sign(e.ledgerWallet, { domain: e.domain, types: daresTypes, primaryType: "Enter", message: { dareId: e.dareOnchainId, stake: BigInt(e.stake), value: BigInt(e.value), confidenceBps: e.confidenceBps, stalemate: e.stalemate } }, "approve number", { action: "enter", dareId: e.dareId, stake: e.stake, value: e.value });
        entrySignatures.push({ entry: e, signature });
      }
      setState("sending");
      if (batch && batchSignature) {
        const result = await confirmManyAction(batch.proposalIds, batchSignature);
        if ("error" in result) {
          setError(result.error);
          setState("idle");
          return;
        }
        for (const id of batch.proposalIds) landed.current.claims.add(id);
      }
      for (const { entry, signature } of entrySignatures) {
        const r = await enterMarketAction(entry.dareId, entry.position, signature);
        if ("error" in r) {
          setError(r.error);
          setState("idle");
          return;
        }
        landed.current.entries.add(entry.dareId);
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

  // One group per person, most items first (3.38).
  const groups = Array.from(new Set(claims.map((c) => c.creditor.id)))
    .map((id) => ({ creditor: claims.find((c) => c.creditor.id === id)!.creditor, rows: claims.filter((c) => c.creditor.id === id) }))
    .sort((a, b) => b.rows.length - a.rows.length);
  const check = (on: boolean) =>
    on ? (
      <span className="flex h-6 w-6 items-center justify-center rounded-pill bg-chalk text-on-chalk">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      </span>
    ) : (
      <span className="h-6 w-6 rounded-pill border-[1.5px] border-line-strong" />
    );

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.creditor.id} className="flex flex-col gap-3" data-claim-group={g.creditor.id}>
          <div className="flex items-center gap-3">
            <Avatar name={g.creditor.displayName} hue={hueFor(g.creditor.id)} size={32} />
            <div className="flex min-w-0 flex-col">
              <h2 className="text-body-strong text-ink">{g.creditor.displayName}</h2>
              <p className="text-caption text-ink-3">{g.rows.length === 1 ? "One thing" : `${g.rows.length} things`}</p>
            </div>
          </div>
          <ul className="flex flex-col rounded-card border border-line bg-surface">
            {g.rows.map((c, i) => {
              const on = keptClaims.has(c.proposalId);
              const first = g.creditor.displayName.split(/\s+/)[0] ?? g.creditor.displayName;
              return (
                <li key={c.proposalId} className={`grid grid-cols-[minmax(0,1fr)_44px] items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`} data-claim-row={c.proposalId}>
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2 text-label text-ink-3">
                      <StateMark state="proposed" />
                      {c.kicker}
                    </span>
                    <span className="text-body-strong text-ink">{c.subject}</span>
                    <span className="flex items-center gap-2 text-body-sm text-ink-2">
                      <ObligationToken owner={{ id: viewer.id, displayName: viewer.displayName, hue: hueFor(viewer.id) }} other={g.creditor} viewerId={viewer.id} denomination={c.denomination} quantity={BigInt(c.quantity)} pending />
                      {c.conceded ? <span className="text-caption text-ink-3">You said “fine, you got me.”</span> : null}
                    </span>
                  </span>
                  {/* A 44px target holding a 24px chalk circle with the check, unpressed until this person presses it (Round D); the row itself opens nothing. */}
                  <button type="button" role="checkbox" aria-checked={on} aria-label={`Confirm: ${possessive(first)} got you`} disabled={state !== "idle"} onClick={() => toggle(setKeptClaims, c.proposalId)} data-press="line" className="flex h-11 w-11 items-center justify-center rounded-pill press-line">
                    {check(on)}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
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
                    onClick={() => toggle(setKept, e.dareId)}
                    data-press="line"
                    className="flex h-11 w-11 items-center justify-center rounded-pill press-line"
                  >
                    {check(on)}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {error ? <ProblemSummary messages={[error]} retry={confirmAll} /> : null}
      <PinnedSheet
        label="Confirm"
        low={
          <Button variant="primary" onClick={confirmAll} loading={state !== "idle"} disabled={state === "done" || pressed === 0} data-confirm-all="">
            {pressed === 0 ? "Yep, these are right" : n === 1 ? "Yep, that’s right" : pressed === n ? `Yep, all ${n} are right` : pressed === 1 ? "Yep, this one’s right" : `Yep, these ${pressed} are right`}
          </Button>
        }
      />
    </div>
  );
}
