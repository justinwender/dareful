/**
 * The game page's cards (docs/design.md 3.33): one per question the group is running, collapsed to the question
 * and where it stands, with no numbers until you are in. The meta line per state is a rule, so it has tests. The
 * words never say odds, a price or a share: your own entry, the count, the clock, the outcome in the market's
 * words, and who was closest.
 */
import type { MarketMark } from "@/components/ledger/state-mark";
import { unitPhrase } from "@/lib/ledger/number-axis";
import { leanPill } from "@/lib/ui/team";
import type { FeedEnding } from "./results";
import type { TemplateKey } from "./templates";

export type CardInput = {
  key: TemplateKey;
  state: "draft" | "open" | "locked" | "resolved" | "voided" | "expired";
  viewerIn: boolean;
  /** This viewer's own value, as stored: basis points, the shifted margin, the total, or the answer's index. */
  mine: bigint | null;
  inCount: number;
  groupSize: number;
  votesCast: number;
  /** Whether the feed's proposal is on the ballot (3.35). */
  proposed: boolean;
  voted: boolean;
  teams: { away: string; home: string } | null;
  unit: { singular: string; plural: string; margin?: { shift: string; home: string; away: string } | null } | null;
  answers: string[] | null;
  /** The outcome in the market's words once settled ("The Bills won", "Bills by 7", "41", "Field goal"), or null. */
  outcomeWords: string | null;
  feedEnding: FeedEnding | null;
  resolvedBy: string | null;
  /** Who was closest, or who called it on a pick-one question: "You" or a first name; null when nobody scored. */
  closest: { name: string; off: string | null } | null;
  /** "Voting ends Mon 7:45pm", when the backstop's moment is known. */
  votingEnds: string | null;
};

export type CardMeta = { mark: MarketMark; text: string };

/** "You're in at Bills 70%", "You're in: Field goal", "You're in at Bills by 7", "You're in at 41". */
export function yourEntry(input: Pick<CardInput, "key" | "mine" | "teams" | "unit" | "answers">): string {
  if (input.mine === null) return "You’re in";
  if (input.key === "first_drive" && input.answers) return `You’re in: ${input.answers[Number(input.mine)] ?? "?"}`;
  if (input.key === "home_wins" && input.teams) return `You’re in at ${leanPill(Number(input.mine) / 100, input.teams.away, input.teams.home)}`;
  if (input.unit) return `You’re in at ${unitPhrase(input.mine, input.unit)}`;
  return `You’re in at ${Number(input.mine) / 100}%`;
}

/** The meta line under a card, by state (3.33), and the mark that heads it (3.23). */
export function cardMeta(input: CardInput): CardMeta {
  const count = `${input.inCount} of ${input.groupSize} in`;
  if (input.state === "draft") return { mark: "draft", text: "You never sent this one" };
  if (input.state === "open") return input.viewerIn ? { mark: "in", text: `${yourEntry(input)} · ${count}` } : { mark: "open", text: `Closes at kickoff · ${count}` };
  if (input.state === "locked") {
    if (input.votesCast === 0 && !input.proposed) return { mark: "locked", text: input.key === "first_drive" ? "Waiting on the play-by-play" : "Waiting on the final score" };
    const called = input.votesCast === 0 ? (input.key === "first_drive" ? "The play-by-play is in" : "The final score is in") : `${input.votesCast} of ${input.groupSize} have called it`;
    return { mark: "voting", text: input.votingEnds ? `${called} · voting ends ${input.votingEnds}` : called };
  }
  if (input.state === "voided") {
    const why = input.feedEnding === "conflict" ? "results disagreed" : input.feedEnding === "tie" ? "a tie" : input.feedEnding === "drive_unknown" ? "no play-by-play" : input.resolvedBy === "arbitration" ? "the terms didn’t decide it" : "nobody could tell";
    return { mark: "voided", text: `Void · ${why}` };
  }
  if (input.state === "expired") return { mark: "expired", text: "Never settled" };
  const words = input.outcomeWords ?? "Decided";
  const you = input.closest?.name === "You";
  const line =
    input.closest === null
      ? null
      : input.key === "first_drive"
        ? `${you ? "you" : input.closest.name} called it`
        : input.closest.off !== null && (input.key === "total" || input.key === "margin")
          ? `${you ? "you were" : `${input.closest.name} was`} off by ${input.closest.off}`
          : `${you ? "you were" : `${input.closest.name} was`} closest`;
  return { mark: "resolved", text: line ? `${words} · ${line}` : words };
}

/** Where the 12px dot sits on a card's line (3.33), 0 to 1: the home side's chance, or the signed margin across the sport's reach. */
export function lineT(input: { key: TemplateKey; value: bigint; shift: bigint | null; reach: number }): number {
  if (input.key === "home_wins") return Math.min(1, Math.max(0, Number(input.value) / 10_000));
  const signed = Number(input.value - (input.shift ?? 0n));
  return Math.min(1, Math.max(0, (signed + input.reach) / (2 * input.reach)));
}
