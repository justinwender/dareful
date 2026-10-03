"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { TypedDataDomain } from "viem";
import { Button } from "@/components/ui/button";
import { ProblemSummary } from "@/components/ledger/problem";
import { Sheet } from "@/components/ui/sheet";
import { HoldoutAvatar } from "./whos-in-row";
import { lockMarketAction } from "@/lib/actions/markets";
import { WORDS } from "@/lib/ui/errors";
import { hashAsksFor, useHash } from "@/lib/ui/hash";

/** Everything a browser needs to build the typed data a person signs. Bigints travel as strings. */
export type Signing = {
  domain: TypedDataDomain;
  dareOnchainId: `0x${string}`;
  stalemate: 0 | 1;
  ledgerWallet: string;
  governanceWallet: string;
  /** What an entry carries as confidence: everything on a pick-one market (3.30), nothing on the other two kinds. The same figure the server signs against. */
  confidenceBps: number;
  /** Present only for the creator of a draft: the Create message, every field final. */
  create?: { groupId: `0x${string}`; kind: number; pace: number; termsHash: `0x${string}`; denomId: `0x${string}`; range: string; options: number; resolvesBy: string };
};

export type StakeUnit = { monetary: boolean; quantifiable: boolean; singular: string; plural: string };

/**
 * The asker's close (3.42, holdouts): "Close it with 4", a tertiary under the who's-in row and never the primary
 * while the close is still ahead, because the close is coming anyway and closing early binds everyone else. It
 * asks once, in a modal sheet, with the dashed avatars of who it leaves out and one line naming them, the chalk
 * "Close it now" and "Keep it open". Closing early locks the market as its close would. Where nobody is left out
 * (everyone asked is in) it closes without asking, since it leaves nobody out.
 */
export function LockButton({ dareId, count, leftOut = [], primary = true, variant }: { dareId: string; count: number; /** The people asked who are not in yet, named in the ask. */ leftOut?: Array<{ name: string }>; primary?: boolean; /** Under the who's-in row (3.42) it is a tertiary, never the primary while the close is still ahead. */ variant?: "primary" | "secondary" | "tertiary" }) {
  const router = useRouter();
  const titleId = useId();
  const [pending, start] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // A row on Now that says Close lands here with the ask open (the field round, 1.5): the address asks for it, and the sheet is the confirmation whoever it leaves out.
  const hash = useHash();
  useEffect(() => {
    if (!(hashAsksFor(hash, "close") && count >= 2)) return;
    // The ask opens on the next frame, once the screen has landed.
    const frame = requestAnimationFrame(() => setAsking(true));
    return () => cancelAnimationFrame(frame);
  }, [hash, count]);
  const names = leftOut.map((p) => p.name.trim().split(/\s+/)[0] ?? p.name);
  const line = names.length === 0 ? "" : names.length === 1 ? `${names[0]} can’t get in after this.` : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]} can’t get in after this.`;
  const close = () =>
    start(async () => {
      setProblem(null);
      const r = await lockMarketAction(dareId);
      if ("error" in r) {
        setProblem(r.error);
        // Closed or decided under the person: the screen is read again, and the words say so (1.6).
        if (r.error === WORDS.changed) router.refresh();
      } else {
        setAsking(false);
        router.refresh();
      }
    });
  return (
    <div className="flex flex-col gap-3">
      <ProblemSummary messages={[asking ? null : problem]} />
      <Button variant={variant ?? (primary ? "primary" : "secondary")} className={variant === "tertiary" ? "self-start" : undefined} loading={pending && !asking} disabled={count < 2} onClick={() => (leftOut.length > 0 ? setAsking(true) : close())} data-close-early="">
        {count < 2 ? "It takes two to close it" : `Close it with ${count}`}
      </Button>
      <Sheet open={asking} onClose={() => setAsking(false)} labelledBy={titleId}>
        <h2 id={titleId} className="text-body-strong text-ink">
          Close it with {count}?
        </h2>
        <div className="flex flex-col gap-4" data-close-early-ask="">
          {leftOut.length > 0 ? (
            <div className="flex items-center gap-2">
              {leftOut.slice(0, 6).map((p, i) => (
                <HoldoutAvatar key={i} name={p.name} size={36} />
              ))}
            </div>
          ) : null}
          {line ? <p className="text-body-sm text-ink-2">{line}</p> : null}
          <ProblemSummary messages={[problem]} />
          <Button variant="primary" loading={pending} onClick={close}>
            Close it now
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setAsking(false)}>
            Keep it open
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
