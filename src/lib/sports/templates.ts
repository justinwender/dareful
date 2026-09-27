/**
 * The questions What's on writes for a game (docs/design.md 3.32, 3.33, 3.35, 3.40; docs/decisions.md, public
 * markets and the game page). A fixed menu per sport, pure, so the wording and the scales have tests: who wins,
 * the margin, the total, and the first drive where the league's play-by-play is reliably published (the NFL
 * regular season). Every question closes when the game starts. The terms say in plain words what everyone
 * consents to at entry: the final score decides, overtime included, and if nobody votes, the final score settles
 * it. Nothing here says "official", and nothing anywhere says "spread".
 */
import type { Unit } from "@/lib/ledger/markets";
import { DRIVE_ANSWERS, type FeedGame, type Sport } from "./types";

export type TemplateKey = "home_wins" | "margin" | "total" | "first_drive";
export type MarketKind = "binary" | "numeric" | "categorical";

export type Template = {
  key: TemplateKey;
  kind: MarketKind;
  /** The menu row's short name (3.33): "Who wins", "By how much", "Total points", "The Bills' first drive". */
  name: string;
  /** What kind it is, for the menu row's caption. */
  kindLabel: string;
  title: string;
  terms: string;
  /** The terms as the terms step shows them (3.38): the counting rule, the tie rule where the sport can tie, and the backstop. */
  rows: { countsIf: string; tie: string | null; unclear: string };
  /** The unit for a number question, the answers for a pick-one question, ['no', 'yes'] otherwise. */
  outcomeLabels: string[];
  range: bigint | null;
  typical: bigint | null;
  /** The signed margin's offset: added before storing, taken off for display; half the scale. */
  shift: bigint | null;
  /** Whether the final score answers it (the source card, 3.35). */
  decidedByScore: boolean;
  /** Whether the feed proposes and settles it at all: the score's questions, and the first drive from the play-by-play. */
  decidedByFeed: boolean;
  outcomeWords: [string, string, string, string] | null;
  sort: number;
};

/** What a score counts, per sport. */
export const UNIT: Record<Sport, Unit> = { nfl: { singular: "point", plural: "points" }, mlb: { singular: "run", plural: "runs" }, nba: { singular: "point", plural: "points" }, nhl: { singular: "goal", plural: "goals" } };

/**
 * The scoring scales, per sport (a scale is a scoring rule: off by the whole scale scores nothing). The total's
 * scale is about the range of totals a season shows (a touchdown and a field goal either side of an NFL total);
 * the margin's is about two typical margins, centred on a tie, with the field taking as far as half of it below
 * zero. Chosen here, logged in docs/decisions.md, and never derived from entries.
 */
export const SCALES: Record<Sport, { total: bigint; totalTypical: bigint; margin: bigint }> = {
  nfl: { total: 28n, totalTypical: 45n, margin: 28n },
  mlb: { total: 10n, totalTypical: 9n, margin: 8n },
  nba: { total: 40n, totalTypical: 225n, margin: 26n },
  nhl: { total: 6n, totalTypical: 6n, margin: 6n },
};

/** How far the margin's slider reaches either way before the number is typed (docs/design.md 3.40): the sport's usual range. */
export const SLIDER_REACH: Record<Sport, number> = { nfl: 35, mlb: 8, nba: 30, nhl: 5 };

/** How long a game usually runs, from its start: when the tick begins looking for a final. */
export const DURATION_MS: Record<Sport, number> = { nfl: 3.25 * 3_600_000, mlb: 3 * 3_600_000, nba: 2.5 * 3_600_000, nhl: 2.75 * 3_600_000 };
export const expectedEnd = (sport: Sport, startsAt: Date): Date => new Date(startsAt.getTime() + DURATION_MS[sport]);

/** Half the margin's scale: the offset a signed margin is stored under. */
export const marginShift = (sport: Sport): bigint => SCALES[sport].margin / 2n;

/** What the sport calls its game's end, for the terms. */
const OVERTIME: Record<Sport, string> = { nfl: "overtime included", mlb: "extra innings included", nba: "overtime included", nhl: "overtime and the shootout included" };
/** Whether the sport's games can end level (the NFL's regular season can; the others play on). */
export const CAN_TIE: Record<Sport, boolean> = { nfl: true, mlb: false, nba: false, nhl: false };
/** The feed's regular season, where the first drive is offered: coverage is by league and season, never by a flag read off a finished game. */
export const REGULAR_SEASON = 2;

const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);
/** The consent every entry gives (docs/design.md 3.35, 4.9), in the words the entry sheet shows above the button. */
export const CONSENT = "If nobody votes, the final score settles it.";
const BY_SCORE = `${CONSENT} If the two results we check disagree, it's void: nothing changes hands, and it counts against nobody. If the game is postponed or called off, this one can't be settled and nothing changes hands.`;
/** The details' "If it's unclear" row on a question the score answers (3.35). */
export const UNCLEAR_BY_SCORE = "The final score. If the two results we check disagree, it's void.";
/** The first drive's consent: the play-by-play settles it, on one source, three days on (docs/decisions.md, the game page). */
export const DRIVE_CONSENT = "If nobody votes, the play-by-play settles it.";
/** The one line on a game's terms step when the first drive is among the questions (3.33, 3.35): true for every question on the page. */
export const BOTH_CONSENT = "If nobody votes, the final score settles the others and the play-by-play settles the first drive.";
/**
 * The consent line for a set of questions started together (docs/decisions.md 2026-09-27): the score's for
 * questions the score settles, the play-by-play's for the first drive alone, and one sentence saying both when
 * the first drive is among them, since the line the backstop rests on has to be true for every question it
 * stands above. Nothing chosen reads as the score's, the common case, with the button disabled anyway.
 */
