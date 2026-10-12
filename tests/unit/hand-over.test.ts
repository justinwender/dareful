/**
 * Handing the phone over, the friend's two steps as drawn (docs/design.md 3.45, frames 4 and 5): "Who's joining?"
 * with the entry's summary, "Pick yourself" over the people not in yet, the ones not set up at 0.45 and not
 * tappable with "Not set up for this yet", the way to the code for someone with no account; then the friend's
 * 56px avatar and name, "Your PIN", four 14px dots and a keypad of 56px keys. Rendered to markup.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PinStep, WhosJoining } from "@/components/markets/hand-over-steps";

const router = { push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined, forward: () => undefined, prefetch: () => undefined } as unknown as AppRouterInstance;
const inRouter = (el: React.ReactElement) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, el));
const maya = { id: "m", name: "Maya Lin", hue: "lilac" as const, ready: true };
const theo = { id: "t", name: "Theo Park", hue: "sky" as const, ready: false };

test("who's joining: the summary, pick yourself, the ready ones tappable, the rest at 0.45 and not, and the way to the code for someone with no account", () => {
  const html = inRouter(createElement(WhosJoining, { candidates: [maya, theo], words: "60%, 1 beer", host: "Sam", empty: null, onPick: () => undefined, onScan: () => undefined }));
  assert.ok(html.includes("Who’s joining?") && html.includes("60%, 1 beer") && html.includes("Pick yourself"));
  assert.ok(/data-candidate="ready"/.test(html) && !/<button[^>]*disabled=""[^>]*data-candidate="ready"/.test(html), "a friend with pass the phone on can be picked");
  assert.ok(/<button[^>]*disabled=""[^>]*data-candidate="not-set-up"[^>]*opacity-45/.test(html) || /<button[^>]*data-candidate="not-set-up"[^>]*disabled=""[^>]*opacity-45/.test(html) || (/data-candidate="not-set-up"/.test(html) && /disabled=""/.test(html) && /opacity-45/.test(html)), "one not set up: at 0.45 and not tappable");
  assert.ok(html.includes("Not set up for this yet"), "and said why");
  assert.ok(html.includes("No account? Scan the code with your own phone") && html.includes('data-scan-instead=""'));
  assert.ok(!/%\s*·/.test(html.replace("60%, 1 beer", "")), "nothing of anyone else's number");
  assert.ok(!html.includes("data-nobody-to-pick"), "people to pick: no line about nobody");
});

test("who's joining with nobody to pick says which it is: everyone this was sent to is in already, or none of the host's people have pass the phone on, with how a friend turns it on (pre-submission bug fixes 2)", () => {
  const empty = (why: "all_in" | "none_on") => inRouter(createElement(WhosJoining, { candidates: [], words: "60%, 1 beer", host: "Sam", empty: why, onPick: () => undefined, onScan: () => undefined }));
  const allIn = empty("all_in");
  assert.ok(allIn.includes('data-nobody-to-pick="all_in"') && allIn.includes("Everyone this was sent to is in already.") && !allIn.includes("pass the phone on yet"), "everyone in: said so, and nothing to turn on");
  const noneOn = empty("none_on");
  assert.ok(noneOn.includes('data-nobody-to-pick="none_on"') && noneOn.includes("None of Sam’s people have pass the phone on yet.") && !noneOn.includes("is in already"), "nobody set up: said so, never that everyone is in");
  assert.ok(noneOn.includes("A friend turns it on from their own phone: You, then Pass the phone."), "and how a friend turns it on, by the tab and the row they will see");
  assert.ok(noneOn.includes("No account? Scan the code with your own phone"), "the way in by the code still stands under it");
});

test("the PIN step: the friend's 56px avatar and name, Your PIN, four 14px dots, and a keypad of 56px keys with a delete", () => {
  const html = inRouter(createElement(PinStep, { friend: maya, pin: "12", problem: null, holding: false, counting: false, line: null, onKey: () => undefined }));
  assert.ok(html.includes("Maya Lin") && /width:56px/.test(html), "the friend, at 56px");
  assert.ok(html.includes("Your PIN") && (html.match(/data-pin-dot=""/g) ?? []).length === 4 && html.includes('data-pin-dots="2"') && html.includes("h-[14px] w-[14px]"), "four 14px dots, two filled");
  const keys = html.match(/data-pin-key="([^"]+)"/g) ?? [];
  assert.equal(keys.length, 11, "the ten digits and a delete");
  assert.ok(html.includes('aria-label="Delete"') && (html.match(/h-14 items-center justify-center rounded-button bg-field/g) ?? []).length === 11, "56px keys on the field colour");
  assert.ok(html.includes('data-type-exempt=""'), "a control, outside the type budget");
});

test("the PIN step holds from the fourth digit until the answer: every key takes nothing at once, past a third of a second the tally counts where the dots were with the keypad at 0.88, and past three seconds a line says it is still going (pre-submission bug fixes 2)", () => {
  const step = (holding: boolean, counting: boolean, line: string | null, problem: string | null = null) => inRouter(createElement(PinStep, { friend: maya, pin: "1234", problem, holding, counting, line, onKey: () => undefined }));
  const keys = (html: string) => html.match(/<button[^>]*data-pin-key="[^"]+"[^>]*>/g) ?? [];
  const dots = (html: string) => html.match(/<span[^>]*data-pin-dot=""[^>]*>/g) ?? [];
  const open = step(false, false, null);
  assert.ok(keys(open).every((k) => !/ disabled=""/.test(k)) && !open.includes("data-tally-loader") && open.includes('data-pin-keypad="open"'), "nothing on its way: every key takes a tap, and no tally");
  const sent = step(true, false, null);
  assert.equal(keys(sent).length, 11);
  assert.ok(keys(sent).every((k) => / disabled=""/.test(k)) && sent.includes('aria-busy="true"') && sent.includes('data-pin-keypad="holding"'), "the fourth digit: every key takes nothing at once");
  assert.ok(!sent.includes("data-tally-loader") && dots(sent).every((d) => !/\binvisible\b/.test(d)), "under a third of a second the dots stand, with nothing counting yet");
  const counting = step(true, true, null);
  assert.ok(counting.includes('data-pin-wait=""') && counting.includes("data-tally-loader"), "the tally counts where the dots were");
  assert.ok(dots(counting).length === 4 && dots(counting).every((d) => /\binvisible\b/.test(d)), "the dots keep their place unseen");
  assert.ok(/class="grid grid-cols-3 gap-2 opacity-\[0\.88\]"/.test(counting), "the keypad at 0.88, as a tapped control");
  assert.ok(!counting.includes("data-pin-still"), "no line before three seconds");
  const long = step(true, true, "Still going. This one takes a few seconds.");
  assert.ok(long.includes('data-pin-still=""') && long.includes("Still going. This one takes a few seconds."), "the line at three seconds");
  const answered = step(false, false, null, "That’s not it.");
  assert.ok(answered.includes("That’s not it.") && !answered.includes("data-tally-loader") && keys(answered).every((k) => !/ disabled=""/.test(k)), "the answer takes its place, and the keypad takes the PIN again");
});
