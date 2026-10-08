/**
 * The field round, part 1 (2026-10-02): the rules the owner's findings turned into, each pure and held here. What
 * a control says while it waits, the words for each cause, who may close a market and when, a row's address on
 * Now, the clock past a close, each sport's start word, the reminder's night, and the session sliding.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { buttonWait } from "@/components/ui/button";
import { NOTHING_CAME_BACK } from "@/components/ledger/problem";
import { failureWords, notAllowed, WORDS } from "@/lib/ui/errors";
import { hashAsksFor } from "@/lib/ui/hash";
import { mayClose } from "@/lib/ledger/markets";
import { closesClock, TIMES_UP } from "@/lib/ui/copy";
import { startWord } from "@/lib/sports/types";
import { reminderSendTime, voteReminderNotice, votingOpenedNotice } from "@/lib/notify/messages";
import { REISSUE_AFTER_MS, sessionDueForReissue } from "@/lib/auth/session";
import { causeOf } from "@/lib/usage/events";

test("a write is never shown failed: past ten seconds it is still going with its line, and only a read gets the block with Try again", () => {
  assert.deepEqual(buttonWait("none", "write"), { block: false, pending: false, long: false, line: null, words: null });
  assert.deepEqual(buttonWait("pending", "write"), { block: false, pending: true, long: false, line: null, words: null });
  assert.deepEqual(buttonWait("still", "write"), { block: false, pending: true, long: true, line: WORDS.writeStillGoing, words: null });
  assert.deepEqual(buttonWait("block", "write"), { block: false, pending: true, long: true, line: WORDS.writeStillGoing, words: null }, "ten seconds into a write: the runner, the line, and no second send on offer");
  assert.deepEqual(buttonWait("block", "read"), { block: true, pending: false, long: false, line: null, words: WORDS.readTimeout }, "a read may be asked for again");
  assert.deepEqual(buttonWait("still", "read"), { block: false, pending: true, long: true, line: "Still going.", words: null });
  assert.equal(NOTHING_CAME_BACK, WORDS.readTimeout);
});

test("every cause has its words, each a statement with what to do, and Try again only where a retry could put it right", () => {
  assert.equal(WORDS.offline, "You’re offline. Try again once you’re back.");
  assert.equal(WORDS.readTimeout, "That’s taking longer than it should. Try again.");
  assert.equal(WORDS.writeStillGoing, "Still going. This one takes a few seconds.");
  assert.equal(WORDS.server, "Something broke on our end. Try again in a minute.");
  assert.equal(WORDS.signedOut, "You’ve been signed out. Sign in to finish this.");
  assert.equal(WORDS.changed, "This changed while you were on it. Here’s the latest.");
  assert.equal(WORDS.tooMany, "Too many tries. Give it a minute.");
  assert.equal(notAllowed("JP", "close"), "Only JP can close this one.");
  for (const w of Object.values(WORDS)) assert.ok(!w.includes("?") && !w.includes("—"), `${w} is a statement without an em dash`);
  assert.equal(failureWords(false), WORDS.offline, "a request that threw on a phone with no network: nothing was sent");
  assert.equal(failureWords(true), WORDS.server);
  assert.equal(causeOf(WORDS.signedOut, true), "signed_out");
  assert.equal(causeOf(WORDS.changed, true), "changed");
  assert.equal(causeOf(WORDS.tooMany, true), "too_many");
  assert.equal(causeOf(WORDS.server, true), "server");
  assert.equal(causeOf(WORDS.readTimeout, true), "nothing_came_back");
  assert.equal(causeOf(notAllowed("JP", "close"), true), "not_allowed");
  assert.equal(causeOf(WORDS.offline, true), "offline", "the offline words say offline even when the phone says it is back");
});

test("a request that reaches the server as nobody answers the signed-out words from every action, never a thrown error the phone cannot read", () => {
  const dir = join(process.cwd(), "src/lib/actions");
  const files = readdirSync(dir).filter((f) => f.endsWith(".ts"));
  let answers = 0;
  for (const f of files) {
    const src = readFileSync(join(dir, f), "utf8");
    const lines = src.split("\n");
    lines.forEach((line, i) => {
      if (/await requireUser\(\)/.test(line)) assert.ok(f === "groups.ts" && /createGroupAction/.test(lines.slice(Math.max(0, i - 3), i).join("\n")), `${f}:${i + 1} requires a user where an answer could say so`);
      if (/const (user|host) = await currentUser\(\);/.test(line)) {
        assert.match(lines[i + 1] ?? "", /^\s*if \(!\w+\) return/, `${f}:${i + 2} answers when there is nobody`);
        answers += 1;
      }
    });
  }
  assert.ok(answers >= 55, `${answers} actions answer the signed-out case`);
});

test("who may close a market by hand: its asker while it runs, and past its time anyone in it", () => {
  const t = new Date("2026-10-02T20:00:00Z");
  const d = { creatorId: "asker", resolvesBy: new Date("2026-10-02T21:00:00Z"), inIt: ["asker", "jp", null] };
  assert.equal(mayClose(d, "asker", t), true);
  assert.equal(mayClose(d, "jp", t), false, "before the close it is the asker's");
  assert.equal(mayClose(d, "jp", new Date("2026-10-02T21:00:00Z")), true, "at the close anyone in it may finish it");
  assert.equal(mayClose(d, "outsider", new Date("2026-10-02T22:00:00Z")), false, "someone not in it never");
  assert.equal(mayClose({ ...d, resolvesBy: null }, "jp", t), false, "with no close time it stays the asker's");
});

test("a row's address names the move as a fragment, and a sheet reads it: enter raises the entry, ballot the ballot, close the close's ask", () => {
  assert.equal(hashAsksFor("#enter", "enter"), true);
  assert.equal(hashAsksFor("#ballot", "ballot"), true);
  assert.equal(hashAsksFor("#close", "close"), true);
  assert.equal(hashAsksFor("#enter", "ballot"), false);
  assert.equal(hashAsksFor("", "enter"), false);
  assert.equal(hashAsksFor("#enter2", "enter"), false);
});

test("an open market past its close says Time’s up, never Closes soon", () => {
  const now = new Date("2026-10-02T20:00:00Z");
  assert.equal(closesClock(new Date("2026-10-02T19:59:00Z"), now, "America/New_York"), TIMES_UP);
  assert.equal(closesClock(now, now, "America/New_York"), TIMES_UP);
  assert.equal(closesClock(new Date("2026-10-02T22:00:00Z"), now, "America/New_York"), "Closes tonight");
  assert.equal(closesClock(new Date("2026-10-05T22:00:00Z"), now, "America/New_York"), "Closes Monday");
});

test("each sport starts in its own word", () => {
  assert.deepEqual(["nfl", "mlb", "nba", "nhl"].map(startWord), ["kickoff", "first pitch", "tip-off", "puck drop"]);
  assert.equal(startWord("curling"), "the start");
});

test("the twelve-hour reminder waits for 9am in its zone from 11pm, and the voting notices open the ballot", () => {
  assert.equal(reminderSendTime(new Date("2026-10-02T23:30:00Z"), "UTC").toISOString(), "2026-10-03T09:00:00.000Z");
  assert.equal(reminderSendTime(new Date("2026-10-03T03:00:00Z"), "UTC").toISOString(), "2026-10-03T09:00:00.000Z");
  assert.equal(reminderSendTime(new Date("2026-10-02T15:00:00Z"), "UTC").toISOString(), "2026-10-02T15:00:00.000Z");
  assert.equal(reminderSendTime(new Date("2026-10-03T03:30:00Z"), "America/New_York").toISOString(), "2026-10-03T13:00:00.000Z", "11:30pm Eastern waits for 9am Eastern, which is 13:00 UTC: the night is the asker's zone's");
  assert.equal(reminderSendTime(new Date("2026-10-02T18:30:00Z"), "America/New_York").toISOString(), "2026-10-02T18:30:00.000Z", "2:30pm Eastern goes out as it is");
  const app = "https://dareful.app";
  const asker = votingOpenedNotice({ by: "asker", name: "JP", title: "Will it rain?", marketId: "m1", appUrl: app });
  assert.deepEqual([asker.title, asker.url], ["JP closed “Will it rain”", `${app}/m/m1#ballot`]);
  assert.equal(votingOpenedNotice({ by: "time", name: "JP", title: "Will it rain?", marketId: "m1", appUrl: app }).title, "Time’s up on JP’s “Will it rain”");
  assert.equal(votingOpenedNotice({ by: "both_in", name: "Rae", title: "Will it rain?", marketId: "m1", appUrl: app }).body, "It’s between the two of you now. Say how it came out.");
  const reminder = voteReminderNotice({ name: "JP", title: "Will it rain?", cast: 1, quorum: 4, marketId: "m1", appUrl: app });
  assert.deepEqual([reminder.title, reminder.body, reminder.url], ["Still open: JP’s “Will it rain”", "1 of 4 has called it. Yours is still to come.", `${app}/m/m1#ballot`]);
  // The vote opens when it has happened (the games-and-the-reveal round): named for whoever said so, or for the final.
  assert.equal(votingOpenedNotice({ by: "happened", name: "Maya", title: "Will it rain?", marketId: "m1", appUrl: app }).title, "Maya says “Will it rain” has happened");
  assert.equal(votingOpenedNotice({ by: "final", name: "JP", title: "Who wins, Red Sox or Yankees?", marketId: "m1", appUrl: app }).title, "The final is in on JP’s “Who wins, Red Sox or Yankees”");
});

test("a session a day old is issued again on the next open, a younger one is left, and none is made from nothing", () => {
  const now = new Date("2026-10-02T20:00:00Z");
  assert.equal(sessionDueForReissue(new Date(now.getTime() - REISSUE_AFTER_MS), now), true);
  assert.equal(sessionDueForReissue(new Date(now.getTime() - REISSUE_AFTER_MS + 1), now), false);
  assert.equal(sessionDueForReissue(null, now), false);
});
