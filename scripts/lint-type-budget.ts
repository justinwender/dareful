/**
 * The style budget (docs/design.md 1.2, 4.8) as a rule that fails the build, because a rule that lives in review
 * does not survive the next several phases.
 *
 * The count is of sizes, not tokens. A size is a family at a pixel size (Hanken 13, Hanken 17, Young Serif 26),
 * and weight is free inside it, the way `body` has always carried 400 and 600: `label` and `caption` are one
 * size, `body-sm` and `numeral` 15 are one size. A screen uses at most four sizes, at most one of them serif,
 * and at most two weights at any one size, 400 and 600. Nothing references a token from the first design or a
 * literal pixel size outside the control components. A screen is a page file plus everything it imports under
 * src/, transitively, because a screen is composed of components and the budget belongs to the screen. Counting
 * references in markup over-approximates a screen that renders several states, which is what the specification
 * asks for: it reads "run it per state, since a raised sheet adds its own text".
 *
 * Not counted: text inside a control (a button, a form field or its label, a chip, the odds line's riding
 * percent, the code boxes), and text inside an obligation token. A token is on a control when the JSX element
 * whose attributes carry it is one of those, carries `data-type-exempt` (4.8's own marker, for a control that is
 * not a form element: the code boxes), or when the file is one of the control components. A class held in a
 * variable outside any element cannot be placed, so it counts. A weight utility (`font-bold`) counts only when it
 * sits in the same string literal as the size it changes.
 *
 *   npm run lint:type            the rule
 *   npm run lint:type -- --explain   every reference on every screen, with its size, weight and element
 */
import { CUT_PHRASES } from "../src/lib/ui/copy-rules";
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

const ROOT = resolve(process.env.TYPE_BUDGET_ROOT ?? process.cwd());
const SRC = join(ROOT, "src");
/**
 * The screens over the budget on the day a rule arrived, with their counts. The rule holds every screen to the
 * budget, or to its baseline where it has one, so the build fails the moment any screen gets worse and passes
 * once it is burned down. `--write-baseline` rewrites it from the current counts. Since the count moved from
 * tokens to sizes (2026-09-25) no built screen needs one, and the file is absent.
 */
const BASELINE = join(ROOT, "scripts", "type-budget.baseline.json");
type Baseline = Record<string, { sizes: number; serifs: number }>;
const baseline: Baseline = existsSync(BASELINE)
  ? (JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline)
  : {};
const writing = process.argv.includes("--write-baseline");
const current: Baseline = {};

/** The nine tokens, each a family at a size with a weight of its own (1.2). */
const SIZE: Record<string, { size: string; weight: number }> = {
  "serif-xl": { size: "serif 40", weight: 400 },
  "serif-l": { size: "serif 26", weight: 400 },
  "serif-m": { size: "serif 17", weight: 400 },
  "numeral-hero": { size: "serif 60", weight: 400 },
  numeral: { size: "hanken 20", weight: 600 },
  "numeral-sm": { size: "hanken 15", weight: 600 },
  body: { size: "hanken 17", weight: 400 },
  "body-strong": { size: "hanken 17", weight: 600 },
  "body-sm": { size: "hanken 15", weight: 400 },
  label: { size: "hanken 13", weight: 600 },
  caption: { size: "hanken 13", weight: 400 },
};
const TOKEN =
  /\btext-(serif-xl|serif-l|serif-m|numeral-hero|numeral-sm|numeral|body-strong|body-sm|body|label|caption)\b/g;
const LEGACY =
  /\btext-(display-xl|display|question-lg|question|card-question-sm|card-question|outcome-sm|outcome|body-sm-prose)\b/g;
const LITERAL = /\btext-\[\d+px\]/g;
const WEIGHT_UTILITY =
  /\bfont-(thin|extralight|light|normal|medium|semibold|bold|extrabold|black)\b/;
const WEIGHT: Record<string, number> = {
  thin: 100,
  extralight: 200,
  light: 300,
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
  black: 900,
};
const ALLOWED_WEIGHTS = new Set([400, 600]);

/**
 * Control components and the obligation token: their text does not count (1.2, 4.8), and they may size
 * themselves literally.
 */
