import { redirect } from "next/navigation";
import { NewCoverForm, type GroupOption, type PersonOption } from "@/components/ledger/new-cover-form";
import { Screen, TopBar } from "@/components/ledger/screen";
import { currentUser } from "@/lib/auth/session";
import { claimById, ghostsForCreator } from "@/lib/ledger/claims";
import { denominationsForGroup, recentDenominationsForUser } from "@/lib/ledger/denominations";
import { groupsForUser, peopleForUser, setLabel } from "@/lib/ledger/groups";
import { userById } from "@/lib/ledger/person";

export const dynamic = "force-dynamic";

export default async function NewCoverPage({ searchParams }: { searchParams: Promise<{ person?: string; ghost?: string; group?: string; for?: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const sp = await searchParams;
  const [groups, people, ghosts, recent] = await Promise.all([groupsForUser(me.id), peopleForUser(me.id), ghostsForCreator(me.id), recentDenominationsForUser(me.id)]);
  const options: GroupOption[] = await Promise.all(
    groups.map(async (g) => ({
      id: g.id,
      name: g.name,
      // A set nobody named is shown by its people, here as everywhere (docs/decisions.md 2026-09-27); never the word Group.
      label: setLabel({ name: g.name, isDyad: g.isDyad, memberNames: g.members.filter((m) => m.userId).map((m) => m.displayName), viewerName: me.displayName }),
      isDyad: g.isDyad,
      memberIds: g.members.map((m) => m.userId).filter((x): x is string => Boolean(x)),
      ghostIds: g.members.map((m) => m.claimId).filter((x): x is string => Boolean(x)),
      units: (await denominationsForGroup(g.id)).map((u) => ({
        id: u.id,
        groupId: u.groupId,
        label: u.label,
        pluralLabel: u.pluralLabel,
        quantifiable: u.quantifiable,
        monetary: u.monetary,
        template: u.template,
        markKind: u.markKind,
        markValue: u.markValue,
      })),
    })),
  );
  // Account-holders first, then the people this person added who have not joined yet. Anyone else is
  // "someone new" in the form, so there is always somebody to cover for.
  const who: PersonOption[] = [
    ...people.map((p) => ({ id: p.user.id, displayName: p.user.displayName, kind: "user" as const })),
    ...ghosts.map((g) => ({ id: g.id, displayName: g.displayName, kind: "claim" as const })),
  ];
  // From a person's page (docs/decisions.md 2026-09-27): that person is the one covered, and nothing else is picked.
  // Their page is reachable before anything is between you, so they are looked up when they are not in the list.
  const fixed: PersonOption | undefined = sp.for
    ? (who.find((p) => p.id === sp.for) ??
      (await userById(sp.for).then((u) => (u ? ({ id: u.id, displayName: u.displayName, kind: "user" } as const) : undefined))) ??
      (await claimById(sp.for).then((c) => (c && !c.claimedBy ? ({ id: c.id, displayName: c.displayName, kind: "claim" } as const) : undefined))))
    : undefined;
  return (
    <Screen>
      <TopBar back title="I got this one" />
      <div className="py-2">
        <NewCoverForm
          people={who}
          groups={options}
          recent={recent.map((u) => ({ id: u.id, groupId: u.groupId, label: u.label, pluralLabel: u.pluralLabel, quantifiable: u.quantifiable, monetary: u.monetary, template: u.template, markKind: u.markKind, markValue: u.markValue }))}
          initialPerson={sp.person ?? sp.ghost}
          initialGroup={sp.group}
          forPerson={fixed}
        />
      </div>
    </Screen>
  );
}
