/**
 * Joining from inside the app, groups as a consequence of questions, and the vote cascade's bookkeeping, against
 * the real database. No chain: lock is written into the mirror, as in market-view.test.ts.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createOccasionGroup, groupChipsFor, isMember, nameGroup, setArchived } from "@/lib/ledger/groups";
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
const chipsOf = (who: Signer) => groupChipsFor(who.user.id, who.user.displayName);
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

test("a group nobody named is called by its latest question, dashed until it recurs, then worth naming", async () => {
  const { g, d } = await open("Does the ferry run on Sunday?");
  let chip = (await chipsOf(ana)).find((c) => c.id === g.id);
  assert.deepEqual([chip?.label, chip?.named, chip?.once, chip?.worthNaming], ["Does the ferry run on Sunday", false, true, false]);
  const d2 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: d.denomId, title: "Second one here?", termsText: "Yes if it happens.", resolvesBy: new Date(Date.now() + 3_600_000) });
  await markets.openMarket(d2.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d2)));
  chip = (await chipsOf(ana)).find((c) => c.id === g.id);
  assert.deepEqual([chip?.label, chip?.once, chip?.worthNaming], ["Second one here", false, true]);
  await nameGroup(g.id, ana.user.id, "  Ferry  people ");
  chip = (await chipsOf(ana)).find((c) => c.id === g.id);
  assert.deepEqual([chip?.label, chip?.named, chip?.worthNaming], ["Ferry people", true, false]);
});

test("a draft nobody sent is not a group to anyone, and is a row only its creator is asked to finish", async () => {
  const { g, d0 } = await ask("Never sent this one?");
  assert.equal((await chipsOf(ana)).some((c) => c.id === g.id), false);
  const row = (await home(ana)).needs.find((n) => n.key === d0.id);
  assert.deepEqual([row?.kind, row?.verb, row?.context], ["finish", "Finish", "You started this and never sent it"]);
  assert.equal((await home(ben)).needs.some((n) => n.key === d0.id), false);
});

test("hiding a group hides it for that person only, and something new there brings it back", async () => {
  const { g, d } = await open();
  await joinByMarketLink(d.id, ben.user.id);
  await setArchived(g.id, ben.user.id, true);
  assert.equal((await home(ben)).chips.some((c) => c.id === g.id), false);
  assert.equal((await home(ben)).hidden.some((c) => c.id === g.id), true);
  assert.equal((await home(ben)).needs.some((n) => n.key === d.id), false, "a hidden group asks for nothing");
  assert.equal((await home(ana)).chips.some((c) => c.id === g.id), true, "nobody else's view changed");
  const d2 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: d.denomId, title: "Something new here?", termsText: "Yes if it happens.", resolvesBy: new Date(Date.now() + 3_600_000) });
  await markets.openMarket(d2.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d2)));
  assert.equal((await home(ben)).chips.some((c) => c.id === g.id), true);
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
  const enter = async (who: Signer, bps: bigint) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake: 1000n, valueBps: bps, signature: await who.ledger.signTypedData(markets.enterTypedData(d, 1000n, bps)) });
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
  await markets.enterMarket({ dareId: d.id, userId: ana.user.id, stake: 1000n, valueBps: 5000n, signature: await ana.ledger.signTypedData(markets.enterTypedData(d, 1000n, 5000n)) });
  const now = new Date();
  assert.deepEqual(await sendNudge(d.id, cy.user.id, now), { waitingOn: 0, told: 0, reached: 0 }, "cy is not in, so cy cannot say we");
  assert.deepEqual(await sendNudge(d.id, ana.user.id, now), { waitingOn: 2, told: 2, reached: 0 });
  assert.deepEqual(await sendNudge(d.id, ana.user.id, now), { waitingOn: 2, told: 0, reached: 0 }, "the second tap tells nobody again");
  assert.deepEqual((await told(d.id)).filter((x) => x.startsWith("nudge")), ["nudge:ben<-ana", "nudge:cy<-ana"]);
});
