/**
 * The fixture's own rule, against the real database: a run's cleanup takes the games that run made and never
 * another run's. The suites share one database and `node --test` runs files side by side; a cleanup that took
 * every `test:` game once deleted the sports suite's game between its two inserts (docs/decisions.md
 * 2026-09-27).
 */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { cleanup, removeTestGames, track } from "./fixture";

const RUN = Math.random().toString(36).slice(2, 8);
after(cleanup);

const game = (sourceId: string) => ({
  source: "espn",
  sourceId,
  sport: "nfl",
  name: "Titans at Giants",
  startsAt: new Date(Date.now() + 3_600_000),
  expectedEndAt: new Date(Date.now() + 4 * 3_600_000),
  homeId: "19",
  homeAbbr: "NYG",
  homeName: "New York Giants",
  homeShort: "Giants",
  awayId: "10",
  awayAbbr: "TEN",
  awayName: "Tennessee Titans",
  awayShort: "Titans",
});

test("cleanup takes this run's games and never another run's: two suites share the database and run side by side", async () => {
  const mine = track.gamePrefix(`test:${RUN}:`);
  const theirs = `test:${RUN}-other:`;
  const [a] = await db.insert(schema.sportsGames).values(game(`${mine}1`)).returning({ id: schema.sportsGames.id });
  const [b] = await db.insert(schema.sportsGames).values(game(`${theirs}1`)).returning({ id: schema.sportsGames.id });
  assert.ok(a && b);
  await db.insert(schema.publicQuestions).values({ gameId: a.id, key: "home_wins", kind: "binary", title: "Who wins, Titans or Giants?", termsText: "t", outcomeLabels: ["Yes", "No"], decidedByScore: true, decidedByFeed: true, sort: 0 });
  try {
    assert.equal(await removeTestGames(db, [mine]), 1, "one game, this run's, with its question");
    assert.equal((await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.id, a.id))).length, 0, "this run's game gone");
    assert.equal((await db.select().from(schema.sportsGames).where(eq(schema.sportsGames.id, b.id))).length, 1, "the other run's game untouched");
    assert.equal(await removeTestGames(db, []), 0, "no prefix, nothing taken");
  } finally {
    await db.delete(schema.sportsGames).where(eq(schema.sportsGames.id, b.id));
  }
});
