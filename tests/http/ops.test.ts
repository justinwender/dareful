/**
 * The ops round (2026-10-09), over HTTP against a running server that shares this database: a question's result is never
 * drawn as a cover (on a guest's page, on an account's page, on the page its debtor confirms it from); the numbers
 * picture is drawn once for many asks; and the health route answers every system with nothing secret, 200 only while
 * the core is up, one run a minute. Sessions are forged with SESSION_SECRET for temporary users, as the pages suite does.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { cleanup, cover, ghost, tempSigner, track, type Signer } from "../db/fixture";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function cookieFor(userId: string): Promise<string> {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(s));
}
async function get(path: string, cookie?: string): Promise<Response> {
  return fetch(BASE + path, { headers: cookie ? { cookie: `dareful_session=${cookie}` } : {}, redirect: "manual" });
}
async function page(path: string, cookie?: string): Promise<string> {
  const r = await get(path, cookie);
  assert.equal(r.status, 200, `${path} answers`);
  return (await r.text()).replace(/<script[\s\S]*?<\/script>/g, "");
}
/** How many cover cards a page draws. */
const covers = (dom: string) => (dom.match(/<article[^>]*data-cover=""/g) ?? []).length;

const TITLE = "Does the kettle get descaled by Friday?";
let avery: Signer, blake: Signer, cAvery: string, cBlake: string, marketId: string, proposalId: string, guestId: string;

before(async () => {
  const up = await fetch(BASE).catch(() => null);
  if (!up) throw new Error(`nothing is listening at ${BASE}; start the app first`);
  [avery, blake] = await Promise.all([tempSigner("Avery"), tempSigner("Blake")]);
  [cAvery, cBlake] = await Promise.all([cookieFor(avery.user.id), cookieFor(blake.user.id)]);
  const g = await createGroup({ name: "result check (temporary)", createdBy: avery.user.id, memberUserIds: [blake.user.id] });
  track.group(g.id);
  const usd = await ensureUsd(g.id, avery.user.id);
  const d0 = await markets.draftMarket({ creatorId: avery.user.id, groupId: g.id, denomId: usd.id, title: TITLE, termsText: "Yes if the kettle is descaled by Friday.", resolvesBy: new Date(Date.now() + 86_400_000) });
  marketId = (await markets.openMarket(d0.id, avery.user.id, await avery.ledger.signTypedData(markets.createTypedData(d0)))).id;
  guestId = await ghost(avery.user.id, "Gale");
  const now = new Date();
  // Settled here, as a question with a guest in it is (`settleProvisional`): its transfers are proposals with origin "dare".
  await db.insert(schema.darePositions).values([
    { dareId: marketId, userId: avery.user.id, stake: 500n, value: 8000n, enteredBy: avery.user.id, enteredAt: now, acknowledgedAt: now },
    { dareId: marketId, userId: blake.user.id, stake: 500n, value: 2000n, enteredBy: blake.user.id, enteredAt: now, acknowledgedAt: now },
    { dareId: marketId, claimId: guestId, stake: 500n, value: 3000n, enteredBy: avery.user.id, enteredAt: now, acknowledgedAt: now },
  ]);
  await db.update(schema.dares).set({ lockedAt: now, resolvedAt: now, resolvedBy: "provisional", resolvedOutcome: 1n }).where(eq(schema.dares.id, marketId));
  const [p] = await db.insert(schema.obligationProposals).values({ groupId: g.id, fromUser: blake.user.id, toUser: avery.user.id, denomId: usd.id, quantity: 320n, amountCents: 320n, origin: "dare", originId: marketId, settleExpected: true, status: "pending" }).returning({ id: schema.obligationProposals.id });
  proposalId = p!.id;
  await db.insert(schema.obligationProposals).values({ groupId: g.id, fromClaim: guestId, toUser: avery.user.id, denomId: usd.id, quantity: 270n, amountCents: 270n, origin: "dare", originId: marketId, settleExpected: true, status: "pending" });
  // And one cover the ordinary way, so the guest's page is shown drawing covers still.
  await cover(avery.user.id, guestId, "Pizza on Tuesday");
});
after(cleanup);

