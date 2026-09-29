import { ButtonLink } from "@/components/ui/button";
import { RootHeader, Screen } from "@/components/ledger/screen";
import { OfflineBar } from "@/components/ui/offline-bar";
import { FirstRun } from "@/components/home/first-run";
import { JustHappened } from "@/components/home/just-happened";
import { NeedsYou } from "@/components/home/needs-you";
import { Running } from "@/components/home/running";
import { SignedOut } from "@/components/home/signed-out";
import { nowFor } from "@/lib/ledger/home";
import { closesLabel, todayLabel } from "@/lib/ui/copy";
import { TabBar } from "@/components/ui/tab-bar";
import { ViewportProbe } from "@/components/ui/viewport-probe";
import { currentUser } from "@/lib/auth/session";
import { viewerClock } from "@/lib/ui/zone";
import { starterGames } from "@/lib/sports";
import { rowData } from "@/components/on/game-row";
import { hueFor } from "@/lib/ui/hue";

export const dynamic = "force-dynamic";

/**
 * Now, the root (docs/design.md 4.7, 6.1): what is live and what needs this person. It routes rather than does:
 * creating things lives behind Start, people on their own tab, the account behind You. Three sections in a fixed
 * order and nothing above or between them, each gone when it is empty, and nothing here counts, badges or ages. A
 * claim to accept and a cover to confirm are Needs you rows, never sections of their own.
 */
export default async function Now({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const clock = await viewerClock();
  const user = await currentUser();
  if (!user) return <SignedOut />;
  const sp = await searchParams;
  const now = new Date(clock.now);

  const home = await nowFor(user, { now, closes: (at) => closesLabel(at, now, clock.zone), zone: clock.zone });
  const empty = !home.hasAnything;
  // "Got a code?" at the top right, placed as the question step places it (docs/design.md 6.1, amended 2026-09-27): joining by code is one tap from home.
  const today = (
    <RootHeader
      info="now"
      right={
        <ButtonLink href="/join" variant="tertiary" data-got-a-code="">
          Got a code?
        </ButtonLink>
      }
    >
      <h2 className="text-label text-ink-3">{todayLabel(now, clock.zone)}</h2>
    </RootHeader>
  );

  if (empty) return <FirstRun today={todayLabel(now, clock.zone)} games={(await starterGames(now)).map((g) => rowData(g, clock.zone, null, null))} viewerHue={hueFor(user.id)} />;

  return (
    <Screen root>
      {today}
      <OfflineBar />
      <div className="flex flex-col gap-7 py-4">
        <NeedsYou rows={home.needs} viewer={user} showAll={sp.all === "1"} allHref="/?all=1" />

        <Running rows={home.running} viewerId={user.id} />

        <JustHappened rows={home.happened} viewerId={user.id} clock={clock} />
        {/* An instrument for the installed app's tab bar (docs/testing.md session 21), here as well as on You so a page with the band can be read beside one without; it leaves with the cause. */}
        <ViewportProbe />
      </div>
      <TabBar active="/" start />
    </Screen>
  );
}

