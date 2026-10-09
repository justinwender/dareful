/**
 * The final round (2026-10-09) against the real database and, for the unit of one's own, the real chain. Silence agrees
 * with the app's ruling only where the terms everyone signed say so, and an argument from before that rule goes to the
 * tiebreaker after a day with nobody agreeing; a question of one's own on a game page closes like the game's others and
 * is its people's to settle, never the feed's; a unit of one's own goes on the chain as "beers" does, by its id alone;
 * and the owner's numbers leave out every excluded account and every excluded guest. A guest in the argument and the
 * game question keeps them off the chain. Rows are the temporary people's and removed after; the tick is never called.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { relayer } from "@/lib/chain/relayer";
import { ensureUnitInGroup, ensureUsd } from "@/lib/ledger/denominations";
import { enterAsGhost } from "@/lib/ledger/ghost-entry";
import { createGroup } from "@/lib/ledger/groups";
import { bufferToHex, denomOnchainId, groupOnchainId } from "@/lib/ledger/ids";
import * as markets from "@/lib/ledger/markets";
import { agreeWithRuling, rulingsToStand, SILENCE_MS, stampOldRulings } from "@/lib/ledger/rulings";
import { newSalt, sealedText, sealLine, sealOf } from "@/lib/ledger/seal";
import { ARBITRATION_BACKSTOP_MS, backstopMoment, toArbitrate } from "@/lib/ledger/settle";
import { proposeFor, syncSchedule } from "@/lib/sports";
import { parseScoreboard } from "@/lib/sports/espn";
import type { FeedGame, ScheduleSource } from "@/lib/sports/types";
import { countedOnchain, countStats } from "@/lib/usage/stats";
import { cleanup, codeOf, tempSigner, track, type Signer } from "./fixture";

const H = 3_600_000;
const RUN = Math.random().toString(36).slice(2, 8);
const PREFIX = `test:final:${RUN}:`;
const fixture = (path: string): unknown => JSON.parse(readFileSync(new URL(`../fixtures/sports/${path}.json`, import.meta.url), "utf8"));

let ana: Signer, ben: Signer;
before(async () => {
  track.gamePrefix(PREFIX);
  [ana, ben] = await Promise.all(["Ana", "Ben"].map((n) => tempSigner(n)));
});
after(cleanup);

// ------------------------------------------------------------------------------------- section 8: silence

/** An argument between Ana and someone from the link: sealed at the ask with the rule silence agrees under, or from before that rule. */
async function argument(label: string, sealed: boolean) {
  const g = await createGroup({ name: `silence check ${label} (temporary)`, createdBy: ana.user.id });
  track.group(g.id);
  const usd = await ensureUsd(g.id, ana.user.id);
  const rationale = "Hitting a pitched ball in play is the harder skill. Most penalties are scored, so most saves never happen.";
  const salt = newSalt();
  const hash = sealOf(salt, sealedText(1n, rationale, null));
  const terms = "Yes if hitting a pitched baseball in play is harder than saving a penalty kick.";
  const d0 = await markets.draftMarket({
    creatorId: ana.user.id,
    groupId: g.id,
    denomId: usd.id,
    title: "Is hitting a baseball harder than saving a penalty?",
    termsText: sealed ? `${terms}\n\n${sealLine(hash)}` : terms,
    resolvesBy: null,
    pace: "argument",
    tier: "checkable",
    stalemate: "arbitrate",
    ...(sealed ? { settledBy: "facts" as const, seal: { outcome: 1n, confidenceBps: 8000, rationale, salt, hash } } : {}),
  });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  await markets.enterMarket({ dareId: d.id, userId: ana.user.id, stake: 1000n, value: 10_000n, signature: await ana.ledger.signTypedData(markets.enterTypedData(d, 1000n, 10_000n)) });
  await enterAsGhost({ dareId: d.id, who: { name: "Gabe", phoneHash: null, memberClaimId: null }, tokens: [], stake: 1000n, value: 0n });
  return d;
}

