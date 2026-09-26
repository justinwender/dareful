/**
 * The questions What's on writes for a game (docs/design.md 3.32, 3.33; docs/decisions.md, public markets). A
 * fixed set per sport, pure, so the wording and the scales have tests: who wins, the margin, the total, and the
 * first drive where the scoreboard reports play-by-play. Every question closes when the game starts. The terms say
 * in plain words what everyone consents to at entry: the final score decides, overtime included, and if nobody
 * votes, the final score decides. Nothing here says "official", and nothing anywhere says "spread".
 */
import type { Unit } from "@/lib/ledger/markets";
import type { FeedGame, Sport } from "./types";

export type TemplateKey = "home_wins" | "margin" | "total" | "first_drive";
export type MarketKind = "binary" | "numeric" | "categorical";

export type Template = {
  key: TemplateKey;
  kind: MarketKind;
  title: string;
  terms: string;
  /** The unit for a number question, the answers for a pick-one question, ['no', 'yes'] otherwise. */
  outcomeLabels: string[];
  range: bigint | null;
  typical: bigint | null;
  /** The signed margin's offset: added before storing, taken off for display; half the scale. */
  shift: bigint | null;
  decidedByScore: boolean;
  outcomeWords: [string, string, string, string] | null;
  sort: number;
};

/** What a score counts, per sport. */
export const UNIT: Record<Sport, Unit> = { nfl: { singular: "point", plural: "points" }, mlb: { singular: "run", plural: "runs" }, nba: { singular: "point", plural: "points" }, nhl: { singular: "goal", plural: "goals" } };

/**
 * The scoring scales, per sport (a scale is a scoring rule: off by the whole scale scores nothing). The total's
 * scale is about the spread of totals a season shows (a touchdown and a field goal either side of an NFL total);
 * the margin's is about two typical margins, centred on zero, with the field taking as far as half of it below
 * zero. Chosen here, logged in docs/decisions.md, and never derived from entries.
 */
export const SCALES: Record<Sport, { total: bigint; totalTypical: bigint; margin: bigint }> = {
  nfl: { total: 28n, totalTypical: 45n, margin: 28n },
  mlb: { total: 10n, totalTypical: 9n, margin: 8n },
  nba: { total: 40n, totalTypical: 225n, margin: 26n },
  nhl: { total: 6n, totalTypical: 6n, margin: 6n },
};

/** How long a game usually runs, from its start: when the tick begins looking for a final. */
export const DURATION_MS: Record<Sport, number> = { nfl: 3.25 * 3_600_000, mlb: 3 * 3_600_000, nba: 2.5 * 3_600_000, nhl: 2.75 * 3_600_000 };
export const expectedEnd = (sport: Sport, startsAt: Date): Date => new Date(startsAt.getTime() + DURATION_MS[sport]);

/** Half the margin's scale: the offset a signed margin is stored under. */
export const marginShift = (sport: Sport): bigint => SCALES[sport].margin / 2n;

/** What the sport calls its game's end, for the terms. */
const OVERTIME: Record<Sport, string> = { nfl: "overtime included", mlb: "extra innings included", nba: "overtime included", nhl: "overtime and the shootout included" };
/** Whether the sport's games can end level (the NFL's regular season can; the others play on). */
const CAN_TIE: Record<Sport, boolean> = { nfl: true, mlb: false, nba: false, nhl: false };

const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1);
const BY_SCORE = "If nobody votes, the final score decides. If the game is postponed or called off, this one can't be settled and nothing changes hands.";

/** The questions for one game, in the curators' order. */
export function templatesFor(game: Pick<FeedGame, "sport" | "home" | "away" | "playByPlay">): Template[] {
  const { sport } = game;
  const home = game.home.short;
  const away = game.away.short;
  const unit = UNIT[sport];
  const scales = SCALES[sport];
  const tie = CAN_TIE[sport] ? " If it ends in a tie, this one is called off and nothing changes hands." : "";
  const out: Template[] = [
    {
      key: "home_wins",
      kind: "binary",
      title: `Who wins, ${away} or ${home}?`,
      terms: `Yes if the ${home} win, no if the ${away} win, on the final score, ${OVERTIME[sport]}.${tie} ${BY_SCORE}`,
      outcomeLabels: ["no", "yes"],
      range: null,
      typical: null,
      shift: null,
      decidedByScore: true,
      outcomeWords: [`The ${home} won`, `The ${away} won`, `The ${home} won.`, `The ${away} won.`],
      sort: 0,
    },
    {
      key: "margin",
      kind: "numeric",
      title: `${away} at ${home}: by how much?`,
      // No possessive: a team's name is mostly plural ("the Giants'") and sometimes not ("the Heat's"), and the real session read "the Giants's".
      terms: `${cap(unit.plural)} for the ${home} minus ${unit.plural} for the ${away} on the final score, ${OVERTIME[sport]}: the ${home} by 7 is 7, the ${away} by 3 is 3 the other way, level is 0. Scored on how close you land. ${BY_SCORE}`,
      outcomeLabels: [unit.singular, unit.plural],
      range: scales.margin,
      typical: null,
      shift: marginShift(sport),
      decidedByScore: true,
      outcomeWords: null,
      sort: 1,
    },
    {
      key: "total",
      kind: "numeric",
      title: `${away} at ${home}: how many ${unit.plural} in all?`,
      terms: `Both teams' ${unit.plural} added together on the final score, ${OVERTIME[sport]}. Scored on how close you land. ${BY_SCORE}`,
      outcomeLabels: [unit.singular, unit.plural],
      range: scales.total,
      typical: scales.totalTypical,
      shift: null,
      decidedByScore: true,
      outcomeWords: null,
      sort: 2,
    },
  ];
  if (sport === "nfl" && game.playByPlay)
    out.push({
      key: "first_drive",
      kind: "categorical",
      title: `${away} at ${home}: how does the first drive end?`,
      terms: `The first possession of the game, whichever team has it. A missed field goal, a turnover on downs, a safety or the end of the half counts as Something else. Decided by the people in it, and if nobody can agree, the tiebreaker everyone agreed to calls it.`,
      outcomeLabels: ["Touchdown", "Field goal", "Punt", "Turnover", "Something else"],
      range: null,
      typical: null,
      shift: null,
      decidedByScore: false,
      outcomeWords: null,
      sort: 3,
    });
  return out;
}

/** "Titans at Giants": the away side first. */
export const gameName = (game: Pick<FeedGame, "home" | "away">): string => `${game.away.short} at ${game.home.short}`;

/** The mark a sport's questions wear, from the emoji ink table (football and basketball Clay, hockey Ochre, baseball hashes). */
export const SPORT_MARK: Record<Sport, string> = { nfl: "🏈", mlb: "⚾", nba: "🏀", nhl: "🏒" };
