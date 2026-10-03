import type { Metadata } from "next";
import { startWord } from "@/lib/sports/types";
import { GamePage } from "@/components/on/game-page";
import { gameById } from "@/lib/sports";
import { currentUser } from "@/lib/auth/session";
import { LinkOpened } from "@/components/ui/usage";

export const dynamic = "force-dynamic";

/** The link sent to the chat when a game is started with more than one question (3.27, 3.33): the game page for one set of people, with its own tile. To someone not in that set, signed in or not, it is the set's questions, each opening its own screen, where they get in (3.17). */
export async function generateMetadata({ params }: { params: Promise<{ id: string; g: string }> }): Promise<Metadata> {
  const { id } = await params;
  const found = /^[0-9a-f-]{36}$/i.test(id) ? await gameById(id).catch(() => null) : null;
  const title = found ? found.game.name : "Dareful";
  // Each sport's own start word (docs/design.md 3.33, session 15): never kickoff for a game that has none.
  const description = found ? `Everything closes at ${startWord(found.game.sport)}.` : "Everything closes at the start.";
  return { title, description, robots: { index: false, follow: false }, openGraph: { title, description } };
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string; g: string }>; searchParams: Promise<{ add?: string }> }) {
  const { id, g } = await params;
  const sp = await searchParams;
  const me = await currentUser();
  return (
    <>
      {/^[0-9a-f-]{36}$/i.test(id) ? <LinkOpened link="game" gameId={id} signedIn={Boolean(me)} /> : null}
      <GamePage id={id} g={g} add={sp.add ?? null} start={false} />
    </>
  );
}
