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

/** A market link someone pasted instead: the market's id, or nothing. Only this app's own paths are read. */
export function readPastedLink(raw: string): { marketId: string } | { inviteToken: string } | null {
  const m = raw.trim().match(/(?:^|\/)(m|join)\/([A-Za-z0-9_-]{8,64})(?:[/?#]|$)/);
  if (!m || !m[2]) return null;
  if (m[1] === "join") return { inviteToken: m[2] };
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(m[2]) ? { marketId: m[2].toLowerCase() } : null;
}
