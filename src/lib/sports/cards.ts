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
import { inCount } from "@/lib/ui/copy";

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
  const count = inCount(input.inCount, input.groupSize);
  if (input.state === "draft") return { mark: "draft", text: "You never sent this one" };
  if (input.state === "open") return input.viewerIn ? { mark: "in", text: `${yourEntry(input)} · ${count}` } : { mark: "open", text: `Closes at kickoff · ${count}` };
  if (input.state === "locked") {
    if (input.votesCast === 0 && !input.proposed) return { mark: "locked", text: input.key === "first_drive" ? "Waiting on the play-by-play" : "Waiting on the final score" };
    // In voting: the mark and the clock (3.33), never a count beside it.
    return { mark: "voting", text: input.votingEnds ? `Voting ends ${input.votingEnds}` : input.key === "first_drive" ? "The play-by-play is in" : "The final score is in" };
  }
  if (input.state === "voided") {
    const why = input.feedEnding === "conflict" ? "results disagreed" : input.feedEnding === "tie" ? "a tie" : input.feedEnding === "drive_unknown" ? "no play-by-play" : input.resolvedBy === "arbitration" ? "unclear terms" : "nobody could tell";
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

/** A called-off question (the asker's swipe on Now, 3.15) never happened: it is on no game page, makes no set one of a game's, and blocks nothing from being asked again. */
export const calledOff = (d: { resolvedBy: string | null }): boolean => d.resolvedBy === "removed";

/** The questions one set is running on a game, from its rows in the menu's order and latest first within a question: one per question, the latest opened one, a draft only beside nothing opened for that key, and never one that was called off. */
export function onePerQuestion<T extends { dare: { creatorSignature: unknown; resolvedBy: string | null }; template: { key: string } }>(rows: T[]): T[] {
  const out: T[] = [];
  for (const r of rows) {
    if (calledOff(r.dare)) continue;
    const have = out.find((x) => x.template.key === r.template.key);
    if (!have) out.push(r);
    else if (!have.dare.creatorSignature && r.dare.creatorSignature) out[out.indexOf(have)] = r;
  }
  return out;
}

/** The sets with anything started on each game, most recent first, from the opened questions' rows: a set whose every question was called off is not on the game. */
export function setsOnGames(rows: Array<{ gameId: string; groupId: string; createdAt: Date; resolvedBy: string | null }>): Map<string, Array<{ groupId: string; lastAt: Date }>> {
  const out = new Map<string, Array<{ groupId: string; lastAt: Date }>>();
  for (const r of rows) {
    if (calledOff(r)) continue;
    const list = out.get(r.gameId) ?? [];
    const have = list.find((x) => x.groupId === r.groupId);
    if (!have) list.push({ groupId: r.groupId, lastAt: r.createdAt });
    else if (r.createdAt.getTime() > have.lastAt.getTime()) have.lastAt = r.createdAt;
    out.set(r.gameId, list);
  }
  for (const list of out.values()) list.sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
  return out;
}

/**
 * The who's-in row on a game page (docs/design.md 3.42, with the game as the unit): everyone in on any of its
 * questions, out of the set's seats so the count agrees with the cards under it. "Nobody’s in yet" before the
 * first entry, since a game's asker starts out in nothing; then 3.42's words. Share is the chalk while the viewer
 * started the game and nobody else is in.
 */
export function gameWhosIn(input: { /** Everyone in on any of the game's questions, by participant id. */ inIds: string[]; /** The set's seats. */ seats: number; viewerId: string; /** Who started the game: the asker of its first question. */ startedBy: string | null }): { count: string; chalk: boolean } {
  const n = new Set(input.inIds).size;
  const of = Math.max(input.seats, n);
  const nobodyElse = input.inIds.every((id) => id === input.viewerId);
  const count = n === 0 ? "Nobody’s in yet" : of > n ? `${n} of ${of} in` : nobodyElse ? "Just you so far" : `${n} of you in`;
  return { count, chalk: input.startedBy === input.viewerId && nobodyElse };
}