const CONTROLS = new Set([
  "src/components/ui/button.tsx",
  "src/components/ledger/chip.tsx",
  "src/components/ui/tab-bar.tsx",
  "src/lib/ui/share-card.tsx",
  "src/components/markets/odds-line.tsx",
  "src/components/ledger/obligation-token.tsx",
  // The number field with its steppers (docs/design.md 3.26: "the field is a control, so none of this counts"), and the
  // picker's cells, chips and search field (3.29): every piece of text in them is inside a control.
  "src/components/markets/number-entry.tsx",
  "src/components/markets/mark-picker.tsx",
  // The pick-one entry's rows (3.30): every word in them is inside a control, the answers as radio rows.
  "src/components/markets/pick-one-entry.tsx",
  // A team stamp is a mark, outside the type floor and the budget (1.7); the line between two teams is a control (3.40).
  "src/components/ledger/team-stamp.tsx",
  "src/components/markets/team-line.tsx",
]);
/** Rendered to an image, never to the screen. */
const RENDERERS = [/opengraph-image\.tsx$/, /^src\/app\/icons\//];
/** A modal screen of its own, mounted from the layout: counted as a screen, not against every page. */
const OWN_SCREENS = ["src/components/auth/wallet-bootstrap.tsx"];
/**
 * One state of a screen, in its own file, counted as its own screen (docs/design.md 4.8: "run it per state").
 * A page renders exactly one of its states at a time, so a static sum of two states' sizes counts text that is
 * never on one screen together: the signed-out and empty states of Now beside its live one, the claimant's dead,
 * used and own-link states beside the live one. Each is listed here, left out of its page's closure, and held to
 * the budget on its own.
 */
const STATE_SCREENS = ["src/components/home/first-run.tsx", "src/components/home/signed-out.tsx", "src/components/ledger/claim-gone.tsx"];

const SCREEN_MAX = 4;

function rel(p: string): string {
  return relative(ROOT, p).split("\\").join("/");
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? resolve(dirname(from), spec)
      : null;
  if (!base) return null;
  for (const candidate of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Every file a screen renders: the page and what it imports, transitively, under src/. */
function closure(entry: string, skip: Set<string>): string[] {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const file = stack.pop() as string;
    if (seen.has(file) || skip.has(rel(file))) continue;
    seen.add(file);
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/from\s+"([^"]+)"/g)) {
      const target = resolveImport(file, m[1] as string);
      if (target && target.startsWith(SRC) && /\.tsx?$/.test(target))
        stack.push(target);
    }
  }
  return [...seen].sort();
}

/** The elements whose text is a control's label, wherever they are rendered. A link that is a verb uses a `link-*` utility instead. */
const CONTROL_TAGS = new Set([
  "button",
  "Button",
  "ButtonLink",
  "input",
  "textarea",
  "select",
  "option",
  "label",
  "Chip",
  "ContextChip",
]);
const explaining = process.argv.includes("--explain");

type Occurrence = {
  token: string;
  size: string;
  weight: number;
  line: number;
  tag: string | null;
  counted: boolean;
};

/** The element whose opening tag holds position `at`, or null when `at` is not inside an opening tag. */
function enclosingTag(text: string, at: number): { tag: string; exempt: boolean } | null {
  const before = text.slice(0, at);
  let last: RegExpMatchArray | null = null;
  for (const m of before.matchAll(/<([A-Za-z][\w.]*)/g)) last = m;
  if (!last || last.index === undefined) return null;
  const inside = before.slice(last.index + last[0].length).replace(/=>/g, "");
  if (inside.includes(">")) return null;
  const close = text.indexOf(">", at);
  const opening = inside + (close === -1 ? "" : text.slice(at, close));
  return { tag: last[1] as string, exempt: /\bdata-type-exempt\b/.test(opening) };
}

/** The string literal that holds position `at`, or the line it is on when no quote encloses it. */
function literalAround(text: string, at: number): string {
  const quotes = new Set(['"', "'", "`"]);
  let start = at;
  while (start > 0 && !quotes.has(text[start - 1] as string) && text[start - 1] !== "\n") start--;
  const quote = start > 0 ? (text[start - 1] as string) : null;
  let end = at;
  if (quote && quotes.has(quote)) {
    while (end < text.length && text[end] !== quote && text[end] !== "\n") end++;
  } else {
    while (end < text.length && text[end] !== "\n") end++;
  }
  return text.slice(start, end);
}

function occurrencesIn(file: string): Occurrence[] {
  const text = readFileSync(file, "utf8");
  const out: Occurrence[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    const el = enclosingTag(text, at);
    const token = m[1] as string;
    const own = SIZE[token] as { size: string; weight: number };
    const utility = WEIGHT_UTILITY.exec(literalAround(text, at));
    out.push({
      token,
      size: own.size,
      weight: utility ? (WEIGHT[utility[1] as string] as number) : own.weight,
      line: text.slice(0, at).split("\n").length,
      tag: el?.tag ?? null,
      counted: !(el !== null && (CONTROL_TAGS.has(el.tag) || el.exempt)),
    });
  }
  return out;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
}

