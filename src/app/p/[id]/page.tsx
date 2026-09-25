import { notFound, redirect } from "next/navigation";
import { MarketCardFrom } from "@/components/markets/market-card-from";
import { Avatar } from "@/components/ledger/avatar";
import { CloseObligation } from "@/components/ledger/close-obligation";
import { CoveredCard } from "@/components/ledger/covered-card";
import { NetObligations, type NetLine } from "@/components/ledger/net-obligations";
import { PersonHeader } from "@/components/ledger/person-header";
import { RallyStrip } from "@/components/ledger/rally-strip";
import { ActionArea, Screen, TopBar } from "@/components/ledger/screen";
import { ButtonLink } from "@/components/ui/button";
import { currentUser } from "@/lib/auth/session";
import { chainId, ledgerAddress } from "@/lib/chain/contracts";
import { ledgerDomain } from "@/lib/chain/typed-data";
import { filterByContext, personView, rallyRows, userById, type NettableLine } from "@/lib/ledger/person";
import { storageConfigured } from "@/lib/media/storage";
import { SharedContextBand } from "@/components/ledger/shared-context-band";
import { gotSentence, possessive } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { formatMoney, unitWords } from "@/lib/ui/units";
import { viewerClock } from "@/lib/ui/zone";

/** "two beers", or "$40": what a unit reads as in a sentence. */
function words(d: NettableLine["denomination"], qty: bigint): string {
  return d.monetary ? formatMoney(qty) : unitWords(d, qty);
}

/** What a card needs of a unit, and nothing else: the row carries a Buffer (its onchain id) that has no business crossing to the client. */
function unitForCard(d: NettableLine["denomination"]) {
  return { id: d.id, label: d.label, pluralLabel: d.pluralLabel, quantifiable: d.quantifiable, monetary: d.monetary, template: d.template, markKind: d.markKind, markValue: d.markValue };
}

/** One line per unit that goes both ways, in the words of the header (docs/design.md 2.1), for the netting row. */
function netLines(view: { nettable: NettableLine[] }, meName: string, themName: string): NetLine[] {
  return view.nettable.map((n) => {
    const left = n.meOwes - n.theyOwe;
    const where = n.groupLabel ? `, in ${n.groupLabel}` : "";
    return {
      groupId: n.groupId,
      denomId: n.denomId,
      cancels: words(n.denomination, n.cancels),
      both: `You've got ${themName} ${words(n.denomination, n.meOwes)} and ${possessive(themName)} got you ${words(n.denomination, n.theyOwe)}${where}.`,
      after: left === 0n ? `After this you two are even on these.` : left > 0n ? `After this, you've got ${themName} ${words(n.denomination, left)}.` : `After this, ${possessive(themName)} got you ${words(n.denomination, -left)}.`,
    };
  });
}

export const dynamic = "force-dynamic";

export default async function PersonPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string }> }) {
  const clock = await viewerClock();
  const me = await currentUser();
  if (!me) redirect("/");
  const { id } = await params;
  // You are not a person you have something between you with: your own account lives on the You tab.
  if (id === me.id) redirect("/you");
  const them = await userById(id);
  if (!them) notFound();

  const view = await personView(me, them);
  const domain = ledgerDomain(chainId(), ledgerAddress());
  const photosOn = storageConfigured();
  const rally = rallyRows(view.rally.pickups, me.id, them.id);
  const wanted = (await searchParams).c;
  const chosen = view.contexts.find((c) => c.groupId === wanted);
  const timeline = filterByContext(view.timeline, chosen?.groupId);
  const byId = new Map<string, { id: string; displayName: string }>([
    [me.id, me],
    [them.id, them],
  ]);

  return (
    <Screen>
      <TopBar back />
      <div className="flex flex-col gap-6 py-2">
        <div className="flex items-center gap-4">
          <Avatar name={them.displayName} hue={hueFor(them.id)} size={56} />
          <h1 className="text-body-strong text-ink">{them.displayName}</h1>
        </div>
        <PersonHeader me={me} them={them} theirs={view.header.theirs} yours={view.header.yours} />
        {view.nettable.length > 0 ? <NetObligations otherId={them.id} lines={netLines(view, me.displayName, them.displayName)} domain={domain} /> : null}
        <SharedContextBand personId={them.id} contexts={view.contexts} selectedId={chosen?.groupId ?? null} />
        {timeline.length === 0 ? (
          <p className="text-body text-ink-2">Nothing between you two yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {timeline.map((e) => {
              if (e.kind === "market") return <MarketCardFrom key={`m-${e.market.dare.id}`} m={e.market} viewerId={me.id} clock={clock} consequenceStates={view.consequenceStates} close={{ domain, photosOn }} />;
              if (e.kind === "proposal") {
                const debtor = byId.get(e.proposal.fromUser ?? "");
                const creditor = byId.get(e.proposal.toUser ?? "");
                if (!debtor || !creditor) return null;
                return (
                  <CoveredCard
                    clock={clock}
                    key={`p-${e.proposal.id}`}
                    viewerId={me.id}
                    creditor={creditor}
                    debtor={debtor}
                    denomination={e.denomination}
                    quantity={e.proposal.quantity ?? 1n}
                    amountCents={e.proposal.amountCents}
                    memo={e.proposal.memo}
                    at={e.at}
                    groupName={e.groupName}
                    state="pending"
                    href={debtor.id === me.id ? `/o/${e.proposal.id}` : undefined}
                  />
                );
              }
              const debtor = byId.get(e.obligation.fromUser);
              const creditor = byId.get(e.obligation.toUser);
              if (!debtor || !creditor) return null;
              const total = e.obligation.quantity ?? 1n;
              const state = e.open === 0n ? (e.forgiven > 0n && e.settled === 0n ? "forgiven" : "settled") : e.open < total ? "partly" : "open";
              const card = {
                clock,
                viewerId: me.id,
                creditor,
                debtor,
                denomination: unitForCard(e.denomination),
                quantity: total,
                amountCents: e.obligation.amountCents,
                memo: e.obligation.memo,
                at: e.at,
                groupName: e.groupName,
                state,
                photo: e.obligation.mediaId ? { thumb: `/api/media/${e.obligation.mediaId}?size=thumb`, full: `/api/media/${e.obligation.mediaId}` } : undefined,
              } as const;
              // The creditor closes what they are owed (Principle 2 in reverse: only the person owed can end it), from the row (6.3).
              if (e.open > 0n && creditor.id === me.id) {
                return <CloseObligation key={e.obligation.id} obligationId={e.obligation.id} card={card} sentence={gotSentence(debtor, creditor, me.id)} what={e.obligation.memo ?? words(e.denomination, e.open)} domain={domain} photosOn={photosOn} />;
              }
              return <CoveredCard key={e.obligation.id} {...card} />;
            })}
          </div>
        )}
        {rally ? <RallyStrip rows={rally} people={new Map([[me.id, { name: me.displayName, hue: hueFor(me.id) }], [them.id, { name: them.displayName, hue: hueFor(them.id) }]])} sentence={view.rally.sentence} /> : null}
      </div>
      <ActionArea>
        <ButtonLink href={`/new?person=${them.id}`} variant="primary" className="w-full">
          I got this one
        </ButtonLink>
      </ActionArea>
    </Screen>
  );
}