test("silence agrees only where the signed terms say so: an argument from before the rule keeps Agree, is never stood by a day of silence, and goes to the tiebreaker after a day with nobody agreeing; one sealed under it stands and never takes the tiebreaker's place", async () => {
  const at = new Date();
  const old = await argument("before the rule", false);
  await markets.lockMarket(old.id, ana.user.id, at);
  // Ruled at its close the way arguments were before the round (what production's penalty-kick argument holds).
  await db.update(schema.dares).set({ aiOutcome: 1n, aiProposedAt: at, aiRationale: "Most penalties are scored." }).where(eq(schema.dares.id, old.id));
  const scope = inArray(schema.dares.id, [old.id]);
  assert.equal(await stampOldRulings(new Date(at.getTime() + 60_000), scope), 1, "shown, so its people can answer it");
  assert.deepEqual(await agreeWithRuling(old.id, { userId: ana.user.id }), { settled: false }, "Agree still works on it");
  const dayOn = new Date(at.getTime() + 60_000 + ARBITRATION_BACKSTOP_MS + 60_000);
  assert.deepEqual(await rulingsToStand(dayOn, scope, 10), [], "a day of silence never stands a ruling its terms did not sign for");
  assert.deepEqual(await toArbitrate(new Date(at.getTime() + ARBITRATION_BACKSTOP_MS + 30_000), scope, 3), [], "its day counts from when the ruling was shown, never from the close before it");
  assert.deepEqual((await toArbitrate(dayOn, scope, 3)).map((x) => x.id), [old.id], "nobody agreeing for a day is a stalemate, and the tiebreaker it was signed with hears it");
  const due = backstopMoment({ stalemate: "arbitrate", pace: "argument", lockedAt: at, resolvesBy: null, rulingRevealedAt: new Date(at.getTime() + 60_000), template: null, game: null, final: null });
  assert.equal(due?.actsAt.getTime(), at.getTime() + 60_000 + ARBITRATION_BACKSTOP_MS, "and its warning names that moment");

  const sealed = await argument("under the rule", true);
  await markets.lockMarket(sealed.id, ana.user.id, at);
  const sealedScope = inArray(schema.dares.id, [sealed.id]);
  const later = new Date(at.getTime() + SILENCE_MS + 60_000);
  assert.deepEqual((await rulingsToStand(later, sealedScope, 10)).map((x) => x.id), [sealed.id], "silence stands the one whose terms say so");
  assert.deepEqual(await toArbitrate(new Date(at.getTime() + 3 * SILENCE_MS), sealedScope, 3), [], "and the backstop never hears it over them");
});

// ------------------------------------------------------------------------------------- section 5: a question of one's own on a game page

const recorded = (startsAt: Date): FeedGame => ({ ...parseScoreboard("nfl", fixture("espn-nfl-scheduled"))[0]!, sourceId: `${PREFIX}${startsAt.getTime()}`, startsAt });
const listing = (games: FeedGame[]): ScheduleSource => ({ name: "espn", listGames: async () => games });
const gameRow = async (sourceId: string) => (await db.select().from(schema.sportsGames).where(and(eq(schema.sportsGames.source, "espn"), eq(schema.sportsGames.sourceId, sourceId))).limit(1))[0]!;

