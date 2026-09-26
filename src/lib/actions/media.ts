"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { addMarketPhoto, addSettlementPhoto, MediaError } from "@/lib/media";
import { addSticker, MarkError } from "@/lib/media/marks";
import { MAX_UPLOAD_BYTES } from "@/lib/media/pipeline";
import { MAX_STICKER_BYTES } from "@/lib/media/sticker";
import { StorageUnavailable } from "@/lib/media/storage";
import { isUuidLike } from "@/lib/ledger/ids";
import { viewerZone } from "@/lib/ui/zone";
import { type InkName } from "@/lib/ui/ink";

/**
 * The settlement photo, from the phone (Principle 6). The bytes are read here and handed to the pipeline; the
 * phone has already shrunk anything over the platform's request cap. Nothing about the file but its bytes is
 * kept, and every field of its metadata is gone before it is stored.
 */
export async function addSettlementPhotoAction(form: FormData): Promise<{ ok: true; mediaId: string } | { error: string }> {
  const user = await requireUser();
  const obligationId = z.string().refine(isUuidLike).safeParse(form.get("obligationId"));
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

/**
 * A memory added to a settled market ("Add yours from that night", docs/marks-and-memories.md), by someone who was
 * in it. The same pipeline as the settlement photo, the market as the parent, the role stored on the row.
 */
export async function addMarketPhotoAction(form: FormData): Promise<{ ok: true; mediaId: string } | { error: string }> {
  const user = await requireUser();
  const dareId = z.string().uuid().safeParse(form.get("dareId"));
  const file = form.get("photo");
  if (!dareId.success || !(file instanceof File)) return { error: "That didn't come through. Try again." };
  if (file.size === 0) return { error: "That doesn't look like a photo." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "That photo is too big to send." };
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const row = await addMarketPhoto({ dareId: dareId.data, authorId: user.id, bytes, viewerZone: await viewerZone(), role: "memory" });
    return { ok: true, mediaId: row.id };
  } catch (err) {
    if (err instanceof MediaError) return { error: err.message };
    if (err instanceof StorageUnavailable) return { error: "Photos are off right now." };
    console.error("market photo failed", { err: err instanceof Error ? err.message : err });
    return { error: "The photo didn't go through. Try again." };
  }
}

/**
 * A pasted cutout becomes one of this person's stickers (docs/design.md 3.28): the source with its alpha, the
 * derivative with its edge, and the ink measured from its own pixels, which the picker retints to at once.
 */
export async function addStickerAction(form: FormData): Promise<{ ok: true; id: string; ink: InkName | null } | { error: string }> {
  const user = await requireUser();
  const file = form.get("cutout");
  if (!(file instanceof File)) return { error: "That didn't come through. Try again." };
  if (file.size === 0) return { error: "That doesn’t look like a cutout." };
  if (file.size > MAX_STICKER_BYTES) return { error: "That cutout is too big to send." };
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const row = await addSticker({ ownerId: user.id, bytes });
    return { ok: true, id: row.id, ink: (row.ink as InkName | null) ?? null };
  } catch (err) {
    if (err instanceof MarkError) return { error: err.message };
    if (err instanceof StorageUnavailable) return { error: "Stickers are off right now." };
    console.error("sticker failed", { err: err instanceof Error ? err.message : err });
    return { error: "The sticker didn't go through. Try again." };
  }
}

/**
 * A screenshot on its own, attached while a question is being called (with a case for the tiebreaker, or after
 * the claim): evidence by whoever attached it, weighed as their claim when the arbitrator reads it. Nothing is
 * proposed again here; the arbitrator reads evidence when it is asked.
 */
export async function attachEvidenceAction(form: FormData): Promise<{ ok: true; mediaId: string } | { error: string }> {
  const user = await requireUser();
  const dareId = z.string().uuid().safeParse(form.get("dareId"));
  const file = form.get("screenshot");
  if (!dareId.success || !(file instanceof File)) return { error: "That didn't come through. Try again." };
  if (file.size === 0) return { error: "That doesn't look like a screenshot." };
  if (file.size > MAX_UPLOAD_BYTES) return { error: "That screenshot is too big to send." };
  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const row = await addMarketPhoto({ dareId: dareId.data, authorId: user.id, bytes, viewerZone: await viewerZone(), role: "evidence" });
    return { ok: true, mediaId: row.id };
  } catch (err) {
    if (err instanceof MediaError) return { error: err.message };
    if (err instanceof StorageUnavailable) return { error: "Screenshots are off right now." };
    console.error("evidence failed", { err: err instanceof Error ? err.message : err });
    return { error: "The screenshot didn't go through. Try again." };
  }
}
