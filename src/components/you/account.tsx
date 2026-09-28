"use client";

import { useId, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useDynamicContext } from "@dynamic-labs/sdk-react-core";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { UnitGlyph } from "@/components/ledger/glyphs";
import type { MarkRef } from "@/lib/ui/mark";
import type { GlyphKey } from "@/lib/ui/units";
import type { Hue } from "@/lib/ui/hue";
import { PassThePhoneRow } from "./pass-the-phone";

export type UnitRow = { id: string; label: string; pluralLabel: string; glyph: GlyphKey | null; monetary: boolean; emoji: string | null };

/**
 * Account (docs/design.md 3.34): one card of rows, each `body` 600 over a `caption`, with a chevron: "Your units",
 * "Your marks", "Your number" and "Sign out", which is the one way to leave the product and lives only here (4.7).
 * Sign out asks once in a sheet (3.12, destructive). The unit editor and the marks list behind the rows are not
 * designed (section 7): the two rows open a sheet that lists what this person has used and changes nothing. The
 * number is never held here (only its salted hash, to find entries made under it), so that row states what it
 * is for and opens nothing. Pass the phone is the row with the switch (3.45); One tap is not drawn (3.41, amended).
 */
export function AccountRows({ units, marks, unitsCaption, marksCaption, passThePhone, hue }: { units: UnitRow[]; marks: MarkRef[]; unitsCaption: string; marksCaption: string; /** Pass the phone (3.45): whether it is on, and which half is missing while it is being set up. */ passThePhone: { on: boolean; delegated: boolean; pinSet: boolean }; hue: Hue }) {
  const [open, setOpen] = useState<"units" | "marks" | "signout" | null>(null);
  const titleId = useId();
  const router = useRouter();
  const { handleLogOut } = useDynamicContext();
  const [leaving, setLeaving] = useState(false);
  async function signOut() {
    setLeaving(true);
    try {
      await fetch("/api/session", { method: "DELETE" });
      await handleLogOut();
      router.refresh();
    } finally {
      setLeaving(false);
    }
  }
  return (
    <section className="flex flex-col gap-3" data-you-account="">
      <h2 className="text-label text-ink-3">Account</h2>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        <Row title="Your units" caption={unitsCaption} onClick={() => setOpen("units")} data-account-row="units" />
        <Row title="Your marks" caption={marksCaption} onClick={() => setOpen("marks")} data-account-row="marks" />
        <Row title="Your number" caption="Used to sign in. Nobody else sees it." data-account-row="number" />
        <PassThePhoneRow status={passThePhone} hue={hue} />
        <Row title="Sign out" onClick={() => setOpen("signout")} data-account-row="signout" />
      </div>
      <Sheet open={open === "units"} onClose={() => setOpen(null)} labelledBy={`${titleId}-units`}>
        <h2 id={`${titleId}-units`} className="text-body-strong text-ink">
          Your units
        </h2>
        {units.length === 0 ? (
          <p className="text-body-sm text-ink-2">Nothing yet. A unit is whatever a cover or a question runs on: a beer, a coffee, a next time, dollars.</p>
        ) : (
          <ul className="flex flex-col" data-your-units="">
            {units.map((u) => (
              <li key={u.id} className="flex min-h-12 items-center gap-3 border-t border-line first:border-t-0">
                <span className="flex h-7 w-7 items-center justify-center rounded-button bg-surface-2 text-ink" aria-hidden="true">
                  {u.glyph ? <UnitGlyph unit={u.glyph} size={18} /> : u.emoji ? <span className="text-body-sm">{u.emoji}</span> : u.monetary ? <span className="text-body-sm">$</span> : <span className="text-body-sm">“</span>}
                </span>
                <span className="text-body-sm text-ink">{u.monetary ? "Dollars" : u.pluralLabel.charAt(0).toUpperCase() + u.pluralLabel.slice(1)}</span>
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      <Sheet open={open === "marks"} onClose={() => setOpen(null)} labelledBy={`${titleId}-marks`}>
        <h2 id={`${titleId}-marks`} className="text-body-strong text-ink">
          Your marks
        </h2>
        {marks.length === 0 ? (
          <p className="text-body-sm text-ink-2">Nothing yet. A mark goes on a question when you ask it: an emoji, or a sticker cut from a photo.</p>
        ) : (
          <ul className="grid grid-cols-6 gap-2" data-your-marks="" aria-label="The marks you have used, most recent first">
            {marks.map((m, i) => (
              <li key={i} className="flex items-center justify-center">
                <MarkRefStamp mark={m} size={44} />
              </li>
            ))}
          </ul>
        )}
      </Sheet>
      <Sheet open={open === "signout"} onClose={() => (leaving ? undefined : setOpen(null))} labelledBy={`${titleId}-signout`}>
        <h2 id={`${titleId}-signout`} className="text-body-strong text-ink">
          Sign out?
        </h2>
        <p className="text-body-sm text-ink-2">Everything stays where it is. Sign back in with the same number or email.</p>
        <div className="flex flex-col gap-1">
          <Button variant="primary" data-autofocus onClick={() => void signOut()} loading={leaving} data-sign-out="">
            Sign out
          </Button>
          <Button variant="tertiary" onClick={() => setOpen(null)} disabled={leaving}>
            Stay
          </Button>
        </div>
      </Sheet>
    </section>
  );
}

function Row({ title, caption, onClick, children, ...rest }: { title: string; caption?: string; onClick?: () => void; children?: ReactNode; "data-account-row": string }) {
  const body = (
    <>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-body-strong text-ink">{title}</span>
        {caption ? <span className="text-caption text-ink-3">{caption}</span> : null}
      </span>
      {onClick ? (
        <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3">
          <path d="M9 6l6 6-6 6" />
        </svg>
      ) : null}
      {children}
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="flex min-h-14 w-full items-center gap-3 border-t border-line px-4 py-3 text-left first:border-t-0" {...rest}>
      {body}
    </button>
  ) : (
    <div className="flex min-h-14 w-full items-center gap-3 border-t border-line px-4 py-3 first:border-t-0" {...rest}>
      {body}
    </div>
  );
}
