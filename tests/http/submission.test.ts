/**
 * The submission round (2026-10-09), over HTTP against a running server that shares this database: every share row
 * carries the icons its screen should have (share, copy and the code while a question is open, pass the phone for its
 * asker and for anyone in, a game page's one row the same for its open question), a market's tips wait until the
 * viewer is in, and the public numbers are a picture sent fresh to every proxy. Sessions are forged with
 * SESSION_SECRET for temporary users, as the pages suite does.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { SignJWT } from "jose";
import { db, schema } from "@/db";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import * as markets from "@/lib/ledger/markets";
import { syncSchedule } from "@/lib/sports";
import { parseScoreboard } from "@/lib/sports/espn";
import { cleanup, tempSigner, track, type Signer } from "../db/fixture";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

async function cookieFor(userId: string): Promise<string> {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return new SignJWT({}).setProtectedHeader({ alg: "HS256" }).setSubject(userId).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(s));
}
async function page(path: string, cookie?: string): Promise<string> {
  const r = await fetch(BASE + path, { headers: cookie ? { cookie: `dareful_session=${cookie}` } : {}, redirect: "manual" });
  assert.equal(r.status, 200, `${path} answers`);
  return (await r.text()).replace(/<script[\s\S]*?<\/script>/g, "");
}
type Icon = "share" | "copy" | "code" | "pass";
/** The icons of each share row on a page (the who's-in row's "Share it" group), in the order the rows stand. */
function rows(dom: string): Icon[][] {
  return Array.from(dom.matchAll(/<div[^>]*role="group"[^>]*aria-label="Share it"[^>]*>[\s\S]*?<\/div>/g)).map((m) => {
    const row = m[0];
    const icons: Icon[] = [];
    if (/<button[^>]*data-share=""/.test(row)) icons.push("share");
    if (/<button[^>]*data-copy=/.test(row)) icons.push("copy");
    if (/<button[^>]*data-code=""/.test(row)) icons.push("code");
    if (/<button[^>]*data-pass-phone=""/.test(row)) icons.push("pass");
    return icons;
  });
}
/** Whether the screen's information icon says its tips wait. */
const tipsWait = (dom: string) => /<button[^>]*data-info-icon="[^"]+"[^>]*data-tips-wait=""/.test(dom);

let asker: Signer, friend: Signer, cAsker: string, cFriend: string, marketId: string, gameId: string, gameQuestionId: string;
before(async () => {
  const up = await fetch(BASE).catch(() => null);
  if (!up) throw new Error(`nothing is listening at ${BASE}; start the app first`);
  [asker, friend] = await Promise.all([tempSigner("Priya"), tempSigner("Dev")]);
  [cAsker, cFriend] = await Promise.all([cookieFor(asker.user.id), cookieFor(friend.user.id)]);
  const g = await createGroup({ name: "share row check (temporary)", createdBy: asker.user.id });
  track.group(g.id);
  await db.insert(schema.groupMembers).values({ groupId: g.id, userId: friend.user.id });
  const usd = await ensureUsd(g.id, asker.user.id);
  const d0 = await markets.draftMarket({ creatorId: asker.user.id, groupId: g.id, denomId: usd.id, title: "Does the kettle get descaled by Friday?", termsText: "Yes if the kettle is descaled by Friday.", resolvesBy: new Date(Date.now() + 86_400_000) });
  marketId = (await markets.openMarket(d0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d0)))).id;
  // A game of this run's own, from the recorded scoreboard, with one question the asker has asked and not called.
  const prefix = track.gamePrefix(`test:submission:${randomUUID().slice(0, 8)}:`);
  const scoreboard = JSON.parse(readFileSync(new URL("../fixtures/sports/espn-nfl-scheduled.json", import.meta.url), "utf8")) as unknown;
  const game = parseScoreboard("nfl", scoreboard).slice(0, 1).map((x) => ({ ...x, sourceId: `${prefix}${x.sourceId}`, startsAt: new Date(Date.now() + 5 * 86_400_000) }));
  await syncSchedule("nfl", new Date(), { name: "espn", listGames: async () => game });
  const [row] = await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.sourceId, game[0]!.sourceId));
  gameId = (row as { id: string }).id;
  const [tpl] = await db.select().from(schema.publicQuestions).where(eq(schema.publicQuestions.gameId, gameId));
  const q0 = await markets.draftFromTemplate({ templateId: (tpl as { id: string }).id, creatorId: asker.user.id, groupId: g.id, denomId: usd.id });
  gameQuestionId = (await markets.openMarket(q0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(q0)))).id;
});
after(cleanup);

