/**
 * The close as a hard cutoff, against the real database (the QA round, 2026-09-29; CLAUDE.md: "Lock is a hard
 * cutoff with no exceptions"): once a question's own time has passed, an entry or a change is refused with the
 * lock's own sentence whether or not the tick has locked it, for an account-holder and for someone from the link
 * alike; an argument has no time until its second entry and is not affected. And Now follows: a question past its
 * time that only its asker is in is a Running row that swipes to Remove, never a Close that could not be finished,
 * and someone not in it gets no row at all. No chain. Rows are the temporary people's and removed after.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { enterAsGhost } from "@/lib/ledger/ghost-entry";
import { createGroup } from "@/lib/ledger/groups";
import { homeFor } from "@/lib/ledger/home";
import * as markets from "@/lib/ledger/markets";
import { cleanup, tempSigner, track, type Signer } from "./fixture";

let ana: Signer, ben: Signer, cy: Signer;
before(async () => {
  [ana, ben, cy] = await Promise.all(["Ana", "Ben", "Cy"].map((n) => tempSigner(n)));
});
after(cleanup);

async function question(over: Partial<markets.DraftInput> = {}) {
  const g = await createGroup({ name: "cutoff check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  // Three seats, so "everyone's in" is never the reason a Close is offered here.
  await db.insert(schema.groupMembers).values([ben, cy].map((p) => ({ groupId: g.id, userId: p.user.id })));
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Does John fall asleep during the movie?", termsText: "Yes if John is asleep at any point before the credits. No if he makes it.", resolvesBy: new Date(Date.now() + 3_600_000), ...over });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  const enter = async (who: Signer, value: bigint, stake = 1000n) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake, value, signature: await who.ledger.signTypedData(markets.enterTypedData(d, stake, value)) });
  const ghost = (name: string, tokens: string[], value: bigint) => enterAsGhost({ dareId: d.id, who: { name, phoneHash: null, memberClaimId: null }, tokens, stake: 1000n, value });
  return { d, g: g.id, enter, ghost };
}
/** The question's own time, moved into the past without locking it: what a question with one person in looks like a minute after its close. */
const timePasses = (id: string) => db.update(schema.dares).set({ resolvesBy: new Date(Date.now() - 60_000) }).where(eq(schema.dares.id, id));
const refused = async (fn: () => Promise<unknown>): Promise<[string | null, string | null]> => {
  try {
    await fn();
    return [null, null];
  } catch (err) {
    return err instanceof markets.MarketError ? [err.code, err.message] : [`other:${String(err)}`, null];
  }
};
const home = (who: Signer) => homeFor(who.user, { now: new Date(), closes: () => "tonight" });

test("an entry or a change is refused once the question's own time has passed, locked yet or not, with the lock's own sentence; the numbers already in stay as they were", async () => {
  const { d, enter } = await question();
  await enter(ana, 7000n);
  await timePasses(d.id);
  assert.equal(markets.stateOf((await markets.marketById(d.id))!), "open", "the tick has not locked it: one person in");
  assert.deepEqual(await refused(() => enter(ana, 9000n)), ["wrong_state", "Numbers are locked."], "the asker cannot change theirs after the close");
  assert.deepEqual(await refused(() => enter(ben, 3000n)), ["wrong_state", "Numbers are locked."], "and nobody gets in after it, whether or not the lock has been sent");
  const rows = await markets.positionsOf(d.id);
  assert.deepEqual(rows.map((p) => [p.userId, p.value]), [[ana.user.id, 7000n]], "nothing moved and nothing was added");
});

test("someone from the link is refused after the close like anyone: no new ghost, and a ghost already in cannot change", async () => {
  const { d, enter, ghost } = await question();
  await enter(ana, 7000n);
  const gabe = await ghost("Gabe", [], 9000n);
  await timePasses(d.id);
  assert.deepEqual(await refused(() => ghost("Gabe", [gabe.browserToken as string], 2000n)), ["wrong_state", "Numbers are locked."], "the same browser cannot change its number after the close");
  assert.deepEqual(await refused(() => ghost("Late", [], 5000n)), ["wrong_state", "Numbers are locked."], "and nobody new gets in");
  const rows = await markets.positionsOf(d.id);
  assert.deepEqual(rows.map((p) => p.value), [7000n, 9000n], "the two numbers already in, untouched");
  const ghosts = await db.select({ id: schema.participantClaims.id }).from(schema.participantClaims).where(eq(schema.participantClaims.createdBy, ana.user.id));
  assert.equal(ghosts.some((c) => c.id !== gabe.claimId), false, "no ghost was made for the late name");
});

test("an argument has no time until its second person is in, and is never past it: its sides go in whatever the clock says", async () => {
  const { d, enter } = await question({ pace: "argument", resolvesBy: null, tier: "checkable" });
  // An argument's resolves_by is the moment its second person got in, and it locks in the same breath; a stored time in the past cannot refuse a side.
  await timePasses(d.id);
  await enter(ana, 10_000n);
  await enter(ben, 0n);
  assert.deepEqual((await markets.positionsOf(d.id)).map((p) => p.value), [10_000n, 0n], "both sides in");
  assert.equal(markets.pastItsClose((await markets.marketById(d.id))!, new Date()), false);
});

test("on Now a question past its time that only its asker is in is a Running row that swipes to Remove, never a Close; someone not in it gets no row at all", async () => {
  const { d, enter } = await question();
  await enter(ana, 7000n);
  await timePasses(d.id);
  const mine = await home(ana);
  assert.equal(mine.needs.some((n) => n.key === d.id), false, "no Close to finish: the close refuses fewer than two, and time's up is not a reason to nag");
  const row = mine.running.find((r) => r.id === d.id);
  assert.deepEqual([row?.state, row?.removable], ["in", true], "it runs with just the asker, and the swipe answers Remove (3.15)");
  const theirs = await home(ben);
  assert.equal(theirs.needs.some((n) => n.key === d.id), false, "past the close there is nothing for Ben to get into");
  assert.equal(theirs.running.some((r) => r.id === d.id), false, "and it is not something he has acted on");
  assert.equal(theirs.happened.some((e) => e.kind === "market" && e.market.dare.id === d.id), false, "and it did not happen: an open question is on no list");
});

test("on Now, with two in, the asker's Close on time's up is offered; before the close, someone not in it is asked to enter", async () => {
  const { d, enter } = await question();
  await enter(ana, 7000n);
  const before = await home(ben);
  assert.equal(before.needs.find((n) => n.key === d.id)?.kind, "enter");
  await enter(ben, 3000n);
  await timePasses(d.id);
  const mine = await home(ana);
  const close = mine.needs.find((n) => n.key === d.id);
  assert.deepEqual([close?.kind, close?.verb, close?.context], ["lock", "Close", "Time’s up on this one"], "two in: the close can be finished, so the row is offered");
  assert.equal(mine.running.some((r) => r.id === d.id), false);
});
