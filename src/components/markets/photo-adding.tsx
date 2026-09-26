"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { addMarketPhotoAction } from "@/lib/actions/media";
import type { Hue } from "@/lib/ui/hue";
import { shrinkPhoto } from "@/lib/ui/shrink-photo";

export type PhotoAddingState = {
  /** Opens the phone's own picker, the library first (no `capture`), several at once. */
  pick: () => void;
  /** Photos still going up: each one is a hatched placeholder at the end of the strip until it is stored (3.8). */
  pending: number;
  /** Whether this person may add at all: they were in it, and it has ended. */
  canAdd: boolean;
  /** The night, for the words ("from Friday", "from that night"). */
  night: string;
  /** The viewer, for the placeholders' credit chip. */
  viewer: { name: string; hue: Hue };
  /** A photo that didn't go up, as the 5.1 block in the sheet, with "Try again" (3.8). */
  problem: string | null;
  retry: () => void;
};

const Ctx = createContext<PhotoAddingState>({ pick: () => undefined, pending: 0, canAdd: false, night: "that night", viewer: { name: "?", hue: "stone" }, problem: null, retry: () => undefined });

export const usePhotoAdding = (): PhotoAddingState => useContext(Ctx);

/**
 * One picker for everything that adds a photo to an ended market (docs/design.md 3.8, 3.24, 3.37): the sheet's
 * chalk and the empty slot open the same input, several photos at once, each landing as a placeholder until it
 * is stored, and the control that started it pending until the last one is. A photo that fails leaves the block
 * in the sheet with "Try again" and the rest still go up. Adding sends nobody anything.
 */
export function PhotoAdding({ dareId, night, canAdd, viewer, children }: { dareId: string; night: string; canAdd: boolean; viewer: { name: string; hue: Hue }; children: ReactNode }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [failed, setFailed] = useState<File[]>([]);

  async function send(files: File[]) {
    if (files.length === 0) return;
    setProblem(null);
    setPending((n) => n + files.length);
    const stuck: File[] = [];
    let landed = 0;
    for (const file of files) {
      try {
        const form = new FormData();
        form.set("dareId", dareId);
        form.set("photo", await shrinkPhoto(file), "photo.jpg");
        const r = await addMarketPhotoAction(form);
        if ("error" in r) {
          stuck.push(file);
          setProblem(r.error === "This one has all the photos it can hold." ? "This one’s full." : "That photo didn’t go up.");
        } else landed++;
      } catch {
        stuck.push(file);
        setProblem("That photo didn’t go up.");
      } finally {
        setPending((n) => Math.max(0, n - 1));
      }
    }
    setFailed(stuck);
    if (landed > 0) router.refresh();
  }

  return (
    <Ctx.Provider value={{ pick: () => input.current?.click(), pending, canAdd, night, viewer, problem, retry: () => void send(failed) }}>
      {children}
      {canAdd ? (
        <input
          ref={input}
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            void send(files);
          }}
        />
      ) : null}
    </Ctx.Provider>
  );
}
