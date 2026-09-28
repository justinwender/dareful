import { redirect } from "next/navigation";
import { GameRow, rowData } from "@/components/on/game-row";
import { FeedFailed } from "@/components/on/try-again";
import { Screen, SectionLabel } from "@/components/ledger/screen";
import { TabBar } from "@/components/ui/tab-bar";
import { currentUser } from "@/lib/auth/session";
import { liveFor } from "@/lib/ledger/home";
import { whatsOn } from "@/lib/sports";
import { clockOf } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

/**
 * What's on, the second root (docs/design.md 3.32, 6.1): the games ahead, one row each, to start with your own
 * friends. Most asked first, once ten groups are on a game; then the schedule by day, soonest first. Every row
 * says how much a game is being used and never what anyone thinks: no odds, no shares, nothing picked. New games
 * arrive silently and never badge the tab. Three sizes: 13, 15 and 17; no serif, since a game's name is a subject
 * line and not a question.
 */
export default async function WhatsOnPage() {
  const me = await currentUser();
  if (!me) redirect("/");
  const clock = await viewerClock();
  const now = new Date(clock.now);
  const [on, live] = await Promise.all([whatsOn(me, now, clock.zone), liveFor(me, now)]);
  const hue = hueFor(me.id);
  const row = (g: (typeof on.days)[number]["games"][number]) => rowData(g.game, clock.zone, g.asked, g.yours[0] ? { label: g.yours[0].label, groupId: g.yours[0].groupId } : null);
  const nothing = on.days.length === 0;
  return (
    <Screen root>
      <h1 className="pt-5 text-label text-ink-3">What’s on</h1>
      <div className="flex flex-col gap-7 py-4">
        {on.feed.failing ? <FeedFailed lastOk={on.feed.lastOkAt ? clockOf(on.feed.lastOkAt, clock.zone) : null} nothingSaved={nothing} /> : null}
        {nothing && !on.feed.failing ? (
          <div className="rounded-card border border-line bg-surface px-4 py-3.5">
            <p className="text-body-sm text-ink-2">Nothing on right now. Games show up here a few days before they start.</p>
          </div>
        ) : null}
        {on.mostAsked.length > 0 ? (
          <section className="flex flex-col gap-[10px]" data-most-asked="">
            <SectionLabel>Most asked</SectionLabel>
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {on.mostAsked.map((g, i) => (
                <GameRow key={g.game.id} game={row(g)} viewerHue={hue} divider={i > 0} />
              ))}
            </div>
          </section>
        ) : null}
        {on.days.map((day) => (
          <section key={day.label} className="flex flex-col gap-[10px]">
            <SectionLabel>{day.label}</SectionLabel>
            <div className="overflow-hidden rounded-card border border-line bg-surface">
              {day.games.map((g, i) => (
                <GameRow key={g.game.id} game={row(g)} viewerHue={hue} divider={i > 0} />
              ))}
            </div>
          </section>
        ))}
      </div>
      <TabBar active="/on" live={live} start />
    </Screen>
  );
}
