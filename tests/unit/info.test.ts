/**
 * The information sheets (docs/design.md 10.6, 10.7): every sheet holds to the rules for writing one, the fixed
 * line is word for word, no sheet borrows a banned word, and the entries the QA round corrected say what the
 * screens do, word for word. The lint over the sheets can fail: a sheet built to break each rule is refused. A
 * check that cannot fail is worse than no check.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { INFO_DESCRIPTION_CHARS, INFO_ENTRIES_MAX, INFO_FIXED_LINE, INFO_GROUPS, INFO_TERM_WORDS, sheetProblems, type InfoSheet } from "@/lib/ui/info";
import { INFO_SHEETS } from "@/lib/ui/info-sheets";

/** The words no screen says (4.6: the ledger's, including net in every form, and the price words of 4.6's boundary), as the http suite scans for them, and the sheet's own (10.6). */
const BANNED = /\b(owes?|owed|debt|balance|outstanding|overdue|nets?|netted|netting|wallet|transaction|gas|signature|chain|token|price|pot|house|buy|sell|shares|button|click|simply|press|long-press|scroll)\b/i;

test("the fixed line is the doc's, word for word (10.7), and the sheet draws it", () => {
  assert.equal(INFO_FIXED_LINE, "This sheet is here only for the hackathon, so every feature on every screen can be seen.");
  assert.ok(readFileSync("src/components/ui/info.tsx", "utf8").includes("INFO_FIXED_LINE"), "the sheet component draws the fixed line");
  assert.deepEqual(INFO_GROUPS, ["Gestures", "Icons", "Rules and timing", "Everything else"]);
  assert.equal(INFO_TERM_WORDS, 5);
  assert.equal(INFO_DESCRIPTION_CHARS, 90);
  assert.equal(INFO_ENTRIES_MAX, 16);
});

/** An entry by its term, in any group of a sheet. */
const entry = (key: string, term: string) => Object.values((INFO_SHEETS[key] as InfoSheet).groups).flat().find((e) => e.term === term);

