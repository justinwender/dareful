"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FIELD_PROBLEM_CLASS, Problem } from "@/components/ledger/problem";
import { addOwnUnitAction, removeOwnUnitAction, renameAction } from "@/lib/actions/account";
import { addStickerAction } from "@/lib/actions/media";
import { attempt } from "@/lib/ui/attempt";
import { imageFromClipboard, imageFromPaste, NotACutoutHere, prepareCutout } from "@/lib/ui/cutout-clipboard";
import { NAME_MAX, OWN_UNIT_MAX } from "@/lib/ledger/settings";

/** Your name, in its sheet (the touch-ups round, section 11): the field, prefilled, and Save. */
export function NameEditor({ name, titleId, onDone }: { name: string; titleId: string; onDone: () => void }) {
  const router = useRouter();
  const fieldId = useId();
  const [value, setValue] = useState(name);
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, start] = useTransition();
  const save = () =>
    start(async () => {
      setProblem(null);
      const r = await attempt(() => renameAction(value));
      if ("error" in r) return setProblem(r.error);
      router.refresh();
      onDone();
    });
  return (
    <div className="flex flex-col gap-3" data-name-editor="">
      <h2 id={titleId} className="text-body-strong text-ink">
        Your name
      </h2>
      <input
        id={fieldId}
        value={value}
        onChange={(e) => (setValue(e.target.value), setProblem(null))}
        maxLength={NAME_MAX}
        autoComplete="given-name"
        aria-labelledby={titleId}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? `${fieldId}-problem` : undefined}
        className={`h-12 w-full rounded-button border border-line bg-ground px-4 text-body text-ink${problem ? ` ${FIELD_PROBLEM_CLASS}` : ""}`}
      />
      <Problem id={`${fieldId}-problem`} message={problem} />
      <Button variant="primary" onClick={save} loading={saving} disabled={value.trim() === name.trim()}>
        Save
      </Button>
    </div>
  );
}

/** Your own stake units, in the units sheet: each with a way to take it off, and a field to add one. */
export function OwnUnits({ units }: { units: string[] }) {
  const router = useRouter();
  const fieldId = useId();
  const [list, setList] = useState(units);
  const [value, setValue] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const add = () =>
    start(async () => {
      setProblem(null);
      const r = await attempt(() => addOwnUnitAction(value));
      if ("error" in r) return setProblem(r.error);
      setList(r.units);
      setValue("");
      router.refresh();
    });
  const remove = (label: string) =>
    start(async () => {
      const r = await attempt(() => removeOwnUnitAction(label));
      if ("error" in r) return setProblem(r.error);
      setList(r.units);
      router.refresh();
    });
  return (
    <div className="flex flex-col gap-3" data-own-units="">
      {list.length > 0 ? (
        <ul className="flex flex-col">
          {list.map((u) => (
            <li key={u} className="flex min-h-12 items-center gap-3 border-t border-line first:border-t-0">
              <span className="flex h-7 w-7 items-center justify-center rounded-stamp-28 bg-surface-2 text-body-sm text-ink" aria-hidden="true">
                “
              </span>
              <span className="min-w-0 flex-1 text-body-sm text-ink">{`“${u}”`}</span>
              <button type="button" aria-label={`Take off “${u}”`} disabled={busy} onClick={() => remove(u)} data-press="line" className="inline-flex h-11 w-11 items-center justify-center rounded-pill text-ink-2 press-line">
                <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <label htmlFor={fieldId} className="text-label text-ink-3">
        One of your own
      </label>
      <div className="flex gap-2">
        <input
          id={fieldId}
          value={value}
          onChange={(e) => (setValue(e.target.value), setProblem(null))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          maxLength={OWN_UNIT_MAX}
          autoComplete="off"
          enterKeyHint="done"
          aria-invalid={problem ? true : undefined}
          aria-describedby={problem ? `${fieldId}-problem` : undefined}
          className={`h-12 min-w-0 flex-1 rounded-button border border-line bg-ground px-4 text-body text-ink${problem ? ` ${FIELD_PROBLEM_CLASS}` : ""}`}
        />
        <Button variant="secondary" onClick={add} loading={busy} disabled={value.trim().length === 0}>
          Add
        </Button>
      </div>
      <Problem id={`${fieldId}-problem`} message={problem} />
    </div>
  );
}

/** A sticker saved to your marks from You (3.28's paste, the touch-ups round): a cutout pasted here, or asked of the clipboard. */
export function PasteSticker({ open }: { open: boolean }) {
  const router = useRouter();
  const [problem, setProblem] = useState<string | null>(null);
  const [pasting, setPasting] = useState(false);
  async function take(blob: Blob) {
    setProblem(null);
    setPasting(true);
    try {
      const png = await prepareCutout(blob);
      const form = new FormData();
      form.set("cutout", png, "cutout.png");
      form.set("source", "pasted");
      const r = await addStickerAction(form);
      if ("error" in r) return setProblem(r.error);
      router.refresh();
    } catch (err) {
      setProblem(err instanceof NotACutoutHere ? err.message : "That cutout couldn’t be read.");
    } finally {
      setPasting(false);
    }
  }
  // A paste anywhere while the sheet is open is a cutout arriving, as in the picker (3.28, way 1).
  useEffect(() => {
    if (!open) return;
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFromPaste(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      void take(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- take reads only fresh state through setters
  }, [open]);
  async function ask() {
    setProblem(null);
    try {
      const blob = await imageFromClipboard();
      if (!blob) return setProblem("Nothing to paste yet. Lift a subject out of a photo, copy it, then come back.");
      await take(blob);
    } catch (err) {
      setProblem(err instanceof NotACutoutHere ? err.message : "Copy a cutout first, then paste it here.");
    }
  }
  return (
    <div className="flex flex-col gap-2" data-paste-sticker="">
      <button type="button" aria-label="Paste a cutout" aria-busy={pasting || undefined} disabled={pasting} onClick={() => void ask()} data-press="line" className="flex h-11 w-11 items-center justify-center rounded-stamp-28 border-[1.5px] border-dashed border-line-strong text-ink-2 press-line">
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="6" y="5" width="12" height="16" rx="2" />
          <path d="M9 5V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M12 10v6M9 13h6" />
        </svg>
      </button>
      {problem ? <p className="text-caption text-ink-2">{problem}</p> : null}
    </div>
  );
}
