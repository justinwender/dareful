"use client";

import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { addMarketPhotoAction } from "@/lib/actions/media";
import type { Hue } from "@/lib/ui/hue";
import { shrinkPhoto } from "@/lib/ui/shrink-photo";

/**
 * A photo on its way up, one that didn't make it, or one that landed and is waiting for the screen to re-read
 * (docs/design.md 3.39): its preview, the stored id once it has one, and a tap on a failed one retries it.
 */
export type QueuedPhoto = { key: string; preview: string; status: "pending" | "failed" | "landed"; id?: string };

export type PhotoAddingState = {
  /** Opens the picker: the camera itself while the market is open (3.39), the phone's library once it has ended (3.8). */
  pick: () => void;
  /** Photos still going up: each one is a hatched placeholder at the end of the strip until it is stored (3.8). */
  pending: number;
  /** Whether this person may add at all: they are in it, and it is open or has ended. */
  canAdd: boolean;
  /** The night, for the words ("from Friday", "from that night"). */
  night: string;
  /** The viewer, for the placeholders' credit chip. */
  viewer: { name: string; hue: Hue };
  /** A photo that didn't go up, as the 5.1 block in the sheet, with "Try again" (3.8). */
  problem: string | null;
  retry: () => void;
  /** Each photo still going up or that failed, in the order taken, for the squares in "Yours from tonight" (3.39). */
  queue: QueuedPhoto[];
  /** Retries one failed photo, from its square. */
  retryOne: (key: string) => void;
  /** Drops landed photos the screen now shows from the server, so a square never blinks out between the two. */
  settle: (ids: string[]) => void;
};

const Ctx = createContext<PhotoAddingState>({ pick: () => undefined, pending: 0, canAdd: false, night: "that night", viewer: { name: "?", hue: "stone" }, problem: null, retry: () => undefined, queue: [], retryOne: () => undefined, settle: () => undefined });

export const usePhotoAdding = (): PhotoAddingState => useContext(Ctx);

/**
 * One picker for everything that adds a memory to a market (docs/design.md 3.8, 3.24, 3.37, 3.39): the sheet's
 * chalk and the empty slot once it has ended, the camera button while it is open, all opening the same input.
 * Once it has ended the input is the phone's library, several at once; while it is open it is the camera itself
 * (`capture`), one photo at a time, because that window is for the photo being taken now. Each photo lands as a
 * placeholder until it is stored, and the control that started it is pending until the last one is. A photo that
 * fails keeps its square, and the block in the sheet says so with "Try again". Adding sends nobody anything.
 */
export function PhotoAdding({ dareId, night, canAdd, capture = false, viewer, children }: { dareId: string; night: string; canAdd: boolean; /** The camera, not the library: while the market is open (3.39). */ capture?: boolean; viewer: { name: string; hue: Hue }; children: ReactNode }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const files = useRef(new Map<string, File>());
  const [queue, setQueue] = useState<QueuedPhoto[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const pending = queue.filter((q) => q.status === "pending").length;

  async function send(entries: Array<{ key: string; file: File }>) {
    if (entries.length === 0) return;
    setProblem(null);
    setQueue((q) => q.map((x) => (entries.some((e) => e.key === x.key) ? { ...x, status: "pending" } : x)));
    let landed = 0;
    for (const { key, file } of entries) {
      let id: string | null = null;
      try {
        const form = new FormData();
        form.set("dareId", dareId);
        form.set("photo", await shrinkPhoto(file), "photo.jpg");
        const r = await addMarketPhotoAction(form);
        if ("error" in r) setProblem(r.error === "This one has all the photos it can hold." ? "This one’s full." : "That photo didn’t go up.");
        else id = r.mediaId;
      } catch {
        setProblem("That photo didn’t go up.");
      }
      if (id) {
        landed++;
        files.current.delete(key);
        // The square stays, as the preview, until the screen re-reads and shows the stored copy (`settle`).
        const stored = id;
        setQueue((q) => q.map((x) => (x.key === key ? { ...x, status: "landed", id: stored } : x)));
      } else setQueue((q) => q.map((x) => (x.key === key ? { ...x, status: "failed" } : x)));
    }
    if (landed > 0) router.refresh();
  }
  function settle(ids: string[]) {
    setQueue((q) => {
      const gone = q.filter((x) => x.status === "landed" && x.id !== undefined && ids.includes(x.id));
      if (gone.length === 0) return q;
      for (const x of gone) URL.revokeObjectURL(x.preview);
      return q.filter((x) => !gone.includes(x));
    });
  }
  function take(picked: File[]) {
    const entries = picked.map((file) => {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      files.current.set(key, file);
      return { key, file };
    });
    setQueue((q) => [...q, ...entries.map((e) => ({ key: e.key, preview: URL.createObjectURL(e.file), status: "pending" as const }))]);
    void send(entries);
  }
  const failed = () => queue.filter((q) => q.status === "failed").flatMap((q) => (files.current.has(q.key) ? [{ key: q.key, file: files.current.get(q.key) as File }] : []));

  return (
    <Ctx.Provider value={{ pick: () => input.current?.click(), pending, canAdd, night, viewer, problem, retry: () => void send(failed()), queue, retryOne: (key) => void send(failed().filter((e) => e.key === key)), settle }}>
      {children}
      {canAdd ? (
        <input
          ref={input}
          type="file"
          accept="image/*"
          {...(capture ? { capture: "environment" as const } : { multiple: true })}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            e.target.value = "";
            take(picked);
          }}
        />
      ) : null}
    </Ctx.Provider>
  );
}
