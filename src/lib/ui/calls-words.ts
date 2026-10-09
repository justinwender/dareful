/**
 * The words of the stretch between the close and the vote (the games-and-the-reveal round, 2026-10-07; docs/design.md
 * 3.24 and 3.42, as the fifteenth session wrote them). Who has said calls are in is named and never counted, and the
 * names after "when" are the people who could close it, so nobody reads as late. Pure.
 */

const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve"];

const listWith = (names: string[], joiner: "and" | "or") => (names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} ${joiner} ${names[names.length - 1]}`);

/** The picture's heading from the close (3.22, 3.24, 3.31; the fifteenth session): who said what, no longer hidden, for everyone who can see it. */
export const WHO_SAID_WHAT = "Who said what";

/** What the sheet says when the market is stuck past its close (3.24, the field round's correction). */
export const STUCK_LINE = "Time’s up, and nothing closed it. Anyone in it can.";
/** What closing early costs, where nobody was named (3.24): every question goes to whoever it is sent to. */
export const LEAVES_OUT = "Whoever isn’t in yet can’t get in after.";
/** The stretch's one line while it waits for the thing to happen (3.24). */
export const WAITING_LINE = "Voting opens once it’s happened.";
/** The same on a question the final score answers (3.35): nothing to tap. */
export const WAITING_ON_SCORE = "The final score will propose what happened.";

/**
 * The close's line (3.24, 3.42): "Theo and Maya say calls are in. It closes when Gabe, John or you say so too.", and
 * "… when two of Gabe, John, Maya and you say so too." when it takes two. `said` are the first names of whoever has
 * said it, oldest first, with the viewer as "You" leading; `could` are the people in who have not, the viewer last as
 * "you"; `need` is how many more it takes. The asker closes it themselves, so their line says what that costs.
 */
export function callsLine(input: { said: string[]; could: string[]; need: number; asker: boolean }): string {
  const said = input.said.includes("You") ? ["You", ...input.said.filter((n) => n !== "You")] : input.said;
  const first = said.length === 0 ? "When enough of you say calls are in, it closes early." : `${listWith(said, "and")} ${said.length === 1 && said[0] !== "You" ? "says" : "say"} calls are in.`;
  if (input.asker) return said.length === 0 ? LEAVES_OUT : `${first} ${LEAVES_OUT}`;
  const could = input.could.includes("you") ? [...input.could.filter((n) => n !== "you"), "you"] : input.could;
  if (said.length === 0 || input.need <= 0 || could.length === 0) return first;
  // When it takes everyone left to say it, they are named together: "when Tam and Gabe say so too", never "two of Tam and Gabe".
  const who = input.need === 1 ? listWith(could, "or") : input.need >= could.length ? listWith(could, "and") : `${NUMBER_WORDS[input.need] ?? String(input.need)} of ${listWith(could, "and")}`;
  const verb = input.need === 1 && could[could.length - 1] !== "you" ? "says" : "say";
  return `${first} It closes when ${who} ${verb} so too.`;
}

/** "Maya says it's happened.": the caption under the ballot's heading when a person opened the vote (3.24). */
export function happenedCaption(name: string | null): string | null {
  return name ? `${name} ${name === "You" ? "say" : "says"} it’s happened.` : null;
}

/**
 * One cell of the roll call (3.6, calls are in): what a person said, as the cell's number, and on a game the side they
 * leaned to as its caption, since nothing has happened yet to be off from. A yes-or-no call is its percent; a lean
 * between two teams is the percent toward the side leaned to; a number is bare; a margin is how many it was by, under
 * the side. Even and a tie have no side. Pure.
 */
export function rollCallWords(input: { kind: "binary" | "numeric"; value: bigint; teams: { away: string; home: string } | null; margin: { shift: bigint; away: string; home: string } | null }): { said: string; side: string | null } {
  if (input.kind === "numeric") {
    if (!input.margin) return { said: input.value.toLocaleString("en-US"), side: null };
    const signed = input.value - input.margin.shift;
    const by = signed < 0n ? -signed : signed;
    return { said: by.toLocaleString("en-US"), side: signed === 0n ? null : signed > 0n ? input.margin.home : input.margin.away };
  }
  const percent = Math.round(Number(input.value) / 100);
  if (!input.teams) return { said: `${percent}%`, side: null };
  if (percent === 50) return { said: "50%", side: null };
  return percent > 50 ? { said: `${percent}%`, side: input.teams.home } : { said: `${100 - percent}%`, side: input.teams.away };
}

/** Who agrees with the app's ruling (3.24 as amended 2026-10-08): "Dave agrees.", "Dave and you agree.", named and never counted. */
export function agreedWords(people: ReadonlyArray<{ name: string; me: boolean }>): string {
  if (people.length === 0) return "";
  const names = [...people.filter((p) => !p.me).map((p) => p.name), ...(people.some((p) => p.me) ? ["you"] : [])];
  const verb = names.length === 1 && names[0] !== "you" ? "agrees" : "agree";
  return `${listWith(names, "and").replace(/^you/, "You")} ${verb}.`;
}
