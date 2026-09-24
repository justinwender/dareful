/**
 * Where "back" lands (docs/design.md 6.4): on the root this person came from, and never further. The app is
 * installed with no browser chrome, so nothing may depend on a browser history, and a remembered address is
 * followed only when it is one of the three roots: anything else would let a stored string steer the next tap.
 */
export const ROOTS = ["/", "/people", "/you"] as const;
export type RootPath = (typeof ROOTS)[number];
export const ROOT_KEY = "dareful.root";

export function rootFor(remembered: string | null | undefined): RootPath {
  return (ROOTS as readonly string[]).includes(remembered ?? "") ? (remembered as RootPath) : "/";
}
