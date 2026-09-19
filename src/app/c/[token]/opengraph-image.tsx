import { claimShareCard } from "@/lib/ledger/share";
import { renderShareCard, shareCardContentType, shareCardSize } from "@/lib/ui/share-card";

export const alt = "Someone got this one";
export const size = shareCardSize;
export const contentType = shareCardContentType;

/** The card for a claim link: who sent it and how many, in the sender's own words. Never what or how much. */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return renderShareCard((await claimShareCard(token)).card);
}
