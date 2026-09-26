/**
 * What's on, from a terminal, while its screens are held (docs/decisions.md, public markets): reads one sport's
 * schedule from the scoreboard into the database the way the tick does, and lists the games and the questions
 * written for them with their ids, so a question can be asked from `/m/new?template=<id>` before the tab exists.
 *   node --import tsx --env-file=.env.local scripts/dev/whats-on.ts nfl        sync and list
 *   node --import tsx --env-file=.env.local scripts/dev/whats-on.ts nfl list   list only
 * Nothing here touches a market, sends a notice or calls the tick.
 */
import { and, asc, eq, gt } from "drizzle-orm";
import { db, schema } from "@/db";
import { syncSchedule } from "@/lib/sports";
import { isSport } from "@/lib/sports/types";

async function main(): Promise<void> {
  const sport = process.argv[2];
  if (!isSport(sport)) throw new Error("say which sport: nfl, mlb, nba or nhl");
  const now = new Date();
  if (process.argv[3] !== "list") {
    const r = await syncSchedule(sport, now);
    console.log(`${sport}: ${r.games} games read`);
  }
  const games = await db.select().from(schema.sportsGames).where(and(eq(schema.sportsGames.sport, sport), gt(schema.sportsGames.startsAt, now))).orderBy(asc(schema.sportsGames.startsAt)).limit(12);
  for (const g of games) {
    const qs = await db.select().from(schema.publicQuestions).where(eq(schema.publicQuestions.gameId, g.id)).orderBy(asc(schema.publicQuestions.sort));
    console.log(`\n${g.name}  ${g.startsAt.toISOString()}  ${g.timeValid ? "" : "(time not confirmed) "}${g.playByPlay ? "play-by-play " : ""}${g.venue ?? ""}`);
    for (const q of qs) console.log(`  ${q.key.padEnd(11)} ${q.id}  ${q.title}`);
  }
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
