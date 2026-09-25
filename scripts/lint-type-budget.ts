/**
 * The type budget (docs/design.md 1.2, 4.8) as a rule that fails the build, because a rule that lives in review
 * does not survive the next several phases.
 *
 * A screen references at most four of the nine type tokens and one serif size; a card at most three; nothing
 * references a token from the first design or a literal pixel size, outside the control components whose labels
 * the specification excludes from the count (buttons, chips, the tab bar, the tile renderer). A screen is a page
 * file plus everything it imports under src/, transitively, because a screen is composed of components and the
 * budget belongs to the screen. Counting references in markup over-approximates a screen that renders several
 * states, which is what the specification asks for: "if a screen's markup references five, something on it is
 * decoration".
 *
 * A control's label is outside the count wherever it is (1.2: "Button labels belong to the button component";
 * docs/decisions.md 2026-09-25 extends that to every control, the way chips already were). A token is on a
 * control when the JSX element whose attributes carry it is a button, a form field or its label, or a chip. A
 * class held in a variable outside any element cannot be placed, so it counts.
 *
 *   npm run lint:type            the rule
 *   npm run lint:type -- --explain   every reference on every screen, with the element it sits on
 */
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
 * The screens over the budget on the day the rule arrived, with their counts (docs/decisions.md 2026-09-24). The
 * rule holds every screen to the budget, or to its baseline where it has one, so the build fails the moment any
 * screen gets worse and passes once it is burned down. `--write-baseline` rewrites it from the current counts.
 */
const BASELINE = join(ROOT, "scripts", "type-budget.baseline.json");
type Baseline = Record<string, { tokens: number; serifs: number }>;
const baseline: Baseline = existsSync(BASELINE)
  ? (JSON.parse(readFileSync(BASELINE, "utf8")) as Baseline)
  : {};
const writing = process.argv.includes("--write-baseline");
const current: Baseline = {};

/** The nine tokens. `body-strong` is `body` at 600 and `numeral-sm` is `numeral` at 15: one token each (1.2). */
const FAMILY: Record<string, string> = {
  "serif-xl": "serif-xl",
  "serif-l": "serif-l",
  "serif-m": "serif-m",
  "numeral-hero": "numeral-hero",
  numeral: "numeral",
  "numeral-sm": "numeral",
  body: "body",
  "body-strong": "body",
  "body-sm": "body-sm",
  label: "label",
  caption: "caption",
};
const SERIF = new Set(["serif-xl", "serif-l", "serif-m"]);
const TOKEN =
  /\btext-(serif-xl|serif-l|serif-m|numeral-hero|numeral-sm|numeral|body-strong|body-sm|body|label|caption)\b/g;
const LEGACY =
  /\btext-(display-xl|display|question-lg|question|card-question-sm|card-question|outcome-sm|outcome|body-sm-prose)\b/g;
const LITERAL = /\btext-\[\d+px\]/g;

/** Control components: their labels do not count (1.2, 3.12), and they may size themselves literally. */
const CONTROLS = new Set([
  "src/components/ui/button.tsx",
  "src/components/ledger/chip.tsx",
  "src/components/ui/tab-bar.tsx",
  "src/lib/ui/share-card.tsx",
]);
/** Rendered to an image, never to the screen. */
const RENDERERS = [/opengraph-image\.tsx$/, /^src\/app\/icons\//];
/** A modal screen of its own, mounted from the layout: counted as a screen, not against every page. */
const OWN_SCREENS = ["src/components/auth/wallet-bootstrap.tsx"];

const SCREEN_MAX = 4;
const CARD_MAX = 3;

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
  line: number;
  tag: string | null;
  counted: boolean;
};

/** The element whose opening tag holds position `at`, or null when `at` is not inside an opening tag. */
function enclosingTag(text: string, at: number): string | null {
  const before = text.slice(0, at);
  let last: RegExpMatchArray | null = null;
  for (const m of before.matchAll(/<([A-Za-z][\w.]*)/g)) last = m;
  if (!last || last.index === undefined) return null;
  const inside = before.slice(last.index + last[0].length).replace(/=>/g, "");
  return inside.includes(">") ? null : (last[1] as string);
}

