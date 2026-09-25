/**
 * From the phone test of 2026-09-25 (docs/testing.md, session 7): when the relayer's balance is low and said so.
 * The viewport rule that sat beside it was removed the same day, once a cold start showed the band it was built
 * for with no keyboard ever shown.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { hourly, monOf, RELAYER_FLOOR, relayerLow } from "@/lib/chain/watch";

test("the relayer is low under three MON, said once an hour, and read in whole MON without a float", () => {
  assert.equal(RELAYER_FLOOR, 3_000_000_000_000_000_000n);
  assert.equal(relayerLow(2_999_999_999_999_999_999n), true);
  assert.equal(
    relayerLow(3_000_000_000_000_000_000n),
    false,
    "the floor itself is not under it",
  );
  assert.equal(relayerLow(24_513_597_126_992_219_576n), false);
  assert.equal(
    hourly(new Date("2026-09-25T16:00:30Z")),
    true,
    "the tick at the top of the hour says it",
  );
  assert.equal(
    hourly(new Date("2026-09-25T16:01:30Z")),
    false,
    "the next one does not",
  );
  assert.equal(monOf(24_513_597_126_992_219_576n), "24.51");
  assert.equal(monOf(3_000_000_000_000_000_000n), "3.00");
  assert.equal(
    monOf(8_399_000_000_000_000n),
    "0.00",
    "truncated, never rounded up to look like more gas than there is",
  );
});
