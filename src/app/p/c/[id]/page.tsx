import { notFound, redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { Avatar } from "@/components/ledger/avatar";
import { CoveredCard } from "@/components/ledger/covered-card";
import { GhostActions, type MergeOption } from "@/components/ledger/ghost-actions";
import { ActionArea, Screen, TopBar } from "@/components/ledger/screen";
import { ButtonLink } from "@/components/ui/button";
import { currentUser } from "@/lib/auth/session";
import { claimById, ghostsForCreator, proposalsWithClaim } from "@/lib/ledger/claims";
import { denominationsByIds } from "@/lib/ledger/denominations";
import { peopleForUser } from "@/lib/ledger/groups";
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

  const [rows, people, ghosts] = await Promise.all([proposalsWithClaim(me.id, ghost.id), peopleForUser(me.id), ghostsForCreator(me.id)]);
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
      <TopBar back={{ href: "/", label: "Back" }} />
      <div className="flex flex-col gap-6 py-2">
        <div className="flex items-center gap-4">
          <Avatar name={ghost.displayName} hue="stone" size={56} ghost />
          <div className="flex flex-col">
            <h1 className="text-display text-ink">{ghost.displayName}</h1>
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
      <ActionArea>
        <ButtonLink href={`/new?ghost=${ghost.id}`} variant="primary" className="w-full">
          I got this one
        </ButtonLink>
      </ActionArea>
    </Screen>
  );
}
