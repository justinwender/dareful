/**
 * Pre-submission bug fixes 2 against the real database (docs/decisions.md 2026-10-12). Section 0: pass the phone refused
 * every friend on a question asked without naming anyone, since the friend offered there (one of the host's own people
 * with it on) had never opened the question's link or code and so was in nobody's group; a right PIN now joins them first,
 * exactly as the link would, on a market and on a game's question alike, and a wrong one joins nobody. And the other way
 * into a question with the same gap: a guest who got into a question asked between two people, whose account was then
 * refused its own entry. Rows tracked and removed; Dynamic's signing stood in for by the friend's own key.
 */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import type { PrivateKeyAccount } from "viem";
import { db, schema } from "@/db";
import { seal, storeKey, type SignerLoad } from "@/lib/chain/delegated-signer";
import { bindClaimToUser, linkEntriesFor } from "@/lib/ledger/claims";
import { ensureUsd } from "@/lib/ledger/denominations";
import { enterAsGhost, removeGhostEntry } from "@/lib/ledger/ghost-entry";
import { createGroup, createOccasionGroup, ensureDyad, isMember } from "@/lib/ledger/groups";
import { enterFromHost, handOverCandidates, handOverPicks } from "@/lib/ledger/hand-over";
import * as markets from "@/lib/ledger/markets";
import { setPin } from "@/lib/ledger/pass-the-phone";
import { syncSchedule } from "@/lib/sports";
import { parseScoreboard } from "@/lib/sports/espn";
import { cleanup, tempSigner, testSchedule, track, type Signer } from "./fixture";

const H = 3_600_000;
const RUN = Math.random().toString(36).slice(2, 8);
const PREFIX = `test:fixes2:${RUN}:`;
const fixture = (path: string): unknown => JSON.parse(readFileSync(new URL(`../fixtures/sports/${path}.json`, import.meta.url), "utf8"));

let sam: Signer, nia: Signer, ana: Signer, ben: Signer, cy: Signer, dee: Signer;
let storeKeyWas: string | undefined;
before(async () => {
  track.gamePrefix(PREFIX);
  [sam, nia, ana, ben, cy, dee] = await Promise.all(["Sam", "Nia", "Ana", "Ben", "Cy", "Dee"].map((n) => tempSigner(n)));
  storeKeyWas = process.env.DELEGATION_STORE_KEY;
  if (!/^[0-9a-fA-F]{64}$/.test(storeKeyWas ?? "")) process.env.DELEGATION_STORE_KEY = randomBytes(32).toString("hex");
  // Nia is one of Sam's people, from a set they share, and has pass the phone on: a delegation and a PIN.
  const shared = await createGroup({ name: "fixes 2: Sam and Nia (temporary)", createdBy: sam.user.id, memberUserIds: [nia.user.id] });
  track.group(shared.id);
  const walletId = `w-ledger-${nia.user.id.slice(0, 8)}`;
  const binding = `delegation:${nia.user.id}:${walletId}`;
  await db.insert(schema.delegations).values({ userId: nia.user.id, walletId, walletAddress: nia.user.ledgerWallet.toLowerCase(), encryptedShare: seal(Buffer.from(JSON.stringify({ secretShare: "s" }), "utf8"), storeKey(), binding), encryptedApiKey: seal(Buffer.from("k", "utf8"), storeKey(), binding), shareSetId: null, eventId: "evt-fixes-2", eventAt: new Date(), grantedAt: new Date(), revokedAt: null });
  await setPin(nia.user.id, "1357");
});
after(async () => {
  for (const s of [sam, nia]) {
    await db.delete(schema.delegatedSignatures).where(eq(schema.delegatedSignatures.userId, s.user.id));
    await db.delete(schema.delegations).where(eq(schema.delegations.userId, s.user.id));
  }
  if (storeKeyWas === undefined) delete process.env.DELEGATION_STORE_KEY;
  else process.env.DELEGATION_STORE_KEY = storeKeyWas;
  await cleanup();
});

