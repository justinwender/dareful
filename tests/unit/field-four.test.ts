/**
 * The field round, the owner's follow-ups (2026-10-03): the close time ending editing, the close's line in the
 * sheet, a write that cannot run "Still going" for good, a thrown action's words, a vote thirty-one days in, the
 * reminder held to each person's own night, and both teams' abbreviations whole in Now's mark.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { redirect } from "next/navigation";
import { countedAtClose, lastChanged } from "@/lib/ledger/markets";
import { callsLine, STUCK_LINE } from "@/lib/ui/calls-words";
import { buttonWait, tapGoes } from "@/components/ui/button";
import { KEYS_MISSING_WORDS, signerFailure, signInAbandoned } from "@/lib/auth/device";
import { FALLBACK_ZONE, reminderSendTime, reminderZone } from "@/lib/notify/messages";
import { TeamPair } from "@/components/ledger/team-stamp";
import { STACKED } from "@/lib/ui/team";
import { attempt } from "@/lib/ui/attempt";
import { WORDS } from "@/lib/ui/errors";
import { paceRowShows } from "@/lib/ui/stage";

test("the close time ends editing: at a close after it, an entry last changed after it does not count, and a row from before the stamp reads as when it was made", () => {
  const close = new Date("2026-10-01T00:00:00Z");
  const before = new Date("2026-09-30T14:00:00Z");
  const after = new Date("2026-10-01T03:10:00Z");
  const onTime = { who: "ana", enteredAt: before, changedAt: before };
  const changedLate = { who: "dee", enteredAt: before, changedAt: after };
  const old = { who: "cy", enteredAt: before, changedAt: null };
  const atTheBell = { who: "ben", enteredAt: before, changedAt: close };
  const r = countedAtClose([onTime, changedLate, old, atTheBell], close);
  assert.deepEqual(r.counted.map((p) => p.who), ["ana", "cy", "ben"]);
  assert.deepEqual(r.late.map((p) => p.who), ["dee"], "entered in time, changed after the first pitch: out of the close");
  assert.equal(lastChanged(old).getTime(), before.getTime());
  assert.equal(lastChanged(changedLate).getTime(), after.getTime());
});

test("the close's line in the sheet names who has said calls are in and who it closes on, never a count; the asker's says what closing now costs; stuck, anyone in can", () => {
  assert.equal(STUCK_LINE, "Time’s up, and nothing closed it. Anyone in it can.");
  assert.equal(callsLine({ said: [], could: ["Gabe", "you"], need: 2, asker: false }), "When enough of you say calls are in, it closes early.", "before anyone has");
  assert.equal(callsLine({ said: ["Theo", "Maya"], could: ["Gabe", "John", "you"], need: 1, asker: false }), "Theo and Maya say calls are in. It closes when Gabe, John or you say so too.", "the session's own sentence");
  assert.equal(callsLine({ said: ["Theo"], could: ["Gabe", "John", "Maya", "you"], need: 2, asker: false }), "Theo says calls are in. It closes when two of Gabe, John, Maya and you say so too.", "when it takes two");
  assert.equal(callsLine({ said: ["Theo", "You"], could: ["Gabe", "John"], need: 1, asker: false }), "You and Theo say calls are in. It closes when Gabe or John says so too.", "once you have, it leads with you");
  assert.equal(callsLine({ said: [], could: [], need: 2, asker: true }), "Whoever isn’t in yet can’t get in after.", "the asker's: what closing now costs, where nobody was named");
  assert.equal(callsLine({ said: ["Theo"], could: ["Gabe"], need: 1, asker: true }), "Theo says calls are in. Whoever isn’t in yet can’t get in after.", "and who has said it");
});

test("Still going cannot run for good: a write with no answer after a minute gives way to the words for a failure, and offline at the tap nothing is sent", () => {
  assert.deepEqual(buttonWait("block", "write", true), { block: true, pending: false, long: false, line: null, words: WORDS.server }, "a minute with no answer: the block, and the control takes taps again");
  assert.deepEqual(buttonWait("block", "write", false), { block: false, pending: true, long: true, line: WORDS.writeStillGoing, words: null }, "ten seconds in it is still going");
  assert.equal(buttonWait("block", "read", true).words, WORDS.readTimeout, "a read keeps its own words");
  assert.deepEqual(tapGoes(true), { send: false, words: WORDS.offline });
  assert.deepEqual(tapGoes(false), { send: true, words: null });
});

test("an action that throws answers the table's words, and the framework's own throw passes through", async () => {
  assert.deepEqual(await attempt(async () => ({ ok: true as const })), { ok: true });
  assert.deepEqual(await attempt(async () => Promise.reject(new Error("An error occurred in the Server Components render."))), { error: WORDS.server });
  await assert.rejects(
    attempt(async () => redirect("/m/somewhere")),
    (e: unknown) => String((e as { digest?: string }).digest).startsWith("NEXT_REDIRECT"),
    "a redirect is how a successful action navigates",
  );
});

test("a vote thirty-one days in asks for one fresh sign-in in its place: left unanswered it says the signed-out words, and a closed sign-in step is not waited on", () => {
  assert.equal(signerFailure("signed-out"), WORDS.signedOut);
  assert.equal(signerFailure("other-account"), WORDS.signedOut);
  assert.equal(signerFailure("keys-missing"), KEYS_MISSING_WORDS);
  assert.equal(signInAbandoned({ opened: true, authOpen: false, state: "signed-out", sinceOpenedMs: 2000 }), true);
  assert.equal(signInAbandoned({ opened: true, authOpen: true, state: "signed-out", sinceOpenedMs: 2000 }), false, "the step is still up: the person is typing their code");
  assert.equal(signInAbandoned({ opened: true, authOpen: false, state: "signed-out", sinceOpenedMs: 400 }), false, "a moment for the step to draw");
  assert.equal(signInAbandoned({ opened: true, authOpen: false, state: "ready", sinceOpenedMs: 2000 }), false, "signed in: the keys are on their way");
  assert.equal(signInAbandoned({ opened: false, authOpen: false, state: "signed-out", sinceOpenedMs: 2000 }), false);
});

test("a reminder is held in the recipient's own night where the app knows their zone, then the asker's, then Eastern", () => {
  assert.equal(reminderZone("America/Los_Angeles", "America/New_York"), "America/Los_Angeles");
  assert.equal(reminderZone(null, "America/Chicago"), "America/Chicago");
  assert.equal(reminderZone(null, null), FALLBACK_ZONE);
  assert.equal(FALLBACK_ZONE, "America/New_York");
  // Due at 03:30 UTC: 8:30pm in Los Angeles goes out now; 11:30pm in New York waits for 9am there.
  const due = new Date("2026-10-03T03:30:00Z");
  assert.equal(reminderSendTime(due, reminderZone("America/Los_Angeles", "America/New_York")).toISOString(), due.toISOString());
  assert.equal(reminderSendTime(due, reminderZone(null, null)).toISOString(), "2026-10-03T13:00:00.000Z");
});

test("both teams' abbreviations are whole in Now's 40px mark: stacked bars the mark's width, never one square over another", () => {
  const away = { abbr: "BOS", name: "Red Sox", color: "bd3039" };
  const home = { abbr: "NYY", name: "Yankees", color: "132448" };
  const html = renderToStaticMarkup(createElement(TeamPair, { away, home, stacked: true }));
  assert.match(html, /data-team-pair="stacked"/);
  assert.equal((html.match(/data-team-stamp="/g) ?? []).length, 2);
  assert.ok(html.indexOf(">BOS<") > 0 && html.indexOf(">NYY<") > html.indexOf(">BOS<"), "the away side first, both whole");
  assert.ok(!/absolute/.test(html), "nothing laid over anything");
  assert.equal(STACKED.bar * 2 + STACKED.gap, STACKED.mark, "two bars and the gap fill the mark exactly");
  assert.ok(STACKED.glyph >= 10, "the abbreviation is never smaller than ten pixels");
});

test("the AI market setup stands on every type of a dare, and never on an argument (the first-contact round, superseding 2.6)", () => {
  assert.equal(paceRowShows("dare", "binary"), true);
  assert.equal(paceRowShows("dare", "numeric"), true, "a number gets its own three questions: the unit, the source, the rounding");
  assert.equal(paceRowShows("dare", "categorical"), true, "and a pick-one question: the answers and a tie");
  assert.equal(paceRowShows("argument", "binary"), false, "an argument has its own check");
});

test("an installed app on iOS 26 is laid out whole: the root is a pixel taller than the large viewport at rest, the plain height while a field holds the keyboard, and nothing on the element outranks either", () => {
  const css = readFileSync("src/app/globals.css", "utf8");
  const html = /\n  html \{[\s\S]*?\n  \}/.exec(css)?.[0] ?? "";
  const plain = html.indexOf("height: 100%;");
  const taller = html.indexOf("height: calc(100lvh + 1px);");
  assert.ok(plain > 0 && taller > plain, "the taller root is declared after the plain one, which stays for a browser without the unit");
  assert.ok(/overflow: hidden;/.test(html), "and a finger still cannot scroll it");
  const editing = /\n  html\[data-typing\] \{\s*height: 100%;\s*\}/.exec(css);
  assert.ok(editing, "while a field holds the keyboard the root is the plain height, so the page and the phone's own caret agree");
  assert.ok(!/:focus\) \{\s*height: 100%;/.test(css), "a field the page focused by itself, with no keyboard, never moves the layout");
  assert.ok(css.indexOf("html[data-typing]") > css.indexOf("height: calc(100lvh + 1px);"), "the editing rule comes after the root's, so it wins");
  const layout = readFileSync("src/app/layout.tsx", "utf8");
  const root = /<html [^>]*className=\{`([^`]*)`\}/.exec(layout)?.[1] ?? "";
  assert.ok(root.length > 0 && !/(^|\s)(h|min-h|max-h)-/.test(root), "no height class on the root element: a utility would outrank both rules");
  const sheet = readFileSync("src/components/ui/pinned-sheet.tsx", "utf8");
  assert.ok(sheet.includes('raisedCap: Math.round((document.getElementById("app") ?? root).clientHeight * RAISED_SHARE)'), "the sheet's share of the screen is measured on the app root's box, which is the whole screen");
});
