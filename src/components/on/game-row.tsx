import Link from "next/link";
import { TeamPair } from "@/components/ledger/team-stamp";
import { StateMark } from "@/components/ledger/state-mark";
import { LinkPending } from "@/components/ui/link-pending";
import type { Hue } from "@/lib/ui/hue";
import type { TeamFace } from "@/lib/ui/team";
import { serialiseShell } from "@/lib/ui/shell";

export type GameRowData = {
  id: string;
  name: string;
  away: TeamFace;
  home: TeamFace;
  /** "Sun 4:25pm", in the viewer's zone. */
  start: string;
  /** "Asked in 214 groups", once ten are on it; null below the floor (3.32). */
  asked: string | null;
  /** This viewer's own use, in place of both, with the you're-in mark, opening that group's page: the line as a sentence names the set (`onThisLine`), "You’re on this with the Friday crew". */
  yours: { line: string; groupId: string } | null;
};

/**
 * A game row (docs/design.md 3.32): the two 28px team stamps side by side, away first as in "Chiefs at Bills",
 * the game in `body` 600, and a meta line in `caption`: the start time, then the count once ten groups are on
 * it, or, in place of both, your own use after the you're-in mark. The whole row is the button, with a chevron;
 * What's on is browsed, and the move lives on the game page. The same row stands on an empty Now (3.14).
 */
export function GameRow({ game, viewerHue, divider = false }: { game: GameRowData; viewerHue: Hue; divider?: boolean }) {
  const href = game.yours ? `/on/${game.id}?g=${game.yours.groupId}` : `/on/${game.id}`;
  return (
    <Link prefetch={false} href={href} data-game-row={game.id} data-press="row" data-shell={serialiseShell({ kind: "game", id: game.id, href, name: game.name, start: game.start, away: game.away, home: game.home })} className={`press-row relative grid grid-cols-[60px_minmax(0,1fr)_18px] items-center gap-3 px-[14px] py-3 ${divider ? "border-t border-line" : ""}`}>
      <LinkPending />
      <TeamPair away={game.away} home={game.home} size={28} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-body-strong text-ink">{game.name}</span>
        <span className="flex items-center gap-1.5 text-caption text-ink-3">
          {game.yours ? (
            <>
              <StateMark state="in" hue={viewerHue} size={14} />
              <span className="truncate">{game.yours.line}</span>
            </>
          ) : (
            <span className="truncate">
              {game.start}
              {game.asked ? ` · ${game.asked}` : ""}
            </span>
          )}
        </span>
      </span>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-3">
        <path d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

/** "Sun 4:25pm": a game's start in the viewer's zone (3.32). */
export function startLabel(at: Date, zone: string): string {
  const day = at.toLocaleDateString("en-US", { timeZone: zone, weekday: "short" });
  const clock = at.toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
  return `${day} ${clock}`;
}

/** "Asked in 214 groups" (4.6: a count of use, never of belief). */
export const askedLabel = (n: number): string => `Asked in ${n} groups`;

/** A game row's data from a game row in the database and what the tab knows about it. */
export function rowData(g: { id: string; name: string; startsAt: Date; homeAbbr: string; homeShort: string; homeColor: string | null; awayAbbr: string; awayShort: string; awayColor: string | null }, zone: string, asked: number | null, yours: { line: string; groupId: string } | null): GameRowData {
  return { id: g.id, name: g.name, away: { abbr: g.awayAbbr, name: g.awayShort, color: g.awayColor }, home: { abbr: g.homeAbbr, name: g.homeShort, color: g.homeColor }, start: startLabel(g.startsAt, zone), asked: asked === null ? null : askedLabel(asked), yours };
}
