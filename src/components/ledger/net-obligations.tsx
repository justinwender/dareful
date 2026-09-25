"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { TypedDataDomain } from "viem";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ProblemSummary } from "@/components/ledger/problem";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import { ledgerTypes } from "@/lib/chain/typed-data";
import { netAction, netPayloadAction } from "@/lib/actions/obligations";

export type NetLine = {
  groupId: string;
  denomId: string;
  /** "the two beers": what cancels, in words. */
  cancels: string;
  /** "You've got Gabe three beers and Gabe's got you two, in Friday dinners." */
  both: string;
  /** "After this, you've got Gabe one beer." or "After this you two are even on beers." */
  after: string;
};

/**
 * What goes both ways in one unit between two people cancels on one signature from either of them (PLANNING.md
 * 5a `net`, 7; docs/design.md 2.1: the same unit between two people nets before display, and this is the tap
 * that makes the ledger match the header). One transaction per unit and set of people. Under the header on the
 * person view; a sheet asks once, because it is not undone.
 */
export function NetObligations({ otherId, lines, domain }: { otherId: string; lines: NetLine[]; domain: TypedDataDomain }) {
  const router = useRouter();
  const sign = useSigner();
  const titleId = useId();
  const [openLine, setOpenLine] = useState<NetLine | null>(null);
  const [phase, setPhase] = useState<"idle" | "signing" | "sending">("idle");
  const [error, setError] = useState<string | null>(null);
  const [doneKeys, setDoneKeys] = useState<string[]>([]);

  async function run(line: NetLine) {
    setError(null);
    try {
      setPhase("signing");
      const payload = await netPayloadAction(otherId, line.groupId, line.denomId);
      if ("error" in payload) {
        setError(payload.error);
        setPhase("idle");
        return;
      }
      const m = payload.message;
      const signature = await sign(payload.ledgerWallet, { domain, types: ledgerTypes, primaryType: "Net", message: { groupId: m.groupId, denomId: m.denomId, a: m.a, b: m.b, nonce: BigInt(m.nonce) } }, "net");
      setPhase("sending");
      const result = await netAction(otherId, line.groupId, line.denomId, signature);
      if ("error" in result) {
        setError(result.error);
        setPhase("idle");
        return;
      }
      setDoneKeys((k) => [...k, `${line.groupId}:${line.denomId}`]);
      setPhase("idle");
      setOpenLine(null);
      router.refresh();
    } catch (err) {
      setError(signingProblem(err));
      setPhase("idle");
    }
  }

  const pending = lines.filter((l) => !doneKeys.includes(`${l.groupId}:${l.denomId}`));
  if (pending.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      {pending.map((line) => (
        <div key={`${line.groupId}:${line.denomId}`} className="flex flex-col gap-1.5">
          <Button variant="secondary" onClick={() => setOpenLine(line)} className="w-full">
            Cancel out the {line.cancels} each way
          </Button>
          <p className="text-caption text-ink-3">{line.both}</p>
        </div>
      ))}
      <Sheet open={openLine !== null} onClose={() => (phase === "idle" ? setOpenLine(null) : undefined)} labelledBy={titleId}>
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-body-strong text-ink">
            Cancel out the {openLine?.cancels} each way?
          </h2>
          <p className="text-body-sm text-ink-2">{openLine?.after}</p>
        </div>
        {error ? <ProblemSummary messages={[error]} /> : null}
        <div className="flex flex-col gap-[10px]">
          <Button variant="primary" onClick={() => (openLine ? run(openLine) : undefined)} loading={phase !== "idle"}>
            Cancel them out
          </Button>
          <Button variant="tertiary" onClick={() => setOpenLine(null)} disabled={phase !== "idle"}>
            Never mind
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
