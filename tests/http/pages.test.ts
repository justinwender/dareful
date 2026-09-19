/**
 * The rendered pages over HTTP, against a running server (TEST_BASE_URL, default http://localhost:3000) that
 * shares this database. Sessions are forged with SESSION_SECRET for temporary users, which is what a real
 * session cookie is. Asserts on what a visitor, or a link-preview bot, actually receives.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { db, schema } from "@/db";
import * as claims from "@/lib/ledger/claims";
import { createGroup, createInvite } from "@/lib/ledger/groups";
import { cleanup, cover, ghost, tempUser, track, type User } from "../db/fixture";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

type Got = { status: number; type: string | null; loc: string | null; setCookie: string | null; html: string; text: string; bytes: Buffer };
async function get(path: string, cookie?: string): Promise<Got> {
  const r = await fetch(BASE + path, { headers: cookie ? { cookie: `dareful_session=${cookie}` } : {}, redirect: "manual" });
  const bytes = Buffer.from(await r.arrayBuffer());
  const html = bytes.toString("utf8");
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    // Next streams the <title> into the body at a position that varies between requests; it is not page text.
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  return { status: r.status, type: r.headers.get("content-type"), loc: r.headers.get("location"), setCookie: r.headers.get("set-cookie"), html, text, bytes };
}
const meta = (html: string, property: string) => new RegExp(`<meta property="${property}" content="([^"]*)"`).exec(html)?.[1] ?? null;
async function cookieFor(userId: string): Promise<string> {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(s));
}

let A: User, B: User, C: User, U: User;
let cA: string, cB: string, cU: string;
let gabe: string, linkToken: string, inviteToken: string, groupId: string, boundId: string, ghostCoverId: string;

before(async () => {
  const up = await fetch(BASE).catch(() => null);
  if (!up) throw new Error(`nothing is listening at ${BASE}; start the app first`);
  [A, B, C, U] = await Promise.all([tempUser("Alex Rivera"), tempUser("Ben"), tempUser("Cy"), tempUser("Nico")]);
  [cA, cB, cU] = await Promise.all([cookieFor(A.id), cookieFor(B.id), cookieFor(U.id)]);
  gabe = await ghost(A.id, "Gabe");
  ghostCoverId = (await cover(A.id, gabe, "Dinner at Sal’s", 4720n)).id;
  await cover(A.id, gabe, "Cab home", 1800n);
  linkToken = await claims.createClaimLink(gabe, A.id);
  for (const [creditor, memo, amt] of [[A, "Concert tickets", 6500n], [C, "Brunch", 2300n], [A, "Parking", 900n]] as const) {
    const g = await ghost(creditor.id, "Nico");
    const p = await cover(creditor.id, g, memo, amt);
    if (memo === "Concert tickets") boundId = p.id;
    await claims.bindClaimToUser(g, U.id);
  }
  const group = await createGroup({ name: "Thursday Poker (check)", createdBy: A.id });
  groupId = track.group(group.id);
  inviteToken = await createInvite(group.id, A.id);
});
after(cleanup);

// ------------------------------------------------------------------------------ the claim link, signed out

test("the claim landing page says who the sender thinks you are and what they covered", async () => {
  const r = await get(`/c/${linkToken}`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Alex Rivera thinks you’re"), "who");
  assert.ok(r.text.includes("Alex Rivera got these."), "headline");
  assert.ok(r.text.includes("Dinner at Sal’s") && r.text.includes("Cab home"), "memos");
});

test("it offers that's-me and sign-in, and nothing that acts before someone says who they are", async () => {
  const r = await get(`/c/${linkToken}`);
  assert.ok(r.text.includes("That’s me"));
  assert.ok(r.text.includes("I already have an account"));
  assert.ok(!r.text.includes("Fine, you got me"));
  assert.ok(r.text.includes("Nothing counts until you say so"));
  assert.ok(!r.text.includes("Tap to confirm"));
});

test("opening a claim link sets no cookie and issues no token", async () => {
  const r = await get(`/c/${linkToken}`);
  assert.equal(r.status, 200);
  assert.equal(r.setCookie, null);
  await get(`/c/${linkToken}/opengraph-image`);
  assert.equal((await db.select().from(schema.claimTokens).where(eq(schema.claimTokens.claimId, gabe))).length, 0);
});

// `next dev` always points a generated card at localhost whatever `metadataBase` says, so this can only be
// checked against a deployed app (TEST_BASE_URL=https://dareful.app). It is skipped locally rather than
// asserted in a form that could not fail, and no local mutant covers it.
test("on a deployed app, the preview image is on the app's own origin", { skip: /\/\/(localhost|127\.)/.test(BASE) }, async () => {
  const r = await get(`/c/${linkToken}`);
  assert.equal(new URL(meta(r.html, "og:image") ?? "").origin, new URL(BASE).origin);
});

test("the claim preview names the sender by first name only", async () => {
  const r = await get(`/c/${linkToken}`);
  assert.equal(meta(r.html, "og:title"), "Alex got this one");
  const head = r.html.slice(0, r.html.indexOf("</head>"));
  for (const s of ["Rivera", "Sal", "47", "Cab", "Gabe"]) assert.ok(!new RegExp(`content="[^"]*${s}`).test(head), `the preview leaks "${s}"`);
});

test("a malformed link and an unknown well-formed link read exactly the same", async () => {
  const bad = await get("/c/not-a-real-token");
  const unknown = await get(`/c/${"A".repeat(43)}`);
  assert.equal(bad.status, 200);
  assert.ok(bad.text.includes("That link has expired"));
  assert.equal(unknown.text, bad.text);
  assert.equal(meta(unknown.html, "og:title"), "Dareful");
});

// ------------------------------------------------------------------------------------------------- cards

test("the claim card, the invite card, and the cover card are PNGs, and differ from the plain card", async () => {
  const plain = await get(`/c/${"A".repeat(43)}/opengraph-image`);
  assert.equal(plain.type, "image/png");
  for (const path of [`/c/${linkToken}/opengraph-image`, `/join/${inviteToken}/opengraph-image`, `/o/${boundId}/opengraph-image`]) {
    const r = await get(path);
    assert.equal(r.status, 200, path);
    assert.equal(r.type, "image/png", path);
    assert.ok(r.bytes.length > 5000, path);
    assert.ok(!r.bytes.equals(plain.bytes), `${path} is the plain card`);
  }
});

test("dead links of every kind get byte-identical plain cards", async () => {
  const plain = await get(`/c/${"A".repeat(43)}/opengraph-image`);
  for (const path of ["/c/junk/opengraph-image", `/join/${"B".repeat(43)}/opengraph-image`, "/o/00000000-0000-4000-8000-000000000000/opengraph-image", "/o/junk/opengraph-image"]) {
    const r = await get(path);
    assert.equal(r.type, "image/png", path);
    assert.ok(r.bytes.equals(plain.bytes), `${path} differs from the plain card`);
  }
});

// ------------------------------------------------------------------------------ the cover link, signed out

test("a shared cover answers a preview bot with a card: first name, and nothing about what or how much", async () => {
  const r = await get(`/o/${boundId}`);
  assert.equal(r.status, 200);
  assert.equal(meta(r.html, "og:title"), "Alex got this one");
  assert.match(meta(r.html, "og:image") ?? "", /^https?:\/\/.*\/o\/.*opengraph-image/);
  assert.ok(r.text.includes("Alex got this one."));
  // The whole response, scripts and serialized props included: a value that is not rendered can still be sent.
  for (const s of ["Rivera", "Concert", "65.00", "6500", "Nico"]) assert.ok(!r.html.includes(s), `the signed-out page leaks "${s}"`);
});

test("an unknown cover link, signed out, says nothing and looks like the plain brand", async () => {
  const r = await get("/o/00000000-0000-4000-8000-000000000000");
  assert.equal(r.status, 200);
  assert.equal(meta(r.html, "og:title"), "Dareful");
  assert.ok(!r.text.includes("got this one"));
});

test("a cover is shown in full only to the two people in it", async () => {
  const mine = await get(`/o/${boundId}`, cU);
  assert.equal(mine.status, 200);
  assert.ok(mine.text.includes("Concert tickets") && mine.text.includes("$65.00"));
  assert.equal((await get(`/o/${boundId}`, cB)).status, 404);
});

test("a cover against someone not here yet is visible to the person who logged it, and to nobody else", async () => {
  const mine = await get(`/o/${ghostCoverId}`, cA);
  assert.equal(mine.status, 200);
  assert.ok(mine.text.includes("You got this one.") && mine.text.includes("Waiting for Gabe."));
  assert.equal((await get(`/o/${ghostCoverId}`, cB)).status, 404);
});

// ----------------------------------------------------------------------- the creator and everyone else

test("the creator sees their ghost's page, with the link and the way to let them go", async () => {
  const r = await get(`/p/c/${gabe}`, cA);
  assert.equal(r.status, 200);
  for (const s of ["Gabe", "not here yet", "Make a link for Gabe", "Let them go"]) assert.ok(r.text.includes(s), s);
});

test("someone else gets a 404 for that ghost, and a signed-out visitor is sent home", async () => {
  assert.equal((await get(`/p/c/${gabe}`, cB)).status, 404);
  const out = await get(`/p/c/${gabe}`);
  assert.ok(out.status === 307 || out.status === 302);
  assert.equal(out.loc, "/");
});

test("the creator opening their own link is told it does nothing for them", async () => {
  const r = await get(`/c/${linkToken}`, cA);
  assert.ok(r.text.includes("This is the link you made for Gabe"));
  assert.ok(!r.text.includes("That’s me"));
});

test("a signed-in friend gets one explicit tap, not a silent bind", async () => {
  const r = await get(`/c/${linkToken}`, cB);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("That’s me") && r.text.includes("Nothing happens unless you tap"));
  assert.equal((await claims.claimById(gabe))?.claimedBy, null);
});

test("home lists the ghost among people, and the cover form offers the ghost and someone new", async () => {
  const home = await get("/", cA);
  assert.ok(home.text.includes("Gabe") && home.text.includes("not here yet"));
  const form = await get("/new", cA);
  assert.ok(form.text.includes("Gabe") && form.text.includes("+ someone new"));
});

// ------------------------------------------------------------------------- the claimant's first screen

test("the first screen groups what was waiting by who it is with, and offers one yes for all", async () => {
  const r = await get("/welcome", cU);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Your friends kept track."));
  assert.ok(r.text.includes("With Alex Rivera") && r.text.includes("With Cy"));
  assert.equal((r.text.match(/With /g) ?? []).length, 2);
  for (const s of ["Concert tickets", "Brunch", "Parking", "Yep, all 3 are right"]) assert.ok(r.text.includes(s), s);
});

test("home carries a strip back to it, and someone with nothing waiting is sent home instead of an empty inbox", async () => {
  assert.ok((await get("/", cU)).text.includes("3 things were waiting for you"));
  // Alex has people on their home screen and nothing that arrived by binding: no strip.
  const quiet = await get("/", cA);
  assert.ok(quiet.text.includes("not here yet") && !quiet.text.includes("waiting for you"));
  const r = await get("/welcome", cB);
  assert.ok(r.status === 307 || r.status === 302);
  assert.equal(r.loc, "/");
});

// ------------------------------------------------------------------------------------------------ dates

test("a timestamp is painted in the zone the browser reported, not the server's", async () => {
  const at = new Date(Date.now() - 20 * 86_400_000);
  at.setUTCHours(2, 0, 0, 0); // 2am UTC: the evening before in Los Angeles, the same day in Tokyo
  await db.update(schema.obligationProposals).set({ createdAt: at }).where(eq(schema.obligationProposals.id, ghostCoverId));
  const label = (zone: string) => at.toLocaleDateString("en-US", { timeZone: zone, weekday: "short", month: "short", day: "numeric" });
  assert.notEqual(label("America/Los_Angeles"), label("Asia/Tokyo"));
  for (const zone of ["America/Los_Angeles", "Asia/Tokyo"]) {
    const r = await fetch(`${BASE}/o/${ghostCoverId}`, { headers: { cookie: `dareful_session=${cA}; dareful_tz=${encodeURIComponent(zone)}` } });
    assert.ok((await r.text()).includes(label(zone)), `${zone}: expected ${label(zone)}`);
  }
});

// ------------------------------------------------------------------------------------------------- copy

test("the banned-word scan can see a banned word when one is there", () => {
  assert.ok(BANNED.test("you have an outstanding balance"));
  assert.ok(!BANNED.test("Alex got this one. Squared up."));
});

const BANNED = /\b(owes?|owed|debt|balance|outstanding|overdue|wallet|transaction|gas|signature|chain|token)\b/i;
for (const [name, path, who] of [
  ["the claim landing page", () => `/c/${linkToken}`, () => undefined],
  ["the first screen", () => "/welcome", () => cU],
  ["the ghost page", () => `/p/c/${gabe}`, () => cA],
  ["the cover form", () => "/new", () => cA],
  ["the group page", () => `/g/${groupId}`, () => cA],
  ["the signed-out cover page", () => `/o/${boundId}`, () => undefined],
  ["the cover page", () => `/o/${boundId}`, () => cU],
] as const) {
  test(`no banned word on ${name}`, async () => {
    const r = await get(path(), who());
    assert.equal(r.status, 200);
    const m = BANNED.exec(r.text);
    assert.equal(m, null, m ? `found "${m[0]}" in: ...${r.text.slice(Math.max(0, m.index - 40), m.index + 40)}...` : "");
  });
}
