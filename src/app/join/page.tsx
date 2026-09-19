import { redirect } from "next/navigation";
import { Screen, TopBar } from "@/components/ledger/screen";
import { CodeJoinFocused, LinkJoin } from "@/components/home/code-join";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** docs/design.md, the "Joining with a code" board: the focused form, and the way in for someone holding a link. */
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const sp = await searchParams;
  return (
    <Screen>
      <TopBar back={{ href: "/", label: "Back" }} />
      <div className="flex flex-col gap-7 py-2">
        <div className="flex flex-col gap-2">
          <h1 className="text-question text-ink">Join something</h1>
          <p className="text-body-sm text-ink-2">Someone read you a code, or sent you a link.</p>
        </div>
        <CodeJoinFocused initial={sp.code ?? ""} />
        <div className="flex items-center gap-3 text-caption text-ink-3">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>
        <LinkJoin />
        <p className="text-caption text-ink-3">Nobody sees anything between you and anyone until you’re in.</p>
      </div>
    </Screen>
  );
}
