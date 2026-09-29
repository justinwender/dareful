/**
 * Round C, part 2: the approved additions, each with a check that can fail. The band's clock after the end and the
 * ballot's empty count line (copy), the claimant's headline and span (copy), the who's-got-who fold (leaderboard),
 * the timeline's split and fold (person), the wait's stages (button), the block's Try again (problem), the offline
 * bar, the number vote's heading, and the cut sheet's first-load words. Rendered to markup inside a stub router
 * where a component is involved.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { alreadyInLine, endedClock, nobodyYetLine, spanWords } from "@/lib/ui/copy";
import { foldOwed, gotTooLine, WHO_HAS_WHO_ROWS } from "@/components/markets/leaderboard";
import { splitTimeline, TIMELINE_FOLD, type TimelineEvent } from "@/lib/ledger/person";
import { STILL_GOING_MS, TRY_AGAIN_MS, waitStage } from "@/components/ui/button";
import { isRetryable, NOTHING_CAME_BACK, ProblemSummary } from "@/components/ledger/problem";
import { OfflineBarView } from "@/components/ui/offline-bar";
import { NumberDissentHead } from "@/components/markets/number-dissent";
import { CutSheet } from "@/components/ledger/sticker-from-photo";
import { StakeChips, STAKE_FACT } from "@/components/markets/stake-chips";

const router = { push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined, forward: () => undefined, prefetch: () => undefined } as unknown as AppRouterInstance;
const inRouter = (el: React.ReactElement) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, el));

test("the band's clock after the end says how and when (3.37): settled, voided, called off, closed for good", () => {
  // Monday Sep 28, 2026, 8pm: the same day reads as a time, the last week as a weekday.
  const now = new Date("2026-09-28T20:00:00Z");
  const at = new Date("2026-09-28T00:14:00Z");
  assert.equal(endedClock("resolved", "quorum", at, now, "UTC"), "Settled at 12:14am");
  assert.equal(endedClock("voided", "quorum", new Date("2026-09-26T01:05:00Z"), now, "UTC"), "Voided Sat at 1:05am");
  assert.equal(endedClock("voided", "removed", new Date("2026-09-26T18:52:00Z"), now, "UTC"), "Called off Sat at 6:52pm");
  assert.equal(endedClock("expired", "expired", new Date("2026-09-27T09:00:00Z"), now, "UTC"), "Closed for good Sun at 9am");
  for (const s of [endedClock("resolved", null, at, now, "UTC"), endedClock("expired", null, at, now, "UTC")]) assert.equal(/ago|\d+ (day|hour)/i.test(s), false, s);
});

test("the stake step carries its one fact under the chips, once, in the doc's words (4.9)", () => {
  const props = { stake: "500", other: false, custom: "", stakeWords: (u: string) => `$${Number(u) / 100}`, onStake: () => undefined, onOther: () => undefined, onCustom: () => undefined };
  const money = inRouter(createElement(StakeChips, { ...props, unit: { quantifiable: true, monetary: true, singular: "dollar" } }));
  assert.equal(STAKE_FACT, "The most you can be out is what you put on it.");
  assert.equal((money.match(/data-stake-fact=""/g) ?? []).length, 1, "once");
  assert.ok(money.includes(STAKE_FACT) && money.indexOf(STAKE_FACT) > money.indexOf("Something else"), "under the chips");
  assert.ok(money.includes("$5") && money.includes("$20"), "the three chips");
  const beers = inRouter(createElement(StakeChips, { ...props, unit: { quantifiable: false, monetary: false, singular: "round" } }));
  assert.ok(beers.includes("One round, the same for everyone.") && beers.includes(STAKE_FACT) && !beers.includes("Something else"), "a unit nobody counts: one line, the fact still in it");
});

test("the ballot's count line before anyone has said: nobody yet, and how many of you it takes (3.35)", () => {
  assert.equal(nobodyYetLine(2), "Nobody has said yet. Two of you and it settles.");
  assert.equal(nobodyYetLine(1), "Nobody has said yet. One of you and it settles.");
  assert.equal(nobodyYetLine(4), "Nobody has said yet. Four of you and it settles.");
});

test("the claimant's headline counts the stories, and the span reads in words (3.38)", () => {
  assert.equal(alreadyInLine(6), "You were already in 6 stories.");
  assert.equal(alreadyInLine(1), "You were already in one story.");
  const d = (n: number) => new Date(Date.UTC(2026, 8, 1 + n));
  assert.equal(spanWords(d(0), d(0)), "One night");
  assert.equal(spanWords(d(0), d(3)), "A few days");
  assert.equal(spanWords(d(0), d(9)), "A week");
  assert.equal(spanWords(d(0), d(14)), "Two weeks");
  assert.equal(spanWords(d(0), d(35)), "A month");
  assert.equal(spanWords(d(0), d(95)), "Three months");
});

test("who's got who lists at most three under one person and names the rest in one caption (3.38)", () => {
  assert.equal(WHO_HAS_WHO_ROWS, 3);
  assert.deepEqual(foldOwed([1, 2, 3]), { shown: [1, 2, 3], rest: [] }, "three stay rows");
  assert.deepEqual(foldOwed([1, 2, 3, 4, 5]), { shown: [1, 2, 3], rest: [4, 5] }, "past three, the rest fold");
  // The same possessive the heading above it uses ("Theo's got").
  assert.equal(gotTooLine("Theo", ["Gabe", "John"]), "Theo's got Gabe and John too.");
  assert.equal(gotTooLine("Theo", ["Gabe", "John", "Sam"]), "Theo's got Gabe, John and Sam too.");
  assert.equal(gotTooLine("James", ["Gabe"]), "James' got Gabe too.");
  assert.equal(gotTooLine("you", ["Maya"]), "You’ve got Maya too.");
});

test("the person view: what is still ahead under Coming up, then the past newest first, folded past twelve behind Show earlier (3.38)", () => {
  const market = (state: string, at: number): TimelineEvent => ({ kind: "market", at: new Date(at), market: { state } as never });
  const game = (over: boolean, at: number): TimelineEvent => ({ kind: "game", at: new Date(at), game: { over } as never, markets: [], groupName: null });
  const cover = (at: number): TimelineEvent => ({ kind: "proposal", at: new Date(at), proposal: {} as never, denomination: {} as never, groupName: null });
  const events = [market("resolved", 9), market("open", 8), game(false, 7), cover(6), market("locked", 5), game(true, 4)];
  const split = splitTimeline(events, false);
  assert.deepEqual(split.upcoming.map((e) => e.at.getTime()), [8, 7, 5], "open, locked, and a game not over are ahead");
  assert.deepEqual(split.shown.map((e) => e.at.getTime()), [9, 6, 4], "the past keeps its order");
  assert.equal(split.hidden, 0);
  assert.equal(TIMELINE_FOLD, 12, "the fold is twelve (3.38)");
  const many = Array.from({ length: 17 }, (_, i) => cover(100 - i));
  const folded = splitTimeline(many, false);
  assert.deepEqual([folded.shown.length, folded.hidden], [12, 5], "twelve shown, the rest behind Show earlier");
  assert.deepEqual([splitTimeline(many, true).shown.length, splitTimeline(many, true).hidden], [many.length, 0], "asked for earlier: everything");
});

test("a wait's stages (5.2): nothing under 300ms, the runner, Still going at three seconds, the block with Try again at ten", () => {
  assert.equal(waitStage(false, 20_000), "none");
  assert.equal(waitStage(true, 100), "none");
  assert.equal(waitStage(true, 300), "pending");
  assert.equal(waitStage(true, STILL_GOING_MS), "still");
  assert.equal(waitStage(true, STILL_GOING_MS - 1), "pending");
  assert.equal(waitStage(true, TRY_AGAIN_MS), "block");
  assert.deepEqual([STILL_GOING_MS, TRY_AGAIN_MS], [3_000, 10_000]);
});

test("a server or network failure gets Try again inside the block (5.1); a refusal at a field does not", () => {
  assert.ok(isRetryable("That didn’t go through. Try again.") && isRetryable("Your number didn’t send. The chain is busy.") && isRetryable(NOTHING_CAME_BACK) && isRetryable("Couldn’t save that."));
  assert.equal(isRetryable("Codes are six characters. This one is five."), false);
  assert.equal(isRetryable("Add the amount first."), false);
  let tried = 0;
  const withRetry = inRouter(createElement(ProblemSummary, { messages: ["That didn’t go through. Try again."], retry: () => tried++ }));
  assert.ok(/<button[^>]*data-try-again=""[^>]*>[\s\S]*?Try again/.test(withRetry) && /role="alert"/.test(withRetry), "the 44px Try again inside the alert block");
  const refusal = inRouter(createElement(ProblemSummary, { messages: ["Add the amount first."], retry: () => tried++ }));
  assert.ok(!refusal.includes("data-try-again"), "no Try again for a refusal the tap cannot put right");
  const noRetry = inRouter(createElement(ProblemSummary, { messages: ["That didn’t go through. Try again."] }));
  assert.ok(!noRetry.includes("data-try-again"), "nothing to run: nothing drawn");
  assert.equal(tried, 0);
});

test("the offline bar (3.14): a 28px surface-2 bar with the one line while offline, nothing at all while online", () => {
  const off = inRouter(createElement(OfflineBarView, { offline: true }));
  assert.ok(/<div[^>]*role="status"[^>]*data-offline=""[^>]*>/.test(off) && off.includes("Offline. You can still look around.") && /h-7/.test(off) && /bg-surface-2/.test(off), "28px, surface-2, the words");
  assert.equal(inRouter(createElement(OfflineBarView, { offline: false })), "", "online: nothing");
});

test("the number vote's raised sheet reads What was it? over the field (3.24)", () => {
  const html = inRouter(createElement(NumberDissentHead, { panel: createElement("span", { "data-panel": "" }), line: "", onLine: () => undefined }));
  assert.ok(html.includes("What was it?") && html.indexOf("What was it?") < html.indexOf('data-panel=""'), "the heading, above the field");
  assert.ok(html.includes("What happened?") && html.includes('id="what-happened-2"'), "then the line");
  assert.ok(!/placeholder=/.test(html), "no example in the field (4.9)");
});

test("the cut sheet's first load says so, and on an iPhone offers the lift in the meantime; once loaded, neither (the owner's ruling)", () => {
  const base = { open: true, busy: true, cut: false, problem: null, timing: { loadMs: null, cutMs: null }, onKeep: () => undefined, onStartOver: () => undefined, onClose: () => undefined, onPaste: () => undefined };
  const loading = inRouter(createElement(CutSheet, { ...base, loading: true, lift: false }));
  assert.ok(loading.includes('data-cut-loading=""') && loading.includes("17 MB the first time"), "the sheet says the model is on its way, and roughly how big");
  assert.ok(!loading.includes("data-lift-meanwhile"), "no lift where there is none");
  const iphone = inRouter(createElement(CutSheet, { ...base, loading: true, lift: true }));
  assert.ok(iphone.includes('data-lift-meanwhile=""') && iphone.includes("Copy Subject") && /<button[^>]*data-paste-cutout=""[^>]*>[\s\S]*?Paste/.test(iphone), "the lift path in the meantime");
  const loaded = inRouter(createElement(CutSheet, { ...base, busy: false, loading: false, lift: true }));
  assert.ok(!loaded.includes("data-cut-loading") && !loaded.includes("data-lift-meanwhile"), "once loaded, the cut path alone");
});
