"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { Sheet } from "@/components/ui/sheet";
import { isThemeChoice, THEME_CHOICES, THEME_KEY, themeAttribute, type ThemeChoice } from "@/lib/ui/theme";

/**
 * Appearance (docs/design.md 8.1): a row in the Account card captioned with the current choice, opening a modal
 * sheet of three rows, "Match your phone" (the default), "Always dark" and "Always light". A device preference,
 * kept in this browser's storage like recents and never a record about the person; the choice goes onto `html`
 * at once, and the inline script in the head puts it back before first paint on the next start.
 */
const subscribe = (onChange: () => void) => {
  window.addEventListener("storage", onChange);
  window.addEventListener("dareful:theme", onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener("dareful:theme", onChange);
  };
};
function readChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return isThemeChoice(v) ? v : "phone";
  } catch {
    return "phone";
  }
}
const onServer = (): ThemeChoice => "phone";

export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "phone") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Storage blocked: the choice holds for this page and no longer.
  }
  const attr = themeAttribute(choice);
  if (attr) document.documentElement.setAttribute("data-theme", attr);
  else document.documentElement.removeAttribute("data-theme");
  window.dispatchEvent(new Event("dareful:theme"));
}

export function AppearanceRow() {
  const choice = useSyncExternalStore(subscribe, readChoice, onServer);
  const [open, setOpen] = useState(false);
  const id = useId();
  const label = THEME_CHOICES.find((c) => c.value === choice)?.label ?? "Match your phone";
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-press="row" data-account-row="appearance" className="press-row flex min-h-14 w-full items-center gap-3 border-t border-line px-4 py-3 text-left first:border-t-0">
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body-strong text-ink">Appearance</span>
          <span className="text-caption text-ink-3" data-appearance-choice={choice}>
            {label}
          </span>
        </span>
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} labelledBy={`${id}-title`}>
        <h2 id={`${id}-title`} className="text-body-strong text-ink">
          Appearance
        </h2>
        <div role="radiogroup" aria-labelledby={`${id}-title`} className="flex flex-col">
          {THEME_CHOICES.map((c) => {
            const on = c.value === choice;
            return (
              <button
                key={c.value}
                type="button"
                role="radio"
                aria-checked={on}
                data-press="row"
                data-theme-choice={c.value}
                onClick={() => {
                  setThemeChoice(c.value);
                  setOpen(false);
                }}
                className="press-row flex h-12 items-center justify-between gap-3 border-t border-line text-left text-body text-ink first:border-t-0"
              >
                {c.label}
                <span aria-hidden="true" className={on ? "flex h-6 w-6 items-center justify-center rounded-pill bg-ink text-ground" : "h-6 w-6 rounded-pill border-[1.5px] border-line-strong"}>
                  {on ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12l5 5 9-10" />
                    </svg>
                  ) : null}
                </span>
              </button>
            );
          })}
        </div>
      </Sheet>
    </>
  );
}
