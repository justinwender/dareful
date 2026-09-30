/**
 * The logo round (docs/design/reference/LOGO.md; docs/design.md 11): the count's four values in one block, the
 * first frame and the launch images as one picture, the one handoff with its timer in step with the fade, the
 * logo's own files where LOGO.md places them, Now's shell decided without a query, the instrument's reading, and
 * the visit that keeps Now's door warm. Every rule here is pure or read off the files, and every test has a
 * mutant in tests/mutation/mutants.ts that breaks it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import manifest from "@/app/manifest";
import { Mark, Wordmark } from "@/components/ui/wordmark";
import { keepWarm, WARM_HEADER } from "@/lib/ops/warm";
import { cutPhrasesIn, designWordsIn } from "@/lib/ui/copy-rules";
import { MARK, WORDMARK, WORDMARK_EM } from "@/lib/ui/logo";
import { MOTION } from "@/lib/ui/motion";
import { nowCookie, nowHintOf, shellShows } from "@/lib/ui/now-shell";
import { dressedOnly, GROUND_DARK, GROUND_LIGHT, HANDOFF_JS, handoffOf, LAUNCH_DEVICES, launchImageLinks, launchImagePath, LOGO_ON_DARK, LOGO_ON_LIGHT, OPENING_CSS, OPENING_ELEMENT, OPENING_HANDOFF_SCRIPT, OPENING_MARK, OPENING_STYLE, tallyOf } from "@/lib/ui/opening";

const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

test("the count is tuned in one place: the four values together at the top of the inline style, exactly as named, the stroke no longer than the pace, and every stroke's start counted from them", () => {
  // One block, the four names in it and nothing else, ahead of every other rule of the style that is inlined.
  const block = /^[\s\S]*?#opening \{\s*--tally-beat:[^;]+;[^\n]*\n\s*--tally-stroke:[^;]+;[^\n]*\n\s*--tally-pace:[^;]+;[^\n]*\n\s*--tally-curve:[^;]+;[^\n]*\n\}/.exec(OPENING_STYLE);
  assert.ok(block, "beat, stroke, pace and curve, together, exactly as named");
  assert.ok(!/\{/.test((block[0] as string).replace(/\/\*[\s\S]*?\*\//g, "").replace(/#opening \{[\s\S]*$/, "")), "no rule stands before the block");
  for (const name of ["beat", "stroke", "pace", "curve"]) assert.equal(OPENING_STYLE.split(`--tally-${name}:`).length - 1, 1, `--tally-${name} is set once`);
  const t = tallyOf(OPENING_STYLE);
  assert.ok(t, "the four values read out of the style");
  assert.ok(t.stroke <= t.pace, "a stroke longer than the pace would draw two at once (LOGO.md)");
  assert.equal(t.complete, t.beat + 4 * t.pace + t.stroke, "the count completes at beat + 4 x pace + stroke");
  // The four uprights and the crossing stroke start a pace apart, from the beat, and each draws over the stroke on the curve.
  assert.match(OPENING_STYLE, /#opening \.s \{[^}]*animation: dareful-down var\(--tally-stroke\) var\(--tally-curve\) 0ms 1 both;/);
  assert.match(OPENING_STYLE, /#opening \.s1 \{[^}]*animation-delay: var\(--tally-beat\); \}/);
  for (const n of [1, 2, 3, 4]) assert.ok(OPENING_STYLE.includes(`#opening .s${n + 1} {`) && new RegExp(`#opening \\.s${n + 1} \\{[^}]*animation-delay: calc\\(var\\(--tally-beat\\) \\+ ${n} \\* var\\(--tally-pace\\)\\); \\}`).test(OPENING_STYLE), `stroke ${n + 1} starts ${n} paces after the beat`);
  assert.match(OPENING_STYLE, /#opening \.s5 \{[^}]*animation-name: dareful-across; \}/, "the crossing stroke is drawn left to right");
  assert.equal(tallyOf("#opening { --tally-beat: 200ms; }"), null, "a style without the four is not a count");
});

test("the first frame is the launch image again, the bare ground with nothing drawn, in the phone's scheme; the ground is the tokens' once the document is dressed", async () => {
  // Nothing is drawn in the first frame: every stroke is clipped away whole until its turn.
  assert.match(OPENING_STYLE, /#opening \.s \{[^}]*clip-path: inset\(0 0 100% 0\);/);
  assert.match(OPENING_STYLE, /#opening \.s5 \{ -webkit-clip-path: inset\(0 100% 0 0\); clip-path: inset\(0 100% 0 0\);/);
  assert.equal((OPENING_MARK.match(/<div class="s s\d">/g) ?? []).length, 5, "four strokes and a fifth crossing them");
  assert.ok(OPENING_MARK.split(`fill="${LOGO_ON_DARK}"`).length - 1 === 5 && OPENING_STYLE.includes(`#opening .s path { fill: ${LOGO_ON_LIGHT}; }`), "one colour at a time: the chalk on dark, the ink on light");
  assert.ok(OPENING_STYLE.includes(`background: ${GROUND_DARK}`) && OPENING_STYLE.includes(`background: ${GROUND_LIGHT}`));
  assert.match(OPENING_STYLE, /#opening \.logo \{ position: absolute; left: 50%; top: 50%; width: 120px; height: 120px; margin: -60px 0 0 -60px; \}/, "the logo's box, centred on the full screen (11.2)");
  // Round D's fix, merged: no rule paints html or body for good.
  assert.ok(!/(^|\n)\s*html, body\b/.test(OPENING_STYLE), "every rule on html and body holds only until the handoff");
  assert.equal(OPENING_STYLE.split("html:not([data-dressed]), html:not([data-dressed]) body").length - 1, 3, "the ground, the light ground and the light scheme");
  assert.equal(dressedOnly("#opening { inset: 0; }\nhtml, body { margin: 0; }"), "#opening { inset: 0; }\nhtml:not([data-dressed]), html:not([data-dressed]) body { margin: 0; }");
  assert.equal(OPENING_STYLE, dressedOnly(OPENING_CSS), "the design's style, and nothing after it");
  // No switch for the count on a phone: the instrument that carried one left with the probe (docs/decisions.md 2026-09-29).
  for (const [name, text] of [["the style", OPENING_STYLE], ["the handoff", OPENING_HANDOFF_SCRIPT], ["the layout", readFileSync("src/app/layout.tsx", "utf8")]] as const) assert.ok(!/data-tally|dareful\.tally/.test(text), `${name} carries no switch`);
  // The launch images: one per iPhone in both sets, each the flat ground at the device's full pixel size.
  for (const d of LAUNCH_DEVICES) {
    for (const scheme of ["dark", "light"] as const) {
      const file = `public${launchImagePath(d, scheme)}`;
      assert.ok(existsSync(file), `${file} is there`);
      const meta = await sharp(file).metadata();
      assert.deepEqual([meta.width, meta.height], [d.width * d.ratio, d.height * d.ratio], `${file} at the device's pixel size`);
      const { channels } = await sharp(file).stats();
      const want = rgb(scheme === "dark" ? GROUND_DARK : GROUND_LIGHT);
      assert.deepEqual(
        channels.slice(0, 3).map((c) => [c.min, c.max]),
        want.map((v) => [v, v]),
        `${file} is the bare ground and nothing else`,
      );
    }
  }
  // The design's own link tags (recorded from its files) are all here, word for word, dark before light at every size.
  const links = launchImageLinks();
  const recorded = [...readFileSync("tests/fixtures/logo/launch-links.html", "utf8").matchAll(/<link rel="apple-touch-startup-image" href="([^"]+)" media="([^"]+)">/g)].map((m) => ({ url: m[1] as string, media: m[2] as string }));
  assert.equal(recorded.length, 22);
  for (const r of recorded) assert.ok(links.some((l) => l.url === r.url && l.media === r.media), `${r.url} as the design links it`);
  assert.equal(links.length, LAUNCH_DEVICES.length * 2);
  links.forEach((l, i) => assert.ok(l.media.endsWith(i % 2 === 0 ? "(prefers-color-scheme: dark)" : "(prefers-color-scheme: light)"), "dark before light, so a phone that ignores the scheme takes dark (11.3)"));
  // The generator's list is the same list: one device list, in two languages.
  const inScript = [...((/const DEVICES = \[([\s\S]*?)\];/.exec(readFileSync("scripts/opening.mjs", "utf8")) ?? [])[1] ?? "").matchAll(/\[(\d+), (\d+), (\d)\]/g)].map((x) => `${x[1]}x${x[2]}@${x[3]}`);
  assert.deepEqual(
    inScript,
    LAUNCH_DEVICES.map((x) => `${x.width}x${x.height}@${x.ratio}`),
  );
});

test("there is one handoff: the design's, called once on the frame after the shell has painted, marking the document dressed, every stroke stopped where it is, its timer in step with the ground's fade", () => {
  assert.ok(OPENING_HANDOFF_SCRIPT.includes(HANDOFF_JS), "the design's handoff, as delivered");
  assert.ok(!/\bexport\b/.test(HANDOFF_JS) && HANDOFF_JS.includes("function handOffOpening()") && HANDOFF_JS.includes("function afterFirstPaint(fn)"));
  const app = OPENING_HANDOFF_SCRIPT.replace(HANDOFF_JS, "");
  assert.equal(app.split("afterFirstPaint(").length - 1, 1, "called once");
  assert.equal(app.split("handOffOpening()").length - 1, 1, "and the handoff once");
  assert.match(app, /afterFirstPaint\(function\(\)\{d\.setAttribute\("data-dressed",""\);mark\("dareful:shell"\);handOffOpening\(\);\}\)/, "dressed on the frame the fades begin (Round D)");
  assert.ok(!/await|fetch|then\(/.test(OPENING_HANDOFF_SCRIPT), "it never waits for data");
  const h = handoffOf(OPENING_STYLE, HANDOFF_JS);
  assert.ok(h);
  assert.equal(h.logo, MOTION.quick, "the logo fades over quick");
  assert.equal(h.ground, MOTION.base, "the ground fades over base");
  assert.ok(h.fallback > h.ground && h.fallback - h.ground <= 100, `the timer that removes the element stays just above the ground's fade: ${h.fallback} against ${h.ground}`);
  assert.match(OPENING_STYLE, /#opening\.handoff \.s \{ animation-play-state: paused; \}/, "whatever is mid-stroke stops where it is");
  // Reduce Motion: nothing is drawn; the whole mark fades in over base, and the same two fades.
  const reduce = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(OPENING_STYLE)?.[1] ?? "";
  assert.match(reduce, /#opening \.s \{ animation: none; -webkit-clip-path: none; clip-path: none; \}/);
  assert.match(reduce, new RegExp(`#opening \\.logo \\{ animation: dareful-in ${MOTION.base}ms `));
  // The layout: the style in the head, the element the body's first, outside the app root, one handoff, and nothing waited for.
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  assert.ok(!/\bawait\b/.test(layout) && !/export default async function/.test(layout), "the root layout never waits: the first screen's shell goes out before the account is read (11.5)");
  assert.match(layout, /<head>[\s\S]*<style dangerouslySetInnerHTML=\{\{ __html: OPENING_STYLE \}\} \/>[\s\S]*<\/head>/);
  assert.match(layout, /<body[^>]*>\s*(?:\{\/\*[\s\S]*?\*\/\}\s*)*<div data-opening-host="" className="contents" suppressHydrationWarning dangerouslySetInnerHTML=\{\{ __html: OPENING_ELEMENT \}\} \/>/, "the first thing in the body, in a box the app keeps when the handoff takes the opening away");
  assert.ok(layout.indexOf("data-opening-host") < layout.indexOf('id="app"'));
  assert.equal(OPENING_ELEMENT, `<div id="opening" aria-hidden="true">${OPENING_MARK}</div>`);
  assert.match(layout, /<html [^>]*suppressHydrationWarning>/, "what the head's scripts and the handoff set on html is theirs");
  assert.equal(layout.split("OPENING_HANDOFF_SCRIPT }").length - 1, 1, "exactly one handoff");
});

test("Now's shell is decided from the cookie alone: the + and Got a code? for someone signed in, neither on an empty Now, and what the content says outranks what the phone remembers", () => {
  assert.equal(nowHintOf(undefined), "full");
  assert.equal(nowHintOf("empty"), "empty");
  assert.equal(nowHintOf("anything else"), "full");
  assert.equal(nowCookie("empty"), "dareful_now=empty; path=/; max-age=31536000; samesite=lax");
  assert.deepEqual(shellShows("full", null), { start: true, gotCode: true, sheet: "now", bar: true });
  assert.deepEqual(shellShows("empty", null), { start: false, gotCode: false, sheet: "now-first-run", bar: true });
  assert.deepEqual(shellShows("empty", "full"), { start: true, gotCode: true, sheet: "now", bar: true }, "the content outranks the hint");
  assert.deepEqual(shellShows("full", "empty"), { start: false, gotCode: false, sheet: "now-first-run", bar: true });
  assert.deepEqual(shellShows("full", "out"), { start: false, gotCode: false, sheet: "now", bar: false }, "a cookie that was good and an account that is gone");
  // The stylesheet applies the same rule before any script runs.
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.ok(css.includes('html:has([data-now="empty"]) :is([data-start], [data-now-full]),'));
  assert.ok(css.includes('html:has([data-now-hint="empty"]):not(:has([data-now])) :is([data-start], [data-now-full]) { display: none; }'));
  assert.ok(css.includes('html:has([data-now="full"]) [data-now-empty],') && css.includes('html:has([data-now-hint="full"]):not(:has([data-now])) [data-now-empty] { display: none; }'));
  assert.ok(css.includes("html[data-arriving] [data-now] { animation: fade-in var(--motion-base) var(--ease-fade) both; }"), "the content fades in over base where a shell stood waiting (9.4)");
  // The page: no query stands between a cold start and the shell, and the content arrives behind it.
  const page = readFileSync("src/app/page.tsx", "utf8");
  assert.ok(page.includes("sessionUserId") && !page.includes("currentUser") && !page.includes("nowFor"), "the shell reads the cookie, never the account or Now");
  assert.match(page, /<Suspense fallback=\{<NowWaiting \/>\}>\s*<NowContent /);
  assert.ok(page.indexOf("<TabBar") > page.indexOf("</Suspense>") && page.indexOf("<RootHeader") < page.indexOf("<Suspense"), "the header row and the tab bar are the shell's, around the content");
  const session = readFileSync("src/lib/auth/session.ts", "utf8");
  const cookieOnly = /export const sessionUserId = cache\(async function sessionUserId\(\)[\s\S]*?\n\}\);/.exec(session)?.[0] ?? "";
  assert.ok(cookieOnly.includes("jwtVerify") && !/\bdb\./.test(cookieOnly), "whose session it is comes from the cookie's own signature, with no query");
});

test("the logo's own files sit where LOGO.md places them: the icons as delivered, the one safe for Android's cropping, the favicon drawn to the grid, the link preview, and the wordmark's outlines in one colour", async () => {
  const m = manifest();
  assert.deepEqual(m.icons, [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ]);
  assert.equal(m.background_color, GROUND_DARK);
  for (const [served, delivered, size] of [
    ["public/apple-touch-icon.png", "assets/logo/icon/apple-touch-icon.png", 180],
    ["public/icon-192.png", "assets/logo/icon/icon-192.png", 192],
    ["public/icon-512.png", "assets/logo/icon/icon-512.png", 512],
    ["public/icon-maskable-512.png", "assets/logo/icon/icon-maskable-512.png", 512],
  ] as const) {
    assert.ok(readFileSync(served).equals(readFileSync(delivered)), `${served} is the design's file, as delivered`);
    const meta = await sharp(served).metadata();
    assert.deepEqual([meta.width, meta.height, meta.hasAlpha], [size, size, false], `${served}: full-bleed and opaque`);
  }
  // The safe one is a different drawing: the mark is smaller in it.
  assert.ok(!readFileSync("public/icon-maskable-512.png").equals(readFileSync("public/icon-512.png")));
  // The favicon: the design's own .ico, which holds 16, 32 and 48, never the mark scaled down by the app.
  const ico = readFileSync("public/favicon.ico");
  assert.ok(ico.equals(readFileSync("assets/logo/favicon/favicon.ico")));
  assert.deepEqual([ico.readUInt16LE(0), ico.readUInt16LE(2), ico.readUInt16LE(4)], [0, 1, 3]);
  assert.deepEqual([0, 1, 2].map((i) => ico.readUInt8(6 + 16 * i)).sort((a, b) => a - b), [16, 32, 48]);
  assert.ok(readFileSync("public/favicon.svg", "utf8").includes("prefers-color-scheme: light"), "the .svg follows the browser's scheme");
  const og = await sharp("public/og-image.png").metadata();
  assert.deepEqual([og.width, og.height], [1200, 630]);
  const badge = await sharp("public/badge-96.png").metadata();
  assert.deepEqual([badge.width, badge.height, badge.hasAlpha], [96, 96, true], "the badge is the mark alone on nothing");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  for (const path of ['"/favicon.ico", sizes: "48x48"', '"/favicon.svg", type: "image/svg+xml"', 'apple: "/apple-touch-icon.png"', 'url: "/og-image.png"']) assert.ok(layout.includes(path), `the head names ${path}`);
  assert.ok(readFileSync("public/sw.js", "utf8").includes('icon: "/icon-192.png", badge: "/badge-96.png"'));
  // The outlines are the files' own: seven letters and five strokes, never redrawn.
  assert.equal(WORDMARK.paths.length, 7);
  assert.equal(MARK.paths.length, 5);
  const source = readFileSync("assets/logo/svg/wordmark-on-dark.svg", "utf8");
  for (const p of WORDMARK.paths) assert.ok(source.includes(`d="${p.d}"`) && p.transform !== null && source.includes(`transform="${p.transform}"`));
  const tally = readFileSync("assets/logo/svg/mark-on-dark.svg", "utf8");
  for (const p of MARK.paths) assert.ok(tally.includes(`d="${p.d}"`));
  // In a header: 20px type, over the 64px it may never go under, in the colour of the text around it and no other.
  const drawn = renderToStaticMarkup(createElement(Wordmark, {}));
  assert.equal(WORDMARK_EM, 200);
  const width = Number(/ width="([\d.]+)"/.exec(drawn)?.[1]);
  assert.ok(Math.abs(width - 74.96) < 0.01 && width >= 64, `20px type draws the wordmark ${width}px wide`);
  assert.ok(drawn.includes('fill="currentColor"') && drawn.includes("<title>dareful</title>") && drawn.includes("data-wordmark"));
  assert.ok(!/#[0-9a-fA-F]{3,8}\b|stroke=|filter=|rotate\(/.test(drawn), "no colour of its own, no outline, no shadow, no tilt");
  assert.match(renderToStaticMarkup(createElement(Mark, { height: 12 })), / height="20"/, "the mark is never under 20px tall");
  const screen = readFileSync("src/components/ledger/screen.tsx", "utf8");
  assert.match(screen, /\) : wordmark \? \(\s*<span className="-ml-3 flex h-12 items-center px-3 text-ink">\s*<Wordmark \/>/, "a 48px slot with 12px sides, where back would be, and never beside it");
  assert.ok(/<TopBar wordmark info="claimant" \/>/.test(readFileSync("src/app/welcome/page.tsx", "utf8")), "the claimant screen: the wordmark alone and no back (3.38)");
});

test("the visit that keeps Now's door warm asks for Now's own address as nobody, and never fails the tick", async () => {
  const seen: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fetcher = (async (url: URL | RequestInfo, init?: RequestInit) => {
    seen.push({ url: String(url), init });
    return new Response("<html></html>", { status: 200 });
  }) as typeof fetch;
  const warmed = await keepWarm({ origin: "https://dareful.app", fetcher });
  assert.ok(warmed && warmed.ok && warmed.ms >= 0);
  assert.equal(seen.length, 1);
  assert.equal(seen[0]?.url, "https://dareful.app/");
  assert.equal(seen[0]?.init?.method, "GET");
  const headers = new Headers(seen[0]?.init?.headers);
  assert.equal(headers.get(WARM_HEADER), "1");
  assert.ok(!headers.has("cookie") && !headers.has("authorization"), "as nobody: no cookie and no secret");
  assert.equal(await keepWarm({ origin: "https://dareful.app", fetcher: (async () => Promise.reject(new Error("down"))) as unknown as typeof fetch }), null, "a miss is a slow start and nothing else");
  assert.equal(await keepWarm({ origin: "", fetcher }), null);
  const route = readFileSync("src/app/api/tick/route.ts", "utf8");
  assert.ok(route.indexOf("const warming = keepWarm();") < route.indexOf("const report = await tick(") && route.includes("warmed: await warming"), "beside the jobs, never waited for ahead of them");
});

test("the copy rules: a phrase cut everywhere and the design's own words are both seen when they are there", () => {
  assert.deepEqual(cutPhrasesIn("Put your number on it."), ["Put your number on it"]);
  assert.deepEqual(cutPhrasesIn("Opens that question with your number to put on it."), [], "a different sentence is a different sentence");
  assert.deepEqual(cutPhrasesIn("Puts your number on it and sends it."), ["Put your number on it"]);
  assert.deepEqual(cutPhrasesIn("Your vote is signed from your own phone."), ["Your vote is signed"]);
  assert.deepEqual(cutPhrasesIn("Your vote only ever comes from your own phone, and a majority settles it."), []);
  for (const [text, word] of [
    ["the chalk counts the picked rows", "the chalk"],
    ["The time in the band", "the band"],
    ["The two wells", "the wells"],
    ["Opens Settled, the photo moment", "the photo moment"],
    ["The rally", "the rally"],
    ["a majority of the set settles it", "the set"],
    ["Shows once ten sets of people are on a game", "the set"],
    ["from the slot at the bottom", "the slot"],
    ["The add tile", "the add tile"],
    ["in the owner’s colour", "the owner's colour"],
    ["the count line under it", "the count line"],
    ["the citron dot", "citron"],
    ["The context chips", "the context chips"],
  ] as const)
    assert.deepEqual(designWordsIn(text), [word], text);
  assert.deepEqual(designWordsIn("It settles once a majority has said; as well as that, Settled asks for a photo."), [], "settle, settled and as well are the product's own words");
});
