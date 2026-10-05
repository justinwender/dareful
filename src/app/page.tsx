import { Suspense } from "react";
import { cookies } from "next/headers";
import { ButtonLink } from "@/components/ui/button";
import { RootHeader, Screen } from "@/components/ledger/screen";
import { OfflineBar } from "@/components/ui/offline-bar";
import { InfoIcon } from "@/components/ui/info";
import { NowContent } from "@/components/home/now-content";
import { NowWaiting } from "@/components/home/now-arriving";
import { SignedOut } from "@/components/home/signed-out";
import { GuestLineFor } from "@/components/guest/guest-line";
import { todayLabel } from "@/lib/ui/copy";
import { NOW_COOKIE, nowHintOf } from "@/lib/ui/now-shell";
import { TabBar } from "@/components/ui/tab-bar";
import { sessionUserId } from "@/lib/auth/session";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

/**
 * Now, the root (docs/design.md 4.7, 6.1): what is live and what needs this person. It routes rather than does:
 * creating things lives behind Start, people on their own tab, the account behind You.
 *
 * It is the screen the installed app opens on, so its shell goes out first (11.5): the header row, the tab bar
 * and the + for someone signed in, decided from the cookie alone, with no query in front of it; the content
 * (`NowContent`) reads the account and Now and arrives into it, fading in. This is the one screen that answers in
 * pieces. It never answers 404 and never redirects, which is what every other screen keeps its one answer for
 * (5.3; docs/decisions.md 2026-09-29).
 */
export default async function Now({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const clock = await viewerClock();
  // Signed out: the screen goes out at once, and a guest's line (3.46) arrives behind it, so no query stands before the first frame (11.5).
  if (!(await sessionUserId()))
    return (
      <>
        <Suspense fallback={null}>
          <GuestLineFor />
        </Suspense>
        <SignedOut />
      </>
    );
  const sp = await searchParams;
  const hint = nowHintOf((await cookies()).get(NOW_COOKIE)?.value);
  return (
    <Screen root>
      <span hidden data-now-hint={hint} />
      {/* "Got a code?" at the top right, placed as the question step places it (docs/design.md 6.1, amended 2026-09-27): joining by code is one tap from home. Before anything it is the six boxes on the screen, so it and the sheet's own words follow what Now turns out to be. */}
      <RootHeader
        info="now"
        icon={
          <>
            <span data-now-full="" className="contents">
              <InfoIcon sheet="now" />
            </span>
            <span data-now-empty="" className="contents">
              <InfoIcon sheet="now-first-run" />
            </span>
          </>
        }
        right={
          <span data-now-full="" className="contents">
            <ButtonLink href="/join" variant="tertiary" data-got-a-code="">
              Got a code?
            </ButtonLink>
          </span>
        }
      >
        <h2 className="text-label text-ink-3">{todayLabel(new Date(clock.now), clock.zone)}</h2>
      </RootHeader>
      <OfflineBar />
      <Suspense fallback={<NowWaiting />}>
        <NowContent clock={clock} showAll={sp.all === "1"} />
      </Suspense>
      <TabBar active="/" start />
    </Screen>
  );
}
