/**
 * What share of the questions locked in a window stays on the chain, under each rule (the games-and-the-reveal
 * round, 2026-10-07, section 0). Read-only: Postgres for the questions and their entries, the indexer for who each
 * set had registered on the chain at the moment it locked.
 *
 *   as it happened   whether the lock went to the chain then (`dares.onchain_id`)
 *   last round       the second-pass rule: every entry signed, and the set's registered voters, the people in and
 *                    the asker exactly the people in (`chainCarries`), else decided here as proposals
 *   this round       every entry signed: the set's own group when it is exactly the people in, else the question's
 *                    own group of exactly them (`ensureQuestionGroupOnchain`)
 *
 * A question with a guest in it stays proposals under every rule: a guest has no wallet, and nothing goes on the
 * chain for a position nobody signed (PLANNING.md section 4).
 *
 *   npx tsx --env-file=.env.local scripts/ops/chain-share.ts [days]
 */
import { and, gte, inArray, isNotNull, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { groupOnchainId } from "@/lib/ledger/ids";
import { chainCarries } from "@/lib/ledger/provisional";

const days = Number(process.argv[2] ?? 14);

async function membersAt(groupIds: string[]): Promise<Map<string, Array<{ governance: string; addedAt: number }>>> {
  const url = process.env.ENVIO_GRAPHQL_URL;
  if (!url) throw new Error("ENVIO_GRAPHQL_URL is not set");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: `query Members($g: [String!]) { Member(where: { group_id: { _in: $g } }, limit: 1000) { group_id governance addedAt } }`, variables: { g: groupIds.map((g) => g.toLowerCase()) } }),
  });
  const json = z.object({ data: z.object({ Member: z.array(z.object({ group_id: z.string(), governance: z.string(), addedAt: z.number() })) }) }).parse(await res.json());
  const out = new Map<string, Array<{ governance: string; addedAt: number }>>();
  for (const m of json.data.Member) out.set(m.group_id, [...(out.get(m.group_id) ?? []), { governance: m.governance, addedAt: m.addedAt }]);
  return out;
}

async function main() {
  const since = new Date(Date.now() - days * 86_400_000);
  const locked = await db.select().from(schema.dares).where(and(isNotNull(schema.dares.lockedAt), gte(schema.dares.lockedAt, since)));
  const ids = locked.map((d) => d.id);
  const positions = ids.length ? await db.select().from(schema.darePositions).where(and(inArray(schema.darePositions.dareId, ids), isNotNull(schema.darePositions.acknowledgedAt), isNull(schema.darePositions.dismissedAt))) : [];
  const userIds = Array.from(new Set([...positions.map((p) => p.userId), ...locked.map((d) => d.creatorId)].filter((x): x is string => x !== null)));
  const users = userIds.length ? await db.select({ id: schema.users.id, governance: schema.users.governanceWallet, excluded: schema.users.excludedFromCounts, dynamicId: schema.users.dynamicUserId }).from(schema.users).where(inArray(schema.users.id, userIds)) : [];
  const userOf = new Map(users.map((u) => [u.id, u]));
  const registered = await membersAt(Array.from(new Set(locked.map((d) => groupOnchainId(d.groupId)))));

  type Row = { id: string; title: string; counted: boolean; asHappened: boolean; lastRound: boolean; thisRound: boolean; why: string };
  const rows: Row[] = [];
  for (const d of locked) {
    const mine = positions.filter((p) => p.dareId === d.id);
    if (mine.length < 2) continue;
    // The test suites' own questions (temporary accounts, swept after every run) are nobody's: they are not in the window's numbers.
    if (userOf.get(d.creatorId)?.dynamicId.startsWith("tmp-check:")) continue;
    const signed = mine.every((p) => p.userId !== null && p.enterSignature !== null);
    const lockedAtSec = Math.floor((d.lockedAt as Date).getTime() / 1000);
    const atLock = (registered.get(groupOnchainId(d.groupId).toLowerCase()) ?? []).filter((m) => m.addedAt <= lockedAtSec).map((m) => m.governance);
    const inIt = mine.map((p) => (p.userId ? userOf.get(p.userId)?.governance : undefined)).filter((x): x is string => Boolean(x));
    const asker = userOf.get(d.creatorId)?.governance ?? "";
    const carries = signed && chainCarries({ registered: atLock, inIt, asker });
    const askerIn = mine.some((p) => p.userId === d.creatorId);
    rows.push({
      id: d.id,
      title: d.title.slice(0, 48),
      counted: !(userOf.get(d.creatorId)?.excluded ?? false),
      asHappened: d.onchainId !== null,
      lastRound: carries,
      thisRound: signed,
      why: !signed ? "a guest or an unsigned entry" : carries ? "its set is exactly the people in" : `its set had ${atLock.length} registered${askerIn ? "" : ", and the asker isn't in"}`,
    });
  }
  const share = (xs: Row[], k: "asHappened" | "lastRound" | "thisRound") => `${xs.filter((r) => r[k]).length} of ${xs.length}`;
  for (const r of rows) console.log(`${r.id}  ${r.counted ? "counted " : "excluded"}  then ${r.asHappened ? "chain" : "here "}  last ${r.lastRound ? "chain" : "here "}  now ${r.thisRound ? "chain" : "here "}  ${r.why}  ${r.title}`);
  const counted = rows.filter((r) => r.counted);
  console.log(`\nLocked in the last ${days} days with two or more in: ${rows.length} (${counted.length} counted, test accounts left out).`);
  for (const [label, xs] of [["all", rows], ["counted", counted]] as const) {
    console.log(`${label}: as it happened ${share(xs, "asHappened")}; last round's rule ${share(xs, "lastRound")}; this round's ${share(xs, "thisRound")}`);
  }
  process.exit(0);
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
