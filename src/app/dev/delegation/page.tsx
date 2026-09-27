import { notFound, redirect } from "next/navigation";
import { DelegationControl } from "@/components/auth/delegation-control";
import { Screen, TopBar } from "@/components/ledger/screen";
import { currentUser } from "@/lib/auth/session";
import { hasDelegation } from "@/lib/chain/delegated-signer";

export const dynamic = "force-dynamic";

/**
 * A development-only page for the delegation gate (docs/decisions.md 2026-09-27): it does not exist in a
 * built deployment. The webhook it causes still lands on the registered production endpoint, since Dynamic
 * posts there whichever origin triggered it, and the shared database carries the result back here.
 */
export default async function DelegationDevPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  const me = await currentUser();
  if (!me) redirect("/");
  const stored = await hasDelegation(me.id);
  return (
    <Screen>
      <TopBar back />
      <main className="mx-auto flex w-full max-w-[430px] flex-col gap-6 px-5 pb-10">
        <h1 className="text-serif-l text-ink">Delegation, for the gate</h1>
        <p className="text-body text-ink-2">Development only. Turns the server’s silent signing on for the ledger wallet through Dynamic’s own call, and off again.</p>
        <DelegationControl stored={stored} />
      </main>
    </Screen>
  );
}
