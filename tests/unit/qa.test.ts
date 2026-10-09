/**
 * The QA round (docs/decisions.md 2026-09-29; docs/testing.md session 30): the rules that came out of walking the
 * app on the simulator and in the real sessions. Each is pure or read off the markup a component draws, and each
 * has a mutant in tests/mutation/mutants.ts that breaks it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { askLayerStands } from "@/components/markets/ask-layer";
import { retryOf } from "@/components/ui/button";
import { claimDrag, pullStartsHere } from "@/components/ui/handle";
import { InfoIcon, InfoSheetView } from "@/components/ui/info";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { contentFits, Sheet } from "@/components/ui/sheet";
import { forcesTool } from "@/lib/ai/client";
import { closesLabel } from "@/lib/ui/copy";
import { CLOSINGS, closeMoment, nearestClosing } from "@/lib/ledger/closings";
import { draftAlreadySaved } from "@/lib/ledger/markets";
import { INFO_FIXED_LINE } from "@/lib/ui/info";
import { answerLands, sheetPresent } from "@/lib/ui/stage";
import { CONTROLS, tapCounts } from "@/lib/ui/taps";
import { invalidated, landedOn, QUIET_MS, resetTouchFetch, touched, touchKindOf, WARM_AFTER_MS, WARM_FOR_MS } from "@/lib/ui/touch-fetch";
import { browserAnimated, EDGE_PX, landed, landingByTraversal, LANDING_MS, resetTraversal, touchBegan, touchReleased, traversed } from "@/lib/ui/traversal";
import { takesKeyboard } from "@/lib/ui/viewport";
import { storedZone, ZONE_COOKIE, zoneCookie, zoneToReport } from "@/lib/ui/zone-report";

test("the entry sheet goes in the render the entry line arrives in: it stands only before you're in or while changing (3.24)", () => {
  assert.equal(sheetPresent(false, false), true, "not in: entering is the move");
  assert.equal(sheetPresent(true, false), false, "in, and not changing: nothing is the move, so no sheet beside the entry line");
  assert.equal(sheetPresent(true, true), true, "changing: the sheet is back");
  // The stage reads the rule and keeps no clock of its own.
  const stage = readFileSync("src/components/markets/market-stage.tsx", "utf8");
  assert.ok(stage.includes("const entering = sheetPresent(reading, changing);"), "the stage's sheet is the rule's");
  assert.ok(!/ENTERING_MS|phase === "entering"/.test(stage), "and nothing holds it for a while after");
});

test("an answer lands only where it was asked: a late one never moves a step the person has left, or a line they have changed", () => {
  const asked = { step: "question", line: "Trajan was the greatest Roman emperor" };
  assert.equal(answerLands(asked, { step: "question", line: "Trajan was the greatest Roman emperor" }), true);
  assert.equal(answerLands(asked, { step: "who", line: "Trajan was the greatest Roman emperor" }), false, "they went on");
  assert.equal(answerLands(asked, { step: "question", line: "Hadrian was" }), false, "they changed the line");
});

test("the steps of asking stand only at asking's own address, and a question is sent once: a second send answers with the draft the first one made", () => {
  assert.equal(askLayerStands("/m/new"), true);
  assert.equal(askLayerStands("/m/2e2ab76a-6c29-49a9-8b98-4aaae27906da"), false, "the question's own screen has nothing over it");
  assert.equal(askLayerStands("/"), false);
  assert.equal(askLayerStands(null), false);
  const me = "8e688701-b3ec-48cd-b8ba-7286e76ce947";
  assert.equal(draftAlreadySaved(null, me), "new");
  assert.equal(draftAlreadySaved({ creatorId: me, creatorSignature: null }, me), "saved", "this person's own draft: the second tap opens it");
  assert.equal(draftAlreadySaved({ creatorId: me, creatorSignature: Buffer.from([1]) }, me), "taken", "already sent");
  assert.equal(draftAlreadySaved({ creatorId: "someone-else", creatorSignature: null }, me), "taken", "never someone else's");
});

test("Try again under a control that has not come back is the same tap again: its own handler, or its form submitted (5.2)", () => {
  let clicked = 0;
  let submitted = 0;
  const form = { requestSubmit: () => void submitted++ };
  retryOf({ type: "button", form: null, click: () => void clicked++ });
  assert.deepEqual([clicked, submitted], [1, 0]);
  retryOf({ type: "submit", form, click: null });
  assert.deepEqual([clicked, submitted], [1, 1], "a control that submits a form has no handler of its own: the form is submitted again");
  retryOf({ type: "submit", form, click: () => void clicked++ });
  assert.deepEqual([clicked, submitted], [2, 1], "its own handler first, where it has one");
  retryOf({ type: "button", form, click: null });
  assert.deepEqual([clicked, submitted], [2, 1], "a plain control with no handler does nothing");
});

test("a model that refused a forced tool choice is asked plainly from then on, so the refusal is paid for once", () => {
  assert.equal(forcesTool("some-model", new Set()), true);
  assert.equal(forcesTool("some-model", new Set(["some-model"])), false);
  assert.equal(forcesTool("another", new Set(["some-model"])), true);
});

test("a drag that starts on a sheet's handle row is the sheet's alone (3.24, 6.4, 9.9): both rows carry the claim and touch-action none, the claim cancels a touch's move and is never passive, and the close sits outside the row", () => {
  const modal = renderToStaticMarkup(createElement(Sheet, { open: true, onClose: () => undefined, labelledBy: "t" } as Parameters<typeof Sheet>[0], createElement("p", null, "inside")));
  const pinned = renderToStaticMarkup(createElement(PinnedSheet, { label: "Your number", low: createElement("p", null, "low"), high: createElement("p", null, "high") }));
  for (const [name, html] of [["the modal sheet", modal], ["the pinned sheet", pinned]] as const) {
    const row = /<div[^>]*data-sheet-handle=""[^>]*>/.exec(html)?.[0] ?? "";
    assert.ok(row, `${name} names its handle row`);
    assert.ok(/class="[^"]*\btouch-none\b/.test(row), `${name}: the row takes the pan from the page`);
  }
  // The close is beside the row, never in it: the row captures the pointer and cancels the touch's moves.
  const rowOpen = modal.indexOf('data-sheet-handle=""');
  const rowClose = modal.indexOf("</div>", rowOpen);
  assert.ok(modal.indexOf('aria-label="Close"') > rowClose, "a tap on Close reaches Close");
  // The pinned sheet's own box takes no touches, so the page above a lowered sheet is still the page's.
  assert.ok(/<section[^>]*data-pinned-sheet="low"[^>]*class="pointer-events-none /.test(pinned) && /class="pointer-events-auto /.test(pinned), "only the sheet itself takes touches");
  const calls: Array<[string, string, unknown]> = [];
  const fake = { addEventListener: (type: string, _l: unknown, options: unknown) => void calls.push(["add", type, options]), removeEventListener: (type: string) => void calls.push(["remove", type, null]) };
  let listener: ((e: Event) => void) | null = null;
  const undo = claimDrag({ addEventListener: (type: string, l: EventListenerOrEventListenerObject, options?: boolean | AddEventListenerOptions) => (fake.addEventListener(type, l, options), void (listener = l as (e: Event) => void)), removeEventListener: (type: string) => fake.removeEventListener(type) } as Pick<HTMLElement, "addEventListener" | "removeEventListener">);
  assert.deepEqual(calls, [["add", "touchmove", { passive: false }]], "one listener, and it may cancel");
  let prevented = 0;
  (listener as unknown as (e: Event) => void)({ cancelable: true, preventDefault: () => void prevented++ } as unknown as Event);
  (listener as unknown as (e: Event) => void)({ cancelable: false, preventDefault: () => void prevented++ } as unknown as Event);
  assert.equal(prevented, 1, "it cancels a move that can be cancelled, and leaves one that cannot");
  undo?.();
  assert.deepEqual(calls[1], ["remove", "touchmove", null]);
  assert.equal(claimDrag(null), undefined);
});

test("a pull to re-read starts on the page: a touch that starts in a sheet, pinned or modal, in the ask layer or in a dialog belongs to it (5.5)", () => {
  assert.equal(pullStartsHere("app", false), true);
  assert.equal(pullStartsHere(null, false), true);
  for (const layer of ["sheet", "modal", "ask"]) assert.equal(pullStartsHere(layer, false), false, layer);
  assert.equal(pullStartsHere("app", true), false, "inside a dialog");
  assert.equal(pullStartsHere("tab-bar", false), true, "the bar is not a sheet");
});

test("the information sheet may reach the top and scrolls as one piece: the name and the fixed line go with the entries, under the sheet's own handle row and close, and the icon never stands above a layer (10.4, 10.5)", () => {
  const sheet = renderToStaticMarkup(createElement(InfoSheetView, { sheet: "now", open: true, onClose: () => undefined, labelledBy: "n" }));
  // From the opening of the element that carries the attribute, so its own class is read too (a `sticky` there is the banner back).
  const inside = sheet.slice(sheet.lastIndexOf("<", sheet.indexOf("data-info-sheet=")));
  assert.ok(inside.includes(INFO_FIXED_LINE) && /<h2[^>]*id="n"/.test(inside), "the name and the fixed line are in the piece that scrolls");
  assert.ok(!/\bsticky\b/.test(inside), "nothing in it is pinned");
  const panel = /<div[^>]*role="dialog"[^>]*>/.exec(sheet)?.[0] ?? "";
  // Up to the status bar, on the wrapper that rises and leaves; the panel inside it is its height and moves by its own transform (the touch-ups round).
  const wrapper = sheet.slice(0, sheet.indexOf('role="dialog"'));
  assert.ok(wrapper.includes("max-h-[calc(100%_-_env(safe-area-inset-top))]") && panel.includes("max-h-full"), "as tall as its content, up to the status bar");
  assert.ok(!panel.includes("h-[min(560px,85%)]") && !panel.includes("max-h-[85%]") && !/\boverflow-y-auto\b/.test(panel), "neither the picker's height nor the ordinary cap, and the panel itself does not scroll");
  // The handle row and the close are the panel's; the box under them is what scrolls.
  const scroll = sheet.indexOf("data-sheet-scroll=");
  assert.ok(scroll > sheet.indexOf('aria-label="Close"') && scroll < sheet.indexOf("data-info-sheet="), "the close stays where it is while the entries scroll under it");
  assert.ok(/<div[^>]*class="[^"]*\boverflow-y-auto\b[^"]*"[^>]*data-sheet-scroll="(fits|scrolls)"/.test(sheet));
  const icon = /<button[^>]*data-info-icon="now"[^>]*>/.exec(renderToStaticMarkup(createElement(InfoIcon, { sheet: "now" })))?.[0] ?? "";
  assert.ok(icon, "the icon");
  assert.ok(!/class="[^"]*(^|\s)z-(\[|\d)/.test(icon) && !/\bz-\[60\]/.test(icon), "part of its page: whatever covers the page covers the icon");
});

test("a traversal is known in one place (9.7): the browser's own flag, else a touch that began at a side edge and was never released to the page; a tap is neither; and it is forgotten once the screen has landed", () => {
  const t = 1_000_000;
  resetTraversal();
  assert.equal(landingByTraversal("/m/x", t), false);
  traversed(true, "/m/x", t);
  assert.equal(browserAnimated("/m/x", t + 100), true);
  assert.equal(landingByTraversal("/people", t + 100), false, "another screen is its own arrival");
  assert.equal(landingByTraversal("/m/x", t + LANDING_MS), false, "long after, it is an arrival like any other");
  landed();
  assert.equal(landingByTraversal("/m/x", t + 100), false, "forgotten once landed");
  // No flag (a browser without it, or the app's own router.back): a traversal, and not one the browser animated.
  traversed(undefined, "/", t);
  assert.equal(landingByTraversal("/", t + 10), true);
  assert.equal(browserAnimated("/", t + 10), false);
  traversed(false, "/", t);
  assert.equal(browserAnimated("/", t + 10), false);
  // The touch: within 30px of either edge, and never released to the page.
  resetTraversal();
  touchBegan(EDGE_PX - 18, 390, t);
  traversed(undefined, "/", t + 300);
  assert.equal(browserAnimated("/", t + 310), true, "the phone took the touch for its swipe");
  resetTraversal();
  touchBegan(12, 390, t);
  touchReleased();
  traversed(undefined, "/", t + 300);
  assert.equal(browserAnimated("/", t + 310), false, "a tap at the edge (Close, Back) is a tap");
  resetTraversal();
  touchBegan(200, 390, t);
  traversed(undefined, "/", t + 300);
  assert.equal(browserAnimated("/", t + 310), false, "a touch in the middle is no swipe from the edge");
  resetTraversal();
  touchBegan(390 - 5, 390, t);
  traversed(undefined, "/", t + 300);
  assert.equal(browserAnimated("/", t + 310), true, "the right edge, for a swipe forward");
  resetTraversal();
});

test("a screen that lands from a traversal arrives with none of the app's motion, and every arrival reads the one mark (9.7)", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  assert.match(css, /html\[data-traversal\] :is\(\.motion-arrive, \.motion-rise, \.motion-step-in, \.motion-fade-in\),\s*html\[data-traversal\] \.page-arrive > \*,\s*html\[data-traversal\]\[data-arriving\] \[data-now\] \{ animation: none; \}/);
  const transitions = readFileSync("src/lib/ui/transitions.ts", "utf8");
  assert.equal(transitions.split("if (!doc.startViewTransition || landingByTraversal(location.pathname)) {").length - 1, 2, "neither transition runs over the phone's own");
  assert.match(css, /html\.back::view-transition-new\(root\) \{ animation-delay: 0s; \}/, "Back's list fades in from 0 (9.7)");
  // The action bar's two pictures name their own fades and fill, so an old bar never comes back once it has faded.
  assert.match(css, /::view-transition-old\(ask-action\) \{ animation: fade-out var\(--motion-quick\) var\(--ease-fade\) both; \}/);
  assert.match(css, /::view-transition-new\(ask-action\) \{ animation: fade-in var\(--motion-quick\) var\(--ease-fade\) both; \}/);
});

test("the document never scrolls: the app root is the one scrolling box, the screen's height, and a keyboard is read from the field that takes it", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const html = /\n  html \{[^}]*\}/.exec(css)?.[0] ?? "";
  const body = /\n  body \{[^}]*\}/.exec(css)?.[0] ?? "";
  assert.ok(/height: 100%;/.test(html) && /overflow: hidden;/.test(html), "html is the screen's height and never scrolls");
  assert.ok(/height: 100%;/.test(body) && /overflow: hidden;/.test(body), "so is body");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const app = /<div id="app"[^>]*>/.exec(layout)?.[0] ?? "";
  assert.ok(/\bfixed\b/.test(app) && /\binset-0\b/.test(app) && /\boverflow-y-auto\b/.test(app), "the app root is a fixed box the size of the screen that scrolls its own overflow");
  assert.ok(!/data-viewport-shift|--vv-top|--vv-bottom|data-viewport-probe/.test(css + layout + readFileSync("src/components/ui/layers.tsx", "utf8")), "the guard and its probes are gone");
  assert.ok(!/(html|body|#app|#layers)[^{]*\{[^}]*translate:/.test(css), "nothing above the layers ever moves (9.3)");
  assert.equal(takesKeyboard({ tagName: "INPUT", getAttribute: () => "text" }), true);
  assert.equal(takesKeyboard({ tagName: "INPUT", getAttribute: () => null }), true, "an input with no type is a text field");
  assert.equal(takesKeyboard({ tagName: "INPUT", getAttribute: () => "range" }), false, "a slider takes no keyboard");
  assert.equal(takesKeyboard({ tagName: "TEXTAREA" }), true);
  assert.equal(takesKeyboard({ tagName: "DIV", isContentEditable: true }), true);
  assert.equal(takesKeyboard({ tagName: "BUTTON" }), false);
  assert.equal(takesKeyboard(null), false);
});

test("a touch on a row fetches its screen whole only while the route is known, and the route's shape otherwise (9.4)", () => {
  assert.equal(touchKindOf("/m/2e2ab76a-6c29-49a9-8b98-4aaae27906da?side=yes"), "market");
  assert.equal(touchKindOf("/m/new"), null, "asking is no market");
  assert.equal(touchKindOf("/m/2e2ab76a-6c29-49a9-8b98-4aaae27906da/pass"), null);
  assert.equal(touchKindOf("/on/abc?g=1"), "game");
  assert.equal(touchKindOf("/on/abc/def"), "game");
  assert.equal(touchKindOf("/on"), null, "the tab is a root");
  assert.equal(touchKindOf("/people"), null);
  assert.equal(touchKindOf(null), null);
  resetTouchFetch();
  const t = 10_000_000;
  assert.equal(touched("market", t), "auto", "nothing known: the shape alone");
  assert.equal(touched("market", t + WARM_AFTER_MS - 1), "auto", "the shape has not certainly arrived yet");
  assert.equal(touched("market", t + WARM_AFTER_MS), "full");
  assert.equal(touched("market", t + WARM_FOR_MS - 1), "full");
  assert.equal(touched("market", t + WARM_FOR_MS), "auto", "past the router's hold the shape may be gone");
  assert.equal(touched("market", t + WARM_FOR_MS + 1000), "auto", "and a request the router may have answered from what it held opens no new window");
  assert.equal(touched("game", t + WARM_AFTER_MS), "auto", "a game's shape is its own");
  // After a quiet, the first touch learns the shape again and the next one leans on it.
  const later = t + WARM_FOR_MS + 1000 + QUIET_MS;
  assert.equal(touched("market", later), "auto");
  assert.equal(touched("market", later + WARM_AFTER_MS), "full");
  invalidated("market");
  assert.equal(touched("market", later + WARM_AFTER_MS + 10), "auto", "the router let go of what it held");
  assert.equal(touched("market", later + WARM_AFTER_MS + 2000), "auto", "and only a quiet opens the window again");
  // Arriving at a screen of the kind teaches the router its shape too.
  resetTouchFetch();
  landedOn("market", t);
  assert.equal(touched("market", t + WARM_AFTER_MS), "full");
  resetTouchFetch();
});

test("every screen that is the document's own is tall enough to scroll, a root and a task screen alike, and a step inside the ask layer is not (docs/testing.md item 61)", () => {
  const screen = readFileSync("src/components/ledger/screen.tsx", "utf8");
  assert.ok(screen.includes('!layer && "min-h-[calc(100lvh_+_1px)]"'), "by whether it is in a layer, never by whether it is a root");
  assert.ok(!screen.includes('root && "min-h-'), "a task screen that fits the screen was laid out short, its sheet above the real edge");
});

test("the page behind a modal sheet holds still (9.2, 9.9): a sheet whose content fits takes no pan, and one that overflows scrolls itself", () => {
  assert.equal(contentFits(594, 594), true);
  assert.equal(contentFits(594.4, 594), true, "rounding is not an overflow");
  assert.equal(contentFits(900, 594), false);
  const fits = renderToStaticMarkup(createElement(Sheet, { open: true, onClose: () => undefined, labelledBy: "t" } as Parameters<typeof Sheet>[0], createElement("p", null, "short")));
  const box = /<div[^>]*data-sheet-scroll="[^"]*"[^>]*>|<div[^>]*class="[^"]*"[^>]*data-sheet-scroll="[^"]*"/.exec(fits)?.[0] ?? "";
  assert.ok(/data-sheet-scroll="fits"/.test(box) && /\btouch-none\b/.test(box), "before anything is measured the sheet takes no pan, so nothing reaches the page");
  assert.ok(/\boverscroll-contain\b/.test(box) && /\boverflow-y-auto\b/.test(box), "and one that overflows keeps its own scroll");
  const clear = renderToStaticMarkup(createElement(Sheet, { open: true, clear: true, onClose: () => undefined, labelledBy: "t" } as Parameters<typeof Sheet>[0], createElement("p", null, "short")));
  assert.ok(!/data-sheet-scroll="[^"]*"[^>]*touch-none|touch-none[^>]*data-sheet-scroll/.test(clear), "a clear sheet leaves the photo behind it to the finger (3.28)");
});

test("a close chip's word is the word the screen reads back: Tonight ends today and Tomorrow ends tomorrow, a minute before midnight in the asker's zone, whatever the hour; the week and the month are spans (the QA round)", () => {
  const zone = "America/New_York";
  // A Tuesday at 8:26pm in New York (the moment the mismatch was seen): 30 hours on was Thursday 2:26am.
  const evening = new Date("2026-09-30T00:26:00Z");
  const tonight = closeMoment("tonight", evening, zone);
  const tomorrow = closeMoment("tomorrow", evening, zone);
  assert.equal(tonight.toISOString(), "2026-09-30T03:59:00.000Z", "11:59pm Tuesday, New York");
  assert.equal(tomorrow.toISOString(), "2026-10-01T03:59:00.000Z", "11:59pm Wednesday, New York");
  assert.equal(closesLabel(tonight, evening, zone), "tonight");
  assert.equal(closesLabel(tomorrow, evening, zone), "tomorrow");
  // An afternoon, and a zone east of Greenwich where the date has already turned: still today and tomorrow there.
  const noonTokyo = new Date("2026-09-29T03:00:00Z");
  assert.equal(closesLabel(closeMoment("tonight", noonTokyo, "Asia/Tokyo"), noonTokyo, "Asia/Tokyo"), "tonight");
  assert.equal(closesLabel(closeMoment("tomorrow", noonTokyo, "Asia/Tokyo"), noonTokyo, "Asia/Tokyo"), "tomorrow");
  // A clock change that night (New York falls back on 2026-11-01): the end of Saturday is still a minute before midnight.
  const beforeChange = new Date("2026-10-31T20:00:00Z");
  assert.equal(closeMoment("tomorrow", beforeChange, zone).toISOString(), "2026-11-02T04:59:00.000Z", "11:59pm Sunday, once the clocks have gone back");
  // East of Greenwich the guess lands past the change: Auckland's clocks go forward at 2am on Sunday 2026-09-27, and
  // the end of the Saturday before is still a minute before midnight on the old offset, not an hour early.
  assert.equal(closeMoment("tonight", new Date("2026-09-26T00:00:00Z"), "Pacific/Auckland").toISOString(), "2026-09-26T11:59:00.000Z", "11:59pm Saturday in Auckland, the night its clocks change");
  // The spans, from now.
  assert.equal(closeMoment("week", evening, zone).getTime() - evening.getTime(), 7 * 24 * 3_600_000);
  assert.equal(closeMoment("month", evening, zone).getTime() - evening.getTime(), 30 * 24 * 3_600_000);
  // The write-up's hours land on the nearest chip, and the four chips read as the form draws them.
  assert.equal(nearestClosing(6), "tonight");
  assert.equal(nearestClosing(40), "tomorrow");
  assert.equal(nearestClosing(120), "week");
  assert.equal(nearestClosing(600), "month");
  assert.deepEqual(CLOSINGS.map((c) => c.label), ["Tonight", "Tomorrow", "This week", "This month"]);
  const form = readFileSync("src/components/markets/ask-form.tsx", "utf8");
  assert.match(form, /decideByMoment\(decide, now, zone\)/, "the form asks the moment of the decide-by in the asker's own zone (src/lib/ledger/decide-by.ts, the first-contact round)");
  assert.doesNotMatch(form, /hours \* 3_600_000/, "no chip is a count of hours any more");
});

test("the viewer's zone is reported from the root on every screen, once per browser: written when the cookie is missing or differs, kept when it agrees, and the one screen drawn before it is drawn again", () => {
  assert.equal(storedZone(""), null);
  assert.equal(storedZone("dareful_now=1; dareful_tz=America%2FNew_York"), "America/New_York");
  assert.equal(storedZone("dareful_tz=%E0%A4%A"), null, "a cookie that cannot be decoded is no zone");
  assert.equal(zoneToReport("", "America/New_York"), "America/New_York", "nothing stored: report");
  assert.equal(zoneToReport("dareful_tz=UTC", "America/New_York"), "America/New_York", "stored differs: report");
  assert.equal(zoneToReport("dareful_tz=America%2FNew_York", "America/New_York"), null, "stored agrees: nothing to say");
  assert.equal(zoneToReport("", undefined), null, "a browser with no zone of its own says nothing");
  assert.equal(zoneCookie("America/New_York"), `${ZONE_COOKIE}=America%2FNew_York; path=/; max-age=31536000; samesite=lax`);
  const reporter = readFileSync("src/components/ui/zone-reporter.tsx", "utf8");
  assert.match(reporter, /router\.refresh\(\)/, "the screen drawn in the wrong zone is asked for again");
  assert.match(reporter, /storedZone\(document\.cookie\) === zone\) router\.refresh/, "and only where the cookie held, or the second draw would say the same");
  const providers = readFileSync("src/components/providers.tsx", "utf8");
  assert.match(providers, /<ZoneReporter \/>/, "mounted under every screen");
  const when = readFileSync("src/components/ledger/when.tsx", "utf8");
  assert.doesNotMatch(when, /document\.cookie/, "one writer: When no longer sets the cookie itself");
});

test("a tap counts only on the control it began on: a click on a control that rose under the finger is refused, a keyboard's or a script's click always counts, and a press on something gone from the page cannot be judged (the QA round)", () => {
  const line = { isConnected: true };
  const button = { contains: (n: unknown) => n === button || n === buttonText };
  const buttonText = { isConnected: true };
  assert.equal(tapCounts(line, { control: button, byPointer: true }), false, "down on the line, up on the primary that rose into the spot");
  assert.equal(tapCounts(buttonText, { control: button, byPointer: true }), true, "down and up inside the same control");
  assert.equal(tapCounts(line, { control: button, byPointer: false }), true, "no pointer: a keyboard, a screen reader, a script");
  assert.equal(tapCounts(line, { control: null, byPointer: true }), true, "nothing a finger could enter by");
  assert.equal(tapCounts(null, { control: button, byPointer: true }), true, "no press seen");
  assert.equal(tapCounts({ isConnected: false }, { control: button, byPointer: true }), true, "the thing pressed has been redrawn: unknowable, so it counts");
  assert.match(CONTROLS, /button/);
  assert.match(CONTROLS, /a\[href\]/);
  // The guard is shared since the touch-ups round (`useTapGuard`): the pinned sheet, and the Decided chips the terms step grows under.
  const guard = readFileSync("src/components/ui/tap-guard.ts", "utf8");
  assert.match(guard, /document\.addEventListener\("pointerdown", down, true\)/, "the press is kept from the document, in the capture phase, since it may begin outside the box");
  assert.match(guard, /byPointer: e\.detail > 0/, "a pointer's click carries a count; a keyboard's or a script's carries none");
  const sheet = readFileSync("src/components/ui/pinned-sheet.tsx", "utf8");
  assert.match(sheet, /const onClickCapture = useTapGuard\(\);/);
  assert.match(sheet, /<section[^>]*onClickCapture=\{onClickCapture\}/, "and the sheet judges every click inside it before any control sees it");
  assert.match(readFileSync("src/components/markets/ask-form.tsx", "utf8"), /data-decide-by=\{tooFar \? "none" : decide\.key\} onClickCapture=\{chipTaps\}/, "and so do the Decided chips, so a finger that went down on This week never picks This month as the page grows");
});

test("a well holds the question's own words and wraps rather than clips, and a quorum of one is told its word settles it (3.25; the QA round)", () => {
  const sheet = readFileSync("src/components/markets/call-sheet.tsx", "utf8");
  assert.match(sheet, /className=\{cn\("h-auto min-h-14 whitespace-normal py-3 text-center leading-\[20px\]", pick === w && "border-ink text-ink"\)\}/, "the two wells may take a second line");
  assert.match(sheet, /threshold <= 1 \? "It’s decided the moment you say it\." : `It’s decided once \$\{threshold\} of you say the same thing, and you can change yours until then\.`/, "never 1 of you say");
});

test("taking a side on an argument raises its sheet, as the line does, so the stake and the primary come into view (3.21, 3.24)", () => {
  const stage = readFileSync("src/components/markets/market-stage.tsx", "utf8");
  const sides = stage.slice(stage.indexOf('aria-label="Your side"'), stage.indexOf("Yes, all the way"));
  assert.match(sides, /onClick=\{\(\) => \{\s*setValue\(v\);\s*if \(!raised\) setRaised\(true\);\s*\}\}/, "the side chips raise the sheet");
});
