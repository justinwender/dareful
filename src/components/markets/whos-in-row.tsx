"use client";

import { useEffect, useId, useState, useTransition } from "react";
import QRCode from "qrcode";
import { AvatarStack } from "@/components/ledger/avatar";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { ProblemSummary } from "@/components/ledger/problem";
import { Sheet } from "@/components/ui/sheet";
import { roomCodeAction } from "@/lib/actions/join";
import type { Hue } from "@/lib/ui/hue";
import type { MarkRef } from "@/lib/ui/mark";
import { cn } from "@/lib/utils";

export type WhosInPerson = { name: string; hue: Hue; ghost?: boolean };

/**
 * The who's-in row (docs/design.md 3.42): who is in, and the one place a market is shared from. On the left the
 * 28px avatar stack with the count under it; at the right end the icon buttons, 44px and 2px apart, their 22px
 * glyphs in ink: share (the phone's share sheet, with the market's link and its question), copy (the glyph turns
 * to a check for 1.5s and the name becomes "Link copied" through a live region; no toast) and the code to scan
 * (a modal sheet: the question, a 216px code on a chalk plate with the market's mark at its centre, and the six
 * characters as read-only boxes for reading aloud across a table). The last button hangs 11px into the gutter.
 * It replaces "They're right here: show a code", "Send the link", "Copy" and "Send how it ended", which were four
 * sentences and buttons in three places for one act. While you're the only one in, share is the screen's chalk.
 * Pass the phone is the fourth icon and ships with 3.45; until then the row has three.
 */
export function WhosInRow({ people, count, share, code, chalk = false, className }: { people: WhosInPerson[]; count: string; /** The link and the question as its title; null where there is nothing to send (a void, an expiry). */ share: { url: string; title: string } | null; /** The code to scan: only while the market is open, and only for someone the code can be made for. */ code: { dareId: string; question: string; mark: MarkRef | null } | null; /** Share as the screen's chalk: a 44px chalk circle, while you're the only one in. */ chalk?: boolean; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [saidCopied, setSaidCopied] = useState(false);
  /** The clipboard refused (a browser that needs the page focused, or asks and is told no): the link itself, to copy by hand. A tap is never silently dropped (5.2). */
  const [byHand, setByHand] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
    } catch {
      setByHand(true);
      return;
    }
    setByHand(false);
    setCopied(true);
    setSaidCopied(true);
  }
  async function send() {
    if (!share) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        // The question rides as the text too, so a chat shows it above the link (docs/decisions.md 2026-09-27).
        await navigator.share({ title: share.title, text: share.title, url: share.url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // No share sheet here: copy instead, and say so as copy does.
      }
    }
    await copy();
  }

  return (
    <section className={cn("flex flex-wrap items-start justify-between gap-3", className)} data-whos-in="" aria-label="Who's in">
      <div className="flex min-w-0 flex-col gap-1">
        {people.length > 0 ? <AvatarStack people={people} size={28} ring="var(--ground)" /> : null}
        <p className="text-caption text-ink-2" data-whos-in-count="">
          {count}
        </p>
      </div>
      {share ? (
        <div className="-mr-[11px] flex shrink-0 items-center gap-[2px]" role="group" aria-label="Share it">
          <button type="button" aria-label="Share" data-share="" onClick={send} className={cn("flex h-11 w-11 items-center justify-center rounded-pill transition-opacity duration-[120ms] active:opacity-[0.88]", chalk ? "bg-chalk text-on-chalk" : "text-ink")}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
              <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
            </svg>
          </button>
          <button type="button" aria-label={copied ? "Link copied" : "Copy the link"} data-copy={copied ? "copied" : ""} onClick={copy} className="flex h-11 w-11 items-center justify-center rounded-pill text-ink transition-opacity duration-[120ms] active:opacity-[0.88]">
            {copied ? (
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            ) : (
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="8" width="12" height="12" rx="2" />
                <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
              </svg>
            )}
          </button>
          {code ? (
            <button type="button" aria-label="Show a code to scan" aria-haspopup="dialog" aria-expanded={codeOpen} data-code="" onClick={() => setCodeOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-pill text-ink transition-opacity duration-[120ms] active:opacity-[0.88]">
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="6" height="6" rx="1" />
                <rect x="14" y="4" width="6" height="6" rx="1" />
                <rect x="4" y="14" width="6" height="6" rx="1" />
                <path d="M14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2" />
              </svg>
            </button>
          ) : null}
          <span role="status" aria-live="polite" className="sr-only">
            {saidCopied && copied ? "Link copied" : ""}
          </span>
        </div>
      ) : null}
      {code && share ? <CodeSheet open={codeOpen} onClose={() => setCodeOpen(false)} dareId={code.dareId} url={share.url} question={code.question} mark={code.mark} /> : null}
      {byHand && share ? (
        <input readOnly value={share.url} aria-label="The link, to copy by hand" data-copy-by-hand="" onFocus={(e) => e.currentTarget.select()} className="mt-2 h-11 w-full basis-full rounded-button border border-line bg-surface px-3 text-body-sm text-ink" />
      ) : null}
    </section>
  );
}

/**
 * The code to scan (3.42): opaque, on the current place's surface, with the grabber and the close. The question
 * as its title, a 216px code on a chalk plate with the market's mark in a 44px stamp at its centre (error
 * correction high enough to carry it), and under it the market's six characters as read-only boxes (3.16's, at
 * 48px). No instructions: a phone camera knows what to do with it. Scanning opens the link page (3.17).
 */
function CodeSheet({ open, onClose, dareId, url, question, mark }: { open: boolean; onClose: () => void; dareId: string; url: string; question: string; mark: MarkRef | null }) {
  const titleId = useId();
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!open) return;
    let alive = true;
    // The mark sits over the middle of the code, so the code is drawn at the level that survives a covered centre.
    QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "H", color: { dark: "#121110", light: "#F2EDE3" } })
      .then((svg) => alive && setQr(svg))
      .catch(() => alive && setQr(null));
    if (code === null) {
      start(async () => {
        const r = await roomCodeAction(dareId);
        if (!alive) return;
        if ("error" in r) setProblem(r.error);
        else setCode(r.code);
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the sheet opens; the code is fetched once
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="text-body-strong text-ink">
        {question}
      </h2>
      <div className="flex flex-col items-center gap-4" data-code-sheet="">
        <div className="relative h-[216px] w-[216px] rounded-card bg-chalk p-3" role="img" aria-label="A code to scan that opens this question">
          {qr ? <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
          {mark ? (
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-card bg-chalk p-[3px]">
              <MarkRefStamp mark={mark} size={44} />
            </span>
          ) : null}
        </div>
        {code ? (
          <p aria-label={`The code is ${code.split("").join(" ")}`} className="flex gap-[6px]" data-room-code={code}>
            {code.split("").map((c, i) => (
              <span key={i} aria-hidden="true" data-type-exempt="" className="flex h-12 w-10 items-center justify-center rounded-button border border-line bg-surface text-numeral text-ink">
                {c}
              </span>
            ))}
          </p>
        ) : pending ? (
          <p aria-busy="true" className="flex gap-[6px]">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} aria-hidden="true" className="h-12 w-10 rounded-button border border-line bg-surface" />
            ))}
          </p>
        ) : null}
        <ProblemSummary messages={[problem]} />
      </div>
    </Sheet>
  );
}
