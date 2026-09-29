/**
 * Round D, how it feels (docs/design.md 8, 9, 11): the motion set and its stagger, the slow-load stages, the
 * sheet's settling rules, the layers and the properties that capture a fixed layer, presses, the theme's script,
 * a row's shell, the roots the router still holds, the terms read out of a
 * half-written answer, whole dollars and the Mixed token, the call line's words, the annotated row, the stake
 * chips' default, and the two light blocks of the stylesheet. Every rule here is pure, and every test has a
 * mutant in tests/mutation/mutants.ts that breaks it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { MOTION, overscroll, settleDuration, staggerDelay, staggeredTotal, waitStage } from "@/lib/ui/motion";
import { ancestorsInMarkup, capturesAbove, FIXED_LAYERS, forbiddenClasses, forbiddenOn, parseInlineStyle } from "@/lib/ui/layers";
import { pressShows, PRESS_CANCEL_PX, ROW_PRESS_DELAY_MS } from "@/components/ui/press";
import { isThemeChoice, THEME_KEY, THEME_SCRIPT, themeAttribute } from "@/lib/ui/theme";
import { marketIdOf, parseShell, serialiseShell, shellSheet, type MarketShell } from "@/lib/ui/shell";
import { resetRoots, ROOT_FRESH_MS, rootFresh, rootMounted, whenRootMounts } from "@/lib/ui/roots-store";
import { partialValues } from "@/lib/ui/write-up-stream";
import { formatMoney } from "@/lib/ui/units";
import { outcomeLabel } from "@/components/markets/call-line";
import { annotation } from "@/components/markets/leaderboard";
import { MixedToken, orderMixed, splitMixed } from "@/components/ledger/obligation-token";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { defaultStake, STAKES_COUNT, STAKES_MONEY } from "@/components/markets/stake-chips";
import { bandClock } from "@/lib/ui/band";
import { inkStyleText, INKS, INKS_LIGHT } from "@/lib/ui/ink";

test("the motion set (9.1): three durations, a 40ms stagger, a 1.2s loop; ten columns take 680ms from the first starting to the last landing", () => {
  assert.deepEqual({ quick: MOTION.quick, base: MOTION.base, travel: MOTION.travel, stagger: MOTION.stagger, loop: MOTION.loop }, { quick: 120, base: 200, travel: 320, stagger: 40, loop: 1200 });
  assert.equal(staggerDelay(0), 0);
  assert.equal(staggerDelay(3), 120);
  assert.equal(staggeredTotal(10), 680);
  assert.equal(staggeredTotal(1), 320);
  assert.equal(staggeredTotal(0), 0);
  const css = readFileSync("src/app/globals.css", "utf8");
  for (const [name, value] of [["--motion-quick", "120ms"], ["--motion-base", "200ms"], ["--motion-travel", "320ms"], ["--motion-stagger", "40ms"], ["--motion-loop", "1.2s"], ["--ease-move", "cubic-bezier(0.2, 0.8, 0.2, 1)"], ["--ease-leave", "cubic-bezier(0.4, 0, 1, 1)"], ["--ease-fade", "cubic-bezier(0, 0, 0.58, 1)"]]) assert.ok(css.includes(`${name}: ${value};`), `${name} is ${value}`);
});

test("the slow-load stages are one set of rules (5.2, 9.4): nothing under 300ms, the runner, Still going at three seconds, the block at ten", () => {
  assert.equal(waitStage(true, 299), "none");
  assert.equal(waitStage(true, 300), "pending");
  assert.equal(waitStage(true, 2_999), "pending");
  assert.equal(waitStage(true, 3_000), "still");
  assert.equal(waitStage(true, 10_000), "block");
  assert.equal(waitStage(false, 20_000), "none");
});

test("the sheet settles over base when less than half the distance is left and over travel otherwise, and past a height it moves a third of the finger, 16px at most (9.9)", () => {
  assert.equal(settleDuration(40, 200), MOTION.base);
  assert.equal(settleDuration(-40, 200), MOTION.base);
  assert.equal(settleDuration(100, 200), MOTION.travel, "exactly half is not less than half");
  assert.equal(settleDuration(150, 200), MOTION.travel);
  assert.equal(overscroll(30), 10);
  assert.equal(overscroll(90), 16);
  assert.equal(overscroll(-90), -16);
});

test("the properties that capture a fixed layer are refused on an ancestor, by computed style and by class; their none forms pass (9.3)", () => {
  assert.deepEqual(FIXED_LAYERS.slice(0, 5), ["tab-bar", "start", "sheet", "modal", "ask"]);
  assert.deepEqual(forbiddenOn({ transform: "none", filter: "none", "will-change": "auto", contain: "size" }), []);
  assert.deepEqual(forbiddenOn({ transform: "matrix(1, 0, 0, 1, 0, 0)" }), ["transform: matrix(1, 0, 0, 1, 0, 0)"]);
  assert.deepEqual(forbiddenOn({ translate: "0px" }), ["translate: 0px"], "translateZ(0) and its kin capture too");
  assert.deepEqual(forbiddenOn({ "will-change": "transform, opacity" }), ["will-change: transform, opacity"]);
  assert.deepEqual(forbiddenOn({ "will-change": "opacity" }), []);
  assert.deepEqual(forbiddenOn({ contain: "layout" }), ["contain: layout"]);
  assert.deepEqual(forbiddenOn({ "content-visibility": "auto" }), ["content-visibility: auto"]);
  assert.deepEqual(forbiddenOn({ backdropFilter: "blur(4px)" }), ["backdrop-filter: blur(4px)"], "camel-cased computed styles read too");
  assert.deepEqual(forbiddenClasses("flex transform translate-x-4 -translate-y-1/2 scale-95 rotate-3 blur-sm backdrop-blur contain-paint will-change-transform [transform:translateZ(0)]"), ["transform", "translate-x-4", "-translate-y-1/2", "scale-95", "rotate-3", "blur-sm", "backdrop-blur", "contain-paint", "will-change-transform", "[transform:translateZ(0)]"]);
  assert.deepEqual(forbiddenClasses("flex translate-none transform-none motion-safe:transition-transform will-change-auto [transform:none] contain-size text-ink"), []);
  assert.deepEqual(forbiddenClasses("motion-safe:translate-x-2 hover:scale-105"), ["motion-safe:translate-x-2", "hover:scale-105"], "a variant prefix hides nothing");
  assert.deepEqual(parseInlineStyle("transform:translateY(4px); color: red"), { transform: "translateY(4px)", color: "red" });
});

test("the markup walk finds a fixed layer's ancestors and names what captures it (9.3)", () => {
  const html = '<html><body><div id="app" class="flex"><main class="transform" style="will-change: transform"><section><nav aria-label="Main" class="fixed"></nav></section></main><img src="x"><input><div id="layers"></div></div></body></html>';
  const chain = ancestorsInMarkup(html, (el) => el.tag === "nav" && el.attrs["aria-label"] === "Main");
  assert.ok(chain);
  assert.deepEqual(chain.map((a) => a.tag), ["html", "body", "div", "main", "section"]);
  assert.deepEqual(capturesAbove(chain), ['<main class="transform">: class transform', '<main class="transform">: style will-change: transform']);
  assert.equal(ancestorsInMarkup(html, (el) => el.tag === "footer"), null);
  const clean = ancestorsInMarkup('<div class="flex"><span><a class="press-row">x</a></span></div>', (el) => el.tag === "a");
  assert.deepEqual(capturesAbove(clean ?? []), []);
});

test("a press shows at once on a control and after 60ms on a row, and never once the finger has travelled 8px (9.4)", () => {
  assert.equal(ROW_PRESS_DELAY_MS, 60);
  assert.equal(PRESS_CANCEL_PX, 8);
  assert.equal(pressShows("fill", 0, 0), true);
  assert.equal(pressShows("line", 0, 3), true);
  assert.equal(pressShows("row", 30, 0), false);
  assert.equal(pressShows("row", 60, 0), true);
  assert.equal(pressShows("row", 100, 8), false);
  assert.equal(pressShows("fill", 100, 9), false);
});

test("appearance is a device preference (8.1): three choices, the stored one onto html before paint, none for matching the phone", () => {
  assert.equal(THEME_KEY, "dareful.theme");
  assert.equal(themeAttribute("phone"), null);
  assert.equal(themeAttribute("light"), "light");
  assert.equal(isThemeChoice("sepia"), false);
  assert.ok(THEME_SCRIPT.includes('localStorage.getItem("dareful.theme")') && THEME_SCRIPT.includes('setAttribute("data-theme",t)') && THEME_SCRIPT.includes("catch"), "the head script reads the choice and survives blocked storage");
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.ok(/:root\[data-theme="light"\] \{/.test(css) && /@media \(prefers-color-scheme: light\) \{\s*:root:not\(\[data-theme="dark"\]\) \{/.test(css), "8.8: the light block twice, by choice and by the phone");
  assert.ok(/--live: #e4e34a;\s*\n\s*--live-edge: #1b1815;/.test(css), "8.5: the citron keeps its colour in light and gains its edge; the darker yellow is rejected");
});

test("the two light blocks of the stylesheet carry the same values, so a choice and the phone's setting cannot drift (8.8)", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const block = (start: string) => {
    const i = css.indexOf(start);
    assert.ok(i >= 0, start);
    const open = css.indexOf("{", i);
    let depth = 0;
    for (let j = open; j < css.length; j++) {
      if (css[j] === "{") depth++;
      if (css[j] === "}") {
        depth--;
        if (depth === 0) return css.slice(open + 1, j).replace(/\s+/g, " ").trim();
      }
    }
    throw new Error("unterminated block");
  };
  const chosen = block(':root[data-theme="light"] {');
  const phone = block(':root:not([data-theme="dark"]) {');
  assert.equal(phone, chosen);
  assert.ok(chosen.includes("--ground: #f5efe4;") && chosen.includes("--chalk: #1b1815;") && chosen.includes("--on-chalk: #f5efe4;"), "8.2: the primary is graphite with paper text on light");
});

test("a row's shell (9.4): what the row knew, serialised on its link, read back exactly, and refused when it is not a shell's", () => {
  const shell: MarketShell = { kind: "market", id: "2e2ab76a-6c29-49a9-8b98-4aaae27906da", ink: "ochre", mark: { kind: "emoji", value: "🍺" }, state: "in", clock: "Closes soon", question: "How many shirts?", asker: { name: "Priya Raman", hue: "aqua", line: "Priya asked the Friday crew" }, sheet: null };
  assert.deepEqual(parseShell(serialiseShell(shell)), shell);
  assert.equal(parseShell('{"kind":"market","id":"x","ink":"mauve","question":"q","state":"open"}'), null, "an ink that is not one of the eight");
  assert.equal(parseShell('{"kind":"market","id":"x","ink":"ochre","question":"q","state":"won"}'), null, "a state that is not a mark");
  assert.equal(parseShell("not json"), null);
  const game = parseShell(JSON.stringify({ kind: "game", id: "g", href: "/on/g?g=1", name: "Chiefs at Bills", start: "Sun 4:25pm", away: { abbr: "KC", name: "Chiefs", color: "E31837" }, home: { abbr: "BUF", name: "Bills", color: null } }));
  assert.equal(game?.kind, "game");
  assert.deepEqual(shellSheet("open", false), { label: "Your number", line: "What are the odds?" });
  assert.deepEqual(shellSheet("open", false, "numeric"), { label: "Your number", line: "What's the number?" });
  assert.equal(shellSheet("open", true), null, "once you're in nothing is your move");
  assert.deepEqual(shellSheet("voting", false), { label: "Say what happened", line: "When it's clear, say what happened." });
  assert.equal(shellSheet("resolved", false), null);
  assert.equal(marketIdOf("/m/2E2AB76A-6c29-49a9-8b98-4aaae27906da?side=yes"), "2e2ab76a-6c29-49a9-8b98-4aaae27906da");
  assert.equal(marketIdOf("/m/new"), null);
  assert.equal(marketIdOf("/people"), null);
});

test("the band's clock is one function for the screen and the shell (3.25, 9.4)", () => {
  const now = new Date("2026-09-28T20:00:00Z");
  const zone = "America/New_York";
  const soon = new Date("2026-09-28T22:30:00Z");
  assert.match(bandClock({ state: "open", resolvesBy: soon, resolvedAt: null, resolvedBy: null, votes: 0, now, zone }) ?? "", /^Closes /);
  assert.match(bandClock({ state: "locked", resolvesBy: soon, resolvedAt: null, resolvedBy: null, votes: 0, now, zone }) ?? "", /^Resolving /);
  assert.match(bandClock({ state: "locked", resolvesBy: soon, resolvedAt: null, resolvedBy: null, votes: 2, now, zone }) ?? "", /^Voting ends /);
  assert.match(bandClock({ state: "resolved", resolvesBy: soon, resolvedAt: new Date("2026-09-28T19:00:00Z"), resolvedBy: "quorum", votes: 3, now, zone }) ?? "", /^Settled /);
  assert.equal(bandClock({ state: "open", resolvesBy: null, resolvedAt: null, resolvedBy: null, votes: 0, now, zone }), null);
});

test("a root the router still holds is fresh for thirty seconds, and back waits for it to mount (9.6, 9.7)", async () => {
  resetRoots();
  assert.equal(ROOT_FRESH_MS, 30_000);
  assert.equal(rootFresh("/", 1_000), false);
  rootMounted("/", 1_000);
  assert.equal(rootFresh("/", 30_999), true);
  assert.equal(rootFresh("/", 31_000), false);
  let landed = false;
  const p = whenRootMounts("/people").then(() => {
    landed = true;
  });
  assert.equal(landed, false);
  rootMounted("/people", 2_000);
  await p;
  assert.equal(landed, true);
  resetRoots();
});

test("the terms are read out of a half-written answer (9.8): the words so far, escapes undone, and nothing for a value not started", () => {
  assert.deepEqual(partialValues('{"title": "Does he'), { title: "Does he", terms: null });
  assert.deepEqual(partialValues('{"title":"Does he fall asleep?","terms":"Yes if he\\u2019s out before the credits.\\nNo if'), { title: "Does he fall asleep?", terms: "Yes if he’s out before the credits.\nNo if" });
  assert.deepEqual(partialValues('{"title":"A \\"quoted\\" q","terms":"done."}'), { title: 'A "quoted" q', terms: "done." });
  assert.deepEqual(partialValues(""), { title: null, terms: null });
  assert.deepEqual(partialValues('{"title":"x","terms":"ends in a backslash\\'), { title: "x", terms: "ends in a backslash" });
});

test("whole dollars in lists, cents on a detail sheet (2.2, 3.2)", () => {
  assert.equal(formatMoney(4720n, { whole: true }), "$47");
  assert.equal(formatMoney(4750n, { whole: true }), "$48");
  assert.equal(formatMoney(4720n), "$47.20");
  assert.equal(formatMoney(4700n), "$47");
  assert.equal(formatMoney(4720n, { cents: true, whole: true }), "$47.20", "cents win where the detail asks for them");
  assert.equal(formatMoney(-150n, { whole: true }), "-$2");
});

test("the Mixed token orders glyphs, then words, then dollars, and splits past what fits with dollars always last (2.2, 3.2, 3.10)", () => {
  const unit = (label: string, template: "beer" | "coffee" | null, monetary = false) => ({ denomination: { label, pluralLabel: `${label}s`, quantifiable: true, monetary, template, markKind: null, markValue: null }, quantity: 1n });
  const lines = [unit("dollar", null, true), unit("dumpling run", null), unit("beer", "beer"), unit("coffee", "coffee")];
  assert.deepEqual(orderMixed(lines).map((l) => l.denomination.label), ["beer", "coffee", "dumpling run", "dollar"]);
  assert.deepEqual(splitMixed(lines).map((part) => part.map((l) => l.denomination.label)), [["beer", "coffee", "dumpling run"], ["dollar"]]);
  assert.deepEqual(splitMixed(lines.slice(0, 3)).map((part) => part.map((l) => l.denomination.label)), [["beer", "dumpling run", "dollar"]]);
  assert.deepEqual(splitMixed([]), []);
});

test("the settled call line's labels read the outcome in the question's words (3.5), the annotated row names who a wrong-sided number still beat (3.7), and the smallest stake is the default (3.3)", () => {
  assert.equal(outcomeLabel("yes", { yes: "He did.", no: "He didn’t." }), "Yes, he did");
  assert.equal(outcomeLabel("no", { yes: "He did.", no: "He didn’t." }), "No, he didn’t");
  assert.equal(outcomeLabel("yes", null), "Yes");
  assert.equal(outcomeLabel("no", { yes: "", no: "" }), "No");
  const sorted = [
    { userId: "a", name: "Alex", percent: 80 },
    { userId: "b", name: "Bea", percent: 20 },
    { userId: "c", name: "Gabe Ortiz", percent: 10 },
    { userId: "d", name: "John", percent: 5 },
  ];
  assert.deepEqual(annotation(sorted, 1, "z"), { userId: "b", line: "Only 20%, and still closer than Gabe and John." });
  assert.deepEqual(annotation(sorted, 1, "d"), { userId: "b", line: "Only 20%, and still closer than Gabe and you." });
  assert.equal(annotation([{ userId: "a", name: "Alex", percent: 80 }, { userId: "b", name: "Bea", percent: 30 }], 1, "z"), null, "the last row beats nobody");
  assert.equal(annotation([...sorted].reverse(), 0, "z"), null, "on a no, 80% is the wrong side and it ranks last");
  assert.equal(defaultStake({ quantifiable: true, monetary: true }), String(STAKES_MONEY[0]));
  assert.equal(defaultStake({ quantifiable: true, monetary: false }), String(STAKES_COUNT[0]));
  assert.equal(defaultStake({ quantifiable: false, monetary: false }), "1");
  assert.deepEqual([STAKES_MONEY, STAKES_COUNT], [[500, 1000, 2000], [1, 2, 3]]);
});

test("a market's ink on the document root carries both themes' layers (8.4, 9.3)", () => {
  const text = inkStyleText("sea");
  assert.ok(text.startsWith(`html{--ground:${INKS.sea.ground};`));
  assert.ok(text.includes(`html[data-theme="light"]{--ground:${INKS_LIGHT.sea.ground};`));
  assert.ok(text.includes(`@media (prefers-color-scheme: light){html:not([data-theme="dark"]){--ground:${INKS_LIGHT.sea.ground};`));
  for (const name of Object.keys(INKS) as Array<keyof typeof INKS>) assert.equal(INKS_LIGHT[name].hue, INKS[name].hue, `${name} keeps its hue across themes`);
});

test("the Mixed token draws glyphs, then words, then a rule and whole dollars, in one pill in the owner's hue (3.2)", () => {
  const unit = (label: string, template: "beer" | null, monetary = false) => ({ id: label, label, pluralLabel: `${label}s`, quantifiable: true, monetary, template, markKind: null, markValue: null });
  const html = renderToStaticMarkup(createElement(MixedToken, { owner: { id: "o", displayName: "Gabe Ortiz", hue: "aqua" }, other: { id: "v", displayName: "You" }, viewerId: "v", lines: [{ denomination: unit("dollar", null, true) as never, quantity: 4720n }, { denomination: unit("beer", "beer") as never, quantity: 2n }] }));
  assert.ok(html.includes('data-mixed="2"'), "one pill for two units");
  const body = html.slice(html.indexOf(">") + 1);
  assert.ok(body.indexOf("<svg") < body.indexOf("$47"), "the glyph tally before the dollars");
  assert.ok(body.includes("$47") && !body.includes("$47.20"), "whole dollars in the pill");
  assert.ok(html.includes("bg-line-strong"), "the rule before the dollars");
  assert.ok(/aria-label="Gabe Ortiz(?:&#x27;|’)s got you 2 beers, \$47\.20"/.test(html), `the accessible name keeps the cents: ${html.slice(0, 200)}`);
});
