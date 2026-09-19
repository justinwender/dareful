import { proposalShareCard } from "@/lib/ledger/share";
import { renderShareCard, shareCardContentType, shareCardSize } from "@/lib/ui/share-card";

export const alt = "Someone got this one";
export const size = shareCardSize;
export const contentType = shareCardContentType;

/** The card for a cover someone shared: who, and that there is something to look at. Never what or how much. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderShareCard((await proposalShareCard(id)).card);
}
