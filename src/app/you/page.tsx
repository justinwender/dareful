import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Avatar } from "@/components/ledger/avatar";
import { Screen } from "@/components/ledger/screen";
import { TabBar } from "@/components/ui/tab-bar";
import { currentUser } from "@/lib/auth/session";
import { liveFor } from "@/lib/ledger/home";
import { hueFor } from "@/lib/ui/hue";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

/**
 * You, the third root (docs/design.md 6.1): everything about this person rather than between them and somebody.
 * Account actions, sign out included, live here and nowhere on Now (4.7). Calibration, the clean-resolution rate
 * and marks belong here too and are not built yet; nothing on this screen stands in for them.
 */
export default async function YouPage() {
  const me = await currentUser();
  if (!me) redirect("/");
  const clock = await viewerClock();
  const live = await liveFor(me, new Date(clock.now));
  return (
    <Screen>
      <h1 className="pt-5 text-label text-ink-3">You</h1>
      <div className="flex flex-col gap-6 py-4">
        <div className="flex items-center gap-4">
          <Avatar name={me.displayName} hue={hueFor(me.id)} size={56} />
          <p className="text-body-strong text-ink">{me.displayName}</p>
        </div>
        <SignOutButton />
      </div>
      <TabBar active="/you" live={live} start />
    </Screen>
  );
}