const signingWith = (account: PrivateKeyAccount): SignerLoad => async () => ({ client: {} as Awaited<ReturnType<SignerLoad>>["client"], mod: { delegatedSignTypedData: async (_c, { typedData }) => account.signTypedData(typedData as unknown as Parameters<PrivateKeyAccount["signTypedData"]>[0]) } });
const hosted = (dareId: string, pin: string) => enterFromHost({ dareId, hostId: sam.user.id, friendId: nia.user.id, stake: 500n, value: 6000n, pin, request: "tests/db/bug-fixes-2.test.ts", deps: { load: signingWith(nia.ledger) } });
const seats = async (groupId: string) => (await db.select({ userId: schema.groupMembers.userId }).from(schema.groupMembers).where(eq(schema.groupMembers.groupId, groupId))).map((s) => s.userId).sort();
const enteredAs = async (dareId: string, userId: string) => (await db.select({ props: schema.usageEvents.props }).from(schema.usageEvents).where(and(eq(schema.usageEvents.name, "entered"), eq(schema.usageEvents.dareId, dareId), eq(schema.usageEvents.userId, userId)))).map((r) => (r.props as { as?: string }).as);

/** What a right PIN leaves, and what a wrong one does not: the friend in the question's group, their entry with the terms beside it, counted. */
async function handOverHolds(d: markets.DareRow, label: string) {
  const before = await seats(d.groupId);
  assert.ok(!before.includes(nia.user.id), `${label}: Nia has never opened it`);
  assert.deepEqual((await handOverCandidates(d.id, sam.user.id)).map((c) => [c.name, c.ready]), [["Nia", true]], `${label}: offered from Sam's own people, ready`);
  assert.equal((await handOverPicks(d.id, sam.user.id)).empty, null, `${label}: someone to pick, so no line about nobody`);

  const wrong = await hosted(d.id, "0000");
  assert.ok(!wrong.ok && "pin" in wrong && !wrong.pin.locked, `${label}: a wrong PIN says so`);
  assert.deepEqual(await seats(d.groupId), before, `${label}: and leaves the group as it was`);
  assert.equal(await isMember(d.groupId, nia.user.id), false, `${label}: nobody joined`);
  assert.equal((await markets.positionsOf(d.id)).some((p) => p.userId === nia.user.id), false, `${label}: nothing entered`);
  assert.equal((await db.select().from(schema.delegatedSignatures).where(and(eq(schema.delegatedSignatures.userId, nia.user.id), eq(schema.delegatedSignatures.subject, d.id)))).length, 0, `${label}: nothing signed`);

  const right = await hosted(d.id, "1357");
  assert.ok(right.ok, `${label}: a right PIN gets her in (${!right.ok && "refused" in right ? right.refused : "a PIN refusal"})`);
  assert.equal(await isMember(d.groupId, nia.user.id), true, `${label}: in the question's group, as its link would have put her`);
  assert.deepEqual(await seats(d.groupId), [...before, nia.user.id].sort(), `${label}: one seat more, hers`);
  const mine = (await markets.positionsOf(d.id)).find((p) => p.userId === nia.user.id);
  assert.deepEqual([mine?.value, mine?.stake, mine?.enteredBy, mine?.enterSignature !== null, mine?.questionSignature !== null], [6000n, 500n, sam.user.id, true, true], `${label}: her entry, signed, with the terms over the question's own group beside it, and Sam on it`);
  assert.deepEqual(await enteredAs(d.id, nia.user.id), ["pass_the_phone"], `${label}: counted as an entry, made on a friend's phone`);
  const recs = await db.select({ action: schema.delegatedSignatures.action }).from(schema.delegatedSignatures).where(and(eq(schema.delegatedSignatures.userId, nia.user.id), eq(schema.delegatedSignatures.subject, d.id)));
  assert.deepEqual(recs.map((r) => r.action).sort(), ["create", "enter"], `${label}: both signatures recorded against the request`);
}

test("a friend picked from the host's own people gets into a question asked without naming anyone: a right PIN joins them to its group, and their entry stands with the terms over the question's own group and counts; a wrong PIN leaves the group as it was (section 0)", async () => {
  // "Whoever I send it to": a set of one, the asker's, that grows as people open the link.
  const set = await createOccasionGroup(sam.user.id);
  track.group(set.id);
  const usd = await ensureUsd(set.id, sam.user.id);
  const d0 = await markets.draftMarket({ creatorId: sam.user.id, groupId: set.id, denomId: usd.id, title: "Will it snow before Thanksgiving?", termsText: "Yes if it snows here before Thanksgiving.", resolvesBy: new Date(Date.now() + 24 * H) });
  const d = await markets.openMarket(d0.id, sam.user.id, await sam.ledger.signTypedData(markets.createTypedData(d0)));
  await markets.enterMarket({ dareId: d.id, userId: sam.user.id, stake: 500n, value: 3000n, signature: await sam.ledger.signTypedData(markets.enterTypedData(d, 500n, 3000n)), questionSignature: await sam.ledger.signTypedData(markets.questionCreateTypedData(d)) });
  await handOverHolds(d, "a question");
  assert.equal((await markets.positionsOf(d.id)).length, 2, "two in: Sam and Nia");
});