export function consentFor(keys: readonly TemplateKey[]): string {
  const drive = keys.includes("first_drive");
  const score = keys.some((k) => k !== "first_drive");
  return drive && score ? BOTH_CONSENT : drive ? DRIVE_CONSENT : CONSENT;
}
export const UNCLEAR_BY_PLAYS = "The play-by-play. If it can't say how the first drive ended, it's void.";
/** A tie on a question the contract cannot score at the middle (3.40, frame 5): void, and against nobody. */
export const TIE_VOID = "It's void.";

/** Whether the first drive is offered for a game: the NFL regular season, where the play-by-play is reliably published. */
export function offersFirstDrive(game: Pick<FeedGame, "sport" | "seasonType">): boolean {
  return game.sport === "nfl" && game.seasonType === REGULAR_SEASON;
}

/** The questions for one game, in the menu's order (3.33). */
export function templatesFor(game: { sport: Sport; home: Pick<FeedGame["home"], "short">; away: Pick<FeedGame["away"], "short">; seasonType: number | null }): Template[] {
  const { sport } = game;
  const home = game.home.short;
  const away = game.away.short;
  const unit = UNIT[sport];
  const scales = SCALES[sport];
  const tieRow = CAN_TIE[sport] ? TIE_VOID : null;
  const tie = CAN_TIE[sport] ? " If it ends in a tie, it's void: nothing changes hands, and it counts against nobody." : "";
  const winsCounts = `The team with more ${unit.plural} when the game ends, ${OVERTIME[sport]}.`;
  const marginCounts = `${cap(unit.plural)} for the ${home} minus ${unit.plural} for the ${away} on the final score, ${OVERTIME[sport]}: the ${home} by 7 is 7, the ${away} by 3 is 3 the other way, a tie is 0. Scored on how close you land.`;
  const totalCounts = `Both teams' ${unit.plural} added together on the final score, ${OVERTIME[sport]}. Scored on how close you land.`;
  const out: Template[] = [
    {
      key: "home_wins",
      kind: "binary",
      name: "Who wins",
      kindLabel: "Between the two teams",
      title: `Who wins, ${away} or ${home}?`,
      // No possessive of a team's name anywhere: mostly plural ("the Giants'") and sometimes not ("the Heat's"), and a real session read "the Giants's".
      terms: `${winsCounts} Yes if the ${home} win, no if the ${away} win.${tie} ${BY_SCORE}`,
      rows: { countsIf: `${winsCounts} Yes if the ${home} win, no if the ${away} win.`, tie: tieRow, unclear: UNCLEAR_BY_SCORE },
      outcomeLabels: ["no", "yes"],
      range: null,
      typical: null,
      shift: null,
      decidedByScore: true,
      decidedByFeed: true,
      outcomeWords: [`The ${home} won`, `The ${away} won`, `The ${home} won.`, `The ${away} won.`],
      sort: 0,
    },
    {
      key: "margin",
      kind: "numeric",
      name: "By how much",
      kindLabel: "The margin, between the two teams",
      title: `By how much, ${away} or ${home}?`,
      terms: `${marginCounts} ${BY_SCORE}`,
      rows: { countsIf: marginCounts, tie: null, unclear: UNCLEAR_BY_SCORE },
      outcomeLabels: [unit.singular, unit.plural],
      range: scales.margin,
      typical: null,
      shift: marginShift(sport),
      decidedByScore: true,
      decidedByFeed: true,
      outcomeWords: null,
      sort: 1,
    },
    {
      key: "total",
      kind: "numeric",
      name: `Total ${unit.plural}`,
      kindLabel: "A number",
      title: `How many ${unit.plural}, ${away} and ${home} together?`,
      terms: `${totalCounts} ${BY_SCORE}`,
      rows: { countsIf: totalCounts, tie: null, unclear: UNCLEAR_BY_SCORE },
      outcomeLabels: [unit.singular, unit.plural],
      range: scales.total,
      typical: scales.totalTypical,
      shift: null,
      decidedByScore: true,
      decidedByFeed: true,
      outcomeWords: null,
      sort: 2,
    },
  ];
  if (offersFirstDrive(game)) {
    const driveCounts = "The first possession of the game, whichever team has it, as the play-by-play records it. An interception or a fumble is a turnover. A missed field goal, a turnover on downs, a safety or the end of the half counts as Something else.";
    out.push({
      key: "first_drive",
      kind: "categorical",
      name: "The first drive",
      kindLabel: "Pick one",
      title: `${away} at ${home}: how does the first drive end?`,
      terms: `${driveCounts} ${DRIVE_CONSENT} If the play-by-play can't say how it ended, it's void: nothing changes hands, and it counts against nobody. If the game is postponed or called off, this one can't be settled and nothing changes hands.`,
      rows: { countsIf: driveCounts, tie: null, unclear: UNCLEAR_BY_PLAYS },
      outcomeLabels: [...DRIVE_ANSWERS],
      range: null,
      typical: null,
      shift: null,
      decidedByScore: false,
      decidedByFeed: true,
      outcomeWords: null,
      sort: 3,
    });
  }
  return out;
}

/** "Titans at Giants": the away side first. */
export const gameName = (game: { home: Pick<FeedGame["home"], "short">; away: Pick<FeedGame["away"], "short"> }): string => `${game.away.short} at ${game.home.short}`;

/** The mark a sport's questions wear, from the emoji ink table (football and basketball Clay, hockey Ochre, baseball hashes). */
export const SPORT_MARK: Record<Sport, string> = { nfl: "🏈", mlb: "⚾", nba: "🏀", nhl: "🏒" };
