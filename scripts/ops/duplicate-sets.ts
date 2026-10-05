/**
 * Lists the sets of people that have the same current members, accounts and guests alike (the first-contact round,
 * 2026-10-04), and what folding one into another would move. It only reads: the app already shows such sets as one
 * row (`oneRowPerPeople`) and sends a pair's next cover or question to one of them (`ensureDyad`), so nothing here is
 * needed for the screens. A fold is possible only when the set folded away has no state on the chain (no `onchain_id`
 * on the set or its units, no minted obligation) and no signed question still open or locked, since a question's
 * Create signature names its set and cannot be moved.
 *
 *   npx tsx --env-file=.env.local scripts/ops/duplicate-sets.ts
 */
import { sql } from "drizzle-orm";
import { db } from "@/db";

type Row = { group_id: string; key: string; is_dyad: boolean; named: boolean; created_at: Date; accounts: number; guests: number; onchain: boolean };

async function main(): Promise<void> {
  const sets = Array.from(
    await db.execute<Row>(sql`
      select g.id as group_id, g.is_dyad, g.name is not null as named, g.created_at, g.onchain_id is not null as onchain,
        string_agg(case when m.user_id is not null then 'u:' || m.user_id::text else 'c:' || m.claim_id::text end, ',' order by case when m.user_id is not null then 'u:' || m.user_id::text else 'c:' || m.claim_id::text end) as key,
        count(m.user_id)::int as accounts, count(m.claim_id)::int as guests
      from groups g join group_members m on m.group_id = g.id and m.left_at is null
      group by g.id
      having count(m.user_id) >= 2
    `),
  );
  const byKey = new Map<string, Row[]>();
  for (const s of sets) if (!s.named) byKey.set(s.key, [...(byKey.get(s.key) ?? []), s]);
  const out = [];
  for (const same of byKey.values()) {
    if (same.length < 2) continue;
    const ordered = [...same].sort((a, b) => Number(b.is_dyad) - Number(a.is_dyad) || new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const target = ordered[0] as Row;
    const rows = [];
    for (const s of ordered) {
      const [facts] = Array.from(
        await db.execute<{ open_signed: number; locked: number; ended: number; drafts: number; proposals: number; obligations: number; units: number; units_onchain: number }>(sql`
          select
            (select count(*)::int from dares d where d.group_id = ${s.group_id} and d.creator_signature is not null and d.locked_at is null and d.resolved_at is null) as open_signed,
            (select count(*)::int from dares d where d.group_id = ${s.group_id} and d.locked_at is not null and d.resolved_at is null) as locked,
            (select count(*)::int from dares d where d.group_id = ${s.group_id} and d.resolved_at is not null) as ended,
            (select count(*)::int from dares d where d.group_id = ${s.group_id} and d.creator_signature is null) as drafts,
            (select count(*)::int from obligation_proposals p where p.group_id = ${s.group_id}) as proposals,
            (select count(*)::int from obligations o where o.group_id = ${s.group_id}) as obligations,
            (select count(*)::int from denominations u where u.group_id = ${s.group_id}) as units,
            (select count(*)::int from denominations u where u.group_id = ${s.group_id} and u.onchain_id is not null) as units_onchain
        `),
      );
      const f = facts!;
      const foldable = s.group_id !== target.group_id && !s.onchain && f.obligations === 0 && f.units_onchain === 0 && f.open_signed === 0 && f.locked === 0;
      rows.push({ set: s.group_id, dyad: s.is_dyad, created: new Date(s.created_at).toISOString().slice(0, 16), accounts: s.accounts, guests: s.guests, onchain: s.onchain, ...f, role: s.group_id === target.group_id ? "the row shown, where the next question goes" : foldable ? `fold into ${target.group_id.slice(0, 8)}` : "cannot fold: state on the chain or a signed question still running" });
    }
    out.push({ people: target.key.split(",").length, sets: rows });
  }
  console.log(JSON.stringify(out, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
