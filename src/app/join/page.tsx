import { redirect } from "next/navigation";
import { Screen, TopBar } from "@/components/ledger/screen";
import { CodeJoinFocused, LinkJoin } from "@/components/home/code-join";
import { currentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * "Got a code?" (docs/design.md 3.16, 3.38): reached from the question step's top right. The six boxes, one
 * caption naming the letters no code uses, the link row, and Join in the sheet. Nothing here explains what a
 * code is: the boxes are the shape of one (4.9).
 */
export default async function JoinPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const sp = await searchParams;
  return (
    <Screen>
      <TopBar back />
      <div className="flex flex-col gap-7 py-2">
        <h1 className="text-serif-l text-ink">Got a code?</h1>
        <CodeJoinFocused initial={sp.code ?? ""} />
        <LinkJoin />
      </div>
    </Screen>
  );
}
