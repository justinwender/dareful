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
  const html = inRouter(createElement(WhosJoining, { candidates: [maya, theo], words: "60%, 1 beer", onPick: () => undefined, onScan: () => undefined }));
  assert.ok(html.includes("Who’s joining?") && html.includes("60%, 1 beer") && html.includes("Pick yourself"));
  assert.ok(/data-candidate="ready"/.test(html) && !/<button[^>]*disabled=""[^>]*data-candidate="ready"/.test(html), "a friend with pass the phone on can be picked");
  assert.ok(/<button[^>]*disabled=""[^>]*data-candidate="not-set-up"[^>]*opacity-45/.test(html) || /<button[^>]*data-candidate="not-set-up"[^>]*disabled=""[^>]*opacity-45/.test(html) || (/data-candidate="not-set-up"/.test(html) && /disabled=""/.test(html) && /opacity-45/.test(html)), "one not set up: at 0.45 and not tappable");
  assert.ok(html.includes("Not set up for this yet"), "and said why");
  assert.ok(html.includes("No account? Scan the code with your own phone") && html.includes('data-scan-instead=""'));
  assert.ok(!/%\s*·/.test(html.replace("60%, 1 beer", "")), "nothing of anyone else's number");
});

test("the PIN step: the friend's 56px avatar and name, Your PIN, four 14px dots, and a keypad of 56px keys with a delete", () => {
  const html = inRouter(createElement(PinStep, { friend: maya, pin: "12", problem: null, sending: false, onKey: () => undefined }));
  assert.ok(html.includes("Maya Lin") && /width:56px/.test(html), "the friend, at 56px");
  assert.ok(html.includes("Your PIN") && (html.match(/data-pin-dot=""/g) ?? []).length === 4 && html.includes('data-pin-dots="2"') && html.includes("h-[14px] w-[14px]"), "four 14px dots, two filled");
  const keys = html.match(/data-pin-key="([^"]+)"/g) ?? [];
  assert.equal(keys.length, 11, "the ten digits and a delete");
  assert.ok(html.includes('aria-label="Delete"') && (html.match(/h-14 items-center justify-center rounded-button bg-field/g) ?? []).length === 11, "56px keys on the field colour");
  assert.ok(html.includes('data-type-exempt=""'), "a control, outside the type budget");
});
