/**
 * The person view: header (open obligations expected to settle, netted per unit between the two people),
 * timeline (every event between them, ordered by the offchain timestamp, never the chain timestamp), and
 * the soft-parity footer drawn from what nobody expects to settle.
 */
import { and, desc, eq, inArray, or } from "drizzle-orm";
import { db, schema } from "@/db";
import type { DenominationRow } from "./denominations";
import { denominationsByIds } from "./denominations";
import { obligationsById, openBetween, type EnvioObligation } from "./envio";
import { bytes16ToUuid, uuidToBytes16 } from "./ids";
import { pendingBetween, type ProposalRow } from "./proposals";

export type UserRow = typeof schema.users.$inferSelect;
export type ObligationRow = typeof schema.obligations.$inferSelect;

/** One unit between two people after netting the two directions. `owner` is who picks up next (the debtor). */
export type HeaderLine = {
  denomination: DenominationRow;
  ownerId: string; // debtor after netting
  quantity: bigint; // units; for money, cents
  amountCents: bigint | null; // magnitude for monetary units
};

export type PersonHeader = {
  theirs: HeaderLine[]; // they pick up next
  yours: HeaderLine[]; // you pick up next
};

/** Groups Envio's open edges by (unit, direction), nets the two directions, and drops zeros. */
export function netHeader(me: UserRow, them: UserRow, open: EnvioObligation[], rows: Map<string, ObligationRow>, denoms: Map<string, DenominationRow>, settleExpected: boolean): PersonHeader {
  const byDenom = new Map<string, { meOwes: bigint; theyOwe: bigint }>();
  for (const e of open) {
    const row = rows.get(bytes16ToUuid(e.id));
    if (!row || row.settleExpected !== settleExpected) continue;
    const bucket = byDenom.get(row.denomId) ?? { meOwes: 0n, theyOwe: 0n };
    const remaining = BigInt(e.remaining);
    if (e.debtor === me.ledgerWallet) bucket.meOwes += remaining;
    else bucket.theyOwe += remaining;
    byDenom.set(row.denomId, bucket);
  }
  const theirs: HeaderLine[] = [];
  const yours: HeaderLine[] = [];
  for (const [denomId, b] of byDenom) {
    const denomination = denoms.get(denomId);
    if (!denomination) continue;
    const net = b.theyOwe - b.meOwes;
    if (net === 0n) continue; // "even," never a zero
    const line: HeaderLine = {
      denomination,
      ownerId: net > 0n ? them.id : me.id,
      quantity: net > 0n ? net : -net,
      amountCents: denomination.monetary ? (net > 0n ? net : -net) : null,
    };
    (net > 0n ? theirs : yours).push(line);
  }
  const order = (l: HeaderLine) => (l.denomination.monetary ? 2 : l.denomination.template && l.denomination.template !== "usd" ? 0 : 1);
  theirs.sort((x, y) => order(x) - order(y));
  yours.sort((x, y) => order(x) - order(y));
  return { theirs, yours };
}

export type TimelineEvent =
  | { kind: "obligation"; at: Date; obligation: ObligationRow; denomination: DenominationRow; open: bigint; settled: bigint; forgiven: bigint; netted: bigint; groupName: string | null }
  | { kind: "proposal"; at: Date; proposal: ProposalRow; denomination: DenominationRow; groupName: string | null };

export type PersonView = {
  me: UserRow;
  them: UserRow;
  header: PersonHeader;
  rally: { pickups: Array<{ userId: string; at: Date }>; sentence: string | null };
  timeline: TimelineEvent[];
};

export async function personView(me: UserRow, them: UserRow): Promise<PersonView> {
  const [open, obligations, pending] = await Promise.all([
    openBetween(me.ledgerWallet, them.ledgerWallet),
    db
      .select()
      .from(schema.obligations)
      .where(
        or(
          and(eq(schema.obligations.fromUser, me.id), eq(schema.obligations.toUser, them.id)),
          and(eq(schema.obligations.fromUser, them.id), eq(schema.obligations.toUser, me.id)),
        ),
      )
      .orderBy(desc(schema.obligations.createdAt)),
    pendingBetween(me.id, them.id),
  ]);

  const rows = new Map(obligations.map((o) => [o.id, o]));
  const denomIds = Array.from(new Set([...obligations.map((o) => o.denomId), ...pending.map((p) => p.denomId)]));
  const denoms = await denominationsByIds(denomIds);
  const indexed = await obligationsById(obligations.map((o) => uuidToBytes16(o.id)));
  const groupIds = Array.from(new Set([...obligations.map((o) => o.groupId), ...pending.map((p) => p.groupId)]));
  const groupNames = new Map<string, string | null>();
  if (groupIds.length > 0) {
    const groups = await db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).where(inArray(schema.groups.id, groupIds));
    for (const g of groups) groupNames.set(g.id, g.name);
  }

  const header = netHeader(me, them, open, rows, denoms, true);

  // Soft parity: the last twelve pick-ups nobody expects to settle, as a sequence, never a count.
  const pickups = obligations
    .filter((o) => !o.settleExpected)
    .slice(0, 12)
    .map((o) => ({ userId: o.toUser, at: o.createdAt })); // the creditor picked it up
  const mine = pickups.filter((p) => p.userId === me.id).length;
  const sentence =
    pickups.length < 4
      ? null
      : mine > pickups.length - mine
        ? "You've covered a few more of these lately."
        : mine < pickups.length - mine
          ? `${them.displayName} has covered a few more of these lately.`
          : "You two have been trading these evenly.";

  const timeline: TimelineEvent[] = [];
  for (const o of obligations) {
    const denomination = denoms.get(o.denomId);
    if (!denomination) continue;
    const e = indexed.get(uuidToBytes16(o.id));
    timeline.push({
      kind: "obligation",
      at: o.createdAt,
      obligation: o,
      denomination,
      open: e ? BigInt(e.remaining) : (o.quantity ?? 1n),
      settled: e ? BigInt(e.settled) : 0n,
      forgiven: e ? BigInt(e.forgiven) : 0n,
      netted: e ? BigInt(e.netted) : 0n,
      groupName: groupNames.get(o.groupId) ?? null,
    });
  }
  for (const p of pending) {
    const denomination = denoms.get(p.denomId);
    if (!denomination) continue;
    timeline.push({ kind: "proposal", at: p.createdAt, proposal: p, denomination, groupName: groupNames.get(p.groupId) ?? null });
  }
  // The offchain timestamp, never the chain timestamp.
  timeline.sort((x, y) => y.at.getTime() - x.at.getTime());

  return { me, them, header, rally: { pickups, sentence }, timeline };
}

export async function userById(id: string): Promise<UserRow | null> {
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, id)).limit(1);
  return row ?? null;
}
