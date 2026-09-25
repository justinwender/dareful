"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { addSettlementPhoto, MediaError } from "@/lib/media";
import { MAX_UPLOAD_BYTES } from "@/lib/media/pipeline";
import { StorageUnavailable } from "@/lib/media/storage";
import { viewerZone } from "@/lib/ui/zone";

/**
 * The settlement photo, from the phone (Principle 6). The bytes are read here and handed to the pipeline; the
 * phone has already shrunk anything over the platform's request cap. Nothing about the file but its bytes is
 * kept, and every field of its metadata is gone before it is stored.
 */
export async function addSettlementPhotoAction(form: FormData): Promise<{ ok: true; mediaId: string } | { error: string }> {
  const user = await requireUser();
  const obligationId = z.string().uuid().safeParse(form.get("obligationId"));
  const file = form.get("photo");
  if (!obligationId.success || !(file instanceof File)) return { error: "That didn't come through. Try again." };
  if (file.size === 0) return { error: "That doesn't look like a photo." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "That photo is too big to send." };
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const row = await addSettlementPhoto({ obligationId: obligationId.data, authorId: user.id, bytes, viewerZone: await viewerZone() });
    return { ok: true, mediaId: row.id };
  } catch (err) {
    if (err instanceof MediaError) return { error: err.message };
    if (err instanceof StorageUnavailable) return { error: "Photos are off right now." };
    console.error("settlement photo failed", { err: err instanceof Error ? err.message : err });
    return { error: "The photo didn't go through. Try again." };
  }
}
