import { redirect } from "next/navigation";
import { Screen, TopBar } from "@/components/ledger/screen";
import { AskForm } from "@/components/markets/ask-form";
import { currentUser } from "@/lib/auth/session";
import { denominationsForGroup } from "@/lib/ledger/denominations";
import { groupChipsFor } from "@/lib/ledger/groups";

export const dynamic = "force-dynamic";

export default async function AskPage({ searchParams }: { searchParams: Promise<{ group?: string; line?: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const sp = await searchParams;
  const chips = (await groupChipsFor(me.id, me.displayName)).filter((c) => !c.archived || c.id === sp.group);
  const options = await Promise.all(
    chips.map(async (g) => ({
      id: g.id,
      name: g.label,
      size: g.members.filter((m) => m.userId).length,
      units: (await denominationsForGroup(g.id)).filter((u) => !u.monetary).map((u) => ({ id: u.id, label: u.label, template: u.template, quantifiable: u.quantifiable })),
    })),
  );
  return (
    <Screen>
      <TopBar back={{ href: sp.group ? `/?g=${sp.group}` : "/", label: "Back" }} title="Ask something" />
      <div className="py-2">
        <AskForm groups={options} initialGroup={sp.group} initialLine={sp.line} />
      </div>
    </Screen>
  );
}
