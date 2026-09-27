import { GamePage } from "@/components/on/game-page";

export const dynamic = "force-dynamic";

/** The game page (docs/design.md 3.33): `g` picks which set of people, `add` opens the terms step for one more question, `start` starts fresh. */
export default async function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ g?: string; add?: string; start?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  return <GamePage id={id} g={sp.g ?? null} add={sp.add ?? null} start={sp.start === "1"} />;
}
