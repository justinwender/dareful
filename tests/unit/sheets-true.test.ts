/**
 * Screens that did not do what their information sheet said (the QA round, 2026-09-29): the close as a hard
 * cutoff, Now's Close row only where it can be finished and its three lists held by one rule, the group's number
 * on a margin as words the page must never parse, the night's photo on a question this person is in, the
 * sign-out that survives the sign-in library's own throw, and the claimant's Try again that never re-sends what
 * landed. Each rule is pure, or read off the source where the screen is a server component no test can render,
 * and each has a mutant in tests/mutation/mutants.ts that breaks it.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { listOf, needFromMarket } from "@/lib/ledger/home";
import { pastItsClose } from "@/lib/ledger/markets";
import { numberAxis, unitPhrase, weightedMedian } from "@/lib/ledger/number-axis";
import { nightPhotoTarget } from "@/lib/sports/night-photo";
import { PHOTO_DID_NOT_GO_UP, photoRetryable } from "@/components/markets/photo-problem";
import { stillToSend } from "@/lib/ledger/retry-batch";
import { signOutBoth } from "@/components/you/account";

const t0 = new Date("2026-09-29T18:00:00Z");
const minute = 60_000;

test("the close is a hard cutoff: past its own time a question takes no entry and no change, locked yet or not; before it, it does; an argument has no time and is never past it", () => {
  assert.equal(pastItsClose({ pace: "dare", resolvesBy: new Date(t0.getTime() - minute) }, t0), true, "a minute past: refused, whether or not the tick has locked it");
  assert.equal(pastItsClose({ pace: "dare", resolvesBy: t0 }, t0), true, "the moment itself is past");
  assert.equal(pastItsClose({ pace: "dare", resolvesBy: new Date(t0.getTime() + minute) }, t0), false, "a minute before: open");
  assert.equal(pastItsClose({ pace: "dare", resolvesBy: null }, t0), false, "no time yet");
  // An argument's time is the moment its second person got in, and it locks in the same breath: the time never refuses an entry.
  assert.equal(pastItsClose({ pace: "argument", resolvesBy: new Date(t0.getTime() - minute) }, t0), false);
  assert.equal(pastItsClose({ pace: "argument", resolvesBy: null }, t0), false);
});

const dare = { id: "d1", title: "Does John fall asleep?", creatorId: "creator", resolvesBy: new Date(t0.getTime() + 3_600_000), createdAt: t0, lockedAt: null as Date | null };
const person = (id: string) => ({ id, name: id, ghost: false, percent: null, number: null, pick: null });
const market = (over: Record<string, unknown>) => ({ state: "open", people: [person("creator")], groupSize: 4, votesCast: 0, saidBy: null, unit: null, pickOne: null, ...over, dare: { ...dare, ...((over.dare as object) ?? {}) } }) as never;
const closes = () => "tonight";
const past = { dare: { resolvesBy: new Date(t0.getTime() - minute) } };

test("Now: the asker's Close on time's up is offered only with two or more in; a question only the asker is in stays in Running, where it swipes to Remove", () => {
  assert.equal(needFromMarket(market(past), "creator", false, t0, closes), null, "alone past the time: the close would be refused (it takes two), so no row that can never be finished");
  const two = needFromMarket(market({ ...past, people: [person("creator"), person("gabe")] }), "creator", false, t0, closes);
  assert.deepEqual([two?.kind, two?.verb, two?.context], ["lock", "Close", "Time’s up on this one"], "two in: the close can be finished");
  const three = needFromMarket(market({ ...past, people: [person("creator"), person("gabe"), person("maya")] }), "creator", false, t0, closes);
  assert.equal(three?.kind, "lock");
  // A ghost counts like anyone: two in is the asker and someone from the link.
  const ghost = needFromMarket(market({ ...past, people: [person("creator"), { ...person("gabe"), ghost: true }] }), "creator", false, t0, closes);
  assert.equal(ghost?.kind, "lock");
  // Everyone in is still the asker's Close before the time, and reads as the count.
  const everyone = needFromMarket(market({ groupSize: 2, people: [person("creator"), person("gabe")] }), "creator", false, t0, closes);
  assert.deepEqual([everyone?.kind, everyone?.context], ["lock", "2 of 2 in"]);
});

test("Now: past the close there is no Enter row, since the entry would be refused; before it there is", () => {
  const before = needFromMarket(market({}), "viewer", false, t0, closes);
  assert.deepEqual([before?.kind, before?.verb], ["enter", "Enter"]);
  assert.equal(needFromMarket(market(past), "viewer", false, t0, closes), null, "past its time: nothing this person can finish");
  assert.equal(needFromMarket(market({ ...past, people: [person("creator"), person("gabe")] }), "viewer", false, t0, closes), null, "however many are in");
  // An argument has no time until its second person is in: its other side is still an Enter row.
  const argument = needFromMarket(market({ dare: { resolvesBy: null, pace: "argument" } }), "viewer", false, t0, closes);
  assert.equal(argument?.kind, "enter");
});

test("Now's lists: what needs you, then what you acted on (in it, or locked), then what ended; an open question you are not in and can no longer get into is on no list, never in Just happened", () => {
  assert.equal(listOf({ state: "open", viewerIn: false }, true), "needs", "an Enter row, before the close");
  assert.equal(listOf({ state: "open", viewerIn: true }, true), "needs", "the asker's Close");
  assert.equal(listOf({ state: "open", viewerIn: true }, false), "running", "in it: acted on");
  assert.equal(listOf({ state: "locked", viewerIn: false }, false), "running", "locked is the group's act, in it or not");
  assert.equal(listOf({ state: "locked", viewerIn: true }, false), "running");
  assert.equal(listOf({ state: "open", viewerIn: false }, false), null, "past its close and not in: it has not ended and is nothing you did, so it is on no list (4.7: Just happened is what ended)");
  for (const state of ["resolved", "voided", "expired"] as const) {
    assert.equal(listOf({ state, viewerIn: true }, false), "over", `${state}: ended`);
    assert.equal(listOf({ state, viewerIn: false }, false), "over", `${state}: ended, whoever was in`);
  }
});

test("on a signed margin the group's number is words, not a number: the marker's chip cannot be parsed, so a screen reads the median it is built from and says it in the unit's words", () => {
  // A What's on margin question, shifted by half its scale: the chain stores "Bills by 7" as 27 (3.40).
  const margin = { singular: "point", plural: "points", margin: { shift: "20", home: "Bills", away: "Chiefs" } };
  const entries = [
    { id: "priya", stake: 500n, value: 27n },
    { id: "gabe", stake: 500n, value: 13n },
    { id: "maya", stake: 500n, value: 24n },
  ];
  const axis = numberAxis(entries, margin);
  assert.ok(axis?.marker, "the marker stands from the third entry");
  assert.throws(() => BigInt((axis?.marker?.chip ?? "").replace(/,/g, "")), SyntaxError, `the chip is the sides' words (${axis?.marker?.chip}), which BigInt refuses: the crash the routes audit read at the More sheet's median line`);
  const median = weightedMedian(entries);
  assert.equal(median, 24n, "the stake-weighted median is one of the entries");
  assert.equal(unitPhrase(median as bigint, margin), "Bills by 4", "and reads in the sides' words, which is what the sentence should say");
  assert.equal(axis?.marker?.chip, unitPhrase(median as bigint, margin), "the chip is that phrase already; a sentence about the group's number starts from the median, never from the chip");
  // On an ordinary number question the chip is the number with separators, which is why parsing it ever worked.
  const shirts = numberAxis([{ id: "a", stake: 500n, value: 1200n }, { id: "b", stake: 500n, value: 1500n }, { id: "c", stake: 500n, value: 1300n }], { singular: "shirt", plural: "shirts" });
  assert.equal(shirts?.marker?.chip, "1,300");
});

test("a photo from a game's night goes on the earliest question this person is in, never simply the first question asked; nobody in none of them gets a target", () => {
  const signed = Buffer.from([1]);
  const q = (id: string, minutesIn: number, creatorSignature: Buffer | null = signed) => ({ dare: { id, createdAt: new Date(t0.getTime() + minutesIn * minute), creatorSignature } });
  const running = [q("margin", 2), q("who-wins", 0), q("total", 5), q("unsent", 1, null)];
  const positions = new Map<string, Array<{ userId: string | null }>>([
    ["who-wins", [{ userId: "priya" }]],
    ["margin", [{ userId: "priya" }, { userId: "gabe" }]],
    ["total", [{ userId: "gabe" }, { userId: null }]],
    ["unsent", [{ userId: "gabe" }]],
  ]);
  assert.equal(nightPhotoTarget(running, positions, "priya")?.dare.id, "who-wins", "the first question asked, which Priya is in");
  assert.equal(nightPhotoTarget(running, positions, "gabe")?.dare.id, "margin", "Gabe is not in the first question: his photo goes on the earliest one he is in, so the server admits it");
  assert.equal(nightPhotoTarget(running, positions, "maya"), null, "in none of them: no plus");
  assert.equal(nightPhotoTarget([q("unsent", 0, null)], new Map([["unsent", [{ userId: "gabe" }]]]), "gabe"), null, "a question never sent takes no photo");
  // The night's screen hands the picker that question, and says a photo that did not go up (the sheets audit, 2026-09-29).
  const page = readFileSync("src/components/on/game-page.tsx", "utf8");
  assert.ok(page.includes("const photoTarget = nightPhotoTarget(running, positionsOfMarket, me.id);") && page.includes("dareId={photoTarget?.dare.id ?? ids[0] ?? \"\"}"), "the night's PhotoAdding is given the rule's question");
  assert.ok(page.includes("{canAddPhoto ? <PhotoProblem /> : null}"), "the block under the photos is drawn on the night");
});

test("a photo that did not go up is said with Try again; a full album is a refusal and gets none", () => {
  assert.equal(photoRetryable(PHOTO_DID_NOT_GO_UP), true);
  assert.equal(photoRetryable("This one’s full."), false);
  assert.equal(PHOTO_DID_NOT_GO_UP, "That photo didn’t go up.", "the sentence PhotoAdding sets, exactly, so the block recognises it");
});

test("the deadlock sheet is never offered on a question the feed settles: the first drive too, whose tiebreaker is the play-by-play", () => {
  const page = readFileSync("src/app/m/[id]/page.tsx", "utf8");
  assert.ok(page.includes('d.stalemate === "arbitrate" && mine && counted.length > 1 && !decidedByFeed'), "the split sheet tests the feed flag, which the first drive carries and the score flag does not");
  assert.ok(!page.includes("counted.length > 1 && !decidedByScore"), "and not the score flag");
});

test("sign out is two sign-outs and one failing never keeps the other: the library's login first, tried once more if it throws, then the app's session; nothing thrown, nothing said", async () => {
  const quiet = console.error;
  const logged: string[] = [];
  console.error = (...args: unknown[]) => void logged.push(String(args[0]));
  try {
    const order: string[] = [];
    // The plain case: the login goes, then the session, in that order and once each.
    await signOutBoth(
      async () => void order.push("logout"),
      async () => void order.push("session"),
    );
    assert.deepEqual(order, ["logout", "session"], "the library's login goes before the app's session, since a login left behind signs the app back in on the next load");
    assert.equal(logged.length, 0, "nothing to log");
    // The library throws once: tried again, and the session still ends.
    let tries = 0;
    order.length = 0;
    await signOutBoth(
      async () => {
        tries += 1;
        order.push("logout");
        if (tries === 1) throw new Error("endSession: network");
      },
      async () => void order.push("session"),
    );
    assert.deepEqual(order, ["logout", "logout", "session"]);
    assert.equal(tries, 2);
    // The library throws every time: the app's session still ends, and nothing escapes to the screen.
    order.length = 0;
    await signOutBoth(
      async () => {
        order.push("logout");
        throw new Error("still down");
      },
      async () => void order.push("session"),
    );
    assert.deepEqual(order, ["logout", "logout", "session"]);
    // The app's session refuses (offline): nothing escapes either, so the screen still re-reads.
    await assert.doesNotReject(() =>
      signOutBoth(
        async () => undefined,
        async () => {
          throw new TypeError("Failed to fetch");
        },
      ),
    );
    assert.ok(logged.length >= 3 && logged.every((l) => l.startsWith("sign out:")), `each failure is logged, never quoted on screen: ${logged.join(" | ")}`);
  } finally {
    console.error = quiet;
  }
});

test("Try again on the claimant screen sends only what has not landed: a confirmed batch and an entered question are never signed or sent again", () => {
  const pressed = { claims: ["c1", "c2", "c3"], entries: ["e1", "e2"] };
  assert.deepEqual(stillToSend(pressed, { claims: new Set(), entries: new Set() }), { claims: ["c1", "c2", "c3"], entries: ["e1", "e2"] }, "the first tap sends everything pressed");
  assert.deepEqual(stillToSend(pressed, { claims: new Set(["c1", "c2", "c3"]), entries: new Set(["e1"]) }), { claims: [], entries: ["e2"] }, "the batch landed and one entry did: the retry signs and sends the other entry alone, since the server refuses a confirmed proposal");
  assert.deepEqual(stillToSend({ claims: ["c1", "c2", "c3", "c4"], entries: [] }, { claims: new Set(["c1", "c2", "c3"]), entries: new Set() }), { claims: ["c4"], entries: [] }, "a cover pressed after the batch landed goes in a batch of its own");
  // The screen records what landed as it lands, and asks the rule before signing.
  const source = readFileSync("src/components/ledger/confirm-all.tsx", "utf8");
  assert.ok(source.includes("const todo = stillToSend(") && source.includes("for (const id of batch.proposalIds) landed.current.claims.add(id);") && source.includes("landed.current.entries.add(entry.dareId);"), "wired: the batch and each entry are recorded as they land");
});
