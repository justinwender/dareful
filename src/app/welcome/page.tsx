import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import type { Address } from "viem";
import { db, schema } from "@/db";
import { Avatar } from "@/components/ledger/avatar";
import { ConfirmAll, type ConfirmAllPayload } from "@/components/ledger/confirm-all";
import { CoveredCard } from "@/components/ledger/covered-card";
import { Screen, TopBar } from "@/components/ledger/screen";
import { currentUser } from "@/lib/auth/session";
import { boundPendingForDebtor, linkEntriesFor } from "@/lib/ledger/claims";
import { contracts } from "@/lib/chain/contracts";
import { daresDomain, Stalemate } from "@/lib/chain/typed-data";
import { dareOnchainId } from "@/lib/ledger/ids";
import { answersOf, confidenceFor, unitOf } from "@/lib/ledger/markets";
import { unitPhrase } from "@/lib/ledger/number-axis";
import { inkOf } from "@/lib/ui/ink";
import { markRefOf } from "@/lib/ui/mark";
import { formatMoney, unitWords } from "@/lib/ui/units";
import type { LinkEntryRow } from "@/components/ledger/confirm-all";
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
  const [rows, linkEntries] = await Promise.all([boundPendingForDebtor(me.id), linkEntriesFor(me.id)]);
  if (rows.length === 0 && linkEntries.length === 0) redirect("/");
  // Entries made from a link (3.17, 3.38): each as a claim row whose line is the entry, pressed by default; keeping one signs it, leaving it out sends it back to a ghost under the typed name.
  const entryDenoms = await denominationsByIds(Array.from(new Set(linkEntries.map((e) => e.dare.denomId))));
  const { chainId, dares } = contracts();
  const entries: LinkEntryRow[] = linkEntries.flatMap((e) => {
    const denomination = entryDenoms.get(e.dare.denomId);
    if (!denomination) return [];
    const unit = unitOf(e.dare);
    const answers = answersOf(e.dare);
    const said = answers ? `You’re in: ${answers.find((a) => a.index === Number(e.value))?.text ?? "?"}` : unit ? `You’re in at ${unitPhrase(e.value, unit)}` : `You’re in at ${Number(e.value) / 100}%`;
    const stakeWords = denomination.monetary ? formatMoney(e.stake) : unitWords(denomination, e.stake);
    return [{ dareId: e.dare.id, title: e.dare.title, line: `${said} · ${stakeWords}`, name: e.name, mark: markRefOf(e.dare), ink: inkOf(e.dare), ledgerWallet: me.ledgerWallet, domain: daresDomain(chainId, dares.address), dareOnchainId: dareOnchainId(e.dare.id), stalemate: e.dare.stalemate === "void" ? Stalemate.Void : Stalemate.Arbitrate, confidenceBps: confidenceFor(e.dare), stake: e.stake.toString(), value: e.value.toString(), position: answers ? { stake: e.stake.toString(), answer: Number(e.value) } : unit ? { stake: e.stake.toString(), number: e.value.toString() } : { stake: e.stake.toString(), valueBps: Number(e.value) } }];
  });

  const creditorIds = Array.from(new Set(rows.map((r) => r.toUser).filter((x): x is string => Boolean(x))));
  const creditors = await db.select().from(schema.users).where(inArray(schema.users.id, creditorIds));
  const creditorById = new Map(creditors.map((c) => [c.id, c]));
  const denoms = await denominationsByIds(Array.from(new Set(rows.map((r) => r.denomId))));
  const groupIds = Array.from(new Set(rows.map((r) => r.groupId)));
  const groups = await db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).where(inArray(schema.groups.id, groupIds));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  // One approval covers at most CONFIRM_MANY_MAX, oldest first. The rest are still here afterwards.
  const batch = rows.slice(0, CONFIRM_MANY_MAX);
  const typed = batch.length > 0 ? confirmManyTypedData(batch, new Map(creditors.map((c) => [c.id, c.ledgerWallet as Address]))) : null;
  const payload: ConfirmAllPayload | null = typed
    ? {
        proposalIds: batch.map((r) => r.id),
        ledgerWallet: me.ledgerWallet,
        domain: typed.domain,
        message: { ...typed.message, qtys: typed.message.qtys.map((q) => q.toString()) },
      }
    : null;
  const total = rows.length + entries.length;

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
          <h1 className="text-serif-xl text-ink">{rows.length === 0 ? "Your entries were waiting." : rows.length === 1 ? "Someone got one for you." : "Your friends kept track."}</h1>
          <p className="text-body text-ink-2">
            {total === 1 ? "Here’s what was waiting." : `Here’s what was waiting: ${total} of them.`}
          </p>
        </div>
        <ConfirmAll payload={payload} entries={entries} />
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
