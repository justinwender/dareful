import { notFound, redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { Avatar } from "@/components/ledger/avatar";
import { CoveredCard } from "@/components/ledger/covered-card";
import { GhostActions, type MergeOption } from "@/components/ledger/ghost-actions";
import { CoverSheet } from "@/components/ledger/cover-sheet";
import { Screen, TopBar } from "@/components/ledger/screen";
import { currentUser } from "@/lib/auth/session";
import { claimById, ghostsForCreator, proposalsWithClaim } from "@/lib/ledger/claims";
import { denominationsByIds, denominationsForGroup, recentDenominationsForUser } from "@/lib/ledger/denominations";
import { groupsForUser, peopleForUser } from "@/lib/ledger/groups";
import { hueFor } from "@/lib/ui/hue";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

/**
 * The person view for someone who has not joined yet. Everything on it is provisional: real to the person who
 * added them and to nobody else, until they say it is right. There is no open header, because nothing has
 * minted, and the timeline orders by the offchain timestamp like every other.
 */
export default async function GhostPage({ params }: { params: Promise<{ id: string }> }) {
  const clock = await viewerClock();
  const me = await currentUser();
  if (!me) redirect("/");
  const { id } = await params;
  const ghost = await claimById(id);
  // A ghost is visible to the person who added them. Anyone else gets nothing, not a hint that they exist.
  if (!ghost || ghost.createdBy !== me.id) notFound();
  // Once they have joined, this page is their real one.
  if (ghost.claimedBy) redirect(`/p/${ghost.claimedBy}`);
  if (ghost.id !== id) redirect(`/p/c/${ghost.id}`); // followed a merge to the survivor

  const [rows, people, ghosts, groups, recentUnits] = await Promise.all([proposalsWithClaim(me.id, ghost.id), peopleForUser(me.id), ghostsForCreator(me.id), groupsForUser(me.id), recentDenominationsForUser(me.id)]);
  // The units between you and this ghost, for the cover sheet (3.43): the pair's dyad's, when one exists.
  const dyad = groups.find((g) => g.isDyad && g.members.some((m) => m.claimId === ghost.id)) ?? null;
  const dyadUnits = dyad ? await denominationsForGroup(dyad.id) : [];
  const asCoverUnit = (u: (typeof recentUnits)[number]) => ({ id: u.id, label: u.label, pluralLabel: u.pluralLabel, template: u.template, quantifiable: u.quantifiable, markKind: u.markKind, markValue: u.markValue });
  const denoms = await denominationsByIds(Array.from(new Set(rows.map((r) => r.denomId))));
  const groupIds = Array.from(new Set(rows.map((r) => r.groupId)));
  const groupNames = new Map<string, string | null>();
  if (groupIds.length > 0) {
    const gs = await db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).where(inArray(schema.groups.id, groupIds));
    for (const g of gs) groupNames.set(g.id, g.name);
  }

  const mergeOptions: MergeOption[] = [
    ...people.map((p) => ({ kind: "user" as const, userId: p.user.id, displayName: p.user.displayName })),
    ...ghosts.filter((g) => g.id !== ghost.id).map((g) => ({ kind: "claim" as const, claimId: g.id, displayName: g.displayName })),
  ];
  const them = { id: ghost.id, displayName: ghost.displayName, ghost: true };

  return (
    <Screen>
      <TopBar back info="person-ghost" />
      <div className="flex flex-col gap-6 py-2">
        <div className="flex items-center gap-4">
          <Avatar name={ghost.displayName} hue="stone" size={56} ghost />
          <div className="flex flex-col">
            <h1 className="text-body-strong text-ink">{ghost.displayName}</h1>
            <span className="text-caption text-ink-3">not here yet</span>
          </div>
        </div>
        <GhostActions claimId={ghost.id} name={ghost.displayName} mergeOptions={mergeOptions} />
        {rows.length === 0 ? (
          <p className="text-body text-ink-2">Nothing between you two yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r) => {
              const denomination = denoms.get(r.denomId);
              if (!denomination) return null;
              const ghostIsDebtor = r.fromClaim === ghost.id;
              return (
                <div key={r.id} className="flex flex-col gap-1">
                  <CoveredCard
                    clock={clock}
                    viewerId={me.id}
                    creditor={ghostIsDebtor ? me : them}
                    debtor={ghostIsDebtor ? them : me}
                    denomination={denomination}
                    quantity={r.quantity ?? 1n}
                    amountCents={r.amountCents}
                    memo={r.memo}
                    at={r.createdAt}
                    groupName={groupNames.get(r.groupId) ?? null}
                    state="pending"
                  />
                  {r.status === "declined" ? <p className="px-1 text-caption text-ink-3">Closed.</p> : null}
                  {r.status === "pending" && r.concededAt ? <p className="px-1 text-caption text-ink-3">{ghost.displayName} said “fine, you got me.”</p> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <CoverSheet person={{ id: ghost.id, displayName: ghost.displayName, kind: "claim", hue: "stone", ghost: true }} units={dyadUnits.filter((u) => !u.monetary).map(asCoverUnit)} recent={recentUnits.filter((u) => !u.monetary).map(asCoverUnit)} viewer={{ id: me.id, displayName: me.displayName, hue: hueFor(me.id) }} />
    </Screen>
  );
}
