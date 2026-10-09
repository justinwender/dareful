"use client";

import { useSignInSheet } from "@/components/auth/sign-in-sheet";
import { Button } from "@/components/ui/button";
import { FixedLayer } from "@/components/ui/layers";
import { GUEST_LINE_HEIGHT, guestLineWords } from "@/lib/ui/guest-words";
import type { GuestLine } from "@/lib/ledger/guest";
import { writeJoinHandoff, writeStay } from "@/lib/ui/join-handoff";

/**
 * The guest line (docs/design.md 3.46): a row of the shell under the status bar and above the screen's header,
 * outside the scroller, so the page starts under it and it never covers anything. On the screen's own ground with a
 * 1px line under it; the words on the left, "Sign up" on the right. No count, no colour that changes with time, no
 * close. Signing up comes back to the screen it was tapped on: on a market, the guest's entry there is kept in the
 * account once it exists (the join handoff); anywhere else, the login stays on the screen. It opens the app's own
 * sign-in sheet, as every "Sign in" does (the final round: it was the last place opening the sign-in library's modal,
 * which the touch-ups round took out everywhere else).
 */
export function GuestLineView({ line, dareId, name }: { line: GuestLine; dareId: string | null; name: string }) {
  const signIn = useSignInSheet();
  const height = GUEST_LINE_HEIGHT[line];
  return (
    <>
      {/* The room the line takes, paid at the top of the app root (layout.tsx), drawn with the page so nothing moves after it paints. */}
      <style>{`:root{--guest-line:${height}px}`}</style>
      <FixedLayer name="guest-line">
        <div data-guest-line={line} data-fixed="top" className="fixed inset-x-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-ground pr-2 pl-5" style={{ top: "env(safe-area-inset-top)", height }}>
          <p className={line === "first" ? "text-body-sm text-ink-2" : "text-body-sm font-semibold text-ink"}>{guestLineWords(line)}</p>
          <Button
            variant={line === "first" ? "tertiary" : "secondary"}
            size={line === "first" ? "tertiary" : "inline"}
            className={line === "first" ? "shrink-0 text-ink" : "shrink-0"}
            data-guest-sign-up=""
            onClick={() => {
              if (dareId) writeJoinHandoff({ dareId, at: Date.now(), keep: true, ...(name.trim() ? { name: name.trim().slice(0, 40) } : {}) });
              else writeStay(window.location.pathname, Date.now());
              signIn.open();
            }}
          >
            Sign up
          </Button>
        </div>
      </FixedLayer>
    </>
  );
}
