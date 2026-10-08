import type { MarketCardData } from "./market-view";
import { askerLine } from "./groups";
import { bandClock } from "@/lib/ui/band";
import { hueFor } from "@/lib/ui/hue";
import { markRefOf } from "@/lib/ui/mark";
import { shellSheet, type MarketShell } from "@/lib/ui/shell";
import type { MarketMark } from "@/components/ledger/state-mark";

/**
 * A market's shell from its card (docs/design.md 9.4): what a row on Now, a story card or a question card already
 * knows about the market it opens, so the screen's header, band and sheet can be drawn in the frame after the
 * tap. The clock's words are the band's own (`bandClock`), and the asker line is the screen's own (`askerLine`
 * over the set's facts, never the chip's label a card may carry in `groupName`), so the shell says the words the
 * screen will say; it is held empty when the card does not know who asked.
 */
export function shellOf(m: MarketCardData, viewerId: string, now: Date, zone: string): MarketShell {
  const d = m.dare;
  // Closed: the calls-are-in mark until it has happened, then in voting (the games-and-the-reveal round; 3.23).
  const state: MarketMark = m.state === "open" ? (m.viewerIn ? "in" : "open") : m.state === "locked" ? (m.votingOpen || m.votesCast > 0 ? "voting" : "locked") : m.state;
  // Who asked: among the people in it, or, since a game's asker starts out in nothing, among the set's seats.
  const creator = m.people.find((p) => p.id === d.creatorId) ?? ((seat) => (seat ? { id: seat.id, name: seat.displayName } : undefined))(m.set.members.find((p) => p.id === d.creatorId));
  const kind = m.pickOne ? "categorical" : m.unit ? "numeric" : "binary";
  return {
    kind: "market",
    id: d.id,
    ink: m.ink,
    mark: markRefOf(d),
    state,
    clock: bandClock({ state: m.state, resolvesBy: d.resolvesBy, resolvedAt: d.resolvedAt, resolvedBy: d.resolvedBy, votes: m.votesCast, now, zone, votingOpen: m.votingOpen, firstCall: d.closesAfterFirst }),
    question: d.title,
    asker: creator ? { name: creator.name, hue: hueFor(creator.id), line: askerLine({ id: creator.id, displayName: creator.name }, m.set, viewerId) } : null,
    sheet: shellSheet(state, m.viewerIn, kind),
  };
}
