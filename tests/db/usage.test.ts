/**
 * The usage events, counted where things happen (the field round, 2026-10-02): the record itself, its once-key,
 * its refusal of a bad property, and the rows the real paths leave (asking, entering as an account and as a
 * guest, a guest bound to an account). Against the real database; every row goes with the run's users and
 * markets (the table cascades from both).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { and, eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { hashPhone } from "@/lib/auth/phone";
import { bindByBrowserTokens } from "@/lib/ledger/claims";
import { ensureUsd } from "@/lib/ledger/denominations";
import { enterAsGhost } from "@/lib/ledger/ghost-entry";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { record } from "@/lib/usage";
import { cleanup, fictionalPhone, tempSigner, tempUser, track, type Signer } from "./fixture";

let ana: Signer, ben: Signer;

before(async () => {
  [ana, ben] = await Promise.all([tempSigner("Ana"), tempSigner("Ben")]);
});
after(cleanup);

async function rowsFor(where: { dareId?: string; userId?: string; claimId?: string }) {
  const U = schema.usageEvents;
  const conds = [where.dareId ? eq(U.dareId, where.dareId) : null, where.userId ? eq(U.userId, where.userId) : null, where.claimId ? eq(U.claimId, where.claimId) : null].filter((c): c is NonNullable<typeof c> => c !== null);
  return db.select().from(U).where(and(...conds)).orderBy(U.at);
}

test("a record is a row with its properties and who, a bad property leaves no row and throws nothing, and a link opened counts once per person per link", async () => {
  const me = await tempUser("Cy");
  await record("share", { icon: "copy" }, { userId: me.id });
  // A property outside its set is refused in code, whatever the caller said: the words never reach the table.
  await record("share", { icon: "Will John fall asleep?" as "copy" }, { userId: me.id });
  const shares = (await rowsFor({ userId: me.id })).filter((r) => r.name === "share");
  assert.equal(shares.length, 1, "one share, and the refused one left nothing");
  assert.deepEqual(shares[0]?.props, { icon: "copy" });
  assert.equal(shares[0]?.onceKey, null, "a share counts every time");

  const device = randomUUID();
  const g = await createGroup({ name: "usage check (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  const usd = await ensureUsd(g.id, ana.user.id);
  const d = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Does the count land?", termsText: "Yes if the row is there. No if it is not.", resolvesBy: new Date(Date.now() + 3_600_000) });
  await record("link_opened", { link: "market", signedIn: false, installed: false }, { deviceId: device }, { dareId: d.id });
  await record("link_opened", { link: "market", signedIn: false, installed: true }, { deviceId: device }, { dareId: d.id });
  await record("link_opened", { link: "market", signedIn: true, installed: false }, { userId: me.id, deviceId: device }, { dareId: d.id });
  const opened = (await rowsFor({ dareId: d.id })).filter((r) => r.name === "link_opened");
  assert.equal(opened.length, 2, "the device once, the account once: the device's second open is the same open");
  assert.deepEqual(opened.map((r) => r.onceKey).sort(), [`opened:market:m:${d.id}:d:${device}`, `opened:market:m:${d.id}:u:${me.id}`].sort());
  assert.equal(opened[0]?.deviceId, device);
  assert.equal(me.excludedFromCounts, false, "an account counts unless someone says otherwise");
});

test("asking, entering as an account, entering as a guest and a guest bound to an account each leave their row, with what they were and never who they are", async () => {
  const g = await createGroup({ name: "usage paths (temporary)", createdBy: ana.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: ben.user.id });
  const usd = await ensureUsd(g.id, ana.user.id);
  const d0 = await markets.draftMarket({ creatorId: ana.user.id, groupId: g.id, denomId: usd.id, title: "Does Ben get in?", termsText: "Yes if Ben enters. No if not.", resolvesBy: new Date(Date.now() + 3_600_000) });
  assert.equal((await rowsFor({ dareId: d0.id })).length, 0, "a draft is nothing yet");
  const d = await markets.openMarket(d0.id, ana.user.id, await ana.ledger.signTypedData(markets.createTypedData(d0)));
  const asked = (await rowsFor({ dareId: d.id })).filter((r) => r.name === "asked");
  assert.equal(asked.length, 1);
  assert.deepEqual(asked[0]?.props, { kind: "binary", pace: "dare", source: "direct", mark: "none" });
  assert.equal(asked[0]?.userId, ana.user.id);

  const enter = async (who: Signer, value: bigint) => markets.enterMarket({ dareId: d.id, userId: who.user.id, stake: 500n, value, signature: await who.ledger.signTypedData(markets.enterTypedData(d, 500n, value)) });
  await enter(ana, 7000n);
  await enter(ben, 4000n);
  await enter(ben, 3000n);
  const entered = (await rowsFor({ dareId: d.id })).filter((r) => r.name === "entered");
  assert.equal(entered.length, 2, "two entries, and a change is not a third");
  assert.ok(entered.every((r) => (r.props as { as: string }).as === "account"));

  const guest = await enterAsGhost({ dareId: d.id, who: { name: "Wisp", phoneHash: hashPhone(fictionalPhone()), memberClaimId: null }, tokens: [], stake: 500n, value: 2000n });
  track.claim(guest.claimId);
  const asGuest = (await rowsFor({ dareId: d.id })).filter((r) => r.name === "entered" && r.claimId === guest.claimId);
  assert.equal(asGuest.length, 1);
  assert.deepEqual(asGuest[0]?.props, { as: "guest" });
  assert.equal(asGuest[0]?.userId, null, "a guest is its claim, not an account");

  const newcomer = await tempUser("Wisp");
  await bindByBrowserTokens(newcomer.id, [guest.browserToken as string]);
  const bound = (await rowsFor({ userId: newcomer.id })).filter((r) => r.name === "claim_bound");
  assert.equal(bound.length, 1);
  assert.deepEqual(bound[0]?.props, { via: "token" });
  assert.equal(bound[0]?.claimId, guest.claimId);
  // Nothing typed is in any row: not the question, not a name.
  for (const r of await rowsFor({ dareId: d.id })) assert.ok(!JSON.stringify(r.props).includes("Ben") && !JSON.stringify(r.props).includes("get in"), "no words of anyone's in the properties");
});
