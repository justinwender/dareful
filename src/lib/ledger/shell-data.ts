import type { MarketCardData } from "./market-view";
import { askerLine } from "./groups";
import { bandClock } from "@/lib/ui/band";
import { firstName } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { markRefOf } from "@/lib/ui/mark";
import { shellSheet, type MarketShell } from "@/lib/ui/shell";
import type { MarketMark } from "@/components/ledger/state-mark";

/**
 * A market's shell from its card (docs/design.md 9.4): what a row on Now, a story card or a question card already
 * knows about the market it opens, so the screen's header, band and sheet can be drawn in the frame after the
 * tap. The clock's words are the band's own (`bandClock`); the asker line travels when the asker is among the
 * people the card names, and is held empty otherwise.
 */
export function shellOf(m: MarketCardData, viewerId: string, now: Date, zone: string): MarketShell {
  const d = m.dare;
  const state: MarketMark = m.state === "open" ? (m.viewerIn ? "in" : "open") : m.state === "locked" ? (m.votesCast > 0 ? "voting" : "locked") : m.state;
  const creator = m.people.find((p) => p.id === d.creatorId);
  const setName = m.groupName;
  // A set with no name is named by its people on the market's screen (4.7), which the card does not know in full: the line is held empty until it arrives, except between two people.
  const isDyad = m.groupSize === 2 && !setName;
  const known = creator && (setName || isDyad);
  const kind = m.pickOne ? "categorical" : m.unit ? "numeric" : "binary";
  return {
    kind: "market",
    id: d.id,
    ink: m.ink,
    mark: markRefOf(d),
    state,
    clock: bandClock({ state: m.state, resolvesBy: d.resolvesBy, resolvedAt: d.resolvedAt, resolvedBy: d.resolvedBy, votes: m.votesCast, now, zone }),
    question: d.title,
    asker: known ? { name: creator.name, hue: hueFor(creator.id), line: askerLine(creator.id === viewerId ? "You" : firstName(creator.name), setName, isDyad) } : null,
    sheet: shellSheet(state, m.viewerIn, kind),
  };
}
