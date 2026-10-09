import Link from "next/link";
import { IdeasTile } from "@/components/ideas/ideas-tile";
import { CodeJoinCompact } from "@/components/home/code-join";
import { GameRow, type GameRowData } from "@/components/on/game-row";
import { ButtonLink } from "@/components/ui/button";
import { LinkPending } from "@/components/ui/link-pending";
import type { Hue } from "@/lib/ui/hue";

const STARTERS = ["Does John fall asleep during the movie?", "Does anyone actually show up on time Friday?", "Who gets to the bar first?"];

/**
 * Now, before anything (docs/design.md 3.14): under the shell's date, the serif-xl headline, the chalk "Ask something", the
 * compact code field (its six boxes, no line above them: the chalk and the boxes say it, 4.9), and three games from What's on as game rows under "Or start from something
 * everyone's watching", with a tertiary to the tab; the old starters return when nothing is listed. Start stays
 * hidden, because asking is already the chalk: the shell hides it, and "Got a code?" with it, the moment this
 * arrives (`data-now`, 11.5). One state of the root, in its own file so the type budget counts it on its own
 * (4.8): its serif 40 never sits beside the live screen's serif 17.
 */
export function FirstRun({ games = [], viewerHue = "stone" }: { games?: GameRowData[]; viewerHue?: Hue }) {
  return (
    <div className="flex flex-1 flex-col gap-7 py-6">
      {/* An empty Now leads with the ideas tile (the final round, section 2: the owner's finding over 3.14, which had it last, under the games, where a phone never showed it). */}
      <IdeasTile />
      <div className="flex flex-col gap-3">
        <h1 className="text-serif-xl text-ink">Nothing happens here until somebody else is in it.</h1>
      </div>
      <div className="flex flex-col gap-3">
        <ButtonLink prefetch href="/m/new" variant="primary" data-ask-something="">
          Ask something
        </ButtonLink>
        <CodeJoinCompact label="Someone sent you a code?" />
      </div>
      {games.length > 0 ? (
        <section className="flex flex-col gap-[10px]" data-starter-games="">
          <h2 className="text-label text-ink-2">Or start from something everyone’s watching</h2>
          <div className="overflow-hidden rounded-card border border-line bg-surface">
            {games.map((g, i) => (
              <GameRow key={g.id} game={g} viewerHue={viewerHue} divider={i > 0} />
            ))}
          </div>
          <Link prefetch={false} href="/on" data-press="line" className="relative self-start link-tertiary press-line">
            <LinkPending />
            See everything on What’s on
          </Link>
        </section>
      ) : (
        <section className="flex flex-col gap-[10px]">
          <h2 className="text-label text-ink-2">Or start from one of these</h2>
          <ul className="flex flex-col gap-1.5">
            {STARTERS.map((line) => (
              <li key={line}>
                <Link prefetch={false} href={`/m/new?line=${encodeURIComponent(line)}`} data-press="row" className="press-row relative flex min-h-14 items-center rounded-button bg-surface px-4 py-3 text-body-strong text-ink">
                  <LinkPending />
                  {line}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
