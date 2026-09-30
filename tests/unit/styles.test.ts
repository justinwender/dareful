/**
 * The QA round, the styles and components left behind by features that were renamed, moved or cut (docs/design.md
 * 3.3, 3.29, 3.38, 5.1, 8.7, 9.4, 10.2; docs/decisions.md 2026-09-29): the choice style on every choice among
 * words, text on a scrim and the full-screen photo holding the dark column in both themes, the rings in a person's
 * hue drawn with the stroke variant, the number field's focus on its box, and a press on every control built by
 * hand. Each rule is pure or read off the markup a component draws, or off the source where the rule is a
 * property of the code itself, and each has a mutant in tests/mutation/mutants.ts that breaks it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Chip, chipPress } from "@/components/ledger/chip";
import { ScrimChip } from "@/components/ledger/scrim-chip";
import { PHOTO_ROOM } from "@/components/ledger/sticker-from-photo";
import { NumberEntry } from "@/components/markets/number-entry";
import { PickOneEntry } from "@/components/markets/pick-one-entry";
import { CREAM, CREAM_2, GRAPHITE } from "@/lib/ui/palette";

const read = (path: string) => readFileSync(path, "utf8");

/** Every `<button`, `<a` and `<Link` tag in a file, whole, with the braces inside its attributes balanced. */
function controlTags(src: string): Array<{ line: number; tag: string }> {
  const out: Array<{ line: number; tag: string }> = [];
  const re = /<(button|a|Link)(?=[\s>])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    let i = m.index;
    let depth = 0;
    let quoted = false;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quoted) {
        if (c === '"') quoted = false;
        continue;
      }
      if (depth === 0 && c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ line: src.slice(0, m.index).split("\n").length, tag: src.slice(m.index, i + 1) });
  }
  return out;
}

test("the palette's literals are the stylesheet's own dark column (1.1, 10.2): cream, its second ink and graphite, so what never follows the theme cannot drift from it", () => {
  const css = read("src/app/globals.css");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
  const value = (name: string) => new RegExp(`--${name}: (#[0-9a-fA-F]{6});`).exec(root)?.[1]?.toLowerCase();
  assert.equal(value("ink"), CREAM.toLowerCase(), "cream is the dark theme's ink");
  assert.equal(value("ink-2"), CREAM_2.toLowerCase(), "the second cream is the dark theme's second ink");
  assert.equal(value("ground"), GRAPHITE.toLowerCase(), "graphite is the dark theme's ground");
});

test("a chip's wrapper presses by whether the chip is selected (9.4): a fill dims to 0.88, a line and a word to 0.5", () => {
  assert.deepEqual(chipPress(true), { "data-press": "fill", className: "rounded-pill press-fill" });
  assert.deepEqual(chipPress(false), { "data-press": "line", className: "rounded-pill press-line" });
});

test("a choice among words selects in the choice style (3.3, 3.29): the kind chips, the mode chips, the careful answers, the sides and the units, never as a filter", () => {
  const html = renderToStaticMarkup(createElement(Chip, { size: 36, selected: true, choice: true } as ComponentProps<typeof Chip>, "Yes or no"));
  assert.ok(html.includes("border-ink-3") && html.includes("bg-surface-2") && !html.includes("bg-ink"), "the choice style: a surface-2 fill and an ink-3 border, not ink on ground");
  for (const file of ["src/components/markets/ask-form.tsx", "src/components/ledger/cover-sheet.tsx", "src/components/markets/market-stage.tsx"]) {
    const src = read(file);
    const chips = src.match(/<Chip size=\{(?:36|44)\} selected=\{(?!false\})[^>]*>/g) ?? [];
    assert.ok(chips.length > 0, `${file}: interactive chips`);
    for (const chip of chips) assert.ok(/\schoice[\s>]/.test(chip), `${file}: a chip that can be selected is a choice among words: ${chip}`);
  }
});

test("text on a scrim is cream in both themes (1.1, 8.7): the scrim chip carries the palette's literal, and every scrim on a screen is one", () => {
  const html = renderToStaticMarkup(createElement(ScrimChip, { className: "h-7 px-3" } as ComponentProps<typeof ScrimChip>, "1 / 5"));
  assert.ok(html.includes("bg-scrim"), "on the scrim");
  assert.ok(html.includes(`color:${CREAM}`), `cream, never --ink: ${html}`);
  assert.ok(!html.includes("text-ink"), "no token that follows the theme");
  for (const file of ["src/components/ledger/media-frame.tsx", "src/components/markets/clip-view.tsx", "src/components/markets/empty-slot.tsx", "src/components/ledger/photo-view.tsx"]) assert.ok(!read(file).includes("bg-scrim"), `${file}: a scrim is drawn through ScrimChip alone`);
});

