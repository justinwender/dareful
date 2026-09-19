/** The transaction pooler keeps no session, so the client must not rely on one. */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { db } from "@/db";

after(() => db.$client.end());

test("the client sends no prepared statements and gives idle connections back", () => {
  assert.equal(db.$client.options.prepare, false);
  const idle = db.$client.options.idle_timeout ?? 0;
  assert.ok(idle > 0 && idle <= 30, `idle_timeout is ${idle}`);
});
