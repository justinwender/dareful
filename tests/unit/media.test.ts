/**
 * The photo pipeline (docs/marks-and-memories.md; PLANNING.md Principle 6) as rules: every field of EXIF is gone
 * from what is stored, GPS above all, and only when the photo was taken survives, read before the strip; the
 * frame is 1080 on its long edge with the camera's orientation applied; the thumbnail is a 256 square; and a
 * settlement photo is seen by the two people in the obligation and nobody else. The input photo is made by
 * sharp's own EXIF writer (libvips), never typed by hand.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import { canSeeSettlementPhoto } from "@/lib/media";
import { capturedAtFrom, describeExif } from "@/lib/media/exif";
import { FRAME_EDGE, NotAPhoto, processPhoto, THUMB_EDGE } from "@/lib/media/pipeline";

/** A phone photo: landscape pixels flagged as rotated, a capture time in the camera's clock, and a GPS fix. */
async function phonePhoto(input: { offset?: string; orientation?: number } = {}): Promise<Buffer> {
  return sharp({ create: { width: 1600, height: 1200, channels: 3, background: { r: 120, g: 90, b: 60 } } })
    .jpeg({ quality: 80 })
    .withMetadata({ orientation: input.orientation ?? 6 })
    .withExif({
      IFD0: { Make: "Apple", Model: "iPhone" },
      IFD2: { DateTimeOriginal: "2026:09:20 21:14:03", ...(input.offset ? { OffsetTimeOriginal: input.offset } : {}) },
      IFD3: { GPSLatitudeRef: "N", GPSLatitude: "40/1 44/1 5424/100", GPSLongitudeRef: "W", GPSLongitude: "73/1 59/1 2100/100" },
    })
    .toBuffer();
}

test("the input carries what a phone writes, and nothing of it but the capture time is read", async () => {
  const exif = (await sharp(await phonePhoto({ offset: "-04:00" })).metadata()).exif;
  const seen = describeExif(exif);
  assert.equal(seen.gps, true, "the fixture has a GPS block, so stripping it is a real act");
  assert.equal(seen.capturedAt?.toISOString(), "2026-09-21T01:14:03.000Z", "the camera's own offset places the moment");
  assert.equal(capturedAtFrom(exif, "America/New_York")?.toISOString(), "2026-09-21T01:14:03.000Z");
});

test("without an offset from the camera, the viewer's zone places the capture time; without a zone it is read as UTC", async () => {
  const exif = (await sharp(await phonePhoto()).metadata()).exif;
  assert.equal(capturedAtFrom(exif, "America/Los_Angeles")?.toISOString(), "2026-09-21T04:14:03.000Z");
  assert.equal(capturedAtFrom(exif, null)?.toISOString(), "2026-09-20T21:14:03.000Z");
  assert.equal(capturedAtFrom(undefined, "America/New_York"), null, "no EXIF, no capture time");
  assert.equal(capturedAtFrom(Buffer.from("not exif at all"), null), null);
});

test("what is stored has no EXIF at all: no GPS, no make, no time; the frame is 1080 on its long edge and upright", async () => {
  const out = await processPhoto(await phonePhoto({ offset: "-04:00" }), "America/New_York");
  assert.equal(out.capturedAt?.toISOString(), "2026-09-21T01:14:03.000Z", "read before the strip");
  const frame = await sharp(out.frame.bytes).metadata();
  assert.equal(frame.exif, undefined, "every field of EXIF is gone from the frame");
  assert.equal(describeExif(frame.exif).gps, false);
  assert.ok(!out.frame.bytes.includes("2026:09:20") && !out.frame.bytes.includes("iPhone"), "nothing of the camera's text survives");
  assert.deepEqual([out.frame.width, out.frame.height], [810, 1080], "orientation 6 turns 1600 by 1200 into a portrait frame, 1080 on its long edge");
  assert.equal(out.frame.width <= FRAME_EDGE && out.frame.height <= FRAME_EDGE, true);
  const thumb = await sharp(out.thumb.bytes).metadata();
  assert.equal(thumb.exif, undefined, "and from the thumbnail");
  assert.deepEqual([out.thumb.width, out.thumb.height], [THUMB_EDGE, THUMB_EDGE], "a 256 square for thumbnails and marks");
});

test("something that is not a photo is refused, loudly", async () => {
  await assert.rejects(() => processPhoto(Buffer.from("hello"), null), NotAPhoto);
  await assert.rejects(() => processPhoto(Buffer.alloc(0), null), NotAPhoto);
});

test("a settlement photo is seen by the two people in the obligation and nobody else", () => {
  const o = { fromUser: "debtor", toUser: "creditor" };
  assert.equal(canSeeSettlementPhoto("debtor", o), true);
  assert.equal(canSeeSettlementPhoto("creditor", o), true);
  assert.equal(canSeeSettlementPhoto("friend-in-the-group", o), false, "the group it was in is not the two people in it");
  assert.equal(canSeeSettlementPhoto("", o), false);
});