test("a question of one's own on a game page closes at the start when asked ahead and five minutes after its first call once the game is on, is the page's own, is never the feed's to settle, and is refused once the game is over", async () => {
  const g = await createGroup({ name: "own question check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  const usd = await ensureUsd(g.id, ana.user.id);
  const ahead = recorded(new Date(Date.now() + 3 * H));
  const live = recorded(new Date(Date.now() - H));
  await syncSchedule("nfl", new Date(), listing([ahead, live]));
  const [aheadRow, liveRow] = await Promise.all([gameRow(ahead.sourceId), gameRow(live.sourceId)]);
  const ask = (gameId: string) => markets.draftOwnGameQuestion({ gameId, creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Does the kicker miss a field goal?", termsText: "Yes if the kicker misses any field goal attempt in this game. Decided by the people in it once the game ends." });

  const before = await ask(aheadRow.id);
  assert.deepEqual([before.resolvesBy?.getTime(), before.closesAfterFirst, before.stalemate, before.pace], [aheadRow.startsAt.getTime(), false, "arbitrate", "dare"], "asked ahead: it closes at the start, as the game's own questions do");
  const [own] = await db.select().from(schema.publicQuestions).where(eq(schema.publicQuestions.id, before.templateId as string));
  assert.deepEqual([own?.gameId, own?.key, own?.decidedByFeed, own?.decidedByScore], [aheadRow.id, markets.ownKey(before.id), false, false], "on the game's page, and never the feed's");

  const during = await ask(liveRow.id);
  assert.deepEqual([during.resolvesBy, during.closesAfterFirst], [null, true], "asked during the game: no close until the first call");
  const d = await markets.openMarket(during.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(during)));
  await markets.enterMarket({ dareId: d.id, userId: ana.user.id, stake: 1000n, value: 7000n, signature: await ana.ledger.signTypedData(markets.enterTypedData(d, 1000n, 7000n)) });
  const first = (await markets.marketById(d.id))!.resolvesBy;
  assert.ok(first && first.getTime() > Date.now() + 4 * 60_000 && first.getTime() <= Date.now() + 5 * 60_000, "the first call sets the close five minutes on");
  await enterAsGhost({ dareId: d.id, who: { name: "Gabe", phoneHash: null, memberClaimId: null }, tokens: [], stake: 1000n, value: 2000n });

  // The final comes in: nothing more is asked or entered, the feed proposes nothing, and the vote is open to the people in it.
  const finalScore = parseScoreboard("nfl", fixture("espn-nfl-final")).find((x) => x.completed)!;
  await db.update(schema.sportsGames).set({ finalSeenAt: new Date(), homeScore: finalScore.homeScore, awayScore: finalScore.awayScore, completed: true, status: "final" }).where(eq(schema.sportsGames.id, liveRow.id));
  assert.equal(await codeOf(() => ask(liveRow.id)), "bad_input", "too late to ask once it is over");
  await markets.lockMarket(d.id, ana.user.id, new Date());
  const closed = (await markets.marketById(d.id))!;
  assert.deepEqual(await proposeFor((await gameRow(live.sourceId))!, new Date(), [d.id]), [], "the final score answers nothing it did not ask");
  assert.equal(closed.feedOutcome, null);
  assert.equal(await markets.votingOpenNow(closed), true, "the final opens the vote");
  assert.deepEqual((await toArbitrate(new Date(Date.now() + 2 * 86_400_000), inArray(schema.dares.id, [d.id]), 3)).map((x) => x.id), [d.id], "and with nobody deciding, the tiebreaker its people agreed to hears it, as for any question");
});

// ------------------------------------------------------------------------------------- section 6: a unit of one's own, on the chain

test("a unit of one's own goes on the chain as beers does: registered by its id, counted as a quantity, never its words, and the owner's chain counts follow who is counted", async () => {
  const g = await createGroup({ name: "own unit check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: ben.user.id });
  const pizzas = await ensureUnitInGroup(g.id, ana.user.id, { template: null, label: "pizzas" });
  assert.deepEqual([pizzas.quantifiable, pizzas.monetary, pizzas.template], [true, false, null], "a count, never money");
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: pizzas.id, title: "Does Ben finish the pizza?", termsText: "Yes if Ben finishes a whole large pizza by himself tonight.", resolvesBy: new Date(Date.now() + H) });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  const enter = async (who: Signer, bps: bigint) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake: 2n, value: bps, signature: await who.ledger.signTypedData(markets.enterTypedData(d, 2n, bps)), questionSignature: await who.ledger.signTypedData(markets.questionCreateTypedData(d)) });
  await enter(ana, 7000n);
  await enter(ben, 3000n);
  await markets.lockMarket(d.id, ana.user.id, new Date());
  const locked = (await markets.marketById(d.id))!;
  assert.notEqual(locked.onchainId, null, "on the chain");
  const [unit] = await db.select().from(schema.denominations).where(eq(schema.denominations.id, pizzas.id));
  assert.equal(bufferToHex(unit!.onchainId as Buffer), denomOnchainId(pizzas.id).toLowerCase(), "registered under the hash of its id");
  const { ledger } = contracts();
  const onchain = await relayer().publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "denomOf", args: [groupOnchainId(g.id), denomOnchainId(pizzas.id)] });
  assert.deepEqual([onchain.id.toLowerCase(), onchain.quantifiable], [denomOnchainId(pizzas.id).toLowerCase(), true], "the chain holds its id, its set and that it counts; nothing else");

  const onchainId = bufferToHex(locked.onchainId as Buffer).toLowerCase();
  const counted = await countedOnchain();
  assert.ok(counted.dareIds.includes(onchainId), "a question with counted people in it is real use");
  assert.ok(counted.ledgers.includes(ana.user.ledgerWallet!.toLowerCase()) && counted.ledgers.includes(ben.user.ledgerWallet!.toLowerCase()));
  await db.update(schema.users).set({ excludedFromCounts: true }).where(inArray(schema.users.id, [ana.user.id, ben.user.id]));
  const left = await countedOnchain();
  assert.ok(!left.dareIds.includes(onchainId), "with nobody counted in it, it is a test's");
  assert.ok(!left.ledgers.includes(ana.user.ledgerWallet!.toLowerCase()), "and an excluded account's wallet is asked about nowhere");
  await db.update(schema.users).set({ excludedFromCounts: false }).where(inArray(schema.users.id, [ana.user.id, ben.user.id]));
});

