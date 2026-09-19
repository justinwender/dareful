/**
 * What a share card and its metadata may say. These previews land in group chats and are fetched by bots with
 * no session: a first name and that there is something to look at, never what, how much, or for whom.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import * as claims from "@/lib/ledger/claims";
import { claimShareCard, proposalShareCard } from "@/lib/ledger/share";
import { plainCard } from "@/lib/ui/share-card";
import { cleanup, cover, ghost, tempUser } from "./fixture";

after(cleanup);

const SECRETS = ["Rivera", "Zanzibar", "47", "4720", "dollar", "Gabe", "Okonkwo"];
const says = (share: unknown) => JSON.stringify(share);

async function boundCover() {
  const A = await tempUser("Alex Rivera");
  const U = await tempUser("Gabe Okonkwo");
  const g = await ghost(A.id, "Gabe");
  const p = await cover(A.id, g, "Dinner in Zanzibar", 4720n);
  await claims.bindClaimToUser(g, U.id);
  return { A, U, p };
}

test("a cover's card says the first name of who covered, and that is all", async () => {
  const { p } = await boundCover();
  const share = await proposalShareCard(p.id);
  assert.equal(share.title, "Alex got this one");
  assert.equal(share.card.headline, "Alex got this one.");
  assert.equal(share.sender, "Alex");
  for (const s of SECRETS) assert.ok(!says(share).includes(s), `the card leaks "${s}"`);
});

test("an unknown id, a malformed id, and a closed cover all get the same plain card", async () => {
  const { p } = await boundCover();
  await db.update(schema.obligationProposals).set({ status: "declined", resolvedAt: new Date() }).where(eq(schema.obligationProposals.id, p.id));
  const plain = says(await proposalShareCard(randomUUID()));
  assert.equal(JSON.parse(plain).card.headline, plainCard.headline);
  assert.equal(says(await proposalShareCard("not-an-id")), plain);
  assert.equal(says(await proposalShareCard(p.id)), plain);
});

test("a cover against someone who is not here yet gets a card too, still naming only who covered", async () => {
  const A = await tempUser("Alex Rivera");
  const p = await cover(A.id, await ghost(A.id, "Gabe"), "Dinner in Zanzibar", 4720n);
  const share = await proposalShareCard(p.id);
  assert.equal(share.title, "Alex got this one");
  for (const s of SECRETS) assert.ok(!says(share).includes(s), `the card leaks "${s}"`);
});

test("a claim link's card says the sender's first name and one-or-several, and that is all", async () => {
  const A = await tempUser("Alex Rivera");
  const g = await ghost(A.id, "Gabe");
  await cover(A.id, g, "Dinner in Zanzibar", 4720n);
  const link = await claims.createClaimLink(g, A.id);
  const one = await claimShareCard(link);
  assert.equal(one.card.headline, "Alex got this one.");
  await cover(A.id, g, "Cab", 1800n);
  const several = await claimShareCard(link);
  assert.equal(several.card.headline, "Alex got these.");
  assert.equal(several.title, "Alex got this one");
  for (const s of SECRETS) assert.ok(!says(several).includes(s), `the card leaks "${s}"`);
});

test("a dead, claimed, or unknown claim link gets the same plain card", async () => {
  const A = await tempUser("Alex Rivera");
  const g = await ghost(A.id, "Gabe");
  const link = await claims.createClaimLink(g, A.id);
  const plain = says(await claimShareCard("A".repeat(43)));
  assert.equal(JSON.parse(plain).card.headline, plainCard.headline);
  assert.equal(says(await claimShareCard("junk")), plain);
  await claims.bindClaimToUser(g, (await tempUser("Gabe")).id);
  assert.equal(says(await claimShareCard(link)), plain);
});
