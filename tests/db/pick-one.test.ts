/**
 * A pick-one market, end to end on the real chain (docs/design.md 3.29, 3.30, 3.31, 3.25; PLANNING.md 8c): the
 * worked example from tests/unit/pick-one.test.ts, five people and five answers, one atomic `create` carrying
 * every pick at a confidence of exactly 10000, three votes for the answer that happened against one dissent that
 * picked another, one `resolve`, and then the chain, the mirror and the hand figures compared edge by edge. Then
 * the tie: everyone picks the answer that happens, and it resolves cleanly with nothing changing hands and no toll.
 * It costs a little testnet gas per run.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import type { Hex } from "viem";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { relayer } from "@/lib/chain/relayer";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import { bufferToHex, uuidToBytes16 } from "@/lib/ledger/ids";
import * as markets from "@/lib/ledger/markets";
import { calibrationFor } from "@/lib/ledger/calibration";
import { cleanResolution } from "@/lib/ledger/settle";
import { cleanup, tempSigner, track, type Signer } from "./fixture";

let priya: Signer, gabe: Signer, theo: Signer, maya: Signer, john: Signer, outsider: Signer;
before(async () => {
  [priya, gabe, theo, maya, john, outsider] = await Promise.all(["Priya", "Gabe", "Theo", "Maya", "John", "Outsider"].map((n) => tempSigner(n)));
});
after(cleanup);

async function groupOf(people: Signer[]): Promise<string> {
  const g = await createGroup({ name: "pick one check (temporary)", createdBy: (people[0] as Signer).user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values(people.slice(1).map((p) => ({ groupId: g.id, userId: p.user.id })));
  return g.id;
}
const TERMS = "Whoever is first to be asleep on the couch, eyes shut and not answering, once the movie starts. If everyone makes it to the credits, Nobody.";
const open = async (d: markets.DareRow, creator: Signer) => markets.openMarket(d.id, creator.user.id, await creator.ledger.signTypedData(markets.createTypedData(d)));
const enter = async (d: markets.DareRow, who: Signer, stake: bigint, pick: bigint) =>
  markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value: pick, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, pick)) });
const vote = async (d: markets.DareRow, who: Signer, outcome: bigint) =>
  markets.castVote({ dareId: d.id, userId: who.user.id, outcome, signature: await who.governance.signTypedData(markets.voteTypedData(d, outcome)) });
const code = async (fn: () => Promise<unknown>) => fn().then(() => null, (e: unknown) => (e instanceof markets.MarketError ? e.code : `other: ${e instanceof Error ? e.message : e}`));

test("a pick-one question carries two to six answers, a person answer is someone the asker knows, and a pick names one of them with everything on it", async () => {
  const g = await groupOf([priya, gabe, theo]);
  const usd = await ensureUsd(g, priya.user.id);
  const base = { creatorId: priya.user.id, groupId: g, denomId: usd.id, title: "Who falls asleep first?", termsText: TERMS, resolvesBy: new Date(Date.now() + 3_600_000), kind: "categorical" as const };
  assert.equal(await code(() => markets.draftMarket({ ...base, answers: [{ text: "John" }] })), "bad_input", "one answer is no question");
  assert.equal(await code(() => markets.draftMarket({ ...base, answers: ["A", "B", "C", "D", "E", "F", "G"].map((text) => ({ text })) })), "bad_input", "seven is more than the sheet holds (3.29)");
  assert.equal(await code(() => markets.draftMarket({ ...base, answers: [{ text: "John" }, { text: "john" }] })), "bad_input", "two answers that say the same thing");
  assert.equal(await code(() => markets.draftMarket({ ...base, answers: [{ text: "John" }, { text: "Outsider", userId: outsider.user.id }] })), "bad_input", "a person answer is someone the asker knows here");
  assert.equal(await code(() => markets.draftMarket({ ...base, pace: "argument", answers: [{ text: "John" }, { text: "Nobody" }] })), "bad_input", "an argument is yes or no");
  // The asker may be an answer themselves (3.38), and the words go in as typed.
  const d = await markets.draftMarket({ ...base, answers: [{ text: "Gabe", userId: gabe.user.id }, { text: "Priya", userId: priya.user.id }, { text: "Nobody" }] });
  assert.equal(d.kind, "categorical");
  assert.deepEqual(d.outcomeLabels, ["Gabe", "Priya", "Nobody"]);
  // The column holds a real null where an answer is words (the driver reads it back as the string "NULL"; `answersOf` reads that as nobody).
  const [raw] = (await db.execute(sql`select answer_people[1] = ${gabe.user.id}::uuid as first, answer_people[3] is null as words from dares where id = ${d.id}`)) as unknown as Array<{ first: boolean; words: boolean }>;
  assert.deepEqual(raw, { first: true, words: true }, "which answers are people, aligned with the words, null where words");
  assert.deepEqual(markets.answersOf(d)?.map((a) => [a.index, a.text, a.userId]), [[0, "Gabe", gabe.user.id], [1, "Priya", priya.user.id], [2, "Nobody", null]]);
  const typed = markets.createTypedData(d);
  assert.equal(typed.message.kind, 2, "Kind.Categorical");
  assert.equal(typed.message.options, 3, "how many answers, signed by the asker");
  assert.equal(markets.enterTypedData(d, 500n, 1n).message.confidenceBps, 10_000, "a pick carries everything (3.30)");
  await open(d, priya);
  assert.equal(await code(() => enter(d, gabe, 500n, 3n)), "bad_input", "a pick past the last answer");
  const p = await enter(d, gabe, 500n, 2n);
  assert.equal(p.value, 2n);
  assert.equal(p.confidenceBps, 10_000, "stored as signed, so lock sends the same figure");
  assert.equal((await db.select().from(schema.dareNumberSeries).where(eq(schema.dareNumberSeries.dareId, d.id))).length, 0, "a pick is a choice, not a number: no aggregate, no series");
  // A vote names one of the answers, or nobody can tell; never a number past them.
  assert.equal(markets.outcomeAllowed(d.kind, 2n, d.outcomeLabels.length), true);
  assert.equal(markets.outcomeAllowed(d.kind, 3n, d.outcomeLabels.length), false);
});

test("who falls asleep first, on the chain: five people, one dissent picking another answer, settled to the cent with the picks carrying everything", async () => {
  const g = await groupOf([priya, gabe, theo, maya, john]);
  const usd = await ensureUsd(g, priya.user.id);
  const d0 = await markets.draftMarket({ creatorId: priya.user.id, groupId: g, denomId: usd.id, title: "Who falls asleep first?", termsText: TERMS, resolvesBy: new Date(Date.now() + 3_600_000), kind: "categorical", answers: [{ text: "John", userId: john.user.id }, { text: "Priya", userId: priya.user.id }, { text: "Gabe", userId: gabe.user.id }, { text: "Theo", userId: theo.user.id }, { text: "Nobody" }] });
  const d = await open(d0, priya);
  await enter(d, priya, 500n, 0n);
  await enter(d, gabe, 1000n, 2n);
  await enter(d, theo, 2000n, 0n);
  await enter(d, maya, 750n, 4n);
  await enter(d, john, 900n, 1n);

  const locked = await markets.lockMarket(d.id, priya.user.id);
  assert.equal(locked.threshold, 3, "floor(5 / 2) + 1, computed by the contract");
  const l = (await markets.marketById(d.id)) as markets.DareRow;
  const { dares, ledger } = contracts();
  const { publicClient } = relayer();
  const struct = (await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "dareOf", args: [bufferToHex(l.onchainId as Buffer) as Hex] })) as { kind: number; options: number; status: number; outcome: bigint };
  assert.deepEqual([struct.kind, struct.options], [2, 5], "the chain holds the kind and the count of answers the asker signed");
  const ps0 = (await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "positionsOf", args: [bufferToHex(l.onchainId as Buffer) as Hex] })) as ReadonlyArray<{ value: bigint; confidenceBps: number }>;
  assert.deepEqual(ps0.map((p) => [p.value, p.confidenceBps]), [[0n, 10000], [2n, 10000], [0n, 10000], [4n, 10000], [1n, 10000]], "every pick landed onchain carrying everything: the deployed contract accepted a confidence of exactly 100%");

  // A vote names one of the answers; a number past them is refused before anything is sent.
  assert.equal(await code(() => vote(l, gabe, 5n)), "bad_input");
  // Gabe says it was him: a dissent, counted for Gabe, which nobody else joins.
  assert.deepEqual(await vote(l, gabe, 2n), { resolved: false });
  assert.deepEqual(await vote(l, priya, 0n), { resolved: false });
  assert.deepEqual(await vote(l, theo, 0n), { resolved: false });
  assert.deepEqual(markets.tally(await markets.votesOf(d.id)).map((t) => [t.outcome, t.votes]), [[0n, 2], [2n, 1]], "split, not deadlocked: it takes three agreeing");
  const last = await vote(l, maya, 0n);
  assert.equal(last.resolved, true, "the third for John settles it; Gabe's was a dissent");

  const done = (await markets.marketById(d.id)) as markets.DareRow;
  assert.equal(markets.stateOf(done), "resolved");
  assert.equal(done.resolvedOutcome, 0n);
  const ps = await markets.positionsOf(d.id);
  const by = (s: Signer) => ps.find((p) => p.userId === s.user.id);
  // Scores and nets, worked by hand in tests/unit/pick-one.test.ts: the right picks score full, the wrong ones nothing.
  assert.deepEqual([priya, gabe, theo, maya, john].map((s) => by(s)?.score), [10000, 0, 10000, 0, 0]);
  assert.deepEqual([priya, gabe, theo, maya, john].map((s) => by(s)?.net), [375n, -375n, 662n, -312n, -350n]);

  const rows = await db.select().from(schema.obligations).where(and(eq(schema.obligations.origin, "dare"), eq(schema.obligations.originId, d.id)));
  const edge = (from: Signer, to: Signer) => rows.find((r) => r.fromUser === from.user.id && r.toUser === to.user.id)?.quantity;
  assert.equal(rows.length, 6, "the wrong picks pay the right ones; two right or two wrong move nothing between them");
  assert.deepEqual([edge(gabe, priya), edge(maya, priya), edge(john, priya), edge(gabe, theo), edge(maya, theo), edge(john, theo)], [125n, 125n, 125n, 250n, 187n, 225n]);
  // And the chain agrees with the mirror, row by row.
  for (const r of rows) {
    const o = (await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "obligationOf", args: [uuidToBytes16(r.id)] })) as { minted: bigint; creditor: string };
    assert.equal(o.minted, r.quantity);
    assert.equal(o.creditor.toLowerCase(), [priya, gabe, theo, maya, john].find((s) => s.user.id === r.toUser)?.ledger.address.toLowerCase());
  }
  const after = (await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "dareOf", args: [bufferToHex(done.onchainId as Buffer) as Hex] })) as { status: number; outcome: bigint };
  assert.deepEqual([after.status, after.outcome], [1, 0n]);

  // On You (3.34): pick-one questions are counted, never plotted; and a question that ended with an answer is clean for its asker.
  assert.deepEqual((await calibrationFor(priya.user.id)).pickOne, { resolved: 1, called: 1 });
  assert.deepEqual((await calibrationFor(gabe.user.id)).pickOne, { resolved: 1, called: 0 });
  assert.deepEqual((await calibrationFor(gabe.user.id)).binary.resolved, 0, "a pick has no place on the confidence axis");
  assert.deepEqual(await cleanResolution(priya.user.id), { ended: 1, clean: 1 });
});

test("a tie is not a failure: everyone picks the answer that happens, it resolves, nothing changes hands, and no toll", async () => {
  const g = await groupOf([theo, maya]);
  const usd = await ensureUsd(g, theo.user.id);
  const d0 = await markets.draftMarket({ creatorId: theo.user.id, groupId: g, denomId: usd.id, title: "Who gets there first?", termsText: "Whoever is through the door of the bar first on Friday. If you arrive together, Nobody.", resolvesBy: new Date(Date.now() + 3_600_000), kind: "categorical", answers: [{ text: "Maya", userId: maya.user.id }, { text: "Theo", userId: theo.user.id }, { text: "Nobody" }] });
  const d = await open(d0, theo);
  await enter(d, theo, 800n, 0n);
  await enter(d, maya, 500n, 0n);
  await markets.lockMarket(d.id, theo.user.id);
  const l = (await markets.marketById(d.id)) as markets.DareRow;
  assert.deepEqual(await vote(l, theo, 0n), { resolved: false });
  assert.equal((await vote(l, maya, 0n)).resolved, true);
  const done = (await markets.marketById(d.id)) as markets.DareRow;
  assert.equal(markets.stateOf(done), "resolved", "resolved, not voided: a tie is a fine question with no loser");
  assert.equal(done.resolvedOutcome, 0n);
  const ps = await markets.positionsOf(d.id);
  assert.deepEqual(ps.map((p) => [p.score, p.net]), [[10000, 0n], [10000, 0n]], "everyone scored full, nobody moved");
  assert.equal((await db.select().from(schema.obligations).where(and(eq(schema.obligations.origin, "dare"), eq(schema.obligations.originId, d.id)))).length, 0, "nothing minted");
  const { dares } = contracts();
  const onchain = (await relayer().publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "dareOf", args: [bufferToHex(done.onchainId as Buffer) as Hex] })) as { status: number; outcome: bigint };
  assert.deepEqual([onchain.status, onchain.outcome], [1, 0n], "Resolved on the chain, with the answer recorded");
  assert.deepEqual(await cleanResolution(theo.user.id), { ended: 1, clean: 1 }, "counted as clean: no toll for a tie");
  // Maya's record across this file: the dissent above, where she picked wrong, and this tie, where everyone was right.
  assert.deepEqual((await calibrationFor(maya.user.id)).pickOne, { resolved: 2, called: 1 });
});
