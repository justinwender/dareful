import Link from "next/link";
import { ButtonLink } from "@/components/ui/button";
import { LinkPending } from "@/components/ui/link-pending";
import { Screen, SectionLabel } from "@/components/ledger/screen";
import { FirstRun } from "@/components/home/first-run";
import { JustHappened } from "@/components/home/just-happened";
import { NeedsYou } from "@/components/home/needs-you";
import { Running } from "@/components/home/running";
import { SignedOut } from "@/components/home/signed-out";
import { nowFor, timeBound } from "@/lib/ledger/home";
import { closesLabel, todayLabel } from "@/lib/ui/copy";
import { TabBar } from "@/components/ui/tab-bar";
import { ViewportProbe } from "@/components/ui/viewport-probe";
import { SuggestedGhost } from "@/components/ledger/suggested-ghost";
import { currentUser } from "@/lib/auth/session";
import { boundPendingForDebtor, suggestedGhostsFor } from "@/lib/ledger/claims";
import { viewerClock } from "@/lib/ui/zone";
import { starterGames } from "@/lib/sports";
import { rowData } from "@/components/on/game-row";
import { hueFor } from "@/lib/ui/hue";

export const dynamic = "force-dynamic";

/**
 * Now, the root (docs/design.md 4.7, 6.1): what is live and what is waiting on this person. It routes rather than
 * does: creating things lives behind Start, people on their own tab, the account behind You. Three sections in a
 * fixed order, each gone when it is empty, and nothing here counts, badges or ages.
 */
export default async function Now({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const clock = await viewerClock();
  const user = await currentUser();
  if (!user) return <SignedOut />;
  const sp = await searchParams;
  const now = new Date(clock.now);

  const [home, waiting, suggested] = await Promise.all([nowFor(user, { now, closes: (at) => closesLabel(at, now, clock.zone) }), boundPendingForDebtor(user.id), suggestedGhostsFor(user.id, user.displayName)]);
  const empty = !home.hasAnything && suggested.length === 0 && waiting.length === 0;
  // "Got a code?" at the top right, placed as the question step places it (docs/design.md 6.1, amended 2026-09-27): joining by code is one tap from home.
  const today = (
    <div className="flex items-center justify-between pt-5">
      <h2 className="text-label text-ink-3">{todayLabel(now, clock.zone)}</h2>
      <ButtonLink href="/join" variant="tertiary" className="-my-3" data-got-a-code="">
        Got a code?
      </ButtonLink>
    </div>
  );

  if (empty) return <FirstRun today={todayLabel(now, clock.zone)} games={(await starterGames(now)).map((g) => rowData(g, clock.zone, null, null))} viewerHue={hueFor(user.id)} />;

  return (
    <Screen root>
      {today}
      <div className="flex flex-col gap-7 py-4">
        {waiting.length > 0 ? (
          <Link prefetch={false} href="/welcome" className="relative flex items-center justify-between gap-3 rounded-card border border-dashed border-line-strong px-4 py-3.5">
            <LinkPending />
            <span className="text-body-strong text-ink">{waiting.length === 1 ? "One thing was waiting for you" : "A few things were waiting for you"}</span>
            <span className="link-tertiary">Have a look</span>
          </Link>
        ) : null}

        <NeedsYou rows={home.needs} viewer={user} showAll={sp.all === "1"} allHref="/?all=1" />

        {suggested.length > 0 ? (
          <section className="flex flex-col gap-3">
            <SectionLabel>Is this you?</SectionLabel>
            {suggested.map((g) => (
              <SuggestedGhost key={g.claimId} claimId={g.claimId} name={g.displayName} creatorName={g.creatorName} />
            ))}
          </section>
        ) : null}

        <Running rows={home.running} viewerId={user.id} />

        <JustHappened rows={home.happened} viewerId={user.id} clock={clock} />
        {/* An instrument for the installed app's tab bar (docs/testing.md session 21), here as well as on You so a page with the band can be read beside one without; it leaves with the cause. */}
        <ViewportProbe />
      </div>
      <TabBar active="/" live={timeBound(home.needs)} start />
    </Screen>
  );
}