test("a guest's page draws covers as covers and a question's result under the question's story, never as a cover (section 0)", async () => {
  const dom = await page(`/p/c/${guestId}`, cAvery);
  assert.equal(covers(dom), 1, "the pizza, and no cover for the question");
  assert.ok(dom.includes("Pizza on Tuesday"));
  assert.ok(dom.includes(TITLE), "the question's story is on the page");
  // The visible sentence only (each token also says it in its label): one under the cover, one under the question's story.
  assert.equal((dom.match(/>Gale(&#x27;|')s got you</g) ?? []).length, 2, "what each left: under the cover, and under the question's story");
  assert.ok(dom.indexOf(TITLE) < dom.lastIndexOf("s got you"), "the newer cover first, then the question with what it left");
});

test("an account's page draws a question's result under the question's story, never as a cover (section 0)", async () => {
  const dom = await page(`/p/${blake.user.id}`, cAvery);
  assert.equal(covers(dom), 0, "no cover card");
  assert.ok(dom.includes(TITLE), "the question's story is on the page");
  assert.match(dom, /Blake(&#x27;|')s got you/, "with what it left between the two, under it");
});

test("a question's result is confirmed under its story by its debtor, and its creditor is sent to the question (section 0)", async () => {
  const dom = await page(`/o/${proposalId}`, cBlake);
  assert.equal(covers(dom), 0, "no cover card");
  assert.match(dom, /Avery(&#x27;|')s got you\./);
  assert.ok(dom.includes(TITLE) && dom.includes("Yep, that’s right"), "the story, then the yep");
  const r = await get(`/o/${proposalId}`, cAvery);
  assert.ok([303, 307, 308].includes(r.status), `the creditor is sent on (${r.status})`);
  assert.equal(new URL(r.headers.get("location") ?? "", BASE).pathname, `/m/${marketId}`);
});

test("the numbers picture is drawn once for many asks, and every proxy is still told to ask again (section 0)", async () => {
  const one = await get("/numbers");
  const two = await get("/numbers");
  for (const r of [one, two]) {
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("content-type"), "image/png");
    assert.equal(r.headers.get("cache-control"), "no-cache, max-age=0, must-revalidate");
  }
  assert.ok(one.headers.get("x-drawn-at"), "the moment it was drawn");
  assert.equal(two.headers.get("x-drawn-at"), one.headers.get("x-drawn-at"), "the second ask is the same drawing");
  assert.ok((await one.arrayBuffer()).byteLength > 1_000);
});

test("the health route answers every system as ok, slow or down with nothing secret in it, 200 only while the core is up, and one run a minute (section 2)", async () => {
  const r = await get("/api/health");
  const body = (await r.json()) as { ok: boolean; at: string; env: string; checks: Array<{ name: string; core: boolean; state: string; ms: number; note: string | null }> };
  assert.equal(r.status, body.ok ? 200 : 503, "the status is the core's answer");
  assert.equal(body.env, ["localhost", "127.0.0.1"].includes(new URL(BASE).hostname) ? "local" : "production", "the run is this server's own environment's, said in the answer");
  assert.deepEqual(body.checks.map((c) => c.name), ["database", "tick", "rpc", "contracts", "relayer", "indexer", "anthropic", "resend", "dynamic", "storage", "scoreboard", "second_source", "push", "numbers_image", "link_tile"]);
  assert.deepEqual(body.checks.filter((c) => c.core).map((c) => c.name), ["database", "tick", "rpc", "contracts", "relayer", "indexer"]);
  assert.ok(body.checks.every((c) => ["ok", "slow", "down"].includes(c.state) && Number.isInteger(c.ms)));
  assert.equal(body.ok, body.checks.every((c) => !c.core || c.state !== "down"));
  const text = JSON.stringify(body);
  assert.doesNotMatch(text, /https?:|alchemy|\/v2\/|sk-ant|re_[A-Za-z0-9]{8}|sb_secret|Bearer|0x[0-9a-fA-F]{40}/, "no address, no key, no wallet");
  const again = (await (await get("/api/health")).json()) as { at: string };
  assert.equal(again.at, body.at, "asked again within the minute, the same run");
});
