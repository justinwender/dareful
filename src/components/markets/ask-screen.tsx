import { redirect } from "next/navigation";
import { AskForm } from "@/components/markets/ask-form";
import { contracts } from "@/lib/chain/contracts";
import { daresDomain } from "@/lib/chain/typed-data";
import { currentUser } from "@/lib/auth/session";
import { peopleForUser } from "@/lib/ledger/groups";
import { recentCompanions } from "@/lib/ledger/markets";
import { gameById, templateById } from "@/lib/sports";
import { gameIsOver } from "@/lib/ledger/markets";
import { isMember } from "@/lib/ledger/groups";
import { startWord } from "@/lib/sports/types";
import { clockOf, closesLabel } from "@/lib/ui/copy";
import { stickersOf } from "@/lib/media/marks";
import { initialStickerMark } from "@/lib/ui/mark";
import { storageConfigured } from "@/lib/media/storage";
import { hueFor } from "@/lib/ui/hue";
import { viewerClock } from "@/lib/ui/zone";
import { blankOf, ideaById } from "@/lib/ideas";

export type AskSearch = { line?: string; pace?: string; template?: string; sticker?: string; idea?: string; /** A question of one's own on a game page (the final round, section 5): the game, and the set whose page it was asked from. */ game?: string; g?: string };

/**
 * Asking: the question, then the terms (docs/design.md 3.20 as amended 2026-10-07: "Who's in" is skipped, and every
 * question goes to whoever its asker sends it to). One screen for two routes:
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
  const [known, recent] = await Promise.all([peopleForUser(me.id), recentCompanions(me.id)]);
  // The people the asker has shared a market with come first, most recent first (3.29, "Add a person"); the rest follow by name.
  const rank = new Map(recent.map((id, i) => [id, i]));
  const people = [...known].sort((a, b) => (rank.get(a.user.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.user.id) ?? Number.MAX_SAFE_INTEGER) || a.user.displayName.localeCompare(b.user.displayName));
  const now = new Date(clock.now);
  // A public question (docs/design.md 3.33): the flow starts at the terms with the wording locked; a game that has started is no longer askable.
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
  // The form owns the screen (docs/design.md 3.29): a picked mark retints the band, the ground and the sheet, so the room is the form's to paint.
  const stickers = await stickersOf(me.id);
  // "Ask something with it" from a sticker just made (3.28, frame 3): the question step opens with that sticker as its mark, only if it is this person's.
  // A question of one's own on a game page (the final round, section 5): only from a set this person is in, until the final.
  const isId = (v: string | undefined): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v);
  const onGame = !template && isId(sp.game) && isId(sp.g) && (await isMember(sp.g, me.id)) ? await gameById(sp.game) : null;
  const askableGame = onGame && onGame.game.timeValid && onGame.game.status !== "postponed" && onGame.game.status !== "canceled" && !gameIsOver(onGame.game) ? onGame.game : null;
  const game =
    askableGame && isId(sp.g)
      ? {
          id: askableGame.id,
          name: askableGame.name,
          groupId: sp.g,
          closes: askableGame.startsAt.getTime() > now.getTime() ? `At ${startWord(askableGame.sport)}, ${closesLabel(askableGame.startsAt, now, clock.zone)} at ${clockOf(askableGame.startsAt, clock.zone)}` : "5 minutes after the first call",
        }
      : null;
  // Starting from an idea (3.47): its question, its kind and its own mark (the final round, section 7), all of it editable.
  const idea = template || game ? null : ideaById(sp.idea);
  const initialMark = initialStickerMark(sp.sticker, stickers) ?? (idea ? ({ kind: "emoji", value: idea.mark, name: null } as const) : null);
  const { chainId, dares } = contracts();
  return <AskForm signing={{ domain: daresDomain(chainId, dares.address), ledgerWallet: me.ledgerWallet }} screenTitle={template ? "Ask your friends" : game ? game.name : pace === "argument" ? "Settle an argument" : "Ask something"} gotCode={!template} layer={layer} me={{ id: me.id, name: me.displayName, hue: hueFor(me.id) }} people={people.map((p) => ({ id: p.user.id, name: p.user.displayName, hue: hueFor(p.user.id) }))} initialLine={idea ? (blankOf(idea.text) ? "" : idea.text) : sp.line} initialPace={template || idea || game ? "dare" : pace} stickers={stickers} canPaste={storageConfigured()} template={template} initialMark={initialMark} idea={idea} ownUnits={me.ownUnits ?? []} game={game} />;
}
