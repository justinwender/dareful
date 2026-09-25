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
import { ensureUsd } from "@/lib/ledger/denominations";
import * as markets from "@/lib/ledger/markets";
import { INKS, inkOf } from "@/lib/ui/ink";
import { cleanup, cover, ghost, tempSigner, tempUser, track, type Signer, type User } from "../db/fixture";

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
let asker: Signer, friend: Signer, stranger: Signer, cAsker: string, cFriend: string, cStranger: string, marketId: string, draftId: string;

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

  // A question in a group of two, with the asker in at a distinctive number, and a draft beside it.
  [asker, friend, stranger] = await Promise.all([tempSigner("Priya Raman"), tempSigner("Dev"), tempSigner("Stranger")]);
  [cAsker, cFriend, cStranger] = await Promise.all([cookieFor(asker.user.id), cookieFor(friend.user.id), cookieFor(stranger.user.id)]);
  const mg = await createGroup({ name: "Question check", createdBy: asker.user.id });
  track.group(mg.id);
  await db.insert(schema.groupMembers).values({ groupId: mg.id, userId: friend.user.id });
  const usd = await ensureUsd(mg.id, asker.user.id);
  const ask = (title: string) => markets.draftMarket({ creatorId: asker.user.id, groupId: mg.id, denomId: usd.id, title, termsText: "Yes if the kettle is descaled by Friday.", resolvesBy: new Date(Date.now() + 86_400_000) });
  draftId = (await ask("Is this draft still a secret?")).id;
  const d0 = await ask("Does the kettle get descaled by Friday?");
  const d = await markets.openMarket(d0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d0)));
  await markets.enterMarket({ dareId: d.id, userId: asker.user.id, stake: 1700n, valueBps: 8300n, signature: await asker.ledger.signTypedData(markets.enterTypedData(d, 1700n, 8300n)) });
  marketId = d.id;
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
  // A plain message, not assert.equal: its character diff of two URLs prints as one spliced string
  // ("locdarefulhost") in a terminal, which reads like a bug in the app rather than a wrong value.
  const actual = new URL(meta(r.html, "og:image") ?? "").origin;
  const expected = new URL(BASE).origin;
  assert.ok(actual === expected, `og:image is served from ${actual}; expected ${expected}. NEXT_PUBLIC_APP_URL was wrong when this deployment was built.`);
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

test("the people tab lists the ghost among people, and the cover form offers the ghost and someone new", async () => {
  const people = await get("/people", cA);
  assert.ok(people.text.includes("Gabe") && people.text.includes("not here yet"));
  assert.ok(!(await get("/", cA)).text.includes("not here yet"), "people are a root of their own, not a section of Now (design 4.7)");
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
  assert.ok((await get("/", cU)).text.includes("A few things were waiting for you"));
  // The asker has things on Now and nothing that arrived by binding: no strip.
  const quiet = await get("/", cAsker);
  assert.ok(quiet.text.includes("Needs you") && !quiet.text.includes("waiting for you"));
  const r = await get("/welcome", cB);
  assert.ok(r.status === 307 || r.status === 302);
  assert.equal(r.loc, "/");
});

// -------------------------------------------------------------------------------------------- questions

test("a shared question answers a preview bot with the question, and nothing about who is in or at what", async () => {
  const r = await get(`/m/${marketId}`);
  assert.equal(r.status, 200);
  assert.equal(meta(r.html, "og:title"), "Does the kettle get descaled by Friday?");
  assert.ok(r.text.includes("Does the kettle get descaled by Friday?"));
  // Distinctive spellings: a bare "83" turns up in script file names, and "$17" is how the page's own serialization writes a reference.
  for (const s of ["Priya", "Raman", "83%", "8300", "17.00", "Question check", "Kettles rarely"]) assert.ok(!r.html.includes(s), `the signed-out page leaks "${s}"`);
  const card = await get(`/m/${marketId}/opengraph-image`);
  const plain = await get(`/m/00000000-0000-4000-8000-000000000000/opengraph-image`);
  assert.equal(card.type, "image/png");
  assert.ok(!card.bytes.equals(plain.bytes));
});

test("a draft is a 404 to everyone but the person who asked it, and its preview says nothing", async () => {
  assert.equal((await get(`/m/${draftId}`, cAsker)).status, 200);
  assert.equal((await get(`/m/${draftId}`, cFriend)).status, 404);
  const out = await get(`/m/${draftId}`);
  assert.equal(meta(out.html, "og:title"), "Dareful");
  assert.ok(!out.html.includes("still a secret"));
});

