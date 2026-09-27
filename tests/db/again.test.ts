/**
 * A send that was told and never landed (docs/decisions.md 2026-09-27; src/lib/ledger/again.ts): against the real
 * `chain_writes` table, with rows planted as the relayer and the tick would leave them. What is shown is exactly
 * what the person was told was on its way and can do again; what is not is anything they were never told about,
 * anything a later send superseded, setup, a week-old failure, and a thing that is no longer open. Rows are the
 * test's own and removed after.
 */
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, inArray } from "drizzle-orm";
import type { Hex } from "viem";
import { db, schema } from "@/db";
import { subjectKey, type WriteKind } from "@/lib/chain/relayer";
import { againFor, againRowsFor } from "@/lib/ledger/again";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup, ensureDyad } from "@/lib/ledger/groups";
import { AGAIN_CONTEXT, nowFor } from "@/lib/ledger/home";
import { draftMarket } from "@/lib/ledger/markets";
import { proposeCover } from "@/lib/ledger/proposals";
import { cents, units } from "@/lib/money";
import { cleanup, tempUser, track, type User } from "./fixture";

let gabe: User, justin: User;
const made: Buffer[] = [];
before(async () => {
  [gabe, justin] = await Promise.all(["Gabe", "Justin"].map((n) => tempUser(n)));
});
after(async () => {
  if (made.length) await db.delete(schema.chainWrites).where(inArray(schema.chainWrites.hash, made));
  await cleanup();
});

const H = 3_600_000;
async function write(input: { kind: WriteKind; subject: Record<string, unknown>; status: "pending" | "mined" | "reverted" | "dropped"; actor?: string | null; told?: boolean; ageMs?: number }): Promise<Hex> {
  const hash = randomBytes(32);
  made.push(hash);
  const at = new Date(Date.now() - (input.ageMs ?? H));
  await db.insert(schema.chainWrites).values({ hash, raw: randomBytes(64), label: `test ${input.kind}`, kind: input.kind, subject: subjectKey(input.subject), nonce: 7, status: input.status, actorId: input.actor === undefined ? gabe.id : input.actor, toldAt: input.told === false ? null : at, createdAt: at, updatedAt: at });
  return `0x${hash.toString("hex")}`;
}

test("a told send that was dropped or reverted is the person's to do again; one never told, superseded, a week old, setup, or on a thing since closed is not, and Now says it on the row", async () => {
  const now = new Date();
  const dyad = await ensureDyad(gabe.id, justin.id);
  track.group(dyad.id);
  const usd = await ensureUsd(dyad.id, justin.id);
  const p = await proposeCover({ creditorId: justin.id, debtor: { kind: "user", userId: gabe.id }, groupId: dyad.id, denomId: usd.id, quantity: units(1200n), amountCents: cents(1200n), settleExpected: true, memo: "the cab" });
  const g = await createGroup({ name: "again check (temporary)", createdBy: gabe.id });
  track.group(g.id);
  const gUsd = await ensureUsd(g.id, gabe.id);
  const d = await draftMarket({ creatorId: gabe.id, groupId: g.id, denomId: gUsd.id, title: "Does the tick finish it?", termsText: "Yes if the row shows on Now. No if it does not.", resolvesBy: new Date(Date.now() + H) });
  const obligationId = randomUUID();
  await db.insert(schema.obligations).values({ id: obligationId, tokenId: 1n, groupId: dyad.id, fromUser: justin.id, toUser: gabe.id, denomId: usd.id, quantity: units(500n), uniqueObligation: false, amountCents: cents(500n), origin: "manual", settleExpected: true, confirmTx: randomBytes(32) });

  const confirmDropped = await write({ kind: "confirm", subject: { proposalIds: [p.id] }, status: "dropped" });
  const untold = await write({ kind: "net", subject: { groupId: dyad.id, denomId: usd.id, a: gabe.id, b: justin.id }, status: "dropped", told: false });
  const superseded = await write({ kind: "close", subject: { obligationId: randomUUID(), reason: "settled" }, status: "dropped", ageMs: 2 * H });
  await write({ kind: "close", subject: JSON.parse((await db.select({ s: schema.chainWrites.subject }).from(schema.chainWrites).where(eq(schema.chainWrites.hash, Buffer.from(superseded.slice(2), "hex"))))[0]!.s) as Record<string, unknown>, status: "pending", actor: null, told: false, ageMs: H });
  const old = await write({ kind: "close", subject: { obligationId: randomUUID(), reason: "settled" }, status: "dropped", ageMs: 8 * 24 * H });
  const setup = await write({ kind: "register", subject: { groupId: dyad.id }, status: "dropped" });
  const netReverted = await write({ kind: "net", subject: { groupId: g.id, denomId: gUsd.id, a: gabe.id, b: justin.id }, status: "reverted" });
  const lockDropped = await write({ kind: "create", subject: { dareId: d.id }, status: "dropped" });
  const closeDropped = await write({ kind: "close", subject: { obligationId, reason: "forgiven" }, status: "dropped" });
  const someoneElses = await write({ kind: "confirm", subject: { proposalIds: [randomUUID()] }, status: "dropped", actor: justin.id });

  const items = await againFor(gabe.id, now);
  const hashes = items.map((i) => i.hash);
  assert.ok(hashes.includes(confirmDropped) && hashes.includes(netReverted) && hashes.includes(lockDropped) && hashes.includes(closeDropped), "told and dropped, or told and reverted, is theirs to do again");
  assert.ok(!hashes.includes(untold), "a drop the person was never told about is not theirs to see: their request already said it failed");
  assert.ok(!hashes.includes(superseded), "a later send for the same thing, by anyone, supersedes");
  assert.ok(!hashes.includes(old), "eight days on, it is history: the window is a week");
  assert.ok(!hashes.includes(setup), "setup was never the person's own action");
  assert.ok(!hashes.includes(someoneElses), "another person's send is theirs, not this one's");

  const rows = await againRowsFor(gabe.id, now);
  assert.ok(rows.confirms.has(p.id), "a dropped confirm is said on the proposal's own row");
  assert.ok(rows.locks.has(d.id));
  assert.deepEqual(
    rows.rows.map((r) => [r.kind, r.subject, r.href, r.dare?.id ?? null]).sort(),
    [
      ["close", "Calling it even with Justin", `/p/${justin.id}`, null],
      ["create", "Does the tick finish it?", `/m/${d.id}`, d.id],
      ["net", "Cancelling out with Justin", `/p/${justin.id}`, null],
    ].sort(),
  );

  const home = await nowFor({ id: gabe.id, displayName: gabe.displayName }, { now, closes: () => "" });
  const yep = home.needs.find((n) => n.kind === "yep" && n.key === p.id);
  assert.equal(yep?.context, AGAIN_CONTEXT, "the yep row's reason line says it did not go through last time");
  const again = home.needs.filter((n) => n.kind === "again");
  assert.deepEqual(again.map((n) => [n.subject, n.verb]).sort(), [["Calling it even with Justin", "Try again"], ["Cancelling out with Justin", "Try again"], ["Does the tick finish it?", "Lock"]].sort());

  // Once the thing is no longer open there is nothing to do again: the row leaves with it.
  await db.update(schema.obligations).set({ closedAt: now }).where(eq(schema.obligations.id, obligationId));
  await db.update(schema.dares).set({ lockedAt: now }).where(eq(schema.dares.id, d.id));
  const later = await againRowsFor(gabe.id, now);
  assert.deepEqual(later.rows.map((r) => r.kind), ["net"], "the closed obligation and the locked question have left");
});
