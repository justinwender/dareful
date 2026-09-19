/** Times read in the viewer's zone, never the server's, and "yesterday" is a calendar day, not a span of hours. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { dayLabel, firstName, validZone, whenLabel } from "@/lib/ui/copy";

const at = (iso: string) => new Date(iso);

test("something from last night reads as yesterday, not as a weekday two days back", () => {
  // 11:30pm Friday in New York, read at 9:00am Saturday in New York: 9.5 hours ago, and yesterday.
  assert.equal(whenLabel(at("2026-09-19T03:30:00Z"), at("2026-09-19T13:00:00Z"), "America/New_York"), "yesterday");
});

test("the same two instants read differently in a zone where no midnight fell between them", () => {
  // In Tokyo both instants are on Saturday the 19th.
  assert.equal(whenLabel(at("2026-09-19T03:30:00Z"), at("2026-09-19T13:00:00Z"), "Asia/Tokyo"), "9h ago");
});

test("thirty hours ago is yesterday when it was yesterday, even though it is more than a day", () => {
  assert.equal(whenLabel(at("2026-09-18T12:00:00Z"), at("2026-09-19T22:00:00Z"), "America/New_York"), "yesterday");
});

test("two calendar days back reads as the weekday in the viewer's zone", () => {
  // 1:00am UTC Thursday is still Wednesday evening in New York.
  assert.equal(whenLabel(at("2026-09-17T01:00:00Z"), at("2026-09-19T16:00:00Z"), "America/New_York"), "Wednesday");
  assert.equal(whenLabel(at("2026-09-17T01:00:00Z"), at("2026-09-19T16:00:00Z"), "UTC"), "Thursday");
});

test("minutes, and just now", () => {
  assert.equal(whenLabel(at("2026-09-19T12:00:00Z"), at("2026-09-19T12:00:30Z"), "UTC"), "just now");
  assert.equal(whenLabel(at("2026-09-19T12:00:00Z"), at("2026-09-19T12:41:00Z"), "UTC"), "41 min ago");
});

test("forty minutes ago across midnight is still minutes", () => {
  assert.equal(whenLabel(at("2026-09-19T03:50:00Z"), at("2026-09-19T04:30:00Z"), "America/New_York"), "40 min ago");
});

test("a week or more back is a date in the viewer's zone", () => {
  assert.equal(whenLabel(at("2026-09-01T02:00:00Z"), at("2026-09-19T16:00:00Z"), "America/New_York"), "Mon, Aug 31");
  assert.equal(whenLabel(at("2026-09-01T02:00:00Z"), at("2026-09-19T16:00:00Z"), "UTC"), "Tue, Sep 1");
});

test("a day label is in the viewer's zone", () => {
  assert.equal(dayLabel(at("2026-10-02T02:00:00Z"), "America/Los_Angeles"), "Oct 1");
  assert.equal(dayLabel(at("2026-10-02T02:00:00Z"), "UTC"), "Oct 2");
});

test("a zone from a cookie is validated before it is used", () => {
  assert.equal(validZone("America/New_York"), "America/New_York");
  assert.equal(validZone("Not/A_Zone"), null);
  assert.equal(validZone(""), null);
  assert.equal(validZone(null), null);
  assert.equal(validZone("A".repeat(65)), null);
});

test("a first name is the first word only", () => {
  assert.equal(firstName("  Alex Rivera-Santos "), "Alex");
  assert.equal(firstName("Sam"), "Sam");
  assert.equal(firstName(""), "");
});