test("every sheet holds to 10.6: the groups in order, terms of five words, one sentence of ninety characters, sixteen entries, gestures and icons named as the doc names them, and no banned word", () => {
  const keys = Object.keys(INFO_SHEETS);
  assert.ok(keys.length >= 28, `sheets for every screen 10.1 lists: ${keys.length}`);
  for (const key of keys) {
    const sheet = INFO_SHEETS[key] as InfoSheet;
    assert.deepEqual(sheetProblems(sheet), [], `${key}: ${sheetProblems(sheet).join("; ")}`);
    const text = [sheet.name, ...Object.values(sheet.groups).flat().flatMap((e) => [e.term, e.description, e.qualifier ?? ""])].join(" ");
    const m = BANNED.exec(text);
    assert.equal(m, null, `${key}: banned word "${m?.[0]}"`);
    assert.ok(!/[—]/.test(text), `${key}: an em dash`);
  }
  // The worked example (10.8): fifteen entries for a yes-or-no market while it's open, plus the settling rule the stake step no longer states (4.9); the swaps for the other kinds.
  const open = INFO_SHEETS["market-open"] as InfoSheet;
  assert.equal(Object.values(open.groups).flat().length, 16);
  assert.ok(open.groups["Rules and timing"]?.some((e) => /land closer than you, and only by the gap/.test(e.description)), "the settling rule is on the market's sheet");
  assert.ok(open.groups.Gestures?.some((e) => e.term === "Drag along the odds line"));
  assert.ok((INFO_SHEETS["market-open-number"] as InfoSheet).groups.Gestures?.some((e) => e.term === "Tap the number"));
  assert.ok((INFO_SHEETS["market-open-pick"] as InfoSheet).groups.Gestures?.some((e) => e.term === "Tap an answer"));
  // The logo round: a vote is said without signing's vocabulary, and the three entries that said the cut phrase say what happens instead.
  assert.ok((INFO_SHEETS["market-voting"] as InfoSheet).groups["Rules and timing"]?.some((e) => e.description === "Your vote only ever comes from your own phone, and a majority settles it."));
  assert.ok((INFO_SHEETS["market-draft"] as InfoSheet).groups["Everything else"]?.some((e) => e.term === "I’m in, at the bottom" && e.description === "Gets you in and sends it to everyone you picked, at once."));
  assert.ok((INFO_SHEETS["game"] as InfoSheet).groups["Rules and timing"]?.some((e) => e.term === "No number until you’re in" && e.description === "Until you’re in, a card shows the close and how many are in, never anyone’s number."));
  assert.ok((INFO_SHEETS["game-link"] as InfoSheet).groups["Everything else"]?.some((e) => e.description === "Opens it here and closes the one open; you get in there until it closes."), "a game's question opens in its card (the games-and-the-reveal round, section 4)");
  // The shared gestures are on Now's sheet and nowhere else (10.6).
  assert.ok(INFO_SHEETS["now"]?.groups.Gestures?.some((e) => /Swipe down from the top/.test(e.term)));
  for (const key of keys) if (key !== "now" && key !== "now-first-run") assert.ok(!Object.values((INFO_SHEETS[key] as InfoSheet).groups).flat().some((e) => /from the top/.test(e.term)), `${key} repeats a shared gesture`);
  // The QA round (2026-09-29): the corrected entries word for word, the entries the screens gained, and the retired ones gone. Spot checks inside this test, so the mutants that kill it cover them.
  // The shared gestures, as built: the pull never starts from a sheet, the ask layer or a full-screen photo (5.5), and Back is a step back inside asking (9.5).
  assert.equal(entry("now", "Swipe down from the top")?.description, "Re-reads any screen but a sheet, asking or a full-screen photo; a line runs meanwhile.");
  assert.equal(entry("now-first-run", "Swipe down from the top")?.description, "Re-reads any screen but a sheet, asking or a full-screen photo.");
  assert.equal(entry("now", "Back, on other screens")?.description, "Lands on the tab you came from; inside asking, it goes one step back.");
  // Now's rows: Try again is a verb (3.15), That's me acts in one tap, a game's row has two targets, Just happened keeps eight.
  assert.equal(entry("now", "A row’s verb")?.description, "Enter, Vote, Close, Yep, Finish or Try again opens the thing at its move.");
  assert.ok(entry("now", "That’s me") && entry("now", "A game’s row") && entry("now", "The turning ring"), "the rows a person meets on Now");
  assert.equal(entry("now", "Just happened")?.description, "What the group did, the newest eight; a tap opens the question, the game or the person.");
  // Measure the screen left You and Now with the logo round's probe; nothing lists it.
  for (const key of Object.keys(INFO_SHEETS)) assert.equal(entry(key, "Measure the screen"), undefined, `${key} still lists the probe`);
  // The close is a hard cutoff by time (CLAUDE.md), and a void-rule question closed by the clock ends there (docs/decisions.md).
  // A market closes four ways (the games-and-the-reveal round), and closed it waits for the thing to happen.
  for (const key of ["market-open", "market-open-number", "market-open-pick"]) assert.equal(entry(key, "The close")?.description, "Its asker, enough of the people in, its time or a game’s start closes it.", key);
  assert.equal(entry("market-calls", "It’s happened")?.description, "Opens the vote for everyone at once; so do the final score and the date it’s decided.");
  assert.equal(entry("market-open", "Tap the avatars")?.description, "Opens who’s in: everyone in so far.", "nobody is asked by name, so nobody is still out while it is open");
  // More holds how it works and the colour, and only once you're in (page.tsx draws it for `mine || state !== "open"`); a pick settles full or nothing (3.25).
  assert.deepEqual([entry("market-open", "More")?.description, entry("market-open", "More")?.qualifier], ["Beside this sheet’s icon: how this one works, and its colour to pick if you asked it.", "once you’re in"]);
  assert.equal(entry("market-open-pick", "How it settles")?.description, "A wrong pick settles with each right pick; all right or all wrong, nothing changes hands.");
  assert.ok(entry("market-open", "Not you?") && entry("market-open", "Where everyone landed")?.description.includes("in a blind market yours is final then"), "Not you? joined the open sheet, and the blind rule folded into where everyone landed");
  assert.equal(entry("market-link", "Get in as yourself"), undefined, "the signed-in line is not on the signed-out page's sheet");
  assert.equal(entry("market-link", "I already have an account")?.description, "Under Join as: signs you in before anything is sent, so you get in as yourself.");
  // The join step a guest meets since the first-contact rounds: a name and nothing else, so nothing about numbers or suggested names.
  for (const gone of ["Have an account? Sign in", "Names after two letters", "A wrong number"]) assert.equal(entry("market-link", gone), undefined, gone);
  // While it's called: More holds nothing attached until the end (page.tsx gates it on `ended`); the sheet's second height and the source a What's on question waits on.
  assert.equal(entry("market-voting", "More")?.description, "What the stake is in, the group’s number exactly, and for the asker its colour.");
  assert.equal(entry("market-voting-number", "I see it differently")?.description, "Takes the number you saw as your vote, a note instead, or nobody can tell.");
  assert.ok(entry("market-voting", "Swipe the sheet up") && entry("market-voting", "The final score") && entry("market-voting-pick", "The play-by-play"));
  // Once over: a small square brings its photo into the large one (3.8), settling lives on the person's page (3.37), a void by the group counts against the asker (3.34).
  assert.ok(entry("market-ended", "Tap a small photo") && entry("market-memory", "Tap a small photo") && entry("market-ended", "Tap a photo") === undefined);
  assert.equal(entry("market-ended", "Settled, on your row"), undefined);
  assert.equal(entry("market-ended", "Void or never settled")?.description, "Nothing changes hands; a void the group or the tiebreaker called counts against its asker.");
  // The game page shares from its who's-in row (3.42), and a game link opened signed in still opens each question's own screen to join.
  assert.deepEqual((INFO_SHEETS["game"] as InfoSheet).groups.Icons?.map((e) => e.term), ["More", "Share", "Copy the link"]);
  assert.ok(entry("game-link", "Signed in"), "a signed-in person not among its people gets the group's questions");
  assert.equal(entry("game", "The names under the game"), undefined, "a game is one page: no names to switch between");
  // The person view: the header counts what is expected back and never says net (2.1, 3.10); the note on a cover is read by both, the cost by nobody else (3.43).
  assert.equal(entry("person", "The header")?.description, "What’s open and expected back, each unit as the difference between you; never a zero.");
  assert.equal(entry("person", "I got this one")?.description, "From the bottom: what, how many, who picks up next, a note, and a cost nobody else sees.");
  // A cover: declining tells nobody and asks nothing first (declineProposal writes the status alone).
  assert.equal(entry("cover", "Not this one")?.description, "Leaves it out for good, with no second ask; it goes from both pages and nobody is told.");
  // Asking: blind is final, not hidden (3.22, 3.31), Send it saves a draft, and the mark's colour is its own only when it has one (3.29).
  assert.equal(entry("ask-terms", "Where everyone landed")?.description, "Hidden makes each answer final once made; you still see everyone’s once you’re in.");
  assert.equal(entry("ask-terms", "Send it")?.description, "Opens the question and shows its screen, with share, copy and the code to send it.");
  assert.equal(entry("ask-question", "Add a mark")?.description, "Opens the picker; a mark with a colour of its own gives the question that colour.");
  assert.equal(INFO_SHEETS["ask-who"], undefined, "asking has no who's-in step, so no sheet for one");
  for (const key of ["ask-question", "ask-careful", "game-start"]) assert.equal(entry(key, "Next: who’s in"), undefined, `${key} still names who's in`);
  // The photo: Remove asks once and never takes evidence (3.8), and a sticker lands in Your stickers, not Your marks.
  assert.equal(entry("photo", "Remove")?.description, "Asks once, then takes it off for good; what you attached to a call stays.");
  assert.equal(entry("photo", "Make a sticker")?.description, "Tap what to keep, then Keep it; it lands in Your stickers for the next thing you ask.");
});