test("the same on a game page: a question on a game, asked without naming anyone, takes the friend from the host's phone into its set (section 0)", async () => {
  const [game] = parseScoreboard("nfl", fixture("espn-nfl-scheduled")).map((g) => ({ ...g, sourceId: `${PREFIX}${g.sourceId}`, startsAt: new Date(Date.now() + 6 * H) })).slice(0, 1);
  await syncSchedule("nfl", new Date(), testSchedule([game!]));
  const [row] = await db.select().from(schema.sportsGames).where(and(eq(schema.sportsGames.source, "espn"), eq(schema.sportsGames.sourceId, game!.sourceId))).limit(1);
  const [wins] = await db.select().from(schema.publicQuestions).where(and(eq(schema.publicQuestions.gameId, row!.id), eq(schema.publicQuestions.key, "home_wins")));
  const set = await createOccasionGroup(sam.user.id);
  track.group(set.id);
  const usd = await ensureUsd(set.id, sam.user.id);
  const d0 = await markets.draftFromTemplate({ templateId: wins!.id, creatorId: sam.user.id, groupId: set.id, denomId: usd.id });
  const d = await markets.openMarket(d0.id, sam.user.id, await sam.ledger.signTypedData(markets.createTypedData(d0)));
  // The asker hands the phone over before their own call (3.45 as amended 2026-10-09).
  await handOverHolds(d, "a game's question");
});

test("Who's joining? with nobody to pick says why: none of the host's people who aren't in has pass the phone on, or everyone the host could pick is in already, and a host with nobody here yet hears the first (section 0, the owner's addition)", async () => {
  const [hal, ivy] = await Promise.all(["Hal", "Ivy"].map((n) => tempSigner(n)));
  const ask = async () => {
    const set = await createOccasionGroup(hal.user.id);
    track.group(set.id);
    const usd = await ensureUsd(set.id, hal.user.id);
    const d0 = await markets.draftMarket({ creatorId: hal.user.id, groupId: set.id, denomId: usd.id, title: "Does anyone get picked?", termsText: "Yes if someone joins from Hal's phone.", resolvesBy: new Date(Date.now() + 24 * H) });
    return markets.openMarket(d0.id, hal.user.id, await hal.ledger.signTypedData(markets.createTypedData(d0)));
  };
  const d = await ask();
  assert.deepEqual(await handOverPicks(d.id, hal.user.id), { candidates: [], empty: "none_on" }, "a host with nobody here yet: nobody they know has it on");
  const shared = await createGroup({ name: "fixes 2: Hal and Ivy (temporary)", createdBy: hal.user.id, memberUserIds: [ivy.user.id] });
  track.group(shared.id);
  assert.deepEqual(await handOverPicks(d.id, hal.user.id), { candidates: [], empty: "none_on" }, "Ivy is one of Hal's people and isn't in, without pass the phone: said so, never that everyone is in");
  const d2 = await ask();
  const room = (await markets.marketById(d2.id))!;
  await db.insert(schema.groupMembers).values({ groupId: room.groupId, userId: ivy.user.id });
  await markets.enterMarket({ dareId: d2.id, userId: ivy.user.id, stake: 500n, value: 4000n, signature: await ivy.ledger.signTypedData(markets.enterTypedData(room, 500n, 4000n)) });
  assert.deepEqual(await handOverPicks(d2.id, hal.user.id), { candidates: [], empty: "all_in" }, "every one of Hal's people is in already");
  assert.equal((await handOverPicks(d.id, sam.user.id)).empty, null, "a list with someone on it needs no reason");
});

