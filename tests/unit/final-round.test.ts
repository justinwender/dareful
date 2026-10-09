/**
 * The final round (2026-10-09): a field kept above the keyboard in every iOS browser, a page that never pans sideways,
 * every link the app makes read from a paste (in tests/unit/rework.test.ts), a unit of your own where the stakes are
 * picked, a mark for every idea and one suggested for a typed question, the picker's categories whole, silence that
 * agrees only where the terms say so, the Decided row's one chip per day, the word "lock" gone from every screen,
 * and a question of your own on a game page. Pure, or a read of the source where the rule is a line of a component.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { FIELD_MARGIN, revealBy } from "@/lib/ui/viewport";
import { dateChipWords, decideByDate, fromProposal, localDate, spanOn } from "@/lib/ledger/decide-by";
import { SILENCE_CLAUSE, sealLine, silenceSigned } from "@/lib/ledger/seal";
import { markOf } from "@/lib/ledger/write-up";
import { drawable } from "@/lib/ui/emoji-ink";
import { IDEAS } from "@/lib/ideas";
import { aboutGameLine, MARK_LINE, Scope, SuggestedMark } from "@/lib/ai/markets";
import { cardMeta, type CardInput } from "@/lib/sports/cards";
import { isOwnKey, ownKey } from "@/lib/ledger/markets";
import { CATEGORIES } from "@/lib/ui/mark-catalog";

const read = (f: string) => readFileSync(f, "utf8");

test("a field is kept in the middle of what shows: nothing moves while it sits inside the visible part of its box, and otherwise the box scrolls by the distance between the two middles", () => {
  const box = { top: 0, bottom: 800 };
  assert.equal(revealBy({ field: { top: 100, bottom: 148 }, box, visible: { top: 0, bottom: 400 }, margin: FIELD_MARGIN }), null, "inside, with the margin to spare");
  assert.equal(revealBy({ field: { top: 500, bottom: 548 }, box, visible: { top: 0, bottom: 339 }, margin: FIELD_MARGIN }), 355, "under a keyboard Brave shrank the page above: down by the middles' distance");
  assert.equal(revealBy({ field: { top: 330, bottom: 378 }, box, visible: { top: 0, bottom: 380 }, margin: FIELD_MARGIN }), 164, "a field touching the keyboard's edge is moved too: the margin counts");
  assert.equal(revealBy({ field: { top: -60, bottom: -12 }, box, visible: { top: 0, bottom: 339 }, margin: FIELD_MARGIN }), -205, "above what shows: up");
  assert.equal(revealBy({ field: { top: 150, bottom: 198 }, box: { top: 200, bottom: 700 }, visible: { top: 0, bottom: 812 }, margin: FIELD_MARGIN }), -276, "the box's own edge counts as much as the screen's");
});

test("the sheets keep the field being typed into in view, and the pinned sheet's content scrolls at its top position when the page is too short for it (section 1)", () => {
  const pinned = read("src/components/ui/pinned-sheet.tsx");
  assert.ok(pinned.includes("useFieldInView(panel, body, {"), "the pinned sheet watches its own fields");
  assert.ok(pinned.includes("const scrolls = position === \"full\" || (position === top && m.natural > m.fullCap + 1);"), "never cut off out of reach");
  assert.ok(pinned.includes("if (screen) ro.observe(screen);"), "a keyboard that shrinks the page is measured");
  assert.ok(pinned.includes("restoring.current = setTimeout(() => {") && pinned.includes("}, RESTORE_AFTER_TAP_MS);") && pinned.includes("const RESTORE_AFTER_TAP_MS = 400;"), "and goes back only once the tap that took the keyboard away has landed");
  assert.ok(read("src/components/ui/sheet.tsx").includes("useFieldInView(panel, scroller, { on: open, travelMs: MOTION.travel, act: (by) => (by === null ? \"none\" : \"scroll\") });"), "and every modal sheet");
  const hook = read("src/components/ui/field-in-view.ts");
  assert.ok(hook.includes('el.addEventListener("input", soon);') && hook.includes('vv?.addEventListener("resize", soon);'), "looked at again as the field is typed into and as the keyboard moves the page");
});

test("nothing pans sideways (section 2): the ask layer and every sheet that scrolls clip what is wider than the screen", () => {
  assert.ok(read("src/components/markets/ask-layer.tsx").includes("fixed inset-0 z-40 flex flex-col overflow-x-hidden overflow-y-auto"), "the ask layer, whose steps arrive from the side");
  assert.ok(read("src/components/ui/pinned-sheet.tsx").includes('scrolls ? "overflow-x-hidden overflow-y-auto overscroll-y-contain" : "overflow-hidden"'));
});

test("an empty Now leads with the ideas tile, and the code boxes are headed by their own line with the way in by a link under them (section 2)", () => {
  const first = read("src/components/home/first-run.tsx");
  assert.ok(first.indexOf("<IdeasTile />") > 0 && first.indexOf("<IdeasTile />") < first.indexOf("Nothing happens here until somebody else is in it."), "the ideas first");
  const code = read("src/components/home/code-join.tsx");
  const compact = code.slice(code.indexOf("export function CodeJoinCompact"), code.indexOf("export function LinkJoin"));
  assert.ok(compact.indexOf("Got a link instead?") > compact.indexOf("<CodeBoxes"), "the link under the boxes, never their heading");
  assert.ok(!/>\s*Got a link\?\s*</.test(code), "\"Got a link?\" heads nothing");
});

test("a link pasted where the clipboard is out of reach has a field that is always there, and a clipboard with no link says so in the app's words (section 4)", () => {
  const code = read("src/components/home/code-join.tsx");
  const link = code.slice(code.indexOf("export function LinkJoin"));
  assert.ok(link.includes('data-paste-link=""') && link.includes("<input"), "the paste button and the field, together");
  assert.ok(!/manual &&|showField &&|fallback &&/.test(link) && !/\shidden(\s|=|>|\/)/.test(link), "the field never waits for the clipboard to fail first");
  assert.ok(link.includes("There’s no Dareful link on your clipboard.") && !link.includes("no market link"), "every link the app makes, not just a market's");
});

test("Decided starts on the chip that lands on the write-up's day, and the date chip never names a day a chip already does (section 8)", () => {
  const zone = "America/New_York";
  const now = new Date("2026-10-08T16:00:00Z");
  const today = localDate(now, zone);
  const week = decideByDate({ key: "week" }, now, zone);
  const month = decideByDate({ key: "month" }, now, zone);
  assert.equal(today, "2026-10-08");
  assert.deepEqual([spanOn(today, now, zone), spanOn(week, now, zone), spanOn(month, now, zone), spanOn("2026-10-20", now, zone)], ["tonight", "week", "month", null]);
  assert.deepEqual(fromProposal(today, now, zone), { key: "tonight" }, "October 8 on October 8 is Tonight");
  assert.deepEqual(fromProposal(week, now, zone), { key: "week" }, "the day a week on is This week");
  assert.deepEqual(fromProposal("2026-10-20", now, zone), { key: "date", date: "2026-10-20" });
  assert.equal(dateChipWords({ decide: { key: "tonight" }, proposed: today, tooFar: false }, now, zone), "A date", "Tonight picked, and no \"Oct 8\" beside it (the owner's screenshot)");
  assert.equal(dateChipWords({ decide: { key: "tonight" }, proposed: "2026-10-20", tooFar: false }, now, zone), "Oct 20", "another day keeps its chip");
  assert.equal(dateChipWords({ decide: { key: "date", date: "2026-10-21" }, proposed: "2026-10-20", tooFar: false }, now, zone), "Oct 21", "a picked date names itself");
  assert.equal(dateChipWords({ decide: { key: "week" }, proposed: "2026-10-20", tooFar: true }, now, zone), "A date", "too far off, no date");
  assert.ok(read("src/components/markets/ask-form.tsx").includes("dateChipWords({ decide, proposed: proposedDate, tooFar: tooFar !== null }, new Date(), askerZone())"), "the chip reads it");
});

test("silence agrees only where the terms everyone signed say so (section 8): the seal line carries the clause word for word, and terms without it do not", () => {
  const seal = `0x${"ab".repeat(32)}` as const;
  const line = sealLine(seal);
  assert.ok(line.includes(SILENCE_CLAUSE) && line.endsWith(", and then the tiebreaker decides."), "the seal's line, unchanged, so every seal made before still checks");
  assert.equal(line, `The app’s ruling is sealed until it closes: ${seal}. It stands unless someone in it sees it differently within a day of the close, and then the tiebreaker decides.`);
  assert.equal(silenceSigned(`Yes if the kettle boils first.\n\n${line}`), true);
  assert.equal(silenceSigned("Yes if hitting a pitched baseball in play is harder than saving a penalty kick."), false, "an argument from before the rule");
  assert.ok(read("src/lib/ledger/rulings.ts").includes("sql`not ${disputed}`, silenceIn(D.termsText)))"), "the tick stands by silence only those");
});

test("the dispute's photo is optional for everyone (section 8): the words are required and nothing else", () => {
  const actions = read("src/lib/actions/markets.ts");
  const dispute = actions.slice(actions.indexOf("export async function disputeRulingAction"), actions.indexOf("\n}\n", actions.indexOf("export async function disputeRulingAction")));
  assert.ok(dispute.length > 0, "the action is where it was");
  assert.ok(!/photo is required|needs a photo|attach a photo|media\.length === 0|!media|attachments\.length === 0/i.test(dispute), "no path refuses a dispute for want of a photo");
  const sheets = read("src/components/markets/ruling-sheet.tsx");
  const sheet = sheets.slice(sheets.indexOf("function DisputeSheet"), sheets.indexOf("\n}\n", sheets.indexOf("function DisputeSheet")));
  assert.ok(sheet.includes('if (text.trim().length < 2) return setFieldProblem("Say what it got wrong.");'), "the words are required");
  assert.ok(!/shots\.length (===|<) [01]|shots\.length === 0/.test(sheet), "and the sheet sends without a photo, for an account as for a guest");
});

test("no screen says lock in any sense (section 8): no sentence in the source, capitalised or with the apostrophe copy uses, nor a capitalised word, names it", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk("src");
  const word = /\b(un)?lock(s|ed|ing|out|outs)?\b/i;
  const hits: string[] = [];
  for (const f of files) {
    // Comments are not copy; a URL's "//" is not a comment.
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    for (const m of src.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
      const t = m[1] ?? m[2] ?? m[3] ?? "";
      const copy = (/^[A-Z]/.test(t) && /\s/.test(t)) || t.includes("’") || /^[A-Z][a-z]+$/.test(t);
      if (copy && word.test(t)) hits.push(`${f}: ${t.slice(0, 80)}`);
    }
    if (f.endsWith(".tsx")) for (const m of src.matchAll(/>\s*([A-Z][A-Za-z’' ,.]*[a-z.])\s*</g)) if (word.test(m[1] ?? "")) hits.push(`${f}: ${m[1]}`);
  }
  assert.deepEqual(hits, []);
});

test("every idea has a mark of its own that the tiles can draw, and a typed question is offered one by the write-up, or none (section 7)", () => {
  const marks = IDEAS.map((i) => i.mark);
  assert.ok(marks.every((m) => typeof m === "string" && drawable(m)), "drawable");
  assert.equal(new Set(marks).size, marks.length, "each its own");
  assert.equal(markOf(" 🍕 "), "🍕");
  assert.equal(markOf(""), null);
  assert.equal(markOf("pizza"), null, "a word is not a mark");
  assert.equal(markOf(null), null);
  assert.equal(SuggestedMark.parse(undefined), "", "a write-up without one has none");
  assert.equal(SuggestedMark.parse("x".repeat(40)), "", "nothing longer than a mark");
  assert.ok(MARK_LINE.includes("Never a flag"), "the write-up is told what a mark is");
  assert.equal(Scope.parse({ title: "Does it snow before Thanksgiving?", terms: "Yes if snow falls in town before Thanksgiving Day.", ambiguous: false, criteria: [], mark: "❄️" }).mark, "❄️");
  const form = read("src/components/markets/ask-form.tsx");
  assert.ok(form.includes("markChosen") && form.includes("data-band-mark"), "the suggestion fills an empty mark only, and the asker changes or removes it on the terms step");
});

test("the mark picker's categories are whole, each with its icon, and the row stays as the list scrolls (section 7)", () => {
  assert.equal(CATEGORIES.length, 9);
  assert.ok(CATEGORIES.every((c) => c.icon.length > 0 && c.label.length > 0), "an icon and a name for each");
  const picker = read("src/components/markets/mark-picker.tsx");
  assert.ok(picker.includes('className="sticky -top-3 z-10 -mx-4 flex shrink-0 items-center justify-between bg-surface px-4 py-2" data-category-jump=""'), "sticky, spread across the width, never cut off");
  assert.ok(picker.includes("aria-label={c.label} title={c.label}"), "named for a screen reader");
});

test("a next time leaves the stakes, and a unit of your own is made where they are picked (section 6)", () => {
  for (const [f, rows] of [["src/components/markets/ask-form.tsx", 2], ["src/components/on/start-game.tsx", 1]] as const) {
    const src = read(f);
    const count = (needle: string) => src.split(needle).length - 1;
    // Every stakes row: the asking form has two (asking, and a game's question), starting a game one.
    assert.equal(count('units.filter((u) => u.template !== "next_time").map((u) => unitChip('), rows, `${f}: no stakes row offers the set's own next times`);
    assert.ok(!/\bunits\.map\(\(u\) => unitChip\(/.test(src), `${f}: no row offers every unit unfiltered`);
    assert.equal(count("<MakeUnit onMade={(label) => (setMine((m) => (m.includes(label) ? m : [...m, label])), setUnit({ kind: \"new\", template: null, label }))} />"), rows, `${f}: every stakes row makes, offers and picks a unit of one's own`);
    assert.ok(!/key: "next_time"|template: "next_time", label/.test(src.slice(src.indexOf("PRESETS"), src.indexOf("PRESETS") + 400)), `${f}: no preset for it`);
  }
  assert.ok(read("src/components/markets/make-unit.tsx").includes("addOwnUnitAction(value)"), "saved to your units on You by the same rule as there");
});

test("a question of your own on a game page: its key marks it as the page's own, its card asks its people what happened, and its write-up is about that game alone (section 5)", () => {
  const id = "0d3bff62-c96c-4905-8576-27b203e1069e";
  assert.equal(ownKey(id), `own:${id}`);
  assert.deepEqual([isOwnKey(ownKey(id)), isOwnKey("home_wins"), isOwnKey("margin")], [true, false, false]);
  const base: CardInput = { key: "home_wins", state: "locked", viewerIn: true, mine: 5000n, inCount: 2, votesCast: 0, proposed: false, voted: false, teams: null, unit: null, answers: null, outcomeWords: null, feedEnding: null, resolvedBy: null, closest: null, votingEnds: null, votingOpen: true };
  assert.deepEqual(cardMeta({ ...base, own: true }), { mark: "voting", text: "Say what happened" }, "nothing from the feed is coming");
  assert.equal(cardMeta({ ...base, own: true, votesCast: 1, votingEnds: "Fri 8:00 PM" }).text, "Voting ends Fri 8:00 PM");
  assert.equal(cardMeta({ ...base, own: false }).text, "Waiting on the final score", "a menu question still waits for the feed");
  const line = aboutGameLine({ name: "Rays at <b>Yankees</b>", startsAt: new Date("2026-10-09T00:00:00Z"), started: true }, "America/New_York");
  assert.ok(line.includes("<game>Rays at bYankees/b</game>") && line.includes("which started Thursday, October 8 at 8:00 PM and is being played now"), line);
  assert.ok(line.includes("decideBy the day it ends"));
  const actions = read("src/lib/actions/markets.ts");
  assert.ok(actions.includes('const who = d.game ? { kind: "set" as const, groupId: d.game.groupId } : d.who;') && actions.includes('if (who.kind === "set" && !(await isMember(who.groupId, user.id))) return { error: "You\'re not one of those people." };'), "it goes to the set whose page it was asked from, and only for someone in that set");
  const page = read("src/components/on/game-page.tsx");
  assert.ok(page.includes("const ownHref = askable && !outsider && addTo ? `/m/new?game=${game.id}&g=${addTo.groupId}` : null;"), "offered to anyone on the page until the final");
  assert.ok(page.includes("<MarketScreen id={c.dare.id} search={{}} embedded pageShares={pageShares} pagePhotos={!outsider} />"), "the open card draws no photos of its own");
  assert.ok(read("src/app/m/[id]/market-screen.tsx").includes("const photosHere = !(embedded && pagePhotos);"), "the page holds the game's photos in one place");
});

test("every sign-in opens the app's own sheet, the guest line's Sign up included: nothing in the source opens the sign-in library's modal", () => {
  const files: string[] = [];
  const walk = (d: string) => {
    for (const f of readdirSync(d)) {
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(f)) files.push(p);
    }
  };
  walk("src");
  const opens = files.filter((f) => /\bsetShowAuthFlow\b/.test(read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1")));
  assert.deepEqual(opens, []);
  assert.ok(read("src/components/guest/guest-line-view.tsx").includes("signIn.open();"), "the guest line opens the sheet");
});
