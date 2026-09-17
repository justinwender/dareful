import { redirect } from "next/navigation";
import { Screen, TopBar } from "@/components/ledger/screen";
import { Button } from "@/components/ui/button";
import { createGroupAction } from "@/lib/actions/groups";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function NewGroupPage() {
  const me = await currentUser();
  if (!me) redirect("/");
  return (
    <Screen>
      <TopBar back={{ href: "/", label: "Back" }} title="New group" />
      <form action={createGroupAction} className="flex flex-col gap-6 py-2">
        <p className="text-body text-ink-2">Name it the way you already say it. You’ll get a link to send around.</p>
        <label className="flex flex-col gap-2">
          <span className="text-label text-ink-3">Name</span>
          <input name="name" required maxLength={60} placeholder="Thursday dinner" className="h-12 rounded-tile border border-line bg-surface px-3 text-body text-ink" />
        </label>
        <Button type="submit" variant="primary">
          Start the group
        </Button>
      </form>
    </Screen>
  );
}