test("a hand-over whose terms over the question's own group cannot be signed still lets the entry stand, and says so in the log, never quietly (section 0)", async () => {
  const set = await createOccasionGroup(sam.user.id);
  track.group(set.id);
  const usd = await ensureUsd(set.id, sam.user.id);
  const d0 = await markets.draftMarket({ creatorId: sam.user.id, groupId: set.id, denomId: usd.id, title: "Does the second signature fail loudly?", termsText: "Yes if it rains here tomorrow.", resolvesBy: new Date(Date.now() + 24 * H) });
  const d = await markets.openMarket(d0.id, sam.user.id, await sam.ledger.signTypedData(markets.createTypedData(d0)));
  // Nia's share signs her entry and is refused the terms: the one failure the hand-over goes on past.
  const refusingTerms: SignerLoad = async () => ({ client: {} as Awaited<ReturnType<SignerLoad>>["client"], mod: { delegatedSignTypedData: async (_c, { typedData }) => {
    if ((typedData as { primaryType?: string }).primaryType === "Create") throw new Error("refused for the test");
    return nia.ledger.signTypedData(typedData as unknown as Parameters<PrivateKeyAccount["signTypedData"]>[0]);
  } } });
  const said: string[] = [];
  const was = console.error;
  console.error = (...args: unknown[]) => void said.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
  let r: Awaited<ReturnType<typeof enterFromHost>>;
  try {
    r = await enterFromHost({ dareId: d.id, hostId: sam.user.id, friendId: nia.user.id, stake: 500n, value: 6000n, pin: "1357", request: "tests/db/bug-fixes-2.test.ts", deps: { load: refusingTerms } });
  } finally {
    console.error = was;
  }
  assert.ok(r.ok, "the entry stands");
  const mine = (await markets.positionsOf(d.id)).find((p) => p.userId === nia.user.id);
  assert.deepEqual([mine?.enterSignature !== null, mine?.questionSignature], [true, null], "signed, without the terms");
  assert.ok(said.some((line) => line.includes("a hand-over's entry went in without the terms over the question's own group") && line.includes(d.id)), `and the log says so, naming the question: ${said.join(" | ")}`);
});

test("a guest who got into a question asked between two people becomes an account seated in its group: the entry is theirs to keep, and one the asker removed seats nobody (section 0, the other ways in)", async () => {
  // Asked before October 7 of one person, a question lives in the pair's own set, which takes no guest's seat.
  const pair = await ensureDyad(ana.user.id, ben.user.id);
  track.group(pair.id);
  const usd = await ensureUsd(pair.id, ana.user.id);
  const ask = async (title: string) => {
    const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: pair.id, denomId: usd.id, title, termsText: "Yes if it happens tonight.", resolvesBy: new Date(Date.now() + 24 * H) });
    return markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  };
  const kept = await ask("Does the guest keep their call?");
  const removed = await ask("Does a removed guest get a seat?");
  const gabe = await enterAsGhost({ dareId: kept.id, who: { name: "Gabe", phoneHash: null, memberClaimId: null }, tokens: [], stake: 1000n, value: 8000n });
  const rae = await enterAsGhost({ dareId: removed.id, who: { name: "Rae", phoneHash: null, memberClaimId: null }, tokens: [], stake: 1000n, value: 2000n });
  await removeGhostEntry({ dareId: removed.id, claimId: rae.claimId, byUserId: ana.user.id });
  assert.deepEqual(await seats(pair.id), [ana.user.id, ben.user.id].sort(), "a pair's set took neither guest");

  await bindClaimToUser(gabe.claimId, cy.user.id);
  assert.equal(await isMember(pair.id, cy.user.id), true, "Gabe's account has a seat, as opening the link would give it");
  const [grown] = await db.select({ isDyad: schema.groups.isDyad }).from(schema.groups).where(eq(schema.groups.id, pair.id));
  assert.equal(grown?.isDyad, false, "and the pair's set is three people now, as when a third opens the link");
  assert.deepEqual((await linkEntriesFor(cy.user.id)).map((e) => e.dare.id), [kept.id], "the entry is listed to keep");
  await markets.enterMarket({ dareId: kept.id, userId: cy.user.id, stake: 1000n, value: 8000n, signature: await cy.ledger.signTypedData(markets.enterTypedData(kept, 1000n, 8000n)), questionSignature: await cy.ledger.signTypedData(markets.questionCreateTypedData(kept)) });
  const mine = (await markets.positionsOf(kept.id)).find((p) => p.userId === cy.user.id);
  assert.deepEqual([mine?.value, mine?.enterSignature !== null], [8000n, true], "kept: the same numbers, signed by the account");

  await bindClaimToUser(rae.claimId, dee.user.id);
  assert.equal(await isMember(pair.id, dee.user.id), false, "an entry the asker removed is no way into the set");
});
