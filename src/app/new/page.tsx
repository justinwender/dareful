import { redirect } from "next/navigation";
import { NewCoverForm, type GroupOption } from "@/components/ledger/new-cover-form";
import { Screen, TopBar } from "@/components/ledger/screen";
import { currentUser } from "@/lib/auth/session";
import { denominationsForGroup, recentDenominationsForUser } from "@/lib/ledger/denominations";
import { groupsForUser, peopleForUser } from "@/lib/ledger/groups";

export const dynamic = "force-dynamic";

export default async function NewCoverPage({ searchParams }: { searchParams: Promise<{ person?: string; group?: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const sp = await searchParams;
  const [groups, people, recent] = await Promise.all([groupsForUser(me.id), peopleForUser(me.id), recentDenominationsForUser(me.id)]);
  const options: GroupOption[] = await Promise.all(
    groups.map(async (g) => ({
      id: g.id,
      name: g.name,
      isDyad: g.isDyad,
      memberIds: g.members.map((m) => m.userId).filter((x): x is string => Boolean(x)),
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
  return (
    <Screen>
      <TopBar back={{ href: sp.person ? `/p/${sp.person}` : sp.group ? `/g/${sp.group}` : "/", label: "Back" }} title="I got this one" />
      {people.length === 0 ? (
        <p className="py-4 text-body text-ink-2">Nobody to cover for yet. Start a group and send the link first.</p>
      ) : (
        <div className="py-2">
          <NewCoverForm
            people={people.map((p) => ({ id: p.user.id, displayName: p.user.displayName }))}
            groups={options}
            recent={recent.map((u) => ({ id: u.id, groupId: u.groupId, label: u.label, pluralLabel: u.pluralLabel, quantifiable: u.quantifiable, monetary: u.monetary, template: u.template, markKind: u.markKind, markValue: u.markValue }))}
            initialPerson={sp.person}
            initialGroup={sp.group}
          />
        </div>
      )}
    </Screen>
  );
}