function occurrencesIn(file: string): Occurrence[] {
  const text = readFileSync(file, "utf8");
  const out: Occurrence[] = [];
  for (const m of text.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    const tag = enclosingTag(text, at);
    out.push({
      token: FAMILY[m[1] as string] as string,
      line: text.slice(0, at).split("\n").length,
      tag,
      counted: !(tag !== null && CONTROL_TAGS.has(tag)),
    });
  }
  return out;
}

function tokensIn(file: string): Set<string> {
  return new Set(
    occurrencesIn(file)
      .filter((o) => o.counted)
      .map((o) => o.token),
  );
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(name)) out.push(p);
  }
  return out;
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

// 2. Each screen: at most four tokens, one serif size.
const pages = walk(join(SRC, "app")).filter((p) => /[/\\]page\.tsx$/.test(p));
const screens = [
  ...pages,
  ...OWN_SCREENS.map((p) => join(ROOT, p)).filter((p) => existsSync(p)),
];
const skipForPages = new Set([...CONTROLS, ...OWN_SCREENS]);
for (const screen of screens) {
  const isOwn = OWN_SCREENS.includes(rel(screen));
  const files = closure(
    screen,
    isOwn ? new Set(CONTROLS) : skipForPages,
  ).filter((f) => !RENDERERS.some((re) => re.test(rel(f))));
  const used = new Set<string>();
  const where = new Map<string, string[]>();
  const explain: string[] = [];
  for (const f of files) {
    for (const o of occurrencesIn(f)) {
      explain.push(
        `    ${o.counted ? "        " : "control "}${o.token.padEnd(12)} ${rel(f)}:${o.line}${o.tag ? ` <${o.tag}>` : ""}`,
      );
      if (!o.counted) continue;
      used.add(o.token);
      if (!(where.get(o.token) ?? []).includes(rel(f)))
        where.set(o.token, [...(where.get(o.token) ?? []), rel(f)]);
    }
  }
  const serifs = [...used].filter((t) => SERIF.has(t));
  const line = `${rel(screen)}: ${used.size} token${used.size === 1 ? "" : "s"} (${[...used].sort().join(", ")})`;
  report.push(line);
  if (explaining) report.push(...explain);
  const allowed = baseline[rel(screen)];
  const tokenCap = allowed ? Math.max(SCREEN_MAX, allowed.tokens) : SCREEN_MAX;
  const serifCap = allowed ? Math.max(1, allowed.serifs) : 1;
  if (used.size > tokenCap)
    problems.push(
      `${line}: over the budget of ${tokenCap} (1.2, 4.8${allowed ? ", the baseline" : ""}). Where: ${[
        ...used,
      ]
        .sort()
        .map((t) => `${t} in ${(where.get(t) ?? []).join(", ")}`)
        .join("; ")}`,
    );
  if (serifs.length > serifCap)
    problems.push(
      `${rel(screen)}: ${serifs.length} serif sizes (${serifs.join(", ")}); a screen has ${serifCap === 1 ? "one (4.1)" : `${serifCap} in the baseline`}`,
    );
  if (used.size > SCREEN_MAX || serifs.length > 1)
    current[rel(screen)] = { tokens: used.size, serifs: serifs.length };
}

// 3. Each card: at most three tokens.
for (const file of walk(join(SRC, "components")).filter((p) =>
  /-card\.tsx$/.test(p),
)) {
  const used = tokensIn(file);
  const line = `${rel(file)}: ${used.size} token${used.size === 1 ? "" : "s"} (${[...used].sort().join(", ")})`;
  report.push(line);
  const allowed = baseline[rel(file)];
  const cap = allowed ? Math.max(CARD_MAX, allowed.tokens) : CARD_MAX;
  if (used.size > cap)
    problems.push(
      `${line}: over the budget of ${cap} for a card (1.2${allowed ? ", the baseline" : ""})`,
    );
  if (used.size > CARD_MAX)
    current[rel(file)] = { tokens: used.size, serifs: 0 };
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
  `\ntype budget: no legacy token, no literal size; ${screens.length} screens, ${over} still over the budget and held to their baseline`,
);
