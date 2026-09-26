/**
 * Media on a market as rules (docs/marks-and-memories.md; docs/decisions.md, the media phase and the open window):
 * a memory goes on a market from the moment it is asked, by someone who is in it, while there is room, and one
 * taken before the end is its author's alone until then (docs/design.md 3.39); whoever added a memory can remove
 * it and evidence stays; a screenshot goes with what happened while it is being called, by someone in the group,
 * three at most; the frame shows memories only, and nothing before the end, and the model reads evidence only;
 * the strip shows four and then "+N"; the pulse changes when a screenshot lands; and "Add yours from Friday"
 * names the night the way the settled screen does.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { evidenceBlocks } from "@/lib/ai/client";
import { pulseOf } from "@/lib/ledger/pulse";
import { EVIDENCE_PER_PERSON, evidenceAllowed, evidenceItems, frameItems, MEMORIES_PER_MARKET, memoryAllowed, memoryVisible, recordItems, removeAllowed, strip, yoursItems } from "@/lib/media/roles";
import { fromThatNight } from "@/lib/ui/copy";
import { PHOTOS_LINE } from "@/lib/ui/tiles";

test("a memory goes on a market from the moment it is asked, by someone who is in it, while there is room", () => {
  assert.deepEqual(memoryAllowed({ state: "resolved", inIt: true, count: 0 }), { ok: true });
  assert.deepEqual(memoryAllowed({ state: "resolved", inIt: true, count: MEMORIES_PER_MARKET - 1 }), { ok: true }, "weeks later included: nothing about time is checked");
  assert.deepEqual(memoryAllowed({ state: "voided", inIt: true, count: 0 }), { ok: true }, "a void was still a night (3.8)");
  assert.deepEqual(memoryAllowed({ state: "expired", inIt: true, count: 0 }), { ok: true });
  assert.deepEqual(memoryAllowed({ state: "open", inIt: true, count: 0 }), { ok: true }, "the camera while it is open (3.39)");
  assert.deepEqual(memoryAllowed({ state: "locked", inIt: true, count: 0 }), { ok: true }, "a photo started before lock lands as a memory even if it finishes after (3.39)");
  assert.deepEqual(memoryAllowed({ state: "draft", inIt: true, count: 0 }), { ok: false, why: "not_asked" }, "a draft has nobody in it yet");
  assert.deepEqual(memoryAllowed({ state: "open", inIt: false, count: 0 }), { ok: false, why: "not_in" }, "someone not yet in sees no camera: entering is their only move (3.39)");
  assert.deepEqual(memoryAllowed({ state: "resolved", inIt: false, count: 0 }), { ok: false, why: "not_in" }, "someone in the group who was not in it may see the frame and not add to it");
  assert.deepEqual(memoryAllowed({ state: "resolved", inIt: true, count: MEMORIES_PER_MARKET }), { ok: false, why: "full" });
});

test("a memory taken before the market ends is its author's alone until then, and everyone's after, whatever the ending", () => {
  assert.equal(memoryVisible({ state: "open", authorId: "priya", viewerId: "priya" }), true, "the person who took it");
  assert.equal(memoryVisible({ state: "open", authorId: "priya", viewerId: "gabe" }), false, "another participant, before the end");
  assert.equal(memoryVisible({ state: "locked", authorId: "priya", viewerId: "gabe" }), false, "not on the locked or voting screens either");
  assert.equal(memoryVisible({ state: "resolved", authorId: "priya", viewerId: "gabe" }), true, "once it ends it joins the frame");
  assert.equal(memoryVisible({ state: "voided", authorId: "priya", viewerId: "gabe" }), true, "a void was still a night");
  assert.equal(memoryVisible({ state: "expired", authorId: "priya", viewerId: "gabe" }), true);
});

test("whoever added a memory can remove it, nobody else can, and evidence stays", () => {
  assert.deepEqual(removeAllowed({ role: "memory", authorId: "priya", byUserId: "priya" }), { ok: true });
  assert.deepEqual(removeAllowed({ role: "memory", authorId: "priya", byUserId: "gabe" }), { ok: false, why: "not_yours" });
  assert.deepEqual(removeAllowed({ role: "evidence", authorId: "priya", byUserId: "priya" }), { ok: false, why: "evidence_stays" }, "a vote or a ruling may rest on it (3.8)");
});

test("a screenshot goes with what happened while it is being called, by anyone who may say what happened, three at most", () => {
  assert.deepEqual(evidenceAllowed({ state: "locked", member: true, mine: 0 }), { ok: true });
  assert.deepEqual(evidenceAllowed({ state: "locked", member: true, mine: EVIDENCE_PER_PERSON - 1 }), { ok: true });
  assert.deepEqual(evidenceAllowed({ state: "locked", member: true, mine: EVIDENCE_PER_PERSON }), { ok: false, why: "full" });
  assert.deepEqual(evidenceAllowed({ state: "resolved", member: true, mine: 0 }), { ok: false, why: "not_voting" }, "once it is decided there is nothing to prove");
  assert.deepEqual(evidenceAllowed({ state: "open", member: true, mine: 0 }), { ok: false, why: "not_voting" });
  assert.deepEqual(evidenceAllowed({ state: "locked", member: false, mine: 0 }), { ok: false, why: "not_member" });
});

test("the frame leads with what the claim carried, then the memories in order; everything attached is evidence; the rest stays on the record", () => {
  const t = (n: number) => new Date(1_700_000_000_000 + n * 1000);
  const rows = [
    { id: "m2", role: "memory", createdAt: t(5), authorId: "theo" },
    { id: "e1", role: "evidence", createdAt: t(1), authorId: "priya" },
    { id: "m1", role: "memory", createdAt: t(2), authorId: "gabe" },
    { id: "e2", role: "evidence", createdAt: t(3), authorId: "theo" },
    { id: "e0", role: "evidence", createdAt: t(4), authorId: "priya" },
  ];
  assert.deepEqual(frameItems(rows, "priya").map((r) => r.id), ["e1", "e0", "m1", "m2"], "the claimant's attachments lead, oldest first, then the memories (3.8)");
  assert.deepEqual(frameItems(rows, null).map((r) => r.id), ["m1", "m2"], "with nobody having called it, the memories alone");
  assert.deepEqual(frameItems(rows, "gabe").map((r) => r.id), ["m1", "m2"], "a claimant who attached nothing leads with nothing");
  assert.deepEqual(evidenceItems(rows).map((r) => r.id), ["e1", "e2", "e0"], "everyone voting sees everything attached, oldest first");
  assert.deepEqual(recordItems(rows, "priya").map((r) => r.id), ["e2"], "evidence that was not the claimant's stays on the record behind More");
  assert.deepEqual(frameItems([], "priya"), []);
  assert.deepEqual(frameItems(rows, "priya", false).map((r) => r.id), ["e1", "e0"], "before the market ends the claim's clip is everyone's and a memory taken while it was open waits (3.39)");
  assert.deepEqual(frameItems(rows, null, false), [], "with no claimant, nothing before the end");
  assert.deepEqual(yoursItems(rows, "gabe", false).map((r) => r.id), ["m1"], "\"Yours from tonight\": this person's own memories, and nobody else's");
  assert.deepEqual(yoursItems(rows, "theo", false).map((r) => r.id), ["m2"]);
  assert.deepEqual(yoursItems(rows, "priya", false), [], "evidence is not a memory, and someone who took none has no row");
  assert.deepEqual(yoursItems(rows, "gabe", true), [], "once it ends they are in the frame, and the row goes");
});

test("the strip under the frame shows four and then +N", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `p${i}`);
  assert.deepEqual(strip(ids(3)), { squares: ["p0", "p1", "p2"], more: 0 });
  assert.deepEqual(strip(ids(4)), { squares: ["p0", "p1", "p2", "p3"], more: 0 }, "four fit");
  assert.deepEqual(strip(ids(7)), { squares: ["p0", "p1", "p2", "p3"], more: 3 }, "past four the rest is a count");
  assert.deepEqual(strip([]), { squares: [], more: 0 });
});

test("a screenshot the model reads is wrapped in a tag naming who supplied it, never sent bare", () => {
  const blocks = evidenceBlocks([
    { by: "Sam", mediaType: "image/jpeg", base64: "AAAA" },
    { by: 'Theo <b>"quoted"</b>', mediaType: "image/png", base64: "BBBB" },
  ]);
  assert.equal(blocks.length, 6, "open tag, image, close tag, for each");
  assert.deepEqual(blocks[0], { type: "text", text: '<screenshot by="Sam">' });
  assert.deepEqual(blocks[1], { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "AAAA" } });
  assert.deepEqual(blocks[2], { type: "text", text: "</screenshot>" });
  assert.deepEqual(blocks[3], { type: "text", text: '<screenshot by="Theo bquotedb">' }, "the supplier's name is cleaned the way every name in a prompt is");
  assert.equal(blocks[4]?.type, "image");
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b?.type === "image") assert.equal(blocks[i - 1]?.type, "text", "an image always follows its supplier's tag");
  }
  assert.deepEqual(evidenceBlocks([]), []);
});

test("the pulse changes when a screenshot lands, so the claim card re-reads", () => {
  const base = { votes: [], statements: [], resolvedAt: null, aiProposedAt: null };
  const before = pulseOf({ ...base, evidence: [] });
  const after = pulseOf({ ...base, evidence: ["e1"] });
  assert.notEqual(before, after);
  assert.equal(pulseOf({ ...base, evidence: ["b", "a"] }), pulseOf({ ...base, evidence: ["a", "b"] }), "order does not matter");
  assert.equal(pulseOf(base), before, "no screenshots reads as none");
});

test("\"Add yours from Friday\": the night in the viewer's zone, then that night once a weekday would be ambiguous", () => {
  const zone = "America/New_York";
  const settled = new Date("2026-09-25T23:30:00-04:00"); // a Friday evening in New York
  assert.equal(fromThatNight(settled, new Date("2026-09-25T23:50:00-04:00"), zone), "tonight", "the same calendar day in the viewer's zone");
  assert.equal(fromThatNight(settled, new Date("2026-09-26T09:00:00-04:00"), zone), "last night", "a calendar day, the way yesterday is everywhere in the app");
  assert.equal(fromThatNight(settled, new Date("2026-09-29T12:00:00-04:00"), zone), "Friday");
  assert.equal(fromThatNight(settled, new Date("2026-10-01T12:00:00-04:00"), zone), "Friday", "six days on, still this week");
  assert.equal(fromThatNight(settled, new Date("2026-10-02T12:00:00-04:00"), zone), "that night", "a week on, a weekday would name the wrong night");
  const morning = new Date("2026-09-25T09:00:00-04:00"); // settled over breakfast in New York: the evening of the 25th in Tokyo
  assert.equal(fromThatNight(morning, new Date("2026-09-25T20:00:00-04:00"), zone), "tonight");
  assert.equal(fromThatNight(morning, new Date("2026-09-25T20:00:00-04:00"), "Asia/Tokyo"), "last night", "the same instant is the next morning in Tokyo");
});

test("a tile with photos says so and never carries one", () => {
  assert.match(PHOTOS_LINE, /photos/i);
  assert.doesNotMatch(PHOTOS_LINE, /\d/, "no count: nothing anywhere counts photos");
});
