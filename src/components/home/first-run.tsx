import Link from "next/link";
import { RootHeader, Screen } from "@/components/ledger/screen";
import { CodeJoinCompact } from "@/components/home/code-join";
import { GameRow, type GameRowData } from "@/components/on/game-row";
import { ButtonLink } from "@/components/ui/button";
import { LinkPending } from "@/components/ui/link-pending";
import { TabBar } from "@/components/ui/tab-bar";
import type { Hue } from "@/lib/ui/hue";
import { OfflineBar } from "@/components/ui/offline-bar";

const STARTERS = ["Does John fall asleep during the movie?", "Does anyone actually show up on time Friday?", "Who gets to the bar first?"];

/**
 * Now, before anything (docs/design.md 3.14): the date, the serif-xl headline, the chalk "Ask something", the
 * compact code field (its six boxes, no line above them: the chalk and the boxes say it, 4.9), and three games from What's on as game rows under "Or start from something
 * everyone's watching", with a tertiary to the tab; the old starters return when nothing is listed. Start stays
 * hidden, because asking is already the chalk. One state of the root, in its own file so the type budget counts
 * it on its own (4.8): its serif 40 never sits beside the live screen's serif 17.
 */
export function FirstRun({ today, games = [], viewerHue = "stone" }: { today: string; games?: GameRowData[]; viewerHue?: Hue }) {
  return (
    <Screen root>
      <RootHeader info="now-first-run">
        <h2 className="text-label text-ink-3">{today}</h2>
      </RootHeader>
      <OfflineBar />
      <div className="flex flex-1 flex-col gap-7 py-6">
        <div className="flex flex-col gap-3">
          <h1 className="text-serif-xl text-ink">Nothing happens here until somebody else is in it.</h1>
        </div>
        <div className="flex flex-col gap-3">
          <ButtonLink prefetch href="/m/new" variant="primary">
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
            <Link prefetch={false} href="/on" className="relative self-start link-tertiary">
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
                  <Link prefetch={false} href={`/m/new?line=${encodeURIComponent(line)}`} className="relative flex min-h-14 items-center rounded-button bg-surface px-4 py-3 text-body-strong text-ink">
                    <LinkPending />
                    {line}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      <TabBar active="/" start={false} />
    </Screen>
  );
}
