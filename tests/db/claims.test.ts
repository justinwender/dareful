/**
 * The accountless layer against the real database: resolving a picked contact, claim links and browser
 * tokens, the three bind paths, merge, dismissal, the dyad fold, and the hourly limit on resolutions.
 * Every test builds its own people, so a failure points at the rule it names and at nothing upstream.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { and, eq, getTableColumns } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPhone } from "@/lib/auth/phone";
import * as claims from "@/lib/ledger/claims";
import { ensureUsd, createDenomination } from "@/lib/ledger/denominations";
import { createGroup, ensureDyad } from "@/lib/ledger/groups";
import { proposeCover } from "@/lib/ledger/proposals";
import { cents, units } from "@/lib/money";
import { cleanup, codeOf, cover, fictionalPhone, ghost, ghostDyad, proposal, tempUser, track, type User } from "./fixture";

let A: User, B: User, C: User;
before(async () => {
  [A, B, C] = await Promise.all([tempUser("Ana"), tempUser("Ben"), tempUser("Cy")]);
});
after(cleanup);

const seats = (groupId: string) => db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, groupId));

// ---------------------------------------------------------------------------------------------- resolving

test("a picked contact becomes a ghost carrying the hash", async () => {
  const h = hashPhone(fictionalPhone());
  const id = await ghost(A.id, "Gabe", h);
  assert.deepEqual((await claims.claimById(id))?.phoneHash, h);
});

test("the same number in another spelling reuses the creator's ghost", async () => {
  const id = await ghost(A.id, "Gabe", hashPhone("(212) 555-0142", "US"));
  const again = await claims.resolvePicked({ creatorId: A.id, displayName: "Gabriel", phoneHash: hashPhone("+1 212-555-0142") });
  assert.deepEqual(again, { kind: "claim", claimId: id });
});

test("a typed name makes a new ghost with no hash, every time", async () => {
  const one = await ghost(A.id, "Nico");
  const two = await ghost(A.id, "Nico");
  assert.notEqual(one, two);
  assert.equal((await claims.claimById(one))?.phoneHash, null);
});

test("a number that belongs to an account resolves to that account", async () => {
  const h = hashPhone(fictionalPhone());
  const U = await tempUser("Has Account", h);
  assert.deepEqual(await claims.resolvePicked({ creatorId: A.id, displayName: "Whoever", phoneHash: h }), { kind: "user", userId: U.id });
});

test("picking your own number is refused", async () => {
  const h = hashPhone(fictionalPhone());
  const U = await tempUser("Me", h);
  assert.equal(await codeOf(() => claims.resolvePicked({ creatorId: U.id, displayName: "Me", phoneHash: h })), "is_you");
});

test("another creator picking the same number gets their own ghost", async () => {
  const h = hashPhone(fictionalPhone());
  assert.notEqual(await ghost(A.id, "Gabe", h), await ghost(C.id, "Gabe W", h));
});

test("a cover against a ghost is a pending row naming the ghost", async () => {
  const g = await ghost(A.id, "Gabe");
  const p = await cover(A.id, g, "dinner");
  assert.equal(p.fromClaim, g);
  assert.equal(p.fromUser, null);
  assert.equal(p.toUser, A.id);
  assert.equal(p.status, "pending");
});

test("the ghost dyad is formed once", async () => {
  const g = await ghost(A.id, "Gabe");
  const one = await ghostDyad(A.id, g);
  const two = await ghostDyad(A.id, g);
  assert.equal(one.id, two.id);
  assert.equal(one.isDyad, true);
  assert.equal((await seats(one.id)).length, 2);
});

// ------------------------------------------------------------------------------------------ links, tokens

test("the creator can make a claim link and it reads back to the ghost", async () => {
  const g = await ghost(A.id, "Gabe");
  const link = await claims.createClaimLink(g, A.id);
  const read = await claims.readClaimLink(link);
  assert.equal(read?.claim.id, g);
  assert.equal(read?.creatorName, "Ana");
});

test("someone else cannot make a link for that ghost", async () => {
  const g = await ghost(A.id, "Gabe");
  assert.equal(await codeOf(() => claims.createClaimLink(g, B.id)), "not_yours");
});

test("reading a link issues nothing", async () => {
  const g = await ghost(A.id, "Gabe");
  const link = await claims.createClaimLink(g, A.id);
  await claims.readClaimLink(link);
  await claims.readClaimLink(link);
  assert.equal((await db.select().from(schema.claimTokens).where(eq(schema.claimTokens.claimId, g))).length, 0);
});

test("that's-me issues a browser token that is not the link token, and it resolves to the ghost", async () => {
  const g = await ghost(A.id, "Gabe");
  const link = await claims.createClaimLink(g, A.id);
  const issued = await claims.issueBrowserToken(link);
  assert.ok(issued);
  assert.notEqual(issued.browserToken, link);
  assert.deepEqual((await claims.claimsForBrowserTokens([issued.browserToken, "junk"])).map((c) => c.id), [g]);
});

test("the link token is not a browser token", async () => {
  const g = await ghost(A.id, "Gabe");
  const link = await claims.createClaimLink(g, A.id);
  await claims.issueBrowserToken(link);
  assert.deepEqual(await claims.claimsForBrowserTokens([link]), []);
});

test("a ghost can concede from their browser, once", async () => {
  const g = await ghost(A.id, "Gabe");
  const p = await cover(A.id, g, "dinner");
  const issued = await claims.issueBrowserToken(await claims.createClaimLink(g, A.id));
  assert.ok(issued);
  assert.equal(await claims.concede(p.id, [issued.browserToken]), true);
  assert.notEqual((await proposal(p.id))?.concededAt, null);
  assert.equal(await claims.concede(p.id, [issued.browserToken]), false);
});

test("a stranger's token, and another ghost's token, cannot concede", async () => {
  const g = await ghost(A.id, "Gabe");
  const other = await ghost(A.id, "Someone Else");
  const p = await cover(A.id, g, "dinner");
  const theirs = await claims.issueBrowserToken(await claims.createClaimLink(other, A.id));
  assert.ok(theirs);
  assert.equal(await claims.concede(p.id, ["x".repeat(43)]), false);
  assert.equal(await claims.concede(p.id, [theirs.browserToken]), false);
  assert.equal((await proposal(p.id))?.concededAt, null);
});

// ---------------------------------------------------------------------------------------------- binding

test("a phone login binds every ghost with that hash, across creators, and only those", async () => {
  const h = hashPhone(fictionalPhone());
  // The "Zqx" names let the audit simulate a bind that ignores the hash without touching anyone's real ghosts.
  const g1 = await ghost(A.id, "Zqx Gabe", h);
  const g3 = await ghost(C.id, "Zqx Gabe W", h);
  const bystander = await ghost(A.id, "Zqx Not Gabe", hashPhone(fictionalPhone()));
  const U = await tempUser("Gabe");
  assert.deepEqual((await claims.bindByPhone(U.id, h)).sort(), [g1, g3].sort());
  assert.equal((await claims.claimById(bystander))?.claimedBy, null);
});

test("bound rows name the user and remember the ghost", async () => {
  const g = await ghost(A.id, "Gabe");
  const p = await cover(A.id, g, "dinner");
  const U = await tempUser("Gabe");
  const r = await claims.bindClaimToUser(g, U.id);
  assert.deepEqual(r?.proposalIds, [p.id]);
  const row = await proposal(p.id);
  assert.equal(row?.fromUser, U.id);
  assert.equal(row?.fromClaim, null);
  assert.equal(row?.fromBoundClaim, g);
  assert.equal(row?.status, "pending");
});

test("a conceded row stays conceded through the bind", async () => {
  const g = await ghost(A.id, "Gabe");
  const p = await cover(A.id, g, "dinner");
  const issued = await claims.issueBrowserToken(await claims.createClaimLink(g, A.id));
  assert.ok(issued);
  await claims.concede(p.id, [issued.browserToken]);
  await claims.bindClaimToUser(g, (await tempUser("Gabe")).id);
  assert.notEqual((await proposal(p.id))?.concededAt, null);
});

test("the ghost's seat in the group becomes the user's", async () => {
  const g = await ghost(A.id, "Gabe");
  const dyad = await ghostDyad(A.id, g);
  const U = await tempUser("Gabe");
  await claims.bindClaimToUser(g, U.id);
  const m = await seats(dyad.id);
  assert.equal(m.length, 2);
  assert.ok(m.some((x) => x.userId === U.id));
  assert.ok(m.every((x) => x.claimId === null));
});

test("the ghost is marked claimed, and binding again is a no-op", async () => {
  const g = await ghost(A.id, "Gabe");
  await cover(A.id, g, "dinner");
  const U = await tempUser("Gabe");
  await claims.bindClaimToUser(g, U.id);
  const c = await claims.claimById(g);
  assert.equal(c?.claimedBy, U.id);
  assert.notEqual(c?.claimedAt, null);
  assert.deepEqual((await claims.bindClaimToUser(g, U.id))?.proposalIds, []);
});

test("a second person cannot take a claimed ghost", async () => {
  const g = await ghost(A.id, "Gabe");
  await claims.bindClaimToUser(g, (await tempUser("Gabe")).id);
  assert.equal(await codeOf(() => claims.bindClaimToUser(g, B.id)), "already_claimed");
});

test("a link to a claimed ghost issues no token", async () => {
  const g = await ghost(A.id, "Gabe");
  const link = await claims.createClaimLink(g, A.id);
  await claims.bindClaimToUser(g, (await tempUser("Gabe")).id);
  assert.equal(await claims.issueBrowserToken(link), null);
});

test("the first screen lists what arrived by binding, oldest first, and nothing else", async () => {
  const U = await tempUser("Gabe");
  const g1 = await ghost(A.id, "Gabe");
  const g2 = await ghost(C.id, "Gabe");
  const p1 = await cover(A.id, g1, "first");
  const p2 = await cover(C.id, g2, "second");
  const direct = await proposeCover({ creditorId: B.id, debtor: { kind: "user", userId: U.id }, groupId: track.group((await ensureDyad(B.id, U.id)).id), denomId: (await ensureUsd((await ensureDyad(B.id, U.id)).id, B.id)).id, quantity: units(500n), amountCents: cents(500n), settleExpected: true, memo: "ordinary" });
  await claims.bindClaimToUser(g2, U.id);
  await claims.bindClaimToUser(g1, U.id);
  const ids = (await claims.boundPendingForDebtor(U.id)).map((p) => p.id);
  assert.deepEqual(ids, [p1.id, p2.id]);
  assert.ok(!ids.includes(direct.id));
});

test("a login in the browser holding the token binds", async () => {
  const g = await ghost(A.id, "Nico");
  const p = await cover(A.id, g, "coffee");
  const issued = await claims.issueBrowserToken(await claims.createClaimLink(g, A.id));
  assert.ok(issued);
  const U = await tempUser("Nico");
  assert.deepEqual(await claims.bindByBrowserTokens(U.id, [issued.browserToken]), [g]);
  assert.equal((await proposal(p.id))?.fromUser, U.id);
});

test("the creator's own browser never binds their own ghost", async () => {
  const g = await ghost(A.id, "Nico");
  const issued = await claims.issueBrowserToken(await claims.createClaimLink(g, A.id));
  assert.ok(issued);
  assert.deepEqual(await claims.bindByBrowserTokens(A.id, [issued.browserToken]), []);
  assert.equal((await claims.claimById(g))?.claimedBy, null);
});

test("a creator is never their own ghost", async () => {
  const g = await ghost(A.id, "Self");
  assert.equal(await codeOf(() => claims.bindClaimToUser(g, A.id)), "is_you");
});

test("a ghost creditor binds with its provenance kept, and the debtor is asked who it turned out to be", async () => {
  const g = await ghost(B.id, "Lee");
  const dyad = await ghostDyad(B.id, g);
  const usd = await ensureUsd(dyad.id, B.id);
  const [row] = await db.insert(schema.obligationProposals).values({ groupId: dyad.id, fromUser: B.id, toClaim: g, denomId: usd.id, quantity: 500n, amountCents: 500n, origin: "dare", settleExpected: true, status: "pending" }).returning();
  assert.ok(row);
  const U = await tempUser("Lee");
  await claims.bindClaimToUser(g, U.id);
  const after = await proposal(row.id);
  assert.equal(after?.toUser, U.id);
  assert.equal(after?.toClaim, null);
  assert.equal(after?.toBoundClaim, g);
  assert.ok((await claims.creditorReconfirmsForDebtor(B.id)).some((p) => p.id === row.id));
  // It is the debtor's to answer, but it did not arrive by their own binding, so it is not on their first screen.
  assert.ok(!(await claims.boundPendingForDebtor(B.id)).some((p) => p.id === row.id));
});

test("an ordinary cover is not a creditor re-confirmation", async () => {
  const U = await tempUser("Plain");
  const dyad = await ensureDyad(B.id, U.id);
  track.group(dyad.id);
  const p = await proposeCover({ creditorId: B.id, debtor: { kind: "user", userId: U.id }, groupId: dyad.id, denomId: (await ensureUsd(dyad.id, B.id)).id, quantity: units(100n), amountCents: cents(100n), settleExpected: true, memo: "plain" });
  assert.ok(!(await claims.creditorReconfirmsForDebtor(U.id)).some((x) => x.id === p.id));
});

test("a row that would become a cover of oneself is closed, and the user keeps one seat", async () => {
  const g = await ghost(A.id, "Twin");
  const dyad = await ghostDyad(A.id, g);
  const usd = await ensureUsd(dyad.id, A.id);
  const U = await tempUser("Twin");
  await db.insert(schema.groupMembers).values({ groupId: dyad.id, userId: U.id });
  const [row] = await db.insert(schema.obligationProposals).values({ groupId: dyad.id, fromClaim: g, toUser: U.id, denomId: usd.id, quantity: 100n, amountCents: 100n, origin: "dare", settleExpected: true, status: "pending" }).returning();
  assert.ok(row);
  await claims.bindClaimToUser(g, U.id);
  assert.equal((await proposal(row.id))?.status, "declined");
  assert.equal((await db.select().from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, dyad.id), eq(schema.groupMembers.userId, U.id)))).length, 1);
  assert.ok((await seats(dyad.id)).every((m) => m.claimId === null));
});

// ------------------------------------------------------------------------------------------ the dyad fold

test("binding to someone the creator already has a dyad with leaves one dyad, holding the ghost's rows", async () => {
  const U = await tempUser("Old Friend");
  const real = await ensureDyad(A.id, U.id);
  track.group(real.id);
  const g = await ghost(A.id, "Old F");
  const p = await cover(A.id, g, "tickets");
  const ghostDyadId = p.groupId;
  assert.notEqual(ghostDyadId, real.id);
  await claims.bindClaimToUser(g, U.id);
  const row = await proposal(p.id);
  assert.equal(row?.groupId, real.id);
  assert.equal(row?.fromUser, U.id);
  assert.equal(row?.fromBoundClaim, g);
  assert.equal((await db.select().from(schema.groups).where(eq(schema.groups.id, ghostDyadId))).length, 0);
  assert.equal((await ensureDyad(A.id, U.id)).id, real.id);
  assert.equal((await seats(real.id)).length, 2);
});

test("a fold maps the ghost dyad's dollars onto the existing dyad's dollars, not a second dollar unit", async () => {
  const U = await tempUser("Old Friend");
  const real = await ensureDyad(A.id, U.id);
  track.group(real.id);
  const realUsd = await ensureUsd(real.id, A.id);
  const g = await ghost(A.id, "Old F");
  const p = await cover(A.id, g, "tickets");
  await claims.bindClaimToUser(g, U.id);
  assert.equal((await proposal(p.id))?.denomId, realUsd.id);
  const usds = (await db.select().from(schema.denominations).where(eq(schema.denominations.groupId, real.id))).filter((d) => d.template === "usd");
  assert.equal(usds.length, 1);
});

test("a fold carries over a unit the existing dyad does not have", async () => {
  const U = await tempUser("Old Friend");
  const real = await ensureDyad(A.id, U.id);
  track.group(real.id);
  const g = await ghost(A.id, "Old F");
  const dyad = await ghostDyad(A.id, g);
  const tacos = await createDenomination({ groupId: dyad.id, createdBy: A.id, template: null, label: "taco", pluralLabel: "tacos", quantifiable: true, monetary: false });
  const p = await proposeCover({ creditorId: A.id, debtor: { kind: "claim", claimId: g }, groupId: dyad.id, denomId: tacos.id, quantity: units(2n), amountCents: null, settleExpected: false, memo: "lunch" });
  await claims.bindClaimToUser(g, U.id);
  assert.equal((await proposal(p.id))?.denomId, tacos.id);
  const [moved] = await db.select().from(schema.denominations).where(eq(schema.denominations.id, tacos.id));
  assert.equal(moved?.groupId, real.id);
});

test("a ghost dyad with onchain state refuses to fold, loudly, and the bind does not happen", async () => {
  const U = await tempUser("Old Friend");
  track.group((await ensureDyad(A.id, U.id)).id);
  const g = await ghost(A.id, "Old F");
  const p = await cover(A.id, g, "tickets");
  await db.update(schema.groups).set({ onchainId: Buffer.from(`${"ab".repeat(16)}${p.groupId.replace(/-/g, "")}`, "hex") }).where(eq(schema.groups.id, p.groupId));
  await assert.rejects(() => claims.bindClaimToUser(g, U.id), /onchain state/);
  assert.equal((await claims.claimById(g))?.claimedBy, null);
  assert.equal((await proposal(p.id))?.fromClaim, g);
});

test("a first-time signup has nothing to fold: the ghost dyad simply becomes theirs", async () => {
  // The creator has a dyad with someone else, which must not attract the new person's rows.
  track.group((await ensureDyad(A.id, B.id)).id);
  const g = await ghost(A.id, "New Person");
  const p = await cover(A.id, g, "tickets");
  const U = await tempUser("New Person");
  await claims.bindClaimToUser(g, U.id);
  assert.equal((await proposal(p.id))?.groupId, p.groupId);
  assert.equal((await ensureDyad(A.id, U.id)).id, p.groupId);
});

// ------------------------------------------------------------------------------------------------- merge

test("two ghosts merge into one, and the survivor takes the rows and the phone hash", async () => {
  const h = hashPhone(fictionalPhone());
  const from = await ghost(A.id, "Sam P", h);
  const into = await ghost(A.id, "Sammy");
  const p = await cover(A.id, from, "tickets");
  await claims.mergeGhost(A.id, from, { kind: "claim", claimId: into });
  assert.equal((await claims.claimById(from))?.id, into);
  assert.equal((await proposal(p.id))?.fromClaim, into);
  assert.deepEqual((await claims.claimById(into))?.phoneHash, h);
});

test("a token and a link for the merged ghost still reach the survivor", async () => {
  const from = await ghost(A.id, "Sam P");
  const into = await ghost(A.id, "Sammy");
  const link = await claims.createClaimLink(from, A.id);
  const issued = await claims.issueBrowserToken(link);
  assert.ok(issued);
  await claims.mergeGhost(A.id, from, { kind: "claim", claimId: into });
  assert.equal((await claims.claimsForBrowserTokens([issued.browserToken]))[0]?.id, into);
  assert.equal((await claims.readClaimLink(link))?.claim.id, into);
});

test("the merged ghost no longer shows as the creator's, and the survivor does", async () => {
  const from = await ghost(A.id, "Sam P");
  const into = await ghost(A.id, "Sammy");
  await claims.mergeGhost(A.id, from, { kind: "claim", claimId: into });
  const mine = (await claims.ghostsForCreator(A.id)).map((g) => g.id);
  assert.ok(!mine.includes(from));
  assert.ok(mine.includes(into));
});

test("a ghost cannot be pointed at someone the creator shares no group with", async () => {
  const g = await ghost(A.id, "Sam");
  const stranger = await tempUser("Stranger");
  assert.equal(await codeOf(() => claims.mergeGhost(A.id, g, { kind: "user", userId: stranger.id })), "not_allowed");
  assert.equal((await claims.claimById(g))?.claimedBy, null);
});

test("a creator cannot point a ghost at themselves", async () => {
  const g = await ghost(A.id, "Sam");
  assert.equal(await codeOf(() => claims.mergeGhost(A.id, g, { kind: "user", userId: A.id })), "is_you");
});

test("someone else cannot merge the creator's ghost", async () => {
  const g = await ghost(A.id, "Sam");
  assert.equal(await codeOf(() => claims.mergeGhost(B.id, g, { kind: "user", userId: C.id })), "not_yours");
});

test("this-Gabe-is-that-Gabe binds the ghost to a friend the creator shares a group with", async () => {
  const friend = await tempUser("Gabe");
  const group = await createGroup({ name: "merge check (temporary)", createdBy: A.id });
  track.group(group.id);
  await db.insert(schema.groupMembers).values({ groupId: group.id, userId: friend.id });
  const g = await ghost(A.id, "Gabe");
  const p = await cover(A.id, g, "tickets");
  await claims.mergeGhost(A.id, g, { kind: "user", userId: friend.id });
  const row = await proposal(p.id);
  assert.equal(row?.fromUser, friend.id);
  assert.equal(row?.fromBoundClaim, g);
});

// --------------------------------------------------------------------------------------------- dismissal

test("someone else cannot dismiss the creator's ghost", async () => {
  const g = await ghost(A.id, "Gone", hashPhone(fictionalPhone()));
  assert.equal(await codeOf(() => claims.dismissGhost(B.id, g)), "not_yours");
  assert.notEqual((await claims.claimById(g))?.phoneHash, null);
});

test("dismissal deletes the phone hash and keeps the row", async () => {
  const g = await ghost(A.id, "Gone", hashPhone(fictionalPhone()));
  await claims.dismissGhost(A.id, g);
  const gone = await claims.claimById(g);
  assert.ok(gone);
  assert.equal(gone.phoneHash, null);
});

test("dismissal closes the pending row, kills the link, and takes the ghost out of the group", async () => {
  const g = await ghost(A.id, "Gone");
  const p = await cover(A.id, g, "brunch");
  const link = await claims.createClaimLink(g, A.id);
  assert.equal(await claims.isClaimMember(p.groupId, g), true);
  await claims.dismissGhost(A.id, g);
  assert.equal((await proposal(p.id))?.status, "declined");
  assert.equal(await claims.readClaimLink(link), null);
  assert.equal(await claims.isClaimMember(p.groupId, g), false);
});

test("picking a dismissed ghost's number again starts a fresh ghost", async () => {
  const h = hashPhone(fictionalPhone());
  const g = await ghost(A.id, "Gone", h);
  await claims.dismissGhost(A.id, g);
  assert.notEqual(await ghost(A.id, "Back", h), g);
});

// -------------------------------------------------------------------------------------------- suggestion

test("a same-named ghost in a shared group is suggested, never bound, and a different name is not", async () => {
  const group = await createGroup({ name: "suggestion check (temporary)", createdBy: A.id });
  track.group(group.id);
  const g = await ghost(A.id, "Robin Q");
  await claims.addGhostToGroup(group.id, g, A.id);
  const U = await tempUser("Robin");
  await db.insert(schema.groupMembers).values({ groupId: group.id, userId: U.id });
  assert.ok((await claims.suggestedGhostsFor(U.id, "Robin")).some((x) => x.claimId === g));
  assert.equal((await claims.claimById(g))?.claimedBy, null);
  assert.ok(!(await claims.suggestedGhostsFor(U.id, "Alexandria")).some((x) => x.claimId === g));
});

test("a same-named ghost in a group the person is not in is not suggested", async () => {
  const group = await createGroup({ name: "suggestion check (temporary)", createdBy: A.id });
  track.group(group.id);
  const g = await ghost(A.id, "Robin Q");
  await claims.addGhostToGroup(group.id, g, A.id);
  const outsider = await tempUser("Robin");
  const elsewhere = await createGroup({ name: "somewhere else (temporary)", createdBy: outsider.id });
  track.group(elsewhere.id);
  assert.ok(!(await claims.suggestedGhostsFor(outsider.id, "Robin")).some((x) => x.claimId === g));
});

test("only someone in a named group can add a ghost to it, and never to a dyad", async () => {
  const group = await createGroup({ name: "add check (temporary)", createdBy: A.id });
  track.group(group.id);
  const mine = await ghost(B.id, "Pat");
  assert.equal(await codeOf(() => claims.addGhostToGroup(group.id, mine, B.id)), "not_allowed");
  const g = await ghost(A.id, "Pat");
  const dyad = await ghostDyad(A.id, await ghost(A.id, "Other"));
  assert.equal(await codeOf(() => claims.addGhostToGroup(dyad.id, g, A.id)), "not_allowed");
});

// ------------------------------------------------------------------------------------------ hourly limit

test("resolutions by number are capped per person per hour, and the cap is per person", async () => {
  const U = await tempUser("Busy");
  const V = await tempUser("Quiet");
  for (let i = 0; i < claims.CONTACT_RESOLUTIONS_PER_HOUR; i += 1) await claims.spendContactResolution(U.id);
  assert.equal(await codeOf(() => claims.spendContactResolution(U.id)), "slow_down");
  assert.equal(await codeOf(() => claims.spendContactResolution(V.id)), null);
});

test("a resolution older than an hour no longer counts", async () => {
  const U = await tempUser("Busy");
  for (let i = 0; i < claims.CONTACT_RESOLUTIONS_PER_HOUR; i += 1) await claims.spendContactResolution(U.id);
  await db.update(schema.contactResolutions).set({ createdAt: new Date(Date.now() - 61 * 60_000) }).where(eq(schema.contactResolutions.userId, U.id));
  assert.equal(await codeOf(() => claims.spendContactResolution(U.id)), null);
});

test("a burst of parallel resolutions cannot slip past the cap", async () => {
  // One short of the cap, then ten at once: exactly one may pass. Without the lock every request in the first
  // wave reads "nineteen" before any of them has inserted, and they all pass.
  const U = await tempUser("Burst");
  for (let i = 0; i < claims.CONTACT_RESOLUTIONS_PER_HOUR - 1; i += 1) await claims.spendContactResolution(U.id);
  const results = await Promise.all(Array.from({ length: 10 }, () => codeOf(() => claims.spendContactResolution(U.id))));
  assert.deepEqual(results.filter((r) => r !== null && r !== "slow_down"), [], "a request failed for a reason other than the limit");
  assert.equal(results.filter((r) => r === null).length, 1);
  assert.equal(results.filter((r) => r === "slow_down").length, 9);
});

test("the limit records who asked and when, and nothing about the number", () => {
  assert.deepEqual(Object.keys(getTableColumns(schema.contactResolutions)).sort(), ["createdAt", "id", "userId"]);
});
