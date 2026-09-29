import { redirect } from "next/navigation";
import { Avatar } from "@/components/ledger/avatar";
import { Screen } from "@/components/ledger/screen";
import { TabBar } from "@/components/ui/tab-bar";
import { ViewportProbe } from "@/components/ui/viewport-probe";
import { AccountRows } from "@/components/you/account";
import { AskedSection } from "@/components/you/asked";
import { CallsSection, NothingYet } from "@/components/you/calls";
import { NumbersSection } from "@/components/you/numbers";
import { currentUser } from "@/lib/auth/session";
import { headerCaption, youFor } from "@/lib/ledger/you";
import { passThePhoneStatus } from "@/lib/ledger/pass-the-phone";
import { hueFor } from "@/lib/ui/hue";
import { glyphKeyOf, quotedUnit } from "@/lib/ui/units";
import { viewerClock } from "@/lib/ui/zone";
import { OfflineBar } from "@/components/ui/offline-bar";

export const dynamic = "force-dynamic";

/**
 * You, the third root (docs/design.md 3.34, 6.1): everything about this person rather than between them and
 * somebody. Identity, then how their calls land, numbers, the questions they asked, and Account, in that order,
 * because the stats are what You is for. Only this person's own calls, with no score, grade or rank, and no
 * comparison with anyone else. Sign out lives here and nowhere on Now (4.7).
 */
export default async function YouPage() {
  const me = await currentUser();
  if (!me) redirect("/");
  const clock = await viewerClock();
  const now = new Date(clock.now);
  const [you, passThePhone] = await Promise.all([youFor(me), passThePhoneStatus(me.id)]);
  const hue = hueFor(me.id);
  const nothing = you.calibration.binary.resolved === 0 && you.calibration.numeric.resolved === 0 && you.calibration.pickOne.resolved === 0 && you.asked.counted.length === 0;
  const unitsCaption = you.units.length === 0 ? "Beers, coffees, a next time, dollars: whatever a cover or a question runs on" : you.units.map((u) => (u.monetary ? "dollars" : glyphKeyOf(u) ? u.pluralLabel : quotedUnit(u.label))).join(", ").replace(/^./, (c) => c.toUpperCase());
  const marksCaption = you.marks.length === 0 ? "The emoji and stickers you put on questions" : "The emoji you’ve used, most recent first, and your stickers";
  return (
    <Screen root>
      <h1 className="pt-5 text-label text-ink-3">You</h1>
      <OfflineBar />
      <div className="flex flex-col gap-6 py-4">
        <div className="flex items-center gap-4">
          <Avatar name={me.displayName} hue={hue} size={56} />
          <div className="flex min-w-0 flex-col">
            <p className="text-body-strong text-ink">{me.displayName}</p>
            <p className="text-caption text-ink-3" data-you-caption="">
              {headerCaption({ markets: you.markets, firstEnteredAt: you.firstEnteredAt, joinedAt: you.joinedAt }, now, clock.zone)}
            </p>
          </div>
        </div>
        {nothing ? (
          <NothingYet />
        ) : (
          <>
            <CallsSection record={you.calibration} hue={hue} now={now} zone={clock.zone} />
            <NumbersSection record={you.calibration.numeric} hue={hue} />
            <AskedSection record={you.asked} />
          </>
        )}
        <AccountRows units={you.units.map((u) => ({ id: u.id, label: u.label, pluralLabel: u.pluralLabel, glyph: glyphKeyOf(u), monetary: u.monetary, emoji: u.emoji }))} marks={you.marks} unitsCaption={unitsCaption} marksCaption={marksCaption} passThePhone={passThePhone} hue={hue} />
        {/* An instrument for the installed app's tab bar (docs/testing.md item 61), to be removed with the cause. */}
        <ViewportProbe />
      </div>
      <TabBar active="/you" start />
    </Screen>
  );
}
