/**
 * The first-contact round (2026-10-04) over HTTP, against a running server (TEST_BASE_URL, default
 * http://localhost:3000) that shares this database. Sessions are forged with SESSION_SECRET for temporary users.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { db, schema } from "@/db";
import { createGroup } from "@/lib/ledger/groups";
import { ensureUsd } from "@/lib/ledger/denominations";
import * as markets from "@/lib/ledger/markets";
import { startGame, syncSchedule } from "@/lib/sports";
import { parseScoreboard } from "@/lib/sports/espn";
import { FIRST_LINE } from "@/lib/ui/copy";
import { cleanup, tempSigner, track, type Signer } from "../db/fixture";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

type Got = { status: number; html: string; text: string };
async function get(path: string, cookie?: string, headers: Record<string, string> = {}): Promise<Got> {
  const r = await fetch(BASE + path, { headers: { ...(cookie ? { cookie: `dareful_session=${cookie}` } : {}), ...headers }, redirect: "manual" });
  const html = await r.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<title>[\s\S]*?<\/title>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;|&rsquo;/g, "’")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
  return { status: r.status, html, text };
}
async function cookieFor(userId: string): Promise<string> {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(s));
}

let asker: Signer, friend: Signer, outsider: Signer;
let cAsker: string, cOutsider: string;
let gameId: string, groupId: string, openId: string;
before(async () => {
  [asker, friend, outsider] = await Promise.all(["Asker", "Friend", "Outsider"].map((n) => tempSigner(n)));
  [cAsker, cOutsider] = await Promise.all([cookieFor(asker.user.id), cookieFor(outsider.user.id)]);
  const g = await createGroup({ name: "first contact pages (temporary)", createdBy: asker.user.id });
  track.group(g.id);
  groupId = g.id;
  await db.insert(schema.groupMembers).values([{ groupId: g.id, userId: friend.user.id }, { groupId: g.id, userId: outsider.user.id }]);
  const usd = await ensureUsd(g.id, asker.user.id);
  const scoreboard = JSON.parse(readFileSync(new URL("../fixtures/sports/espn-nfl-scheduled.json", import.meta.url), "utf8")) as unknown;
  const prefix = track.gamePrefix(`test:first:${randomUUID().slice(0, 8)}:`);
  const game = parseScoreboard("nfl", scoreboard).slice(0, 1).map((x) => ({ ...x, sourceId: `${prefix}${x.sourceId}`, startsAt: new Date(Date.now() + 3 * 86_400_000) }));
  await syncSchedule("nfl", new Date(), { name: "espn", listGames: async () => game });
  const [row] = await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.sourceId, game[0]!.sourceId));
  gameId = (row as { id: string }).id;
  const d0 = await markets.draftMarket({ creatorId: asker.user.id, groupId: g.id, denomId: usd.id, title: "Does the pizza come before the second act?", termsText: "Yes if the pizza is on the table before the second act starts.", resolvesBy: new Date(Date.now() + 3 * 86_400_000) });
  openId = (await markets.openMarket(d0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d0)))).id;
  // The asker starts the game with who wins, as "Send it" does: the drafts, then each Create signature.
  for (const d0 of await startGame({ gameId, keys: ["home_wins"], creatorId: asker.user.id, groupId, denomId: usd.id, zone: "America/New_York" })) {
    await markets.openMarket(d0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d0)));
  }
});
after(cleanup);

test("adding a second question to a game: the Add another page is its terms step, and the page the send lands on lists both questions, never the error card", async () => {
  // One page per game per person (the games-and-the-reveal round, section 4): its address names the game alone.
  const page = await get(`/on/${gameId}`, cAsker);
  assert.equal(page.status, 200);
  assert.ok(page.html.includes(`href="/on/${gameId}?add=margin"`), "the margin is offered under Add another");
  const add = await get(`/on/${gameId}?add=margin`, cAsker);
  assert.equal(add.status, 200);
  assert.ok(add.html.includes('data-game-terms="margin"') && !add.html.includes("data-screen-error"), "the terms step for the margin alone");
  const usd = await ensureUsd(groupId, asker.user.id);
  for (const d0 of await startGame({ gameId, keys: ["margin"], creatorId: asker.user.id, groupId, denomId: usd.id, zone: "America/New_York" })) {
    await markets.openMarket(d0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d0)));
  }
  // The send re-renders the page it was made from, whose address still says add=margin, and then replaces it.
  for (const path of [`/on/${gameId}?add=margin`, `/on/${gameId}`]) {
    const after = await get(path, cAsker);
    assert.equal(after.status, 200, path);
    assert.ok(!after.html.includes("data-screen-error"), `${path} draws no error card`);
    assert.ok(!after.html.includes(`href="/on/${gameId}?add=margin"`), `${path} no longer offers the margin`);
  }
});

test("an address that is not a game's id is the code screen's 404, never a failed render", async () => {
  for (const path of ["/on/401802094", "/on/401802094/00000000-0000-0000-0000-000000000000"]) {
    const r = await get(path, cAsker);
    assert.equal(r.status, 404, path);
    assert.ok(!r.html.includes("data-screen-error"), `${path} draws no error card`);
  }
});

test("the root answers a link-preview fetcher with what the signed-out screen says, in its head", async () => {
  for (const ua of ["facebookexternalhit/1.1 Facebot Twitterbot/1.0", "WhatsApp/2.23.20.0", "TelegramBot (like TwitterBot)"]) {
    const r = await get("/", undefined, { "user-agent": ua });
    assert.equal(r.status, 200, ua);
    const head = r.html.slice(0, r.html.indexOf("</head>"));
    for (const tag of [`<meta name="description" content="${FIRST_LINE}"/>`, `<meta property="og:description" content="${FIRST_LINE}"/>`, `<meta name="twitter:description" content="${FIRST_LINE}"/>`]) assert.ok(head.includes(tag), `${ua}: ${tag}`);
    assert.ok(!head.includes("from who falls asleep first to who wins on Sunday"), `${ua}: never the line 1.9 replaced`);
  }
});

test("a link opened with no account: the thumb at 50% under the slide prompt, the primary saying the 50% it would send, and no number asked of a guest", async () => {
  const r = await get(`/m/${openId}`);
  assert.equal(r.status, 200);
  assert.ok(r.text.includes("Slide to your prediction"), "the prompt where the band will read");
  assert.ok(/I’m in at 50%, \$/.test(r.text), `the primary says the number it would send: ${/I’m in[^<]{0,30}/.exec(r.text)?.[0]}`);
  assert.ok(!r.text.includes("Your phone number") && !r.text.includes("Have an account?"), "no number field and no old sign-in line");
});

test("a draft rests with its terms on screen, its other two moves on the page under the question and above its terms, never in the sheet, and a question nobody else joined is its asker's to withdraw", async () => {
  const usd = await ensureUsd(groupId, asker.user.id);
  const draft = await markets.draftMarket({ creatorId: asker.user.id, groupId, denomId: usd.id, title: "Will the kettle boil before the toast pops?", termsText: "Yes if the kettle clicks off first, by ear. No if the toast pops first.", resolvesBy: new Date(Date.now() + 2 * 86_400_000) });
  const page = await get(`/m/${draft.id}`, cAsker);
  assert.equal(page.status, 200);
  const moves = page.html.indexOf("data-draft-moves");
  const sheet = page.html.indexOf("data-pinned-sheet=");
  assert.ok(moves > 0 && page.html.includes("data-share-first") && page.html.includes("data-discard-draft"), "Share it first and Discard it");
  assert.ok(sheet > 0 && moves < sheet, "on the page, never in the sheet whose raised position ends short of them");
  const terms = page.html.indexOf(">Counts if<");
  assert.ok(terms > 0 && moves < terms, "under the question and above the terms, so Share it first is on screen without scrolling (the second-pass round, on the iOS 27 simulator)");
  assert.ok(page.html.includes('data-pinned-sheet="low"'), "a draft rests, so the terms being approved are on screen");
  const open = await get(`/m/${openId}`, cAsker);
  assert.ok(open.html.includes("data-withdraw-market"), "nobody else is in: the asker may withdraw it");
  const friendView = await get(`/m/${openId}`, await cookieFor(friend.user.id));
  assert.ok(!friendView.html.includes("data-withdraw-market"), "nobody else may");
});