test("the full-screen photo is black in both themes (3.38, 10.2): the dark theme's ground, chalk and second ink on its root and on the sticker result that stands in its place, and its close in cream", () => {
  assert.deepEqual(PHOTO_ROOM, { "--ground": GRAPHITE, "--ink-2": CREAM_2, "--chalk": CREAM, "--on-chalk": GRAPHITE });
  const view = read("src/components/ledger/photo-view.tsx");
  const made = read("src/components/ledger/sticker-from-photo.tsx");
  assert.ok(/data-photo-view=\{id\}[^>]*style=\{PHOTO_ROOM\}/.test(view), "the viewer's root wears the room");
  assert.ok(/data-sticker-made=\{id\}[^>]*style=\{PHOTO_ROOM\}/.test(made), "the result's root wears the room");
  for (const [name, src] of [["the viewer", view], ["the result", made]] as const) assert.ok(/aria-label="Close"[^>]*style=\{\{ color: CREAM \}\}/.test(src), `${name}: the close is cream`);
  assert.ok(!/border-line bg-surface/.test(view), "nothing behind an icon action: the export draws them bare on black");
});

test("the number field's focus is the box's (5.1): the 2px ink outline 2px outside the drawn field, none on the bare input, and the ring in the stroke variant (8.7)", () => {
  const unit = { singular: "shirt", plural: "shirts" };
  const html = renderToStaticMarkup(createElement(NumberEntry, { value: null, onChange: () => undefined, unit, hue: "aqua" }));
  const box = /<div class="[^"]*"[^>]*data-number-field=""[^>]*>/.exec(html)?.[0] ?? /<div[^>]*data-number-field=""[^>]*>/.exec(html)?.[0] ?? "";
  assert.ok(box.includes("focus-within:outline-2") && box.includes("focus-within:outline-offset-2") && box.includes("focus-within:outline-ink"), `the box takes the outline on focus within: ${box}`);
  assert.ok(box.includes("var(--person-aqua-stroke)"), `the ring is the stroke variant: ${box}`);
  const input = /<input[^>]*inputmode="numeric"[^>]*>/i.exec(html)?.[0] ?? "";
  assert.ok(input.includes("focus-visible:outline-none"), `the input carries no outline of its own: ${input}`);
  const problem = renderToStaticMarkup(createElement(NumberEntry, { value: 2400n, onChange: () => undefined, unit, hue: "aqua", problem: true }));
  assert.ok(problem.includes("var(--ink)") && !problem.includes("var(--person-aqua-stroke)"), "a problem turns the ring to ink");
});

test("a pick's ring, the picker's ring, the whisker and the band in a person's hue are the stroke variant on paper (8.7); the dot and the switch keep the fill", () => {
  const answers = [{ index: 0, text: "Gabe", person: null }, { index: 1, text: "Priya", person: null }];
  const html = renderToStaticMarkup(createElement(PickOneEntry, { answers, value: 1, onChange: () => undefined, hue: "sand" }));
  assert.ok(html.includes("var(--person-sand-stroke)") && !html.includes("var(--person-sand)"), "the picked row's ring");
  assert.ok(read("src/components/markets/mark-picker.tsx").includes("inset 0 0 0 1.5px ${hueStrokeVar(hue)}` }"), "the picker's ring");
  const calls = read("src/components/you/calls.tsx");
  assert.ok(calls.includes('stroke={hueStrokeVar(hue)} strokeWidth="2" opacity="0.45"'), "the whisker");
  assert.ok(calls.includes("fill={hueVar(hue)}"), "the dot's fill stays the pastel");
  assert.ok(read("src/components/you/numbers.tsx").includes("background: hueStrokeVar(hue), opacity: 0.45"), "the band");
});

test("every control built by hand carries its press (9.4), and none keeps an :active opacity of its own", () => {
  const dirs = ["src/components/ledger", "src/components/markets", "src/components/you", "src/components/home"];
  // Nothing is held out any more: the who's-in row and the team line took their presses with the shell's changes (the QA round).
  const held = new Set<string>();
  const files = dirs.flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".tsx")).map((f) => join(d, f))).filter((f) => !held.has(f));
  assert.ok(files.length > 40, "the component files");
  const missing: string[] = [];
  const active: string[] = [];
  for (const file of files) {
    const src = read(file);
    if (/active:opacity/.test(src)) active.push(file);
    for (const { line, tag } of controlTags(src)) {
      // A control carries its press, or spreads a chip's, or wraps a card that carries it (`data-press-within`).
      if (/data-press=/.test(tag) || /\{\.\.\.chipPress\(/.test(tag) || /data-press-within=/.test(tag)) continue;
      missing.push(`${file}:${line}`);
    }
  }
  assert.deepEqual(missing, [], "a button or a link with no press");
  assert.deepEqual(active, [], "an :active opacity beside the press");
});
