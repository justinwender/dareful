import { AskScreen, type AskSearch } from "@/components/markets/ask-screen";

export const dynamic = "force-dynamic";

/** `/m/new` on a hard load: the question step as a page of its own, with Close leading to the root. */
export default async function AskPage({ searchParams }: { searchParams: Promise<AskSearch> }) {
  return <AskScreen searchParams={searchParams} />;
}

export { initialStickerMark } from "@/components/markets/ask-screen";
