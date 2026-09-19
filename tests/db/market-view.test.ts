/**
 * What a market shows, and to whom. No chain here: lock and resolution are written straight into the mirror,
 * because these tests are about visibility and about a market reading as one story in a timeline.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import { marketCards } from "@/lib/ledger/market-view";
import * as markets from "@/lib/ledger/markets";
import { personView } from "@/lib/ledger/person";
import { marketShare } from "@/lib/ledger/share";
import { plainCard } from "@/lib/ui/share-card";
import { cleanup, tempSigner, track, type Signer } from "./fixture";

let ana: Signer, ben: Signer, cy: Signer, outsider: Signer;
before(async () => {
  [ana, ben, cy, outsider] = await Promise.all(["Ana Okonkwo", "Ben", "Cy", "Outsider"].map((n) => tempSigner(n)));
});
after(cleanup);

async function openMarket(reveal: "open" | "blind" = "open") {
  const g = await createGroup({ name: "view check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values([ben, cy].map((p) => ({ groupId: g.id, userId: p.user.id })));
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Does Zanzibar get rain this weekend?", termsText: "Yes if it rains there Saturday or Sunday.", resolvesBy: new Date(Date.now() + 3_600_000), revealMode: reveal });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  const enter = async (who: Signer, stake: bigint, bps: bigint) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, valueBps: bps, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, bps)) });
  return { d, g, usd, enter };
}
const card = async (viewer: Signer, id: string, withUser?: Signer) => (await marketCards({ viewerId: viewer.user.id, withUserId: withUser?.user.id })).find((m) => m.dare.id === id);

test("in an open market, someone who has not picked sees who is in and nobody's number; someone who has sees them all", async () => {
  const { d, enter } = await openMarket("open");
  await enter(ana, 2000n, 8000n);
  await enter(ben, 1000n, 3500n);
  assert.deepEqual((await card(cy, d.id))?.people.map((p) => [p.name, p.percent]), [["Ana Okonkwo", null], ["Ben", null]]);
  assert.deepEqual((await card(ben, d.id))?.people.map((p) => p.percent), [80, 35]);
});

test("a blind market hides every number from everyone until it is locked", async () => {
  const { d, enter } = await openMarket("blind");
  await enter(ana, 2000n, 8000n);
  await enter(ben, 1000n, 3500n);
  assert.deepEqual((await card(ben, d.id))?.people.map((p) => p.percent), [null, null]);
  await db.update(schema.dares).set({ lockedAt: new Date() }).where(eq(schema.dares.id, d.id));
  assert.deepEqual((await card(cy, d.id))?.people.map((p) => p.percent), [80, 35]);
});

test("a market says what it needs from the person looking, and nothing once they have done it", async () => {
  const { d, enter } = await openMarket();
  await enter(ana, 2000n, 8000n);
  assert.equal((await card(ben, d.id))?.needsYou, "Put your number in");
  assert.equal((await card(ana, d.id))?.needsYou, null);
  await enter(ben, 1000n, 3500n);
  await db.update(schema.dares).set({ lockedAt: new Date() }).where(eq(schema.dares.id, d.id));
  assert.equal((await card(ben, d.id))?.needsYou, "Say how it came out");
  await db.insert(schema.dareVotes).values({ dareId: d.id, userId: ben.user.id, outcome: 1n, signature: Buffer.from("00", "hex") });
  assert.equal((await card(ben, d.id))?.needsYou, null);
  assert.equal((await card(ana, d.id))?.needsYou, "Say how it came out");
});

test("a draft is listed to nobody, and someone outside the group sees none of the group's markets", async () => {
  const g = await createGroup({ name: "view check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  const usd = await ensureUsd(g.id, ana.user.id);
  const draft = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "A draft?", termsText: "Nobody has approved this yet.", resolvesBy: new Date(Date.now() + 3_600_000) });
  assert.equal(await card(ana, draft.id), undefined);
  const { d } = await openMarket();
  assert.notEqual(await card(ana, d.id), undefined);
  assert.equal(await card(outsider, d.id), undefined);
});

test("in a timeline a resolved market is one story, carrying only what it left between the two people in view", async () => {
  const { d, g, usd, enter } = await openMarket();
  await enter(ana, 2000n, 8000n);
  await enter(ben, 1000n, 3500n);
  await enter(cy, 500n, 6000n);
  const now = new Date();
  await db.update(schema.dares).set({ lockedAt: now, resolvedAt: now, resolvedOutcome: 1n, resolvedBy: "quorum" }).where(eq(schema.dares.id, d.id));
  const edge = (from: Signer, to: Signer, qty: bigint) => ({ id: randomUUID(), tokenId: 1n, groupId: g.id, fromUser: from.user.id, toUser: to.user.id, denomId: usd.id, quantity: qty, uniqueObligation: false, amountCents: qty, origin: "dare", originId: d.id, settleExpected: true, confirmTx: Buffer.alloc(32) });
  await db.insert(schema.obligations).values([edge(ben, ana, 127n), edge(ben, cy, 43n), edge(cy, ana, 20n)]);

  const whole = await card(ana, d.id);
  assert.equal(whole?.state, "resolved");
  assert.equal(whole?.outcome, 1);
  assert.equal(whole?.consequences.length, 3);

  const pair = await card(ana, d.id, ben);
  assert.deepEqual(pair?.consequences.map((c) => [c.from.displayName, c.to.displayName, c.quantity]), [["Ben", "Ana Okonkwo", 127n]]);

  // The person view: the market is there once, and what it minted is not also there as a row of its own.
  // (Needs the indexer ENVIO_GRAPHQL_URL points at to be reachable; an unreachable indexer fails this, on purpose.)
  const view = await personView(ana.user, ben.user);
  assert.equal(view.timeline.filter((e) => e.kind === "market" && e.market.dare.id === d.id).length, 1);
  assert.equal(view.timeline.filter((e) => e.kind === "obligation" && e.obligation.originId === d.id).length, 0);
  const story = view.timeline.find((e) => e.kind === "market" && e.market.dare.id === d.id);
  assert.deepEqual(story?.kind === "market" ? story.market.consequences.map((c) => c.quantity) : null, [127n]);
});

test("a voided market reads as voided, with no outcome and nothing beneath it", async () => {
  const { d, enter } = await openMarket();
  await enter(ana, 2000n, 8000n);
  await enter(ben, 1000n, 3500n);
  const now = new Date();
  await db.update(schema.dares).set({ lockedAt: now, resolvedAt: now, resolvedOutcome: markets.VOID_OUTCOME, resolvedBy: "quorum" }).where(eq(schema.dares.id, d.id));
  const c = await card(ana, d.id);
  assert.equal(c?.state, "voided");
  assert.equal(c?.outcome, null);
  assert.deepEqual(c?.consequences, []);
});

test("a question's share card is the question and an invitation: no number, no name, nothing about what is on it", async () => {
  const { d, enter } = await openMarket();
  await enter(ana, 2000n, 8000n);
  const share = await marketShare(d.id);
  assert.equal(share.question, "Does Zanzibar get rain this weekend?");
  assert.equal(share.card.headline, "Does Zanzibar get rain this weekend?");
  for (const s of ["Okonkwo", "Ana", "80", "2000", "20.00", "dollar"]) assert.ok(!JSON.stringify(share).includes(s), `the card leaks "${s}"`);
});

test("a draft, a malformed id, and an id that matches nothing all get the same plain card", async () => {
  const g = await createGroup({ name: "view check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  const usd = await ensureUsd(g.id, ana.user.id);
  const draft = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "A secret draft?", termsText: "Nobody has approved this yet.", resolvesBy: new Date(Date.now() + 3_600_000) });
  const plain = JSON.stringify(await marketShare(randomUUID()));
  assert.equal(JSON.parse(plain).card.headline, plainCard.headline);
  assert.equal(JSON.stringify(await marketShare("junk")), plain);
  assert.equal(JSON.stringify(await marketShare(draft.id)), plain);
});
