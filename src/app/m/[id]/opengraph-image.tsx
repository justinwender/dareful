import { marketShare } from "@/lib/ledger/share";
import { renderShareCard, shareCardContentType, shareCardSize } from "@/lib/ui/share-card";

export const alt = "A question between friends";
export const size = shareCardSize;
export const contentType = shareCardContentType;

/** The card for a question: the question itself and an invitation. Never anyone's number, never what is on it. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return renderShareCard((await marketShare(id)).card);
}
