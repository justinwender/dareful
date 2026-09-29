import { AskLayer } from "@/components/markets/ask-layer";
import { AskScreen, type AskSearch } from "@/components/markets/ask-screen";

export const dynamic = "force-dynamic";

/** `/m/new` reached from inside the app (docs/design.md 9.5): the ask layer rises over the place the + was tapped from, which stays mounted under it. */
export default async function AskInLayer({ searchParams }: { searchParams: Promise<AskSearch> }) {
  return (
    <AskLayer>
      <AskScreen searchParams={searchParams} layer />
    </AskLayer>
  );
}
