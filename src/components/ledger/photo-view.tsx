"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { removeMarketPhotoAction } from "@/lib/actions/media";

/**
 * A photo full screen (docs/design.md 3.8, 3.39): the frame's derivative on the ground, a 48px close at the top
 * right, and under it "Save to your phone" and, for whoever added a memory, "Remove". Saving goes through the
 * share sheet with the file itself, because a photo taken by the camera inside a web app on an iPhone is not in
 * the phone's own photos; where there is no share sheet the browser saves the file. Removing is destructive
 * (3.12), so it asks once in a sheet. The bytes come through the app's own door, which checks who is asking.
 */
export function PhotoView({ id, alt, removable, onClose }: { id: string; alt: string; removable: boolean; onClose: () => void }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [asking, setAsking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !asking) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, asking]);

  async function save() {
    setProblem(null);
    setSaving(true);
    try {
      const r = await fetch(`/api/media/${id}`);
      if (!r.ok) throw new Error(`door ${r.status}`);
      const blob = await r.blob();
      const file = new File([blob], `dareful-${id.slice(0, 8)}.jpg`, { type: blob.type || "image/jpeg" });
      if (typeof navigator !== "undefined" && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = file.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      }
    } catch (err) {
      // Closing the share sheet is not a failure.
      if (!(err instanceof DOMException && err.name === "AbortError")) setProblem("Couldn’t save it. Try again.");
    } finally {
      setSaving(false);
    }
  }
  async function remove() {
    setProblem(null);
    setRemoving(true);
    try {
      const r = await removeMarketPhotoAction(id);
      if ("error" in r) return setProblem(r.error);
      setAsking(false);
      onClose();
      router.refresh();
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={alt} data-photo-view={id} className="fixed inset-0 z-40 flex flex-col bg-ground pt-[env(safe-area-inset-top)]">
      <div className="flex h-14 shrink-0 items-center justify-end px-2">
        <button type="button" aria-label="Close" onClick={onClose} className="inline-flex h-12 w-12 items-center justify-center rounded-pill text-ink">
          <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center px-2">
        {/* A signed URL that expires; next/image would need a loader for one. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/media/${id}`} alt={alt} className="max-h-full max-w-full object-contain" />
      </div>
      <div className="mx-auto flex w-full max-w-[430px] shrink-0 flex-col gap-2 px-5 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]">
        <ProblemSummary messages={[problem]} />
        <div className={removable ? "grid grid-cols-2 gap-2" : "flex flex-col"}>
          <Button variant="secondary" onClick={save} loading={saving} data-save-photo="">
            Save to your phone
          </Button>
          {removable ? (
            <Button variant="secondary" className="text-ink" onClick={() => setAsking(true)} disabled={saving} data-remove-photo="">
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <Sheet open={asking} labelledBy="remove-photo-title" onClose={() => (removing ? undefined : setAsking(false))}>
        <h2 id="remove-photo-title" className="text-serif-l text-ink">
          Remove this photo?
        </h2>
        <p className="text-body-sm text-ink-2">It comes off this question for good. Nothing else changes.</p>
        <ProblemSummary messages={[problem]} />
        <div className="flex flex-col gap-1">
          <Button variant="primary" data-autofocus onClick={remove} loading={removing}>
            Remove
          </Button>
          <Button variant="tertiary" onClick={() => setAsking(false)} disabled={removing}>
            Keep it
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
