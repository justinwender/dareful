import { redirect } from "next/navigation";
import { AskForm } from "@/components/markets/ask-form";
import { currentUser } from "@/lib/auth/session";
import { denominationsForGroup } from "@/lib/ledger/denominations";
import { peopleForUser, peopleSetsFor } from "@/lib/ledger/groups";
import { openInksByGroup, recentCompanions } from "@/lib/ledger/markets";
import { templateById } from "@/lib/sports";
import { clockOf, closesLabel } from "@/lib/ui/copy";
import { stickersOf } from "@/lib/media/marks";
import type { InkName } from "@/lib/ui/ink";
import type { PickedMark } from "@/lib/ui/mark";
import { storageConfigured } from "@/lib/media/storage";
import { setCaption } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { viewerClock } from "@/lib/ui/zone";

export type AskSearch = { line?: string; pace?: string; template?: string; sticker?: string };

/**
 * Asking: the question, who's in, then the terms (docs/design.md 3.20, section 7). One screen for two routes:
 * `/m/new` hard-loaded, and the same address reached from inside the app, where it renders in the ask layer
 * over the place it was tapped from (9.5, `src/app/@ask/(.)m/new`).
 */
export async function AskScreen({ searchParams, layer = false }: { searchParams: Promise<AskSearch>; layer?: boolean }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const sp = await searchParams;
  // Start offers asking and settling an argument as two rows; both land here, on the right pace.
  const pace = sp.pace === "argument" ? ("argument" as const) : ("dare" as const);
  const clock = await viewerClock();
  const [sets, known, recent] = await Promise.all([peopleSetsFor(me.id, me.displayName), peopleForUser(me.id), recentCompanions(me.id)]);
  // The people the asker has shared a market with come first, most recent first (3.29, "Add a person"); the rest follow by name.
  const rank = new Map(recent.map((id, i) => [id, i]));
  const people = [...known].sort((a, b) => (rank.get(a.user.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.user.id) ?? Number.MAX_SAFE_INTEGER) || a.user.displayName.localeCompare(b.user.displayName));
  const now = new Date(clock.now);
  // A public question (docs/design.md 3.33): the flow starts at who's in with the wording locked; a game that has started is no longer askable.
  const fromWhatsOn = sp.template && /^[0-9a-f-]{36}$/i.test(sp.template) ? await templateById(sp.template) : null;
  const template =
    fromWhatsOn && fromWhatsOn.game.startsAt.getTime() > now.getTime() && fromWhatsOn.game.timeValid
      ? {
          id: fromWhatsOn.template.id,
          title: fromWhatsOn.template.title,
          terms: fromWhatsOn.template.termsText,
          kind: fromWhatsOn.template.kind as "binary" | "numeric" | "categorical",
          gameName: fromWhatsOn.game.name,
          closes: `${closesLabel(fromWhatsOn.game.startsAt, now, clock.zone)} at ${clockOf(fromWhatsOn.game.startsAt, clock.zone)}`,
          decidedByScore: fromWhatsOn.template.decidedByScore,
          scored: fromWhatsOn.template.kind === "numeric" && fromWhatsOn.template.range !== null ? `Off by ${fromWhatsOn.template.range} ${fromWhatsOn.template.range === 1n ? fromWhatsOn.template.outcomeLabels[0] : fromWhatsOn.template.outcomeLabels[1]} or more scores nothing. Closer scores more.` : null,
        }
      : null;
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
  const stickers = await stickersOf(me.id);
  // "Ask something with it" from a sticker just made (3.28, frame 3): the question step opens with that sticker as its mark, only if it is this person's.
  const initialMark = initialStickerMark(sp.sticker, stickers);
  return <AskForm screenTitle={template ? "Ask your friends" : pace === "argument" ? "Settle an argument" : "Ask something"} gotCode={!template} layer={layer} me={{ id: me.id, name: me.displayName, hue: hueFor(me.id) }} sets={options} people={people.map((p) => ({ id: p.user.id, name: p.user.displayName, hue: hueFor(p.user.id) }))} initialLine={sp.line} initialPace={template ? "dare" : pace} stickers={stickers} canPaste={storageConfigured()} template={template} initialMark={initialMark} />;
}

/** Pure: the sticker named in the address as the preset mark, when it is one of this person's own; anything else is no mark. */
export function initialStickerMark(param: string | undefined, mine: ReadonlyArray<{ id: string; ink: InkName | null }>): PickedMark | null {
  if (!param || !/^[0-9a-f-]{36}$/i.test(param)) return null;
  const s = mine.find((x) => x.id === param.toLowerCase());
  return s ? { kind: "sticker", id: s.id, ink: s.ink } : null;
}
