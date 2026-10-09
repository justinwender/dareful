/**
 * The shape of a room code, with nothing that touches the database, so the browser and the server read a code
 * the same way. Six characters from A-Z and 2-9 without O, I and Z (docs/design.md 3.16): 31 characters that
 * survive being read aloud across a table in a dark room. (PLANNING.md named only O/0 and I/1; the design
 * specification is later and also drops Z, which is heard and read as 2.)
 */
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXY23456789";
export const CODE_LENGTH = 6;

const NUMBER_WORDS = ["none", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number) => NUMBER_WORDS[n] ?? String(n);

/** What someone typed, as a code would be written: uppercase, without the spaces and dashes people add. */
export function tidyCode(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-_.]/g, "");
}

/** The code, or what is wrong with its shape in words someone can act on (docs/design.md 5.1, "Voice"). */
export function readCode(raw: string): { code: string } | { problem: string } {
  const code = tidyCode(raw);
  if (code.length !== CODE_LENGTH) return { problem: `Codes are six characters. This one is ${count(code.length)}.` };
  const stray = Array.from(code).find((c) => !CODE_ALPHABET.includes(c));
  if (stray) return { problem: /[OIZ01]/.test(stray) ? `There's no ${stray === "0" ? "zero" : stray === "1" ? "one" : stray} in any code. Worth checking that character.` : "Codes are letters and numbers only." };
  return { code };
}

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
/** Where a pasted link goes: a question, a game's page (for a set, with a question open), or a claim. */
export type PastedLink = { kind: "market"; marketId: string } | { kind: "game"; gameId: string; groupId: string | null; questionId: string | null } | { kind: "claim"; token: string };

/**
 * A link someone pasted instead of a code: every link Dareful makes (the final round, section 4), a question's
 * (`/m/<id>`), a game's page (`/on/<game>` or `/on/<game>/<set>`, with `?q=` for the open question) and a claim's
 * (`/c/<token>`), with or without `https://`, with any query or fragment, and inside whatever the chat put around it (the
 * relay's sentence, a trailing full stop). Only the path is read, and the ids are checked against the database by the
 * action; the link is never fetched. Nothing else: a group is a set of people, never a place with a link of its own
 * (Round C). Pure.
 */
export function readPastedLink(raw: string): PastedLink | null {
  const text = raw.trim();
  const market = new RegExp(`(?:^|[\\s/])m/(${UUID})(?![0-9A-Za-z-])`).exec(text);
  if (market?.[1]) return { kind: "market", marketId: market[1].toLowerCase() };
  const game = new RegExp(`(?:^|[\\s/])on/(${UUID})(?:/(${UUID}))?(?![0-9A-Za-z-])`).exec(text);
  if (game?.[1]) {
    const rest = text.slice(game.index + game[0].length);
    const param = (name: string) => new RegExp(`^[^\\s]*?[?&]${name}=(${UUID})(?![0-9A-Za-z-])`).exec(rest)?.[1]?.toLowerCase() ?? null;
    return { kind: "game", gameId: game[1].toLowerCase(), groupId: game[2]?.toLowerCase() ?? param("g"), questionId: param("q") };
  }
  const claim = /(?:^|[\s/])c\/([A-Za-z0-9_-]{43})(?![A-Za-z0-9_-])/.exec(text);
  if (claim?.[1]) return { kind: "claim", token: claim[1] };
  return null;
}
