"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { TypedDataDomain } from "viem";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ProblemSummary } from "@/components/ledger/problem";
import { signingProblem, useSigner } from "@/components/ledger/use-signer";
import { ledgerTypes } from "@/lib/chain/typed-data";
import { addSettlementPhotoAction } from "@/lib/actions/media";
import { closeObligationAction, closePayloadAction } from "@/lib/actions/obligations";
import { shrinkPhoto as shrink } from "@/lib/ui/shrink-photo";
import { CoveredCard, type CoveredCardProps } from "./covered-card";
import { StateMark } from "./state-mark";

type Phase = "idle" | "signing" | "sending" | "photo";
type Reason = "settled" | "forgiven";

/**
 * The creditor's row on the person view, and the sheet behind it (docs/design.md 6.3: "Person view → the
 * obligation row → sheet"; PLANNING.md Principles 5 and 6). Two acts of equal standing: settled, which is
 * the photo moment, and "Call it even", which is forgiveness as a status move rather than a way of writing
 * something off. Both close everything still open on the obligation, signed with the ledger wallet from this
 * one button; the photo, when there is one, goes up after the chain has the close, and a photo that fails
 * never undoes a settlement.
 */
export function CloseObligation({ obligationId, card, children, sentence, what, domain, photosOn }: { obligationId: string; card?: CoveredCardProps; children?: ReactNode; sentence: string; what: string; domain: TypedDataDomain; photosOn: boolean }) {
  const router = useRouter();
  const sign = useSigner();
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [done, setDone] = useState<{ reason: Reason; mediaId: string | null } | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  function pick(f: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    setFile(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function sendPhoto(): Promise<string | null> {
    if (!file) return null;
    const form = new FormData();
    form.set("obligationId", obligationId);
    form.set("photo", await shrink(file), "photo.jpg");
    const r = await addSettlementPhotoAction(form);
    if ("error" in r) {
      setError(`It's ${done?.reason ?? "closed"}, but the photo didn't go through. ${r.error}`);
      setPhotoFailed(true);
      return null;
    }
    return r.mediaId;
  }

  async function close(reason: Reason) {
    setError(null);
    try {
      setPhase("signing");
      const payload = await closePayloadAction(obligationId);
      if ("error" in payload) {
        setError(payload.error);
        setPhase("idle");
        return;
      }
      const m = payload.message;
      const signature = await sign(
        payload.ledgerWallet,
        { domain, types: ledgerTypes, primaryType: "Close", message: { id: BigInt(m.id), qty: BigInt(m.qty), reason: reason === "forgiven" ? 1 : 0, obligationId: m.obligationId, nonce: BigInt(m.nonce) } },
        `close ${reason}`,
      );
      setPhase("sending");
      const result = await closeObligationAction(obligationId, reason, signature);
      if ("error" in result) {
        setError(result.error);
        setPhase("idle");
        return;
      }
      setDone({ reason, mediaId: null });
      if (file) {
        setPhase("photo");
        const mediaId = await sendPhoto();
        setDone({ reason, mediaId });
        if (!mediaId) {
          setPhase("idle");
          return;
        }
      }
      setPhase("idle");
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(signingProblem(err));
      setPhase("idle");
    }
  }

  async function retryPhoto() {
    setError(null);
    setPhase("photo");
    const mediaId = await sendPhoto();
    setPhase("idle");
    if (mediaId) {
      setDone((d) => (d ? { ...d, mediaId } : d));
      setOpen(false);
      router.refresh();
    }
  }

  const photo = done ? (done.mediaId ? { thumb: `/api/media/${done.mediaId}?size=thumb`, full: `/api/media/${done.mediaId}` } : preview ? { thumb: preview, full: preview } : card?.photo) : card?.photo;

  return (
    <>
      {done ? (
        card ? (
          <CoveredCard {...card} state={done.reason} photo={photo} />
        ) : (
          // A row (a market's consequence): the mark says how it closed; the story's own words stay as they were.
          <div className="flex items-center gap-2">
            <StateMark state={done.reason} />
            <div className="min-w-0 flex-1">{children}</div>
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.thumb} alt="The photo from when it was settled" width={44} height={44} className="h-11 w-11 shrink-0 rounded-button object-cover" />
            ) : null}
          </div>
        )
      ) : (
        <button type="button" onClick={() => setOpen(true)} aria-label={`${sentence}. Settle it, or call it even`} className={card ? "block w-full rounded-card text-left" : "block w-full rounded-button text-left"}>
          {card ? <CoveredCard {...card} /> : children}
        </button>
      )}
      <Sheet open={open} onClose={() => (phase === "idle" ? setOpen(false) : undefined)} labelledBy={titleId}>
        <div className="flex flex-col gap-1">
          <h2 id={titleId} className="text-body-strong text-ink">
            {sentence}
          </h2>
          <p className="text-body-sm text-ink-2">{what}</p>
        </div>
        {photosOn && !done ? (
          <label className="flex min-h-14 cursor-pointer items-center gap-3 rounded-button bg-surface-2 px-4 py-2 text-body-strong text-ink">
            {preview ? (
              // A file the person just picked, shown back before it goes anywhere.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" width={84} height={84} className="h-[84px] w-[84px] shrink-0 rounded-button object-cover" />
            ) : (
              <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-2">
                <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
                <circle cx="12" cy="13" r="3.4" />
              </svg>
            )}
            <span className="min-w-0 flex-1">{preview ? "Change the photo" : "Add a photo of it"}</span>
            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={phase !== "idle"} onChange={(e) => pick(e.target.files?.[0] ?? null)} />
          </label>
        ) : null}
        {error ? <ProblemSummary messages={[error]} /> : null}
        {done && photoFailed ? (
          <Button variant="primary" onClick={retryPhoto} loading={phase === "photo"}>
            Try the photo again
          </Button>
        ) : (
          <div className="flex flex-col gap-[10px]">
            <Button variant="primary" onClick={() => close("settled")} loading={phase !== "idle"} disabled={done !== null}>
              Settled
            </Button>
            <Button variant="secondary" size="primary" onClick={() => close("forgiven")} disabled={phase !== "idle" || done !== null}>
              Call it even
            </Button>
          </div>
        )}
      </Sheet>
    </>
  );
}
