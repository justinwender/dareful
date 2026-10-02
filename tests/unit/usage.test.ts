import assert from "node:assert/strict";
import { test } from "node:test";
import { causeOf, CLIENT_EVENTS, EVENTS, isClientEvent, isCrawler, screenOf, settledWord } from "@/lib/usage/events";
import { actorKey, onceKeyFor } from "@/lib/usage";
import { viaChannel } from "@/lib/notify/index";

test("the browser may report four events and no other: a link opened, a share, a notification's tap and an error shown", () => {
  assert.deepEqual([...CLIENT_EVENTS].sort(), ["error_shown", "link_opened", "notification_opened", "share"]);
  for (const name of CLIENT_EVENTS) assert.ok(isClientEvent(name) && name in EVENTS);
  for (const name of ["asked", "entered", "voted", "settled", "signed_in", "notification_sent", "page", ""]) assert.equal(isClientEvent(name), false, `${name} is the server's own`);
});

test("a property is a word from a fixed set, a boolean or a small count: nothing typed ever fits", () => {
  assert.ok(EVENTS.asked.safeParse({ kind: "binary", pace: "dare", source: "whats_on", mark: "sticker" }).success);
  assert.ok(!EVENTS.asked.safeParse({ kind: "binary", pace: "dare", source: "whats_on", mark: "Will John fall asleep?" }).success, "a question is not a mark");
  assert.ok(!EVENTS.entered.safeParse({ as: "Noah" }).success, "a name is not a way in");
  assert.ok(EVENTS.nudge.safeParse({ stage: "vote", told: 3, reached: 2 }).success);
  assert.ok(!EVENTS.nudge.safeParse({ stage: "vote", told: 3, reached: 2000 }).success, "a count past a thousand is not a count of friends");
  assert.ok(EVENTS.error_shown.safeParse({ cause: "failed", screen: "/m/[id]" }).success);
  assert.ok(!EVENTS.error_shown.safeParse({ cause: "failed", screen: "/m/hello world" }).success, "a screen is a shape, never words");
  assert.ok(!EVENTS.link_opened.safeParse({ link: "market", signedIn: "yes", installed: true }).success);
  assert.ok(!EVENTS.notification_opened.safeParse({ channel: "sms" }).success);
});

test("a link-preview fetcher is never a person: Messages, Slack and the crawlers are refused, a phone's browser is not", () => {
  assert.equal(isCrawler("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"), true);
  assert.equal(isCrawler("Mozilla/5.0 (compatible; Slackbot-LinkExpanding 1.0; +https://api.slack.com/robots)"), true);
  assert.equal(isCrawler("WhatsApp/2.23.20.0"), true);
  assert.equal(isCrawler("curl/8.4.0"), true);
  assert.equal(isCrawler(null), true, "no user agent at all is not a browser");
  assert.equal(isCrawler("Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1"), false);
  assert.equal(isCrawler("Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"), false);
});

test("a screen's shape keeps its words and replaces every id, token and code, and a cause is read from the words shown", () => {
  assert.equal(screenOf("/m/79ee79cb-1c2d-4e0a-9a7b-2f8c1d3e4f50"), "/m/[id]");
  assert.equal(screenOf("/on/79ee79cb-1c2d-4e0a-9a7b-2f8c1d3e4f50/0f332303-6b0b-4f38-aee3-3cc40cdeaab5"), "/on/[id]/[id]");
  assert.equal(screenOf("/c/AbC123xyz"), "/c/[id]");
  assert.equal(screenOf("/"), "/");
  assert.equal(screenOf("/people"), "/people");
  assert.equal(causeOf("That didn’t come back.", true), "nothing_came_back");
  assert.equal(causeOf("That didn’t go through. Try again.", true), "failed");
  assert.equal(causeOf("Say what your friends call you.", true), "refused");
  assert.equal(causeOf("Say what your friends call you.", false), "offline", "offline outranks the words");
  assert.equal(causeOf("That didn’t come back.", false), "offline", "a timeout while offline is the offline, whatever the words say");
  assert.equal(causeOf("", true), "other");
});

test("a link opened counts once per person or device per link, an account before a claim before a device, and nothing else counts once", () => {
  const dare = { dareId: "d1" };
  assert.equal(onceKeyFor("link_opened", { userId: "u1", claimId: "c1", deviceId: "x1" }, dare, { link: "market" }), "opened:market:m:d1:u:u1");
  assert.equal(onceKeyFor("link_opened", { claimId: "c1", deviceId: "x1" }, dare, { link: "market" }), "opened:market:m:d1:c:c1");
  assert.equal(onceKeyFor("link_opened", { deviceId: "x1" }, { gameId: "g1" }, { link: "game" }), "opened:game:g:g1:d:x1");
  assert.equal(onceKeyFor("link_opened", { deviceId: "x1" }, {}, { link: "code" }), "opened:code:code:d:x1");
  assert.equal(onceKeyFor("link_opened", {}, dare, { link: "market" }), null, "nobody to count it for");
  assert.equal(onceKeyFor("share", { userId: "u1" }, dare, { icon: "copy" }), null, "a share counts every time");
  assert.equal(actorKey({}), null);
});

test("a settlement is counted by how it was decided, and a notice's link says its channel before any fragment", () => {
  assert.equal(settledWord("quorum"), "vote");
  assert.equal(settledWord("arbitration"), "tiebreaker");
  assert.equal(settledWord("feed"), "feed");
  assert.equal(viaChannel("https://dareful.app/m/abc#ballot", "push", "log-1"), "https://dareful.app/m/abc?via=push&n=log-1#ballot");
  assert.equal(viaChannel("https://dareful.app/m/abc?x=1", "email", "log-2"), "https://dareful.app/m/abc?x=1&via=email&n=log-2");
});
