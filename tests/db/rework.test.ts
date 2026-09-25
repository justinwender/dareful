/**
 * Joining from inside the app, groups as a consequence of questions, and the vote cascade's bookkeeping, against
 * the real database. No chain: lock is written into the mirror, as in market-view.test.ts.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createOccasionGroup, dismissNamePrompt, isMember, nameGroup, peopleSetsFor, setForPeople } from "@/lib/ledger/groups";
import { homeFor } from "@/lib/ledger/home";
import * as markets from "@/lib/ledger/markets";
import { claimNotice, notifyJoined, notifyOpened, sendNudge } from "@/lib/notify";
import { CODE_GUESSES_PER_HOUR, joinByCode, joinByMarketLink, roomCodeFor } from "@/lib/ledger/rooms";
import { cleanup, codeOf, tempSigner, track, type Signer } from "./fixture";

let ana: Signer, ben: Signer, cy: Signer;
before(async () => {
  [ana, ben, cy] = await Promise.all(["Ana Okonkwo", "Ben Adeyemi", "Cy"].map((n) => tempSigner(n)));
});
after(cleanup);

async function ask(title = "Does Zanzibar get rain this weekend?") {
  const g = await createOccasionGroup(ana.user.id);
  track.group(g.id);
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title, termsText: "Yes if it rains there Saturday or Sunday.", resolvesBy: new Date(Date.now() + 3_600_000) });
  return { g, d0 };
}
async function open(title?: string) {
  const { g, d0 } = await ask(title);
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  return { g, d };
}
const setsOf = (who: Signer) => peopleSetsFor(who.user.id, who.user.displayName);
const home = (who: Signer) => homeFor(who.user, { now: new Date(), closes: () => "tonight" });

test("a code someone reads out puts a signed-in person into the question's group, once", async () => {
  const { g, d } = await open();
  const code = await roomCodeFor(d.id, ana.user.id);
  assert.match(code, /^[A-HJ-NP-Y2-9]{6}$/);
  assert.equal(await roomCodeFor(d.id, ana.user.id), code, "one live code per question");
  assert.deepEqual(await joinByCode(code.toLowerCase(), ben.user.id), { marketId: d.id, joined: true });
  assert.equal(await isMember(g.id, ben.user.id), true);
  assert.deepEqual(await joinByCode(code, ben.user.id), { marketId: d.id, joined: false }, "already a member goes straight in");
});

test("someone outside cannot mint a code for a question they are not in", async () => {
  const { d } = await open();
  assert.equal(await codeOf(() => roomCodeFor(d.id, cy.user.id)), "not_member");
});

test("a code stops working when numbers lock", async () => {
  const { g, d } = await open();
  const code = await roomCodeFor(d.id, ana.user.id);
  await db.update(schema.dares).set({ lockedAt: new Date() }).where(eq(schema.dares.id, d.id));
  assert.equal(await codeOf(() => joinByCode(code, cy.user.id)), "not_found");
  assert.equal(await isMember(g.id, cy.user.id), false);
});

test("a wrong shape costs no guess; codes that match nothing run out", async () => {
  const dana = await tempSigner("Dana");
  assert.equal(await codeOf(() => joinByCode("K7Q", dana.user.id)), "bad_input");
  const spent = async () => (await db.select().from(schema.codeAttempts).where(eq(schema.codeAttempts.userId, dana.user.id))).length;
  assert.equal(await spent(), 0);
  for (let i = 0; i < CODE_GUESSES_PER_HOUR; i += 1) assert.equal(await codeOf(() => joinByCode("XXXXXX", dana.user.id)), "not_found");
  assert.equal(await codeOf(() => joinByCode("XXXXXX", dana.user.id)), "slow_down");
  assert.equal(await spent(), CODE_GUESSES_PER_HOUR);
});

test("a question's link lets an account-holder in; a draft's link goes nowhere", async () => {
  const { g, d } = await open();
  assert.deepEqual(await joinByMarketLink(d.id, cy.user.id), { marketId: d.id, joined: true });
  assert.equal(await isMember(g.id, cy.user.id), true);
  const { g: g2, d0 } = await ask();
  assert.equal(await codeOf(() => joinByMarketLink(d0.id, cy.user.id)), "not_found");
  assert.equal(await isMember(g2.id, cy.user.id), false);
});

test("the sets offered under who's in: the last one asked first, described by names, offered a name on its second question, and never after two not-nows", async () => {
  const { g, d } = await open("Does the ferry run on Sunday?");
  await joinByMarketLink(d.id, ben.user.id);
  const stranger = await tempSigner("Stranger");
  const made = await setForPeople(ana.user.id, [ben.user.id, stranger.user.id]).catch(() => null);
  assert.equal(made, null, "someone ana shares nothing with cannot be put into a question by id alone");
  let mine = (await setsOf(ana)).find((x) => x.groupId === g.id);
  assert.deepEqual([mine?.label, mine?.named, mine?.asked, mine?.offerName], ["Ben and you", false, 1, true]);
  assert.equal((await setsOf(ana))[0]?.groupId, g.id, "the set asked most recently comes first, so it can be preselected");
  await dismissNamePrompt(g.id, ana.user.id);
  assert.equal((await setsOf(ana)).find((x) => x.groupId === g.id)?.offerName, true, "once is not never");
  await dismissNamePrompt(g.id, ben.user.id);
  assert.equal((await setsOf(ana)).find((x) => x.groupId === g.id)?.offerName, false);
  await nameGroup(g.id, ana.user.id, "  Ferry  people ");
  mine = (await setsOf(ben)).find((x) => x.groupId === g.id);
  assert.deepEqual([mine?.label, mine?.named, mine?.offerName], ["Ferry people", true, false]);
});

test("picking the same people again is the same set, not a second one; one other person is the two of them", async () => {
  const { g, d } = await open();
  await joinByMarketLink(d.id, ben.user.id);
  await joinByMarketLink(d.id, cy.user.id);
  track.group((await setForPeople(ana.user.id, [cy.user.id, ben.user.id])).id);
  assert.equal((await setForPeople(ana.user.id, [cy.user.id, ben.user.id])).id, g.id);
  assert.equal((await setForPeople(ana.user.id, [ben.user.id, cy.user.id, ben.user.id])).id, g.id);
  const two = await setForPeople(ana.user.id, [ben.user.id]);
  assert.equal(two.isDyad, true);
  // A set that has never asked anything is not asked what it is called: the question comes with its second one.
  const dana = await tempSigner("Dana Q");
  await joinByMarketLink(d.id, dana.user.id);
  const fresh = await setForPeople(ana.user.id, [ben.user.id, dana.user.id]);
  track.group(fresh.id);
  assert.notEqual(fresh.id, g.id);
  const listed = (await setsOf(ana)).find((x) => x.groupId === fresh.id);
  assert.deepEqual([listed?.label, listed?.asked, listed?.offerName], ["Ben, Dana and you", 0, false]);
});

test("a draft nobody sent is not a set to anyone, and is a row only its asker is asked to finish", async () => {
  const { g, d0 } = await ask("Never sent this one?");
  assert.equal((await setsOf(ana)).some((x) => x.groupId === g.id), false);
  const row = (await home(ana)).needs.find((n) => n.key === d0.id);
  assert.deepEqual([row?.kind, row?.verb, row?.context, row?.question ? row.state : null], ["finish", "Finish", "You never sent this one", "draft"]);
  assert.equal((await home(ben)).needs.some((n) => n.key === d0.id), false);
});

test("home lists people with something open one by one and everyone square as one row; there are no groups on it", async () => {
  const { d } = await open();
  await joinByMarketLink(d.id, ben.user.id);
  const h = await home(ana);
  assert.equal(h.square.some((p) => p.id === ben.user.id), true);
  assert.equal(h.people.some((p) => p.user.id === ben.user.id), false);
  assert.equal("chips" in h || "hidden" in h || "selected" in h, false);
});

test("getting in and changing a number each leave a point of the group's number over time, and nothing about who", async () => {
  const { d } = await open();
  await joinByMarketLink(d.id, ben.user.id);
  const enter = async (who: Signer, stake: bigint, bps: bigint) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value: bps, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, bps)) });
  await enter(ana, 1000n, 8000n);
  await enter(ben, 3000n, 4000n);
  await enter(ben, 3000n, 2000n);
  const series = await db.select().from(schema.dareNumberSeries).where(eq(schema.dareNumberSeries.dareId, d.id)).orderBy(schema.dareNumberSeries.at);
  assert.deepEqual(series.map((x) => [x.valueBps, x.entries]), [[8000, 1], [5000, 2], [3500, 2]]);
  assert.equal(Object.keys(series[0] ?? {}).some((k) => /user|person|who/i.test(k)), false);
  assert.equal((await markets.positionsOf(d.id)).find((p) => p.userId === ben.user.id)?.value, 2000n, "the number is theirs to change until it locks");
});

test("after lock a number cannot move, and nothing can be put on it for nothing", async () => {
  const { d } = await open();
  const sign = async (stake: bigint, bps: bigint) => ana.ledger.signTypedData(markets.enterTypedData(d, stake, bps));
  assert.equal(await codeOf(async () => markets.enterMarket({ dareId: d.id, userId: ana.user.id, stake: 0n, value: 5000n, signature: await sign(0n, 5000n) })), "bad_input", "the contract refuses a stake of zero, and one refusal fails the whole lock");
  await markets.enterMarket({ dareId: d.id, userId: ana.user.id, stake: 1000n, value: 5000n, signature: await sign(1000n, 5000n) });
  await db.update(schema.dares).set({ lockedAt: new Date() }).where(eq(schema.dares.id, d.id));
  assert.equal(await codeOf(async () => markets.enterMarket({ dareId: d.id, userId: ana.user.id, stake: 1000n, value: 9000n, signature: await sign(1000n, 9000n) })), "wrong_state");
  assert.equal((await markets.positionsOf(d.id))[0]?.value, 5000n);
});

test("what happened and somebody's case are different kinds, and the outcome proposal reads only the first", async () => {
  const { d } = await open();
  await db.update(schema.dares).set({ lockedAt: new Date() }).where(eq(schema.dares.id, d.id));
  await markets.sayWhatHappened(d.id, ana.user.id, "It rained all Saturday.");
  await db.delete(schema.dareStatements).where(and(eq(schema.dareStatements.dareId, d.id), eq(schema.dareStatements.userId, ben.user.id)));
  const rows = await db.select().from(schema.dareStatements).where(eq(schema.dareStatements.dareId, d.id));
  assert.deepEqual(rows.map((r) => r.kind), ["update"]);
  await assert.rejects(() => db.insert(schema.dareStatements).values({ dareId: d.id, userId: ana.user.id, kind: "rumour" as never, statement: "x" }));
});

test("the same person is told the same thing about the same question once, and every row names who caused it", async () => {
  const { d } = await open();
  const row = { userId: ben.user.id, dareId: d.id, kind: "vote_request" as const, seq: 1, causedBy: ana.user.id };
  const first = await claimNotice(row.userId, row.dareId, row.kind, row.seq, row.causedBy);
  const again = await claimNotice(row.userId, row.dareId, row.kind, row.seq, row.causedBy);
  assert.deepEqual([typeof first, again], ["string", null]);
  assert.equal(typeof (await claimNotice(row.userId, row.dareId, row.kind, 2, row.causedBy)), "string", "the next vote is a new thing to say");
  await assert.rejects(() => db.insert(schema.notificationLog).values({ ...row, seq: 3, causedBy: null as never }), "nothing is sent because time passed");
});

const told = async (dareId: string) => (await db.select().from(schema.notificationLog).where(eq(schema.notificationLog.dareId, dareId))).map((r) => `${r.kind}:${r.userId === ana.user.id ? "ana" : r.userId === ben.user.id ? "ben" : r.userId === cy.user.id ? "cy" : "?"}<-${r.causedBy === ana.user.id ? "ana" : r.causedBy === ben.user.id ? "ben" : "cy"}`).sort();

test("asking tells the rest of the group once; getting in tells the asker once per person, and changing a number tells nobody", async () => {
  const { g, d } = await open();
  await db.insert(schema.groupMembers).values([ben, cy].map((p) => ({ groupId: g.id, userId: p.user.id })));
  await notifyOpened(d.id, ana.user.id);
  await notifyOpened(d.id, ana.user.id);
  assert.deepEqual(await told(d.id), ["opened:ben<-ana", "opened:cy<-ana"]);
  const enter = async (who: Signer, bps: bigint) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake: 1000n, value: bps, signature: await who.ledger.signTypedData(markets.enterTypedData(d, 1000n, bps)) });
  await enter(ana, 5000n);
  await notifyJoined(d.id, ana.user.id);
  await enter(ben, 3000n);
  await notifyJoined(d.id, ben.user.id);
  await enter(ben, 6000n);
  await notifyJoined(d.id, ben.user.id);
  assert.deepEqual((await told(d.id)).filter((x) => x.startsWith("joined")), ["joined:ana<-ben"]);
});

test("a nudge reaches whoever is not in, once per window however many times it is tapped, and only from someone who is in", async () => {
  const { g, d } = await open();
  await db.insert(schema.groupMembers).values([ben, cy].map((p) => ({ groupId: g.id, userId: p.user.id })));
  await markets.enterMarket({ dareId: d.id, userId: ana.user.id, stake: 1000n, value: 5000n, signature: await ana.ledger.signTypedData(markets.enterTypedData(d, 1000n, 5000n)) });
  const now = new Date();
  assert.deepEqual(await sendNudge(d.id, cy.user.id, now), { waitingOn: 0, told: 0, reached: 0 }, "cy is not in, so cy cannot say we");
  assert.deepEqual(await sendNudge(d.id, ana.user.id, now), { waitingOn: 2, told: 2, reached: 0 });
  assert.deepEqual(await sendNudge(d.id, ana.user.id, now), { waitingOn: 2, told: 0, reached: 0 }, "the second tap tells nobody again");
  assert.deepEqual((await told(d.id)).filter((x) => x.startsWith("nudge")), ["nudge:ben<-ana", "nudge:cy<-ana"]);
});

test("a question this person has acted on is running, and once it is over it just happened", async () => {
  const { d } = await open("Does the running row know where it stands?");
  const enter = async (who: Signer, stake: bigint, bps: bigint) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value: bps, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, bps)) });
  assert.equal((await home(ana)).needs.some((n) => n.key === d.id), true, "not in yet: it needs a number");
  await enter(ana, 1000n, 7000n);
  const h = await home(ana);
  assert.deepEqual([h.running.some((r) => r.id === d.id), h.needs.some((n) => n.key === d.id), h.happened.some((e) => e.kind === "market" && e.market.dare.id === d.id)], [true, false, false], "in: running, and nowhere else");
  const running = h.running.find((r) => r.id === d.id);
  assert.deepEqual([running?.state, running?.caption.startsWith("1 of 1 in")], ["in", true], "the mark says in; the words say where it stands");
  await db.update(schema.dares).set({ lockedAt: new Date(), resolvedAt: new Date(), resolvedOutcome: 1n, resolvedBy: "quorum" }).where(eq(schema.dares.id, d.id));
  const over = await home(ana);
  assert.deepEqual([over.running.some((r) => r.id === d.id), over.happened.some((e) => e.kind === "market" && e.market.dare.id === d.id)], [false, true], "over: just happened, and no longer running");
});