/** Family first, then the pixel size as a number, so a report reads "hanken 13, hanken 17, serif 26". */
function bySize(a: string, b: string): number {
  const [fa, pa] = a.split(" ");
  const [fb, pb] = b.split(" ");
  return fa === fb ? Number(pa) - Number(pb) : (fa as string).localeCompare(fb as string);
}

const problems: string[] = [];
const report: string[] = [];

// 1. Nothing anywhere references a legacy token or a literal size, outside the controls and the renderers.
for (const file of walk(SRC)) {
  const r = rel(file);
  if (CONTROLS.has(r) || RENDERERS.some((re) => re.test(r))) continue;
  const text = readFileSync(file, "utf8");
  for (const m of text.matchAll(LEGACY))
    problems.push(
      `${r}: legacy token "${m[0]}" (the nine tokens are in docs/design.md 1.2)`,
    );
  for (const m of text.matchAll(LITERAL))
    problems.push(`${r}: literal size "${m[0]}" outside a control component`);
}

// 3. Motion (docs/design.md 9.1): every transition and animation reads the set; a duration or a curve typed
// anywhere else fails, the way a colour from outside section 1 does. The set itself, and the opening's first
// frame (11.4), drawn by an inline style before the stylesheet loads, are the two places a value may be written.
const MOTION_ALLOW = new Set(["src/lib/ui/motion.ts", "src/lib/ui/opening.ts"]);
const MOTION_CLASS = /\b(?:motion-safe:|motion-reduce:)?(?:duration|delay)-(?:\[|\d)[^\s"'`]*|\bease-(?:in|out|in-out|linear)\b|\banimate-(?:\[|pulse|spin|bounce|ping)[^\s"'`]*/g;
const MOTION_LITERAL = /["'`]((?:\d*\.\d+|[1-9]\d*)(?:ms|s))["'`]|(cubic-bezier\()/g;
// 4. Colour (1.1, 8.8): every colour on a screen is a token. The tokens, the ink tables, the palette of the two
// literals that never follow the theme, the opening, and the three renderers that draw one image for everyone are
// the only files that may write one; the code to scan writes the generator's black, which becomes currentColor.
const COLOUR_ALLOW = new Set(["src/lib/ui/ink.ts", "src/lib/ui/palette.ts", "src/lib/ui/opening.ts", "src/lib/ui/tiles.tsx", "src/lib/ui/share-card.tsx", "src/lib/ui/numbers-card.tsx", "src/components/markets/whos-in-row.tsx"]);
const COLOUR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|\bhsla?\(/g;
for (const file of walk(SRC)) {
  const r = rel(file);
  if (RENDERERS.some((re) => re.test(r))) continue;
  const text = readFileSync(file, "utf8");
  if (!MOTION_ALLOW.has(r)) {
    for (const m of text.matchAll(MOTION_CLASS)) problems.push(`${r}: motion "${m[0]}" typed outside the set (9.1: duration-(--motion-*), ease-move, ease-leave, ease-fade, the motion-* classes)`);
    for (const m of text.matchAll(MOTION_LITERAL)) problems.push(`${r}: motion "${m[1] ?? m[2]}" typed outside the set (9.1: read MOTION or the custom properties)`);
  }
  if (!COLOUR_ALLOW.has(r)) for (const m of text.matchAll(COLOUR)) problems.push(`${r}: colour "${m[0]}" typed outside the tokens (1.1, 8.8)`);
  // 5. Copy (4.9): a phrase cut from every screen stays cut, wherever it is typed. The list itself is the one file that writes them.
  if (r !== "src/lib/ui/copy-rules.ts") for (const c of CUT_PHRASES) if (c.phrase.test(text)) problems.push(`${r}: "${c.said}" is ${c.why}`);
}
// The stylesheet: a colour, a duration or a curve lives only in a custom property's definition.
const GLOBALS = join(SRC, "app", "globals.css");
if (existsSync(GLOBALS)) {
  const lines = readFileSync(GLOBALS, "utf8").split("\n");
  lines.forEach((line, i) => {
    const definition = /^\s*--[\w-]+:/.test(line);
    if (definition) return;
    for (const m of line.matchAll(COLOUR)) problems.push(`src/app/globals.css:${i + 1}: colour "${m[0]}" outside a token's definition (1.1, 8.8)`);
    for (const m of line.matchAll(/\b(?:\d*\.\d+|[1-9]\d*)(?:ms|s)\b|cubic-bezier\(/g)) problems.push(`src/app/globals.css:${i + 1}: motion "${m[0]}" outside the set's definition (9.1)`);
  });
}

// 2. Each screen: at most four sizes, one serif size, two weights at a size and only 400 and 600.
const pages = walk(join(SRC, "app")).filter((p) => /[/\\]page\.tsx$/.test(p));
const screens = [
  ...pages,
  ...[...OWN_SCREENS, ...STATE_SCREENS].map((p) => join(ROOT, p)).filter((p) => existsSync(p)),
];
const skipForPages = new Set([...CONTROLS, ...OWN_SCREENS, ...STATE_SCREENS]);
for (const screen of screens) {
  const isOwn = OWN_SCREENS.includes(rel(screen)) || STATE_SCREENS.includes(rel(screen));
  const files = closure(
    screen,
    isOwn ? new Set(CONTROLS) : skipForPages,
  ).filter((f) => !RENDERERS.some((re) => re.test(rel(f))));
  const sizes = new Map<string, { weights: Map<number, string[]>; files: string[] }>();
  const explain: string[] = [];
  for (const f of files) {
    for (const o of occurrencesIn(f)) {
      explain.push(
        `    ${o.counted ? "        " : "control "}${o.token.padEnd(12)} ${o.size.padEnd(9)} ${o.weight} ${rel(f)}:${o.line}${o.tag ? ` <${o.tag}>` : ""}`,
      );
      if (!o.counted) continue;
      const s = sizes.get(o.size) ?? { weights: new Map<number, string[]>(), files: [] as string[] };
      if (!s.files.includes(rel(f))) s.files.push(rel(f));
      const w = s.weights.get(o.weight) ?? [];
      if (!w.includes(rel(f))) w.push(rel(f));
      s.weights.set(o.weight, w);
      sizes.set(o.size, s);
    }
  }
  const names = [...sizes.keys()].sort(bySize);
  const serifs = names.filter((s) => s.startsWith("serif"));
  const line = `${rel(screen)}: ${names.length} size${names.length === 1 ? "" : "s"} (${names.join(", ")})`;
  report.push(line);
  if (explaining) report.push(...explain);
  const allowed = baseline[rel(screen)];
  const sizeCap = allowed ? Math.max(SCREEN_MAX, allowed.sizes) : SCREEN_MAX;
  const serifCap = allowed ? Math.max(1, allowed.serifs) : 1;
  if (names.length > sizeCap)
    problems.push(
      `${line}: over the budget of ${sizeCap} (1.2, 4.8${allowed ? ", the baseline" : ""}). Where: ${names
        .map((s) => `${s} in ${(sizes.get(s)?.files ?? []).join(", ")}`)
        .join("; ")}`,
    );
  if (serifs.length > serifCap)
    problems.push(
      `${rel(screen)}: ${serifs.length} serif sizes (${serifs.join(", ")}); a screen has ${serifCap === 1 ? "one (1.2)" : `${serifCap} in the baseline`}`,
    );
  for (const [size, s] of sizes) {
    const bad = [...s.weights.keys()].filter((w) => !ALLOWED_WEIGHTS.has(w));
    if (bad.length > 0 || s.weights.size > 2)
      problems.push(
        `${rel(screen)}: ${size} at ${[...s.weights.keys()].sort().join(", ")} (a size carries 400 and 600 only, 1.2). Where: ${bad
          .map((w) => `${w} in ${(s.weights.get(w) ?? []).join(", ")}`)
          .join("; ")}`,
      );
  }
  if (names.length > SCREEN_MAX || serifs.length > 1)
    current[rel(screen)] = { sizes: names.length, serifs: serifs.length };
}

if (writing) {
  writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
  console.log(
    `baseline written: ${Object.keys(current).length} over the budget`,
  );
  process.exit(0);
}
console.log(report.join("\n"));
const over = Object.keys(current).length;
if (problems.length) {
  console.error(
    `\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`,
  );
  process.exit(1);
}
console.log(
  `\nstyle budget: no legacy token, no literal size, no motion or colour outside the set, no cut phrase; ${screens.length} screens, ${over} over the budget and held to a baseline`,
);
