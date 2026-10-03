/**
 * The field round, part 3 (2026-10-02): the owner's numbers page. Who may read it, the windows, the days, and
 * that every number carries a definition.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { isOwner, ownerIds } from "@/lib/usage/owner";
import { dayOf, daysBetween, dayWindow, nextDay, PERCENT_STATS, shareOf, STATS, windowFor } from "@/lib/usage/stats";
import { explorerAddressUrl } from "@/lib/chain/explorer";

test("the numbers page is the owner's: the ids come from one server-only variable, and nobody else reads it", () => {
  const env = { OWNER_USER_IDS: " a1, b2 ,,c3" } as unknown as NodeJS.ProcessEnv;
  assert.deepEqual([...ownerIds(env)], ["a1", "b2", "c3"]);
  assert.equal(isOwner("b2", env), true);
  assert.equal(isOwner("d4", env), false);
  assert.equal(isOwner(null, env), false);
  assert.equal(isOwner("a1", {} as unknown as NodeJS.ProcessEnv), false, "no variable, no owner");
});

test("two windows and the days: since launch is open at the start, the week is seven days to now, and a day is one Eastern day, so one evening is never two", () => {
  const now = new Date("2026-10-02T20:00:00Z");
  assert.deepEqual(windowFor("launch", now), { from: null, to: now });
  assert.deepEqual(windowFor("week", now), { from: new Date("2026-09-25T20:00:00Z"), to: now });
  // Midnight to midnight in Eastern: 04:00 UTC while the clocks are forward.
  assert.deepEqual(dayWindow("2026-10-02"), { from: new Date("2026-10-02T04:00:00Z"), to: new Date("2026-10-03T04:00:00Z") });
  // An 8pm first pitch and its last out at 11:30pm are one day, though UTC has turned over between them.
  assert.equal(dayOf(new Date("2026-10-03T00:00:00Z")), "2026-10-02");
  assert.equal(dayOf(new Date("2026-10-03T03:30:00Z")), "2026-10-02");
  assert.equal(dayOf(new Date("2026-10-03T04:00:00Z")), "2026-10-03");
  // The day the clocks go back is twenty-five hours long, and still one day.
  assert.deepEqual(dayWindow("2026-11-01"), { from: new Date("2026-11-01T04:00:00Z"), to: new Date("2026-11-02T05:00:00Z") });
  assert.deepEqual(daysBetween("2026-09-29", "2026-10-02"), ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"]);
  assert.deepEqual(daysBetween("2026-10-02", "2026-10-02"), ["2026-10-02"]);
  assert.equal(nextDay("2026-10-31"), "2026-11-01");
});

test("a share is a whole percent of the same people, and the chain's contracts open on the explorer of the chain the app is on", () => {
  assert.deepEqual([shareOf(3, 7), shareOf(0, 0), shareOf(7, 7)], [43, 0, 100]);
  assert.ok(PERCENT_STATS.has("channel_share") && !PERCENT_STATS.has("with_channel"));
  assert.equal(explorerAddressUrl(10143, "0xabc"), "https://testnet.monadexplorer.com/address/0xabc");
  assert.equal(explorerAddressUrl(143, "0xabc"), "https://monadexplorer.com/address/0xabc");
});

test("every number has a key of its own and a definition that says what the window does to it", () => {
  const keys = STATS.map((s) => s.key);
  assert.equal(new Set(keys).size, keys.length);
  assert.ok(STATS.length >= 21);
  for (const s of STATS) assert.ok(s.definition.length > 20 && /window/.test(s.definition) && !s.definition.includes("—"), `${s.key} says what the window does`);
});