test("the lint over the sheets refuses each rule broken (10.6)", () => {
  const long: InfoSheet = { name: "A", groups: { Gestures: [{ term: "Tap it", description: "x".repeat(91) + "." }] } };
  assert.ok(sheetProblems(long).some((p) => /over 90 characters/.test(p)));
  const words: InfoSheet = { name: "A", groups: { "Rules and timing": [{ term: "one two three four five six", description: "Fine." }] } };
  assert.ok(sheetProblems(words).some((p) => /over 5 words/.test(p)));
  const order: InfoSheet = { name: "A", groups: { Icons: [{ term: "More", description: "Fine.", glyph: "more" }], Gestures: [{ term: "Tap it", description: "Fine." }] } };
  assert.ok(sheetProblems(order).some((p) => /out of order/.test(p)));
  const gesture: InfoSheet = { name: "A", groups: { Gestures: [{ term: "Press it", description: "Fine." }] } };
  assert.ok(sheetProblems(gesture).some((p) => /starts with Tap/.test(p)));
  const icon: InfoSheet = { name: "A", groups: { Icons: [{ term: "More", description: "Fine." }] } };
  assert.ok(sheetProblems(icon).some((p) => /names its glyph/.test(p)));
  const many: InfoSheet = { name: "A", groups: { "Everything else": Array.from({ length: 17 }, (_, i) => ({ term: `Thing ${i}`, description: "Fine." })) } };
  assert.ok(sheetProblems(many).some((p) => /at most 16/.test(p)));
  const two: InfoSheet = { name: "A", groups: { "Everything else": [{ term: "Thing", description: "One. Two." }] } };
  assert.ok(sheetProblems(two).some((p) => /more than one sentence/.test(p)));
  const bang: InfoSheet = { name: "A", groups: { "Everything else": [{ term: "Thing", description: "Wow!" }] } };
  assert.ok(sheetProblems(bang).some((p) => /exclamation/.test(p) || /not one sentence/.test(p)));
  // A thing is named as the screen names it (10.6): the design's own word for it is refused, in a term, a description or a qualifier.
  const chalk: InfoSheet = { name: "A", groups: { "Everything else": [{ term: "The checks", description: "Pick what’s right; the chalk counts the picked rows and confirms them together." }] } };
  assert.ok(sheetProblems(chalk).some((p) => /says "the chalk", the design's word/.test(p)));
  const band: InfoSheet = { name: "A", groups: { "Rules and timing": [{ term: "The date in the band", description: "Fine." }] } };
  assert.ok(sheetProblems(band).some((p) => /says "the band"/.test(p)));
  const set: InfoSheet = { name: "A", groups: { "Everything else": [{ term: "Thing", description: "Fine.", qualifier: "in the set" }] } };
  assert.ok(sheetProblems(set).some((p) => /says "the set"/.test(p)));
  // A phrase cut everywhere is cut here.
  const cut: InfoSheet = { name: "A", groups: { "Everything else": [{ term: "I’m in", description: "Puts your number on it and sends it." }] } };
  assert.ok(sheetProblems(cut).some((p) => /says "Put your number on it", which is cut everywhere/.test(p)));
  const fine: InfoSheet = { name: "A market, while it’s open", groups: { Gestures: [{ term: "Tap the avatars", description: "Opens who’s in." }] } };
  assert.deepEqual(sheetProblems(fine), []);
});
