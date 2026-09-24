import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import type { Address } from "viem";
import { db, schema } from "@/db";
import { Avatar } from "@/components/ledger/avatar";
import { ConfirmAll, type ConfirmAllPayload } from "@/components/ledger/confirm-all";
import { CoveredCard } from "@/components/ledger/covered-card";
import { Screen, TopBar } from "@/components/ledger/screen";
import { currentUser } from "@/lib/auth/session";
import { boundPendingForDebtor } from "@/lib/ledger/claims";
import { denominationsByIds } from "@/lib/ledger/denominations";
import { CONFIRM_MANY_MAX, confirmManyTypedData } from "@/lib/ledger/proposals";
import { hueFor } from "@/lib/ui/hue";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

/**
 * The claimant's first screen (PLANNING.md section 4): what was waiting for someone before they had an
 * account, grouped by who it is with, each one open to a yes or a no, and one yes for all of it at the top.
 * This is the payoff for signing up. Someone with nothing waiting never sees an empty inbox: they go home,
 * to the ordinary empty state (docs/design.md 3.10).
 */
export default async function WelcomePage() {
  const clock = await viewerClock();
  const me = await currentUser();
  if (!me) redirect("/");
  const rows = await boundPendingForDebtor(me.id);
  if (rows.length === 0) redirect("/");

  const creditorIds = Array.from(new Set(rows.map((r) => r.toUser).filter((x): x is string => Boolean(x))));
  const creditors = await db.select().from(schema.users).where(inArray(schema.users.id, creditorIds));
  const creditorById = new Map(creditors.map((c) => [c.id, c]));
  const denoms = await denominationsByIds(Array.from(new Set(rows.map((r) => r.denomId))));
  const groupIds = Array.from(new Set(rows.map((r) => r.groupId)));
  const groups = await db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).where(inArray(schema.groups.id, groupIds));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  // One approval covers at most CONFIRM_MANY_MAX, oldest first. The rest are still here afterwards.
  const batch = rows.slice(0, CONFIRM_MANY_MAX);
  const typed = confirmManyTypedData(batch, new Map(creditors.map((c) => [c.id, c.ledgerWallet as Address])));
  const payload: ConfirmAllPayload = {
    proposalIds: batch.map((r) => r.id),
    ledgerWallet: me.ledgerWallet,
    domain: typed.domain,
    message: { ...typed.message, qtys: typed.message.qtys.map((q) => q.toString()) },
  };

  // Grouped by who it is with, in the order each person first appears.
  const sections: Array<{ creditorId: string; rows: typeof rows }> = [];
  for (const r of rows) {
    if (!r.toUser) continue;
    const s = sections.find((x) => x.creditorId === r.toUser);
    if (s) s.rows.push(r);
    else sections.push({ creditorId: r.toUser, rows: [r] });
  }

  return (
    <Screen>
      <TopBar back title="Dareful" />
      <div className="flex flex-col gap-7 py-4">
        <div className="flex flex-col gap-3">
          <h1 className="text-display-xl text-ink">{rows.length === 1 ? "Someone got one for you." : "Your friends kept track."}</h1>
          <p className="text-body text-ink-2">
            {rows.length === 1 ? "Here’s what was waiting." : `Here’s what was waiting: ${rows.length} of them.`} Say yes to what’s right. Tap any one to answer it on its own.
          </p>
        </div>
        <ConfirmAll payload={payload} />
        {rows.length > batch.length ? <p className="text-caption text-ink-3">That covers the first {batch.length}. The rest will still be here.</p> : null}

        {sections.map((s) => {
          const creditor = creditorById.get(s.creditorId);
          if (!creditor) return null;
          return (
            <section key={s.creditorId} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={creditor.displayName} hue={hueFor(creditor.id)} size={32} />
                <h2 className="text-body-strong text-ink">With {creditor.displayName}</h2>
              </div>
              {s.rows.map((r) => {
                const denomination = denoms.get(r.denomId);
                if (!denomination) return null;
                return (
                  <div key={r.id} className="flex flex-col gap-1">
                    <CoveredCard
                      clock={clock}
                      viewerId={me.id}
                      creditor={creditor}
                      debtor={me}
                      denomination={denomination}
                      quantity={r.quantity ?? 1n}
                      amountCents={r.amountCents}
                      memo={r.memo}
                      at={r.createdAt}
                      groupName={groupName.get(r.groupId) ?? null}
                      state="pending"
                      href={`/o/${r.id}`}
                    />
                    {r.concededAt ? <p className="px-1 text-caption text-ink-3">You said “fine, you got me.”</p> : null}
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>
    </Screen>
  );
}
