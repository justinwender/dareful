import { redirect } from "next/navigation";
import { Screen, TopBar } from "@/components/ledger/screen";
import { AskForm } from "@/components/markets/ask-form";
import { currentUser } from "@/lib/auth/session";
import { denominationsForGroup } from "@/lib/ledger/denominations";
import { groupsForUser } from "@/lib/ledger/groups";

export const dynamic = "force-dynamic";

export default async function AskPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const sp = await searchParams;
  const groups = (await groupsForUser(me.id)).filter((g) => !g.isDyad);
  const options = await Promise.all(
    groups.map(async (g) => ({
      id: g.id,
      name: g.name ?? "Group",
      size: g.members.filter((m) => m.userId).length,
      units: (await denominationsForGroup(g.id)).filter((u) => !u.monetary).map((u) => ({ id: u.id, label: u.label, template: u.template, quantifiable: u.quantifiable })),
    })),
  );
  return (
    <Screen>
      <TopBar back={{ href: sp.group ? `/g/${sp.group}` : "/", label: "Back" }} title="Ask something" />
      <div className="py-2">
        {options.length === 0 ? <p className="text-body text-ink-2">A question needs a group to ask. Start one, and the people in it are who gets to answer.</p> : <AskForm groups={options} initialGroup={sp.group} />}
      </div>
    </Screen>
  );
}
