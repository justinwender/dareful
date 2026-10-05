/**
 * Re-settles a question the final score's backstop voided as a conflict when both scoreboards named the same answer
 * (the first-contact round, 2026-10-04: until then the backstop compared whole finals, so two sources that agreed
 * the Yankees won, one with the Red Sox on 2 and one on 0, voided a who-wins question everyone had called).
 *
 *   npx tsx --env-file=.env.local scripts/ops/resettle-feed.ts <dareId>            reads, and says what it would do
 *   npx tsx --env-file=.env.local scripts/ops/resettle-feed.ts <dareId> --apply    does it
 *
 * It changes production data, so it runs with --apply only on the owner's go-ahead. It refuses anything that is not
 * a provisional question (a void recorded on the chain cannot be undone), not voided by the final score as a
 * conflict, or whose two sources answer the question differently. Applying clears the void and settles through the
 * ordinary path (`settleByFeed`, then `settleProvisional`): one pending proposal per transfer, confirmed by each
 * debtor as usual. Nobody is notified again: the notice after the backstop went out with the void, once.
 */
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { marketById, positionsOf, VOID_OUTCOME } from "@/lib/ledger/markets";
import { settleByFeed } from "@/lib/sports";
import { outcomeFor, outcomesAgree } from "@/lib/sports/results";

async function main(): Promise<void> {
  const [dareId, flag] = process.argv.slice(2);
  const apply = flag === "--apply";
  if (!dareId) throw new Error("usage: resettle-feed.ts <dareId> [--apply]");
  const d = await marketById(dareId);
  if (!d) throw new Error("no such question");
  const refuse = (why: string) => {
    throw new Error(`refused: ${why}`);
  };
  if (d.onchainId) refuse("it is on the chain, where a recorded void cannot be undone");
  if (d.resolvedBy !== "feed" || d.feedEnding !== "conflict" || d.resolvedOutcome !== VOID_OUTCOME) refuse(`it did not end as the final score's conflict (resolved_by ${d.resolvedBy}, ending ${d.feedEnding})`);
  if (!d.templateId) refuse("it is not a game's question");
  const [row] = await db.select({ template: schema.publicQuestions, game: schema.sportsGames }).from(schema.publicQuestions).innerJoin(schema.sportsGames, eq(schema.sportsGames.id, schema.publicQuestions.gameId)).where(eq(schema.publicQuestions.id, d.templateId!)).limit(1);
  if (!row) refuse("its game is gone");
  const { template, game } = row!;
  if (game.homeScore === null || game.awayScore === null || game.checkHomeScore === null || game.checkAwayScore === null) refuse("one of the two finals is missing");
  const final = { home: game.homeScore!, away: game.awayScore! };
  const check = { home: game.checkHomeScore!, away: game.checkAwayScore! };
  if (!outcomesAgree(template, final, check)) refuse("the two sources answer the question differently, which is a real conflict");
  const scored = outcomeFor(template, final);
  if (!scored || scored.tie) refuse("the final does not decide it");
  const positions = await positionsOf(d.id);
  console.log(JSON.stringify({ dareId: d.id, title: d.title, key: template.key, final, check, outcome: String(scored!.outcome), in: positions.length, apply }, null, 2));
  if (!apply) {
    console.log("dry run: nothing changed. Run again with --apply on the owner's go-ahead.");
    return;
  }
  await db.update(schema.dares).set({ resolvedAt: null, resolvedBy: null, resolvedOutcome: null, rulingText: null, rulingHash: null, feedEnding: null }).where(eq(schema.dares.id, d.id));
  const fresh = await marketById(d.id);
  const r = await settleByFeed(fresh!, template, game, { outcome: scored!.outcome, ending: "agreed" }, new Date());
  const after = await marketById(d.id);
  console.log(JSON.stringify({ settled: !r.voided, resolvedBy: after?.resolvedBy, outcome: String(after?.resolvedOutcome), ending: after?.feedEnding }, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