test("someone in the group who has not picked sees who is in and no number; someone outside sees neither", async () => {
  const mine = await get(`/m/${marketId}`, cFriend);
  assert.equal(mine.status, 200);
  // The count is the whole message (4.9): the captions that restated it are gone.
  assert.ok(mine.text.includes("1 of 2 in") && !mine.text.includes("shows once you pick") && !mine.text.includes("One friend is in."));
  // Sent, not merely shown: the page's data travels in the HTML, so a number hidden by a component is still leaked.
  for (const s of ["83%", "You’re in at", "8300", "\"stake\":\"1700\"", "buckets"]) assert.ok(!mine.html.includes(s), `someone who has not picked is sent "${s}"`);
  // The asker is in: the receipt is on the screen every time it opens, not for a second after the tap.
  const asked = await get(`/m/${marketId}`, cAsker);
  assert.ok(asked.text.includes("You’re in at 83%") && asked.text.includes("yours to change until") && asked.text.includes("Where the stake sits"));
  const outside = await get(`/m/${marketId}`, cStranger);
  assert.equal(outside.status, 200);
  // The invitation (docs/design.md 3.17): what it is and who asked, by first name, and nothing it could cost.
  assert.ok(outside.text.includes("Priya invited you") && outside.text.includes("One friend is in") && outside.text.includes("Join as"));
  for (const s of ["Priya Raman", "Raman", "83%", "8300", "17.00", "Kettles rarely", "kettle is descaled", "1 of 2 in"]) assert.ok(!outside.html.includes(s), `someone outside the group is sent "${s}"`);
});

test("the terms and the stalemate rule are on the screen before anyone is in", async () => {
  const r = await get(`/m/${marketId}`, cFriend);
  assert.ok(r.text.includes("Yes if the kettle is descaled by Friday."));
  // The tiebreaker is one of the four facts in the details (3.25); the consent sentence lives on the invitation.
  // The tiebreaker is credited to the agreement, never to the app (docs/decisions.md 2026-09-25).
  assert.ok(r.text.includes("If it’s unclear") && r.text.includes("Everyone says their piece and the tiebreaker everyone agreed to calls it."));
});

// ------------------------------------------------------------------------------------------ 2B: home, joining

async function send(path: string, method: string, body: unknown, cookie?: string): Promise<{ status: number }> {
  const r = await fetch(BASE + path, { method, headers: { "content-type": "application/json", ...(cookie ? { cookie: `dareful_session=${cookie}` } : {}) }, body: JSON.stringify(body) });
  return { status: r.status };
}

