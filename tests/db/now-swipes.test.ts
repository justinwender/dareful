/**
 * The two swipes on Now (docs/design.md 3.15), against the real database. Removing ends a market you asked that
 * nobody else is in as a void only the asker can make: it leaves Now and every timeline, counts against nobody,
 * and its own screen still opens for anyone the link reached. Archiving changes nothing but this person's Now.
 * No chain: an open market is not on it yet, which is why removing needs no contract call.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import { nowFor } from "@/lib/ledger/home";
import { marketCards } from "@/lib/ledger/market-view";
import * as markets from "@/lib/ledger/markets";
import { archivedFor, archiveMarket, removeMarket } from "@/lib/ledger/now-swipes";
import { cleanup, codeOf, tempSigner, track, type Signer } from "./fixture";

let ana: Signer, ben: Signer;
before(async () => {
  [ana, ben] = await Promise.all(["Ana", "Ben"].map((n) => tempSigner(n)));
});
after(cleanup);

async function question(title: string) {
  const g = await createGroup({ name: "swipe check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: ben.user.id });
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title, termsText: "Yes if it happens before midnight.", resolvesBy: new Date(Date.now() + 3_600_000) });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  const enter = async (who: Signer, value: bigint, stake = 1000n) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, value)) });
  return { d, g: g.id, enter };
}
const now = (who: Signer) => nowFor(who.user, { now: new Date(), closes: () => "" });

test("removing a market you asked that nobody else is in: only the asker, only while alone and open; it becomes a void that counts against nobody, leaves Now and every timeline, and its own screen still opens", async () => {
  const { d, enter } = await question("Does the kettle get descaled tonight?");
  await enter(ana, 7000n);
  assert.equal(await codeOf(() => removeMarket(d.id, ben.user.id)), "not_yours", "only the person who asked it");
  const before = await now(ana);
  assert.equal(before.running.find((r) => r.id === d.id)?.removable, true, "the running row answers a swipe");
  await removeMarket(d.id, ana.user.id);
  const after = (await markets.marketById(d.id))!;
  assert.deepEqual([markets.stateOf(after), after.resolvedBy, after.resolvedOutcome, after.lockedAt !== null], ["voided", "removed", markets.VOID_OUTCOME, true], "a void only the asker can make, recorded as removed");
  assert.equal(await codeOf(() => removeMarket(d.id, ana.user.id)), "wrong_state", "nothing left to remove");
  const home = await now(ana);
  assert.deepEqual([home.running.some((r) => r.id === d.id), home.happened.some((e) => e.kind === "market" && e.market.dare.id === d.id), home.needs.some((n) => n.key === d.id)], [false, false, false], "gone from Now, and never in Just happened");
  assert.equal((await marketCards({ viewerId: ben.user.id })).some((m) => m.dare.id === d.id), false, "nobody's story: off every timeline");
  const other = await question("Does the second one stay?");
  await other.enter(ana, 7000n);
  await other.enter(ben, 3000n);
  assert.equal(await codeOf(() => removeMarket(other.d.id, ana.user.id)), "wrong_state", "someone else is in, so it isn't the asker's alone to remove");
  assert.equal((await now(ana)).running.find((r) => r.id === other.d.id)?.removable, undefined, "and its row stays put when swiped");
  await db.update(schema.dares).set({ lockedAt: new Date() }).where(eq(schema.dares.id, other.d.id));
  assert.equal(await codeOf(() => removeMarket(other.d.id, ana.user.id)), "wrong_state", "not once it has closed");
});

test("archiving a finished market changes nothing but this person's Now: it leaves their Just happened and stays on everyone else's, and a running one cannot be archived", async () => {
  const { d, enter } = await question("Does the archive keep the story?");
  await enter(ana, 7000n);
  await enter(ben, 3000n);
  assert.equal(await codeOf(() => archiveMarket(d.id, ana.user.id)), "wrong_state", "still running");
  await db.update(schema.dares).set({ lockedAt: new Date(), resolvedAt: new Date(), resolvedOutcome: 1n, resolvedBy: "quorum" }).where(eq(schema.dares.id, d.id));
  assert.equal((await now(ana)).happened.some((e) => e.kind === "market" && e.market.dare.id === d.id), true, "just happened, before the swipe");
  await archiveMarket(d.id, ana.user.id);
  await archiveMarket(d.id, ana.user.id);
  assert.deepEqual([...(await archivedFor(ana.user.id))], [d.id], "once, however many times");
  assert.equal((await now(ana)).happened.some((e) => e.kind === "market" && e.market.dare.id === d.id), false, "off this person's Now");
  assert.equal((await now(ben)).happened.some((e) => e.kind === "market" && e.market.dare.id === d.id), true, "and still on the other person's");
  assert.equal((await marketCards({ viewerId: ana.user.id })).some((m) => m.dare.id === d.id), true, "the story stays where it was, for everyone");
});
