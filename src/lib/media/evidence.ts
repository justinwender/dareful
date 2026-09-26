/**
 * Evidence, as the model reads it (PLANNING.md open question 14; docs/decisions.md, the media phase): the
 * screenshots attached to what happened on a market, each read back out of the private bucket and labelled
 * with the first name of who supplied it. The frame derivative is sent (1080 on its long edge, JPEG), which is
 * legible for a scoreboard or a message and small enough to send several. A screenshot that cannot be read
 * back is left out and logged rather than failing the proposal: a model is never on the critical path, and
 * neither is a photo.
 */
import type { EvidenceImage } from "@/lib/ai/client";
import { firstName } from "@/lib/ui/copy";
import { mediaOnMarket } from "./index";
import { getObject } from "./storage";

export async function evidenceFor(dareId: string): Promise<EvidenceImage[]> {
  const { evidence } = await mediaOnMarket(dareId);
  const out: EvidenceImage[] = [];
  for (const e of evidence) {
    try {
      const bytes = await getObject(`frames/${e.id}.jpg`);
      out.push({ by: firstName(e.author.displayName), mediaType: "image/jpeg", base64: bytes.toString("base64") });
    } catch (err) {
      console.error("evidence could not be read back", { dareId, mediaId: e.id, err: err instanceof Error ? err.message : err });
    }
  }
  return out;
}
