"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { addMarketPhotoAction } from "@/lib/actions/media";
import { shrinkPhoto } from "@/lib/ui/shrink-photo";

/**
 * "Add yours from Friday" (docs/design.md 3.25; docs/marks-and-memories.md, "Adding later is the point"): the
 * tertiary under the outcome on a settled market, for anyone who was in it, weeks later included. One tap opens
 * the phone's own picker (the camera or the library: the night has already happened), the photo goes through
 * the pipeline, and the screen re-reads with the frame. The button waits the way every button does (5.2).
 */
export function AddPhoto({ dareId, label }: { dareId: string; label: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function send(file: File) {
    setProblem(null);
    setBusy(true);
    try {
      const form = new FormData();
      form.set("dareId", dareId);
      form.set("photo", await shrinkPhoto(file), "photo.jpg");
      const r = await addMarketPhotoAction(form);
      if ("error" in r) return setProblem(r.error);
      router.refresh();
    } catch {
      setProblem("The photo didn’t go through. Try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <ProblemSummary messages={[problem]} />
      <Button variant="tertiary" loading={busy} onClick={() => input.current?.click()} className="self-start">
        {label}
      </Button>
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true" disabled={busy} onChange={(e) => void (e.target.files?.[0] ? send(e.target.files[0]) : undefined)} />
    </div>
  );
}
