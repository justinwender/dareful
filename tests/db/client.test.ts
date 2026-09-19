/** The transaction pooler keeps no session, so the client must not rely on one. */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { sql } from "drizzle-orm";
import { db } from "@/db";

after(() => db.$client.end());

test("the client sends no prepared statements and gives idle connections back", () => {
  assert.equal(db.$client.options.prepare, false);
  const idle = db.$client.options.idle_timeout ?? 0;
  assert.ok(idle > 0 && idle <= 30, `idle_timeout is ${idle}`);
});

test("forty queries at once all succeed, each statement repeated so a prepared-statement clash would show", async () => {
  const rows = await Promise.all(Array.from({ length: 40 }, (_, i) => db.execute<{ n: number }>(sql`select ${i}::int as n`)));
  assert.deepEqual(rows.map((r) => Array.from(r)[0]?.n), Array.from({ length: 40 }, (_, i) => i));
});
