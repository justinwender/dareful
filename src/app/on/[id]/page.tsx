import { GamePage } from "@/components/on/game-page";

export const dynamic = "force-dynamic";

/**
 * The game page (docs/design.md 3.33): one page per game per person. `q` is the question open on it (a link to any
 * question on a game lands here with it open), `add` the terms step for one more, `start` a fresh start; `g` names a
 * set, from an older address, whose page it is when the viewer is not in it.
 */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ g?: string; q?: string; add?: string; start?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  return <GamePage id={id} g={sp.g ?? null} q={sp.q ?? null} add={sp.add ?? null} start={sp.start === "1"} />;
}
