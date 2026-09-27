import type { Metadata } from "next";
import { GamePage } from "@/components/on/game-page";
import { gameById } from "@/lib/sports";

export const dynamic = "force-dynamic";

/** The link sent to the chat when a game is started with more than one question (3.27, 3.33): the game page for one set of people, with its own tile. */
export async function generateMetadata({ params }: { params: Promise<{ id: string; g: string }> }): Promise<Metadata> {
  const { id } = await params;
  const found = /^[0-9a-f-]{36}$/i.test(id) ? await gameById(id).catch(() => null) : null;
  const title = found ? found.game.name : "Dareful";
  return { title, description: "Put your numbers on it.", robots: { index: false, follow: false }, openGraph: { title, description: "Put your numbers on it." } };
}

export default async function Page({ params, searchParams }: { params: Promise<{ id: string; g: string }>; searchParams: Promise<{ add?: string }> }) {
  const { id, g } = await params;
  const sp = await searchParams;
  return <GamePage id={id} g={g} add={sp.add ?? null} start={false} />;
}