test("a share row carries every icon its screen should have: share, copy and the code while it is open, and pass the phone for its asker before their call and for anyone in", async () => {
  assert.deepEqual(rows(await page(`/m/${marketId}`, cAsker)), [["share", "copy", "code", "pass"]], "the asker before their call");
  assert.deepEqual(rows(await page(`/m/${marketId}`, cFriend)), [], "someone in the set who is not in has no row to share from yet, so no pass the phone");
  await markets.enterMarket({ dareId: marketId, userId: friend.user.id, stake: 500n, value: 6000n, signature: await friend.ledger.signTypedData(markets.enterTypedData((await markets.marketById(marketId))!, 500n, 6000n)) });
  assert.deepEqual(rows(await page(`/m/${marketId}`, cFriend)), [["share", "copy", "code", "pass"]], "once in");
});

test("a game page's one row carries pass the phone for the question its code is for, by the market's rule, and its open card draws no row of its own", async () => {
  assert.deepEqual(rows(await page(`/on/${gameId}`, cAsker)), [["share", "copy", "code", "pass"]], "the asker of the page's open question");
  assert.deepEqual(rows(await page(`/on/${gameId}?q=${gameQuestionId}`, cAsker)), [["share", "copy", "code", "pass"]], "with its card open, still one row");
  assert.deepEqual(rows(await page(`/on/${gameId}`, cFriend)), [["share", "copy", "code"]], "someone on the page who is not in it and did not ask it");
});

test("a market's tips wait until the viewer is in: the information icon says so until their entry stands", async () => {
  const g = await createGroup({ name: "tips wait check (temporary)", createdBy: asker.user.id });
  track.group(g.id);
  const usd = await ensureUsd(g.id, asker.user.id);
  const d0 = await markets.draftMarket({ creatorId: asker.user.id, groupId: g.id, denomId: usd.id, title: "Does the train leave on time?", termsText: "Yes if it leaves by 8:16.", resolvesBy: new Date(Date.now() + 86_400_000) });
  const d = await markets.openMarket(d0.id, asker.user.id, await asker.ledger.signTypedData(markets.createTypedData(d0)));
  assert.equal(tipsWait(await page(`/m/${d.id}`, cAsker)), true, "not in yet: the tips wait");
  await markets.enterMarket({ dareId: d.id, userId: asker.user.id, stake: 500n, value: 7000n, signature: await asker.ledger.signTypedData(markets.enterTypedData(d, 500n, 7000n)) });
  assert.equal(tipsWait(await page(`/m/${d.id}`, cAsker)), false, "in: they run");
  await db.update(schema.dares).set({ lockedAt: new Date() }).where(eq(schema.dares.id, d.id));
  assert.deepEqual(rows(await page(`/m/${d.id}`, cAsker)), [["share", "copy"]], "closed: share and copy alone");
});

test("the public numbers are a picture, drawn by the app and sent fresh to every proxy", async () => {
  const r = await fetch(`${BASE}/numbers`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get("content-type"), "image/png");
  assert.equal(r.headers.get("cache-control"), "no-cache, max-age=0, must-revalidate", "GitHub's proxy and every browser ask again");
  assert.equal(r.headers.get("vercel-cdn-cache-control"), "max-age=60", "the platform's edge keeps one drawing a minute");
  const png = Buffer.from(await r.arrayBuffer());
  assert.equal(png.subarray(1, 4).toString("ascii"), "PNG");
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 600], "1200 by 600");
});
