"use client";

import { useId, useState } from "react";
import { Sheet } from "./sheet";
import { INFO_FIXED_LINE, INFO_GROUPS, INFO_ICON_ON, type InfoEntry, type InfoGlyph } from "@/lib/ui/info";
import { infoSheet } from "@/lib/ui/info-sheets";
import { CREAM } from "@/lib/ui/palette";

/**
 * The information icon and its sheet (docs/design.md section 10), for the hackathon only. A 22px circled-i in
 * `--ink-2` inside a 48px target at the top right of every screen 10.1 lists, named "What you can do here", which
 * opens a modal sheet on the current place's surface: the screen's name, the fixed line, then the groups in
 * 10.6's order with their entries, all of it scrolling as one piece under the sheet's own handle row and close
 * (10.4, amended 2026-09-29: nothing in it is pinned, and it is as tall as its content up to the status bar). It
 * presses to 0.5 like every control drawn in lines (9.4); nothing about it moves, pulses or marks itself as new.
 * The icon is part of its page and never stands above a layer (10.5, amended 2026-09-29), so whatever covers a
 * page covers its icon: the ask layer, a shell, the full-screen photo, a sheet. While a modal sheet is open over
 * the screen the icon does nothing, since a sheet never opens another sheet (6.4). `INFO_ICON_ON` removes it and
 * returns every corner to its place.
 */
export function InfoIcon({ sheet, onPhoto = false }: { sheet: string; /** On the full-screen photo, black in both themes, the icon draws in the dark theme's ink (10.2). */ onPhoto?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const content = infoSheet(sheet);
  if (!INFO_ICON_ON || !content) return null;
  return (
    <>
      <button
        type="button"
        aria-label="What you can do here"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-press="line"
        data-info-icon={sheet}
        onClick={() => {
          // A sheet never opens another sheet (6.4): with one open over this screen, the icon does nothing.
          if (!open && document.querySelector('[data-sheet="open"]')) return;
          setOpen((o) => !o);
        }}
        className="inline-flex h-12 w-12 items-center justify-center rounded-pill press-line"
        style={{ color: onPhoto ? CREAM : "var(--ink-2)" }}
      >
        <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <InfoSheetView sheet={sheet} open={open} onClose={() => setOpen(false)} labelledBy={`${id}-name`} />
    </>
  );
}

/** The sheet itself (10.4), apart from the icon so it can be drawn open: the name and the fixed line go with the entries, and nothing is pinned. */
export function InfoSheetView({ sheet, open, onClose, labelledBy }: { sheet: string; open: boolean; onClose: () => void; labelledBy: string }) {
  const content = infoSheet(sheet);
  if (!content) return null;
  return (
    <Sheet open={open} onClose={onClose} labelledBy={labelledBy} full>
      <div className="flex flex-col gap-5" data-info-sheet={sheet}>
        <div className="flex flex-col gap-1">
          <h2 id={labelledBy} className="text-body-strong text-ink">
            {content.name}
          </h2>
          <p className="text-caption text-ink-3">{INFO_FIXED_LINE}</p>
        </div>
        {INFO_GROUPS.filter((g) => (content.groups[g]?.length ?? 0) > 0).map((g) => (
          <section key={g} className="flex flex-col gap-3">
            <h3 className="text-label text-ink-3">{g}</h3>
            <ul className="flex flex-col gap-3">
              {(content.groups[g] ?? []).map((e) => (
                <Entry key={e.term} entry={e} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Sheet>
  );
}

function Entry({ entry }: { entry: InfoEntry }) {
  return (
    <li className="flex flex-col gap-0.5">
      <p className="flex flex-wrap items-baseline gap-x-2 text-body-sm font-semibold text-ink">
        <span className="inline-flex items-center gap-2">
          {entry.glyph ? <Glyph name={entry.glyph} /> : null}
          {entry.term}
        </span>
        {entry.qualifier ? <span className="text-caption font-normal text-ink-3">· {entry.qualifier}</span> : null}
      </p>
      <p className="text-body-sm text-ink-2">{entry.description}</p>
    </li>
  );
}

/** An icon's own glyph at 20px in `--ink`, before its name (10.4): the same drawings the controls carry. */
export function Glyph({ name }: { name: InfoGlyph }) {
  const p = { width: 20, height: 20, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, className: "shrink-0 text-ink" };
  switch (name) {
    case "more":
      return (
        <svg {...p}>
          <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
          <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case "share":
      return (
        <svg {...p}>
          <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
          <path d="M5 12v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7" />
        </svg>
      );
    case "copy":
      return (
        <svg {...p}>
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
      );
    case "code":
      return (
        <svg {...p}>
          <rect x="4" y="4" width="6" height="6" rx="1" />
          <rect x="14" y="4" width="6" height="6" rx="1" />
          <rect x="4" y="14" width="6" height="6" rx="1" />
          <path d="M14 14h3v3M20 14v6h-6v-2" />
        </svg>
      );
    case "pass":
      return (
        <svg {...p}>
          <rect x="7" y="3" width="10" height="18" rx="2" />
          <path d="M2 10l3-3M2 10l3 3M22 14l-3-3M22 14l-3 3" />
        </svg>
      );
    case "camera":
      return (
        <svg {...p}>
          <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.2l1.2-2h6.2l1.2 2h2.2A1.5 1.5 0 0 1 20 8.5v9A1.5 1.5 0 0 1 18.5 19h-13A1.5 1.5 0 0 1 4 17.5z" />
          <circle cx="12" cy="13" r="3.4" />
        </svg>
      );
    case "back":
      return (
        <svg {...p}>
          <path d="M15 5l-7 7 7 7" />
        </svg>
      );
    case "close":
      return (
        <svg {...p}>
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      );
    // The close of a screen that rose from below (9.5): the CloseControl's own chevron, so the sheet names the icon a person sees.
    case "down":
      return (
        <svg {...p}>
          <path d="M5 9l7 7 7-7" />
        </svg>
      );
    case "chevron":
      return (
        <svg {...p}>
          <path d="M9 5l7 7-7 7" />
        </svg>
      );
    case "check":
      return (
        <svg {...p}>
          <path d="M5 12.5l4.5 4.5L19 7.5" />
        </svg>
      );
    case "remove":
      return (
        <svg {...p}>
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
        </svg>
      );
    case "save":
      return (
        <svg {...p}>
          <path d="M12 3v12M7.5 10.5 12 15l4.5-4.5" />
          <path d="M5 17v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2" />
        </svg>
      );
    case "sticker":
      return (
        <svg {...p}>
          <path d="M5 5h14v9l-5 5H5z" />
          <path d="M14 19v-5h5" />
        </svg>
      );
    case "plus":
      return (
        <svg {...p}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    case "info":
      return (
        <svg {...p}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" />
          <circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none" />
        </svg>
      );
  }
}
