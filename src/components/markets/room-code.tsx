"use client";

import { useState, useTransition } from "react";
import QRCode from "qrcode";
import { Button } from "@/components/ui/button";
import { ProblemSummary } from "@/components/ledger/problem";
import { roomCodeAction } from "@/lib/actions/join";

/**
 * For people in the same room (PLANNING.md section 4, "The room code"): a QR of the question's own link, and
 * six characters under it, because scanning fails across a table or in bad light and someone always has to type
 * it. The QR is drawn here in the browser; the code is a short-lived row that dies when numbers lock.
 */
export function RoomCode({ dareId, url }: { dareId: string; url: string }) {
  const [code, setCode] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function open() {
    setProblem(null);
    start(async () => {
      const r = await roomCodeAction(dareId);
      if ("error" in r) return setProblem(r.error);
      setCode(r.code);
      setQr(await QRCode.toString(url, { type: "svg", margin: 0, color: { dark: "#121110", light: "#F2EDE3" } }).catch(() => null));
    });
  }

  if (!code) {
    return (
      <div className="flex flex-col gap-2">
        <ProblemSummary messages={[problem]} />
        <Button variant="secondary" onClick={open} loading={pending}>
          They’re right here: show a code
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 rounded-card border border-line bg-surface px-4 py-5">
      {qr ? <div role="img" aria-label="A code to scan that opens this question" className="h-44 w-44 overflow-hidden rounded-button bg-ink p-3 [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
      <p aria-label={`The code is ${code.split("").join(" ")}`} className="flex gap-2">
        {code.split("").map((c, i) => (
          <span key={i} aria-hidden="true" className="flex h-[52px] w-10 items-center justify-center rounded-button border border-line bg-ground text-numeral text-ink">
            {c}
          </span>
        ))}
      </p>
      <p className="text-center text-caption text-ink-3">Scan it, or open Dareful and type it under Ask something. It stops working when you lock the numbers.</p>
    </div>
  );
}
