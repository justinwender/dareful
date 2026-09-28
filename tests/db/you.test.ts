/**
 * You's figures against the real database (docs/design.md 3.34): the questions asked that count (a quorum's
 * answer or void, the tiebreaker's, the final score's answer), what is left out (expiry, a removal, the final
 * score's own void), and the header's count of markets, which leaves out a removed one. Rows tracked and removed.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { removeMarket } from "@/lib/ledger/now-swipes";
import { askedRecord, youFor } from "@/lib/ledger/you";
import { cleanup, tempSigner, track, type Signer } from "./fixture";

let ana: Signer, ben: Signer;
before(async () => {
  [ana, ben] = await Promise.all(["Ana", "Ben"].map((n) => tempSigner(n)));
});
after(cleanup);

test("questions you asked count a quorum's answer and its void, leave out expiry, a removal and the final score's own void, keep the order they ended, and the header counts the markets you are in without the removed one", async () => {
  const g = await createGroup({ name: "you check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: ben.user.id });
  const usd = await ensureUsd(g.id, ana.user.id);
  const ask = async (title: string, mark?: string) => {
    const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title, termsText: "Yes if it happens.", resolvesBy: new Date(Date.now() + 3_600_000), ...(mark ? { mark: { kind: "emoji" as const, value: mark } } : {}) });
    const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
    await markets.enterMarket({ dareId: d.id, userId: ana.user.id, stake: 500n, value: 7000n, signature: await ana.ledger.signTypedData(markets.enterTypedData(d, 500n, 7000n)) });
    return d;
  };
  const end = (id: string, by: "quorum" | "arbitration" | "feed" | "expired", outcome: bigint | null, minutesAgo: number) => db.update(schema.dares).set({ lockedAt: new Date(Date.now() - (minutesAgo + 60) * 60_000), resolvedAt: new Date(Date.now() - minutesAgo * 60_000), resolvedBy: by, resolvedOutcome: outcome }).where(eq(schema.dares.id, id));
  const clean = await ask("Does the clean one end cleanly?", "🍺");
  const voided = await ask("Does the voided one count against me?", "🍺");
  const expired = await ask("Does the expired one count against nobody?");
  const feedVoid = await ask("Does the tie count against nobody?");
  const removed = await ask("Does the removed one vanish?");
  const open = await ask("Is the open one still open?");
  await end(clean.id, "quorum", 1n, 50);
  // The clean one scored its one position, as a resolution does (a void scores nobody).
  await db.update(schema.darePositions).set({ score: 9100 }).where(eq(schema.darePositions.dareId, clean.id));
  await end(voided.id, "quorum", markets.VOID_OUTCOME, 40);
  await end(expired.id, "expired", null, 30);
  await end(feedVoid.id, "feed", markets.VOID_OUTCOME, 20);
  await removeMarket(removed.id, ana.user.id);
  const asked = await askedRecord(ana.user.id);
  assert.deepEqual(asked.counted.map((q) => [q.title, q.clean]), [["Does the clean one end cleanly?", true], ["Does the voided one count against me?", false]], "the quorum's answer and its void, oldest first; expiry, the final score's void and a removal are not counted");
  assert.deepEqual([asked.clean, asked.expired], [1, 1]);
  const you = await youFor({ id: ana.user.id, createdAt: ana.user.createdAt });
  assert.equal(you.markets, 5, "in six, one removed: five");
  assert.ok(you.firstEnteredAt && you.firstEnteredAt.getTime() <= Date.now(), "since the first entry");
  assert.deepEqual(you.marks, [{ kind: "emoji", value: "🍺" }], "the marks used on questions asked, once each: two questions wore the beer and it is listed once");
  assert.ok(you.units.some((u) => u.id === usd.id) && you.units.filter((u) => u.monetary).length === 1, "dollars once, however many sets use them");
  assert.deepEqual(you.calibration.binary.resolved, 1, "one resolved yes-or-no call: the clean one; a void scores nobody");
  void open;
});
