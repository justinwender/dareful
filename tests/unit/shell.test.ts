/**
 * Two rules from the phone test of 2026-09-25 (docs/testing.md, session 7): when the visual viewport counts as
 * stuck, and when the relayer's balance is low and said so.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { hourly, monOf, RELAYER_FLOOR, relayerLow } from "@/lib/chain/watch";
import { viewportStuck } from "@/lib/ui/viewport";

const fine = {
  scale: 1,
  offsetTop: 0,
  height: 852,
  innerHeight: 852,
  typing: false,
};

test("a viewport that is short or offset with nothing typing and no zoom is stuck; the keyboard and pinch zoom are not", () => {
  assert.equal(viewportStuck(fine), false, "at rest nothing is repaired");
  assert.equal(
    viewportStuck({ ...fine, height: 828 }),
    true,
    "short after the keyboard went (iOS 26.0)",
  );
  assert.equal(
    viewportStuck({ ...fine, offsetTop: 24 }),
    true,
    "offset from the top",
  );
  assert.equal(
    viewportStuck({ ...fine, height: 500, typing: true }),
    false,
    "the keyboard is up: the short viewport is real",
  );
  assert.equal(
    viewportStuck({ ...fine, scale: 2, height: 426, offsetTop: 100 }),
    false,
    "pinch zoom is meant to be smaller",
  );
  assert.equal(
    viewportStuck({ ...fine, height: 851.5 }),
    false,
    "half a pixel of rounding is not a stuck viewport",
  );
});

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
