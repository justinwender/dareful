import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { marketShare } from "@/lib/ledger/share";
import { gameOfQuestion } from "@/lib/sports";
import { MarketScreen } from "./market-screen";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const share = await marketShare(id);
  return {
    title: share.title,
    description: share.description,
    robots: { index: false, follow: false },
    openGraph: { title: share.title, description: share.description },
  };
}

export default async function MarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ side?: string; pick?: string }>;
}) {
  const { id } = await params;
  // A question on a game lands on its game page with that question open (the games-and-the-reveal round, section 4;
  // docs/design.md 3.33, "Links"), signed in or not; a fragment on the address (#enter, #ballot) travels with it.
  const onGame = /^[0-9a-f-]{36}$/i.test(id) ? await gameOfQuestion(id) : null;
  if (onGame) redirect(`/on/${onGame}?q=${id}`);
  return <MarketScreen id={id} search={await searchParams} />;
}