test("Now holds what needs this person, then what is running, then what just happened, and nothing that starts something", async () => {
  const r = await get("/", cFriend);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Needs you") && r.text.includes("Does the kettle get descaled by Friday?") && /1 of 2 in/.test(r.text) && r.text.includes("Enter"));
  // Creating things lives behind Start (design 6.1): nothing on Now asks, joins or logs, and the one chalk control is the button.
  assert.ok(!r.text.includes("Ask something") && !r.text.includes("I got this one"), "Now starts nothing itself");
  assert.ok(/aria-label="Start something"/.test(r.html), "the Start button");
  // Nothing on Now counts or ages (3.15): no badge on the heading, no days waiting.
  assert.ok(!/Needs you\s*\(?\d/.test(r.text) && !/waiting \d|\d+ days/.test(r.text));
  // The dot on Now means something with a clock is waiting (6.4): a question to get into has one; a draft to finish does not.
  assert.ok(/something with a clock is waiting on you/.test(r.html), "the friend has a question closing on them");
  // The asker has a draft to finish and a question they are in: needs first, then running, and the running row has no verb.
  const a = await get("/", cAsker);
  const needs = a.text.indexOf("Needs you");
  const running = a.text.indexOf("Running");
  assert.ok(needs >= 0 && running > needs, `needs you, then running: ${needs}, ${running}`);
  assert.ok(/Running.*Does the kettle get descaled by Friday\?.*1 of 2 in/.test(a.text), "where it stands, on the row");
  assert.ok(/<svg role="img" aria-label="You’re in"/.test(a.html), "the running row's mark says you're in (3.23)");
  // The action lives on the question's screen, never on a running row (design 4.7): no verb anywhere under Running.
  assert.equal(/\b(Enter|Vote|Yep|Finish|Lock)\b/.exec(a.text.slice(running))?.[0], undefined, "a verb on a running row");
  assert.ok(!/something with a clock is waiting on you/.test(a.html), "a draft can sit: no dot");
});

test("every screen paints a band behind the status bar, and on a market screen it sits inside the market's ink", async () => {
  // docs/testing.md session 7: scrolled content ran under the translucent status bar and into the clock.
  const now = await get("/", cFriend);
  assert.equal(now.status, 200);
  assert.ok(/data-status-band=""/.test(now.html), "the band on a root");
  const m = await get(`/m/${marketId}`, cFriend);
  assert.equal(m.status, 200);
  const ink = m.html.indexOf("--ground:");
  const band = m.html.indexOf('data-status-band=""');
  assert.ok(ink >= 0 && band > ink, `the band is inside the inked root, so it reads the market's ground: ink at ${ink}, band at ${band}`);
});

test("the joining screen is for someone signed in; signed out it sends them home", async () => {
  const out = await get("/join");
  assert.ok(out.status === 307 || out.status === 302);
  const r = await get("/join?code=k7qm", cFriend);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Join something") && r.text.includes("no O, I, Z, zero or one") && r.text.includes("Got a link instead?"));
});

test("the app is installable and its worker is served from the root, where a push needs it", async () => {
  const m = await get("/manifest.webmanifest");
  assert.equal(m.status, 200);
  const manifest = JSON.parse(m.html) as { display: string; start_url: string; icons: Array<{ src: string }> };
  assert.deepEqual([manifest.display, manifest.start_url], ["standalone", "/"]);
  for (const icon of manifest.icons) assert.equal((await get(icon.src)).type, "image/png", icon.src);
  const sw = await get("/sw.js");
  assert.ok(sw.status === 200 && sw.html.includes("notificationclick") && !sw.html.includes('addEventListener("fetch"'), "a worker that caches would serve somebody a stale ledger");
});

test("a push subscription is taken only from someone signed in, and only for a real push service", async () => {
  const sub = (endpoint: string) => ({ endpoint, keys: { p256dh: "B".repeat(87), auth: "a".repeat(22) } });
  assert.equal((await send("/api/push/subscribe", "POST", sub("https://fcm.googleapis.com/fcm/send/check-" + marketId))).status, 401);
  assert.equal((await send("/api/push/subscribe", "POST", sub("https://evil.example.com/collect"), cFriend)).status, 400);
  assert.equal((await send("/api/push/subscribe", "POST", sub("http://fcm.googleapis.com/fcm/send/x"), cFriend)).status, 400);
  assert.equal((await send("/api/push/subscribe", "POST", sub("https://fcm.googleapis.com/fcm/send/check-" + marketId), cFriend)).status, 200);
});

test("a device that cannot approve is only ever reported by the person it belongs to", async () => {
  assert.equal((await send("/api/device-state", "POST", { state: "signed-out", standalone: false })).status, 400);
  assert.equal((await send("/api/device-state", "POST", { state: "anything", standalone: false }, cFriend)).status, 400);
  assert.equal((await send("/api/device-state", "POST", { state: "signed-out", standalone: true }, cFriend)).status, 200);
});

test("nothing on a question borrows a word from finance", async () => {
  const FINANCE = /\b(odds|implied|price|pot|house|buy|sell|shares|liquidity|position size)\b|the market says/i;
  for (const who of [cFriend, cAsker]) {
    const r = await get(`/m/${marketId}`, who);
    // The one exception the vocabulary boundary makes (docs/design.md 4.6): the question the odds line asks.
    const m = FINANCE.exec(r.text.replace(/What are the odds(, in percent)?\?/g, "").replace(/Slide to pick your odds/g, ""));
    assert.equal(m, null, m ? `found "${m[0]}" in: ...${r.text.slice(Math.max(0, m.index - 40), m.index + 40)}...` : "");
  }
});

test("Now has no groups and no way to leave; people and the account have their own roots", async () => {
  const now = await get("/", cAsker);
  assert.ok(!/Sign out/.test(now.text) && !/\bGroups\b/.test(now.text) && !/Nothing open/.test(now.text));
  const you = await get("/you", cAsker);
  assert.ok(you.text.includes("Sign out") && you.text.includes(asker.user.displayName), "the account lives behind You");
  const self = await get(`/p/${asker.user.id}`, cAsker);
  assert.ok((self.status === 307 || self.status === 302) && self.loc === "/you", "your own person view is the You root");
  const gone = await get(`/g/${groupId}`, cA);
  assert.ok((gone.status === 307 || gone.status === 302) && gone.loc === "/", "there is no group screen; an old address goes home");
});

// --------------------------------------------------------------------------------------- 2C: the settler

test("the scheduler's door answers only to its secret, and tells a stranger nothing, not even that it exists", async () => {
  const post = (headers: Record<string, string>) => fetch(`${BASE}/api/tick`, { method: "POST", headers });
  assert.equal((await post({})).status, 404);
  assert.equal((await post({ authorization: "Bearer not-the-secret" })).status, 404);
  assert.equal((await post({ authorization: `Bearer ${"x".repeat((process.env.TICK_SECRET ?? "").length)}` })).status, 404, "same length, wrong value");
  assert.equal((await fetch(`${BASE}/api/tick`)).status, 405, "there is nothing to GET");
});

test("the bar is on the three roots and nowhere else, every other screen has a back control, and signed out there is only the wordmark", async () => {
  for (const path of ["/", "/people", "/you"]) {
    const r = await get(path, cAsker);
    assert.ok(/<nav aria-label="Main"/.test(r.html) && /aria-label="Start something"/.test(r.html) && !/aria-label="Back"/.test(r.html), `${path} is a root`);
    assert.equal((r.html.match(/aria-current="page"/g) ?? []).length, 1, `${path} marks one tab as where you are`);
  }
  for (const path of ["/m/new", "/join", `/m/${marketId}`, "/new", `/p/${friend.user.id}`, "/welcome"]) {
    const r = await get(path, cAsker);
    assert.ok(r.status === 200 || r.loc === "/", `${path}: ${r.status}`);
    if (r.status === 200) assert.ok(/aria-label="Back"/.test(r.html) && !/<nav aria-label="Main"/.test(r.html) && !/aria-label="Start something"/.test(r.html), `${path} is a task screen`);
  }
  const out = await get(`/m/${marketId}`);
  assert.ok(!/aria-label="Back"/.test(out.html) && !/<nav aria-label="Main"/.test(out.html) && out.text.includes("dareful"), "someone signed out has nowhere in the app to go back to");
  // An empty Now (3.14): "Ask something" is the one chalk control, so Start stays hidden, and the bar is still there.
  const empty = await get("/", cA);
  assert.ok(empty.text.includes("Nothing happens here until somebody else is in it.") && empty.text.includes("Ask something"), "the first-run state");
  assert.ok(/<nav aria-label="Main"/.test(empty.html) && !/aria-label="Start something"/.test(empty.html), "Start is hidden where Ask something already is the chalk");
});

test("asking offers both paces and both ways of writing the terms, and the settler says up front what it will not call", async () => {
  const r = await get("/m/new", cAsker);
  for (const t of ["Something that’ll happen", "Settle an argument", "Just write it up", "Ask me three things first"]) assert.ok(r.text.includes(t), t);
  // Start's "Settle an argument" row lands on the same screen, on the settler's pace.
  const arg = await get("/m/new?pace=argument", cAsker);
  assert.ok(/aria-pressed="true"[^>]*>\s*<span[^>]*>\s*Settle an argument/.test(arg.html) && arg.text.includes("What do you two disagree about?"), "the settler preselected");
});

test("someone not yet in is shown the tiebreaker they would be agreeing to", async () => {
  const r = await get(`/m/${marketId}`, cStranger);
  assert.ok(r.text.includes("If nobody can agree how it came out, the app hears both sides and calls it. Being in means you’re fine with that."));
});

// ------------------------------------------------------------------------------------- the v2 migration

test("state is a mark with a name, never a sentence: a question to get into is Open, and a cover to confirm is Proposed", async () => {
  const r = await get("/", cFriend);
  assert.ok(/<svg role="img" aria-label="Open"/.test(r.html), "the needs-you row carries the open mark");
  for (const s of ["Waiting on an answer", "Waiting on how it came out", "Nobody’s in yet", "Everyone’s in", "Squared up", "Called it even"]) assert.ok(!r.text.includes(s), `state prose "${s}" on Now`);
  const u = await get("/welcome", cU);
  assert.ok(/<svg role="img" aria-label="Proposed"/.test(u.html), "a cover to confirm carries the proposed mark");
});

test("a market's own screen is its ink: the ground, surface and line swapped for its layers, its band on its field, and the details as four facts", async () => {
  const [d] = await db.select({ id: schema.dares.id, ink: schema.dares.ink }).from(schema.dares).where(eq(schema.dares.id, marketId));
  assert.ok(d);
  const layers = INKS[inkOf(d)];
  const r = await get(`/m/${marketId}`, cAsker);
  assert.ok(r.html.includes(`--ground:${layers.ground}`) && r.html.includes(`--surface:${layers.surface}`) && r.html.includes(`--field:${layers.field}`), "the ink's layers on the screen's root");
  assert.ok(!r.html.includes("--ink:") && !r.html.includes("--chalk:"), "type colours and the chalk button are never tinted");
  assert.ok(/<svg role="img" aria-label="You’re in"/.test(r.html), "the band's mark: the asker is in");
  for (const s of ["Counts if", "Decided", "Stakes", "If it’s unclear"]) assert.ok(r.text.includes(s), `the details carry ${s}`);
  assert.ok(!r.text.includes("Every pair squares") && !r.text.includes("How we’ll know"), "scoring and the terms disclosure left the screen (4.9)");
  const s = await get(`/m/${marketId}`, cStranger);
  assert.ok(!s.html.includes(`--ground:${layers.ground}`), "the invitation is the neutral room, not the market's place");
});

// ---------------------------------------------------------------------------------- the v2 migration, second half

test("the market screen keeps its one move in the pinned sheet: the odds line before you are in, the link once you are", async () => {
  const before = await get(`/m/${marketId}`, cFriend);
  assert.ok(/<section aria-label="Your number"/.test(before.html), "the sheet, labelled as the move");
  assert.ok(before.text.includes("What are the odds?") && before.text.includes("Slide to answer") && before.text.includes("Slide to pick your odds"), "the odds line, untouched: no thumb, no number, the primary waiting");
  assert.ok(before.html.includes('aria-valuetext="not picked yet"'), "nothing starts picked: a thumb parked at 50% anchors everyone on a coin flip");
  const after = await get(`/m/${marketId}`, cAsker);
  assert.ok(/<section aria-label="Get people in"/.test(after.html) && after.text.includes("Send it to the chat") && after.text.includes("Anyone with the link can get in until"), "once in, the move is the link");
  assert.ok(!after.text.includes("Slide to pick your odds"), "the odds line has become the weight line");
  for (const s of ["in 10", "Fine-tune", "Not once", "Every time"]) assert.ok(!after.text.includes(s) && !before.text.includes(s), `tenths copy "${s}" came back`);
});

test("a task screen's primary is in the sheet too: the ask flow, the code screen", async () => {
  const ask = await get("/m/new", cAsker);
  assert.ok(/<section aria-label="Next"[^>]*>[\s\S]*?Who’s in\?/.test(ask.html), "the ask flow's first move");
  const join = await get("/join", cA);
  assert.ok(/<section aria-label="Join"[^>]*>[\s\S]*?>Join</.test(join.html), "Join, in the sheet");
});

test("the asking tile carries the asker's first name and the mechanic, and never who is in or at what", async () => {
  const r = await get(`/m/${marketId}/opengraph-image`);
  assert.equal(r.status, 200);
  assert.equal(r.type, "image/png");
  // A different picture from the plain card and from a cover's card: it is drawn from the market.
  const plain = await get(`/m/00000000-0000-4000-8000-000000000000/opengraph-image`);
  assert.ok(!r.bytes.equals(plain.bytes));
  assert.ok(r.bytes.length > 10_000, "a drawn tile, not an empty frame");
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
  ["home", () => "/", () => cA],
  ["the people tab", () => "/people", () => cA],
  ["the you tab", () => "/you", () => cA],
  ["the joining screen", () => "/join", () => cA],
  ["the signed-out cover page", () => `/o/${boundId}`, () => undefined],
  ["the cover page", () => `/o/${boundId}`, () => cU],
  ["a question, before picking", () => `/m/${marketId}`, () => cFriend],
  ["a question, once in", () => `/m/${marketId}`, () => cAsker],
  ["the ask screen", () => "/m/new", () => cAsker],
] as const) {
  test(`no banned word on ${name}`, async () => {
    const r = await get(path(), who());
    assert.equal(r.status, 200);
    const m = BANNED.exec(r.text);
    assert.equal(m, null, m ? `found "${m[0]}" in: ...${r.text.slice(Math.max(0, m.index - 40), m.index + 40)}...` : "");
  });
}
