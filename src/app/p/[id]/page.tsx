import { notFound, redirect } from "next/navigation";
import { MarketCardFrom } from "@/components/markets/market-card-from";
import { Avatar } from "@/components/ledger/avatar";
import { CoveredCard } from "@/components/ledger/covered-card";
import { PersonHeader } from "@/components/ledger/person-header";
import { ActionArea, Screen, TopBar } from "@/components/ledger/screen";
import { ButtonLink } from "@/components/ui/button";
import { currentUser } from "@/lib/auth/session";
import { filterByContext, personView, userById } from "@/lib/ledger/person";
import { SharedContextBand } from "@/components/ledger/shared-context-band";
import { hueFor } from "@/lib/ui/hue";
import { viewerClock } from "@/lib/ui/zone";

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
          <h1 className="text-display text-ink">{them.displayName}</h1>
        </div>
        <PersonHeader me={me} them={them} theirs={view.header.theirs} yours={view.header.yours} />
        <SharedContextBand personId={them.id} contexts={view.contexts} selectedId={chosen?.groupId ?? null} />
        {timeline.length === 0 ? (
          <p className="text-body text-ink-2">Nothing between you two yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {timeline.map((e) => {
              if (e.kind === "market") return <MarketCardFrom key={`m-${e.market.dare.id}`} m={e.market} viewerId={me.id} clock={clock} />;
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
              return (
                <CoveredCard
                  clock={clock}
                  key={e.obligation.id}
                  viewerId={me.id}
                  creditor={creditor}
                  debtor={debtor}
                  denomination={e.denomination}
                  quantity={total}
                  amountCents={e.obligation.amountCents}
                  memo={e.obligation.memo}
                  at={e.at}
                  groupName={e.groupName}
                  state={state}
                />
              );
            })}
          </div>
        )}
        {view.rally.sentence ? <p className="text-body-sm text-ink-2">{view.rally.sentence}</p> : null}
      </div>
      <ActionArea>
        <ButtonLink href={`/new?person=${them.id}`} variant="primary" className="w-full">
          I got this one
        </ButtonLink>
      </ActionArea>
    </Screen>
  );
}

