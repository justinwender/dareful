import { redirect } from "next/navigation";
import { TopBar } from "@/components/ledger/screen";
import { AskForm } from "@/components/markets/ask-form";
import { currentUser } from "@/lib/auth/session";
import { denominationsForGroup } from "@/lib/ledger/denominations";
import { peopleForUser, peopleSetsFor } from "@/lib/ledger/groups";
import { openInksByGroup } from "@/lib/ledger/markets";
import { setCaption } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

/** Asking: the question, who's in, then the terms (docs/design.md 3.20, section 7). */
export default async function AskPage({ searchParams }: { searchParams: Promise<{ line?: string; pace?: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const sp = await searchParams;
  // Start offers asking and settling an argument as two rows; both land here, on the right pace.
  const pace = sp.pace === "argument" ? ("argument" as const) : ("dare" as const);
  const clock = await viewerClock();
  const [sets, people] = await Promise.all([peopleSetsFor(me.id, me.displayName), peopleForUser(me.id)]);
  const now = new Date(clock.now);
  const taken = await openInksByGroup(sets.slice(0, 6).map((s) => s.groupId));
  const options = await Promise.all(
    sets.slice(0, 6).map(async (s, i) => ({
      takenInks: taken.get(s.groupId) ?? [],
      groupId: s.groupId,
      label: s.label,
      caption: setCaption({ size: s.members.length, lastAskedAt: s.lastAskedAt, isMostRecent: i === 0, now, timeZone: clock.zone }),
      avatars: s.members.filter((m) => m.userId !== me.id).map((m) => ({ name: m.displayName, hue: m.userId ? hueFor(m.userId) : ("stone" as const) })),
      offerName: s.offerName,
      size: s.members.length,
      units: (await denominationsForGroup(s.groupId)).filter((u) => !u.monetary).map((u) => ({ id: u.id, label: u.label, template: u.template })),
    })),
  );
  // The form owns the screen (docs/design.md 3.29): a picked mark retints the band, the ground and the sheet, so the room is the form's to paint.
  return <AskForm chrome={<TopBar back title={pace === "argument" ? "Settle an argument" : "Ask something"} />} me={{ hue: hueFor(me.id) }} sets={options} people={people.map((p) => ({ id: p.user.id, name: p.user.displayName, hue: hueFor(p.user.id) }))} initialLine={sp.line} initialPace={pace} />;
}