// ------------------------------------------------------------------------------------- section 9: an excluded guest

test("an excluded guest counts nowhere: not their entry, and not toward a question's two or more in", async () => {
  // A window nobody else has anything in, so the suites running beside this one cannot move the numbers.
  const from = new Date("2003-03-03T05:00:00Z");
  const to = new Date("2003-03-04T05:00:00Z");
  const at = new Date("2003-03-03T17:00:00Z");
  const g = await createGroup({ name: "excluded guest check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Does the train leave on time?", termsText: "Yes if the 8:15 leaves the station by 8:16.", resolvesBy: new Date(Date.now() + H) });
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  await markets.enterMarket({ dareId: d.id, userId: ana.user.id, stake: 1000n, value: 7000n, signature: await ana.ledger.signTypedData(markets.enterTypedData(d, 1000n, 7000n)) });
  const guest = await enterAsGhost({ dareId: d.id, who: { name: "Gabe", phoneHash: null, memberClaimId: null }, tokens: [], stake: 1000n, value: 2000n });
  const claimId = guest.claimId as string;
  track.claim(claimId);
  await db.update(schema.dares).set({ createdAt: at }).where(eq(schema.dares.id, d.id));
  await db.delete(schema.usageEvents).where(eq(schema.usageEvents.claimId, claimId));
  await db.insert(schema.usageEvents).values({ name: "entered", claimId, at, props: { as: "guest" } });
  const counts = await countStats({ from, to });
  assert.deepEqual([counts.questions_two_in, counts.guest_entries], [1, 1], "a guest counts like anyone");
  await db.update(schema.participantClaims).set({ excludedFromCounts: true }).where(eq(schema.participantClaims.id, claimId));
  const without = await countStats({ from, to });
  assert.deepEqual([without.questions_two_in, without.guest_entries], [0, 0], "left out, the guest's entry and the question they made two are gone from the numbers");
  await db.delete(schema.usageEvents).where(eq(schema.usageEvents.claimId, claimId));
});
