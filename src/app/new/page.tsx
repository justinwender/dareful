import { redirect } from "next/navigation";
import { NewCoverForm, type GroupOption, type PersonOption } from "@/components/ledger/new-cover-form";
import { Screen, TopBar } from "@/components/ledger/screen";
import { currentUser } from "@/lib/auth/session";
import { ghostsForCreator } from "@/lib/ledger/claims";
import { denominationsForGroup, recentDenominationsForUser } from "@/lib/ledger/denominations";
import { groupsForUser, peopleForUser } from "@/lib/ledger/groups";

export const dynamic = "force-dynamic";

export default async function NewCoverPage({ searchParams }: { searchParams: Promise<{ person?: string; ghost?: string; group?: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const sp = await searchParams;
  const [groups, people, ghosts, recent] = await Promise.all([groupsForUser(me.id), peopleForUser(me.id), ghostsForCreator(me.id), recentDenominationsForUser(me.id)]);
  const options: GroupOption[] = await Promise.all(
    groups.map(async (g) => ({
      id: g.id,
      name: g.name,
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
  const back = sp.person ? `/p/${sp.person}` : sp.ghost ? `/p/c/${sp.ghost}` : "/";
  return (
    <Screen>
      <TopBar back={{ href: back, label: "Back" }} title="I got this one" />
      <div className="py-2">
        <NewCoverForm
          people={who}
          groups={options}
          recent={recent.map((u) => ({ id: u.id, groupId: u.groupId, label: u.label, pluralLabel: u.pluralLabel, quantifiable: u.quantifiable, monetary: u.monetary, template: u.template, markKind: u.markKind, markValue: u.markValue }))}
          initialPerson={sp.person ?? sp.ghost}
          initialGroup={sp.group}
        />
      </div>
    </Screen>
  );
}
