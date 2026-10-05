import { FirstRun } from "@/components/home/first-run";
import { JustHappened } from "@/components/home/just-happened";
import { NeedsYou } from "@/components/home/needs-you";
import { NowKnown } from "@/components/home/now-arriving";
import { Running } from "@/components/home/running";
import { ReachCard } from "@/components/home/reach-card";
import { IdeasTile } from "@/components/ideas/ideas-tile";
import { ideasOnNow } from "@/lib/ideas";
import { owesReachCard } from "@/lib/ledger/reach";
import { SignedOutBody } from "@/components/home/signed-out";
import { rowData } from "@/components/on/game-row";
import { currentUser } from "@/lib/auth/session";
import { nowFor } from "@/lib/ledger/home";
import { starterGames } from "@/lib/sports";
import { closesLabel } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import type { ViewerClock } from "@/lib/ui/zone";

/**
 * Now's content (docs/design.md 4.7, 6.1), which arrives into the shell (11.5): three sections in a fixed order
 * and nothing above or between them, each gone when it is empty, and nothing here counts, badges or ages. A claim
 * to accept and a cover to confirm are Needs you rows, never sections of their own. Before anything, it is first
 * run (3.14). What it turned out to be is said on its root (`data-now`), which is what the shell's + and "Got a
 * code?" answer to.
 */
export async function NowContent({ clock, showAll }: { clock: ViewerClock; showAll: boolean }) {
  const user = await currentUser();
  // A cookie that was good and an account that is gone: the shell was drawn for someone signed in, and the content says otherwise.
  if (!user)
    return (
      <div data-now="out" className="flex flex-1 flex-col">
        <SignedOutBody />
      </div>
    );
  const now = new Date(clock.now);
  const [home, owesCard] = await Promise.all([nowFor(user, { now, closes: (at) => closesLabel(at, now, clock.zone), zone: clock.zone }), owesReachCard(user.id)]);
  if (!home.hasAnything)
    return (
      <div data-now="empty" className="flex flex-1 flex-col">
        <NowKnown state="empty" />
        <FirstRun games={(await starterGames(now)).map((g) => rowData(g, clock.zone, null, null))} viewerHue={hueFor(user.id)} />
      </div>
    );
  return (
    <div data-now="full" className="flex flex-col gap-7 py-4">
      <NowKnown state="full" />
      {/* The one card for an account the app cannot reach (the first-contact round, 2026-10-04; 4.7 as amended): above the sections, once. */}
      {owesCard ? <ReachCard /> : null}
      <NeedsYou rows={home.needs} viewer={user} showAll={showAll} allHref="/?all=1" />

      <Running rows={home.running} viewerId={user.id} />

      <JustHappened rows={home.happened} viewerId={user.id} clock={clock} />
      {/* Ideas, last, while fewer than three questions are running for this person (3.47, 3.14). */}
      {ideasOnNow(home.running.length) ? <IdeasTile /> : null}
    </div>
  );
}
