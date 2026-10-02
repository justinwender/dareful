"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { addMarketPhoto, addSettlementPhoto, MediaError, removeMarketPhoto } from "@/lib/media";
import { addSticker, MarkError } from "@/lib/media/marks";
import { MAX_UPLOAD_BYTES } from "@/lib/media/pipeline";
import { MAX_STICKER_BYTES } from "@/lib/media/sticker";
import { StorageUnavailable } from "@/lib/media/storage";
import { isUuidLike } from "@/lib/ledger/ids";
import { viewerZone } from "@/lib/ui/zone";
import { type InkName } from "@/lib/ui/ink";
import { record } from "@/lib/usage";

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
 * A memory on a market (docs/marks-and-memories.md; docs/design.md 3.39): "Add yours from that night" once it has
 * ended, or the camera while it is open, by someone who is in it. The same pipeline as the settlement photo, the
 * market as the parent, the role stored on the row. Adding sends nobody anything.
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
 * Removes a memory (docs/design.md 3.8, 3.39): whoever added it, from its full-screen view, at any time. Evidence
 * is refused here, since a vote or a ruling may rest on it.
 */
export async function removeMarketPhotoAction(rawId: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(rawId);
  if (!id.success) return { error: "That one doesn't exist." };
  try {
    await removeMarketPhoto({ mediaId: id.data, byUserId: user.id });
    return { ok: true };
  } catch (err) {
    if (err instanceof MediaError) return { error: err.message };
    console.error("removing a photo failed", { err: err instanceof Error ? err.message : err });
    return { error: "That didn't go through. Try again." };
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
    await record("sticker", { source: form.get("source") === "cut" ? "cut" : "pasted" }, { userId: user.id });
    return { ok: true, id: row.id, ink: (row.ink as InkName | null) ?? null };
  } catch (err) {
    if (err instanceof MarkError) return { error: err.message };
    if (err instanceof StorageUnavailable) return { error: "Stickers are off right now." };
    console.error("sticker failed", { err: err instanceof Error ? err.message : err });
    return { error: "The sticker didn't go through. Try again." };
  }
}

/**
 * Photos or screenshots on their own, attached while a question is being called (by anyone voting, or with a
 * case for the tiebreaker): evidence by whoever attached them, shown to everyone voting and weighed as their claim
 * when the arbitrator reads them. Nothing is proposed again here; the arbitrator reads evidence when it is asked.
 */
export async function attachEvidenceAction(form: FormData): Promise<{ ok: true; mediaIds: string[] } | { error: string }> {
  const user = await requireUser();
  const dareId = z.string().uuid().safeParse(form.get("dareId"));
  const files = form.getAll("attachment").filter((f): f is File => f instanceof File && f.size > 0);
  if (!dareId.success || files.length === 0) return { error: "That didn't come through. Try again." };
  if (files.some((f) => f.size > MAX_UPLOAD_BYTES)) return { error: "One of those is too big to send." };
  try {
    const mediaIds: string[] = [];
    const zone = await viewerZone();
    for (const file of files) {
      const row = await addMarketPhoto({ dareId: dareId.data, authorId: user.id, bytes: Buffer.from(await file.arrayBuffer()), viewerZone: zone, role: "evidence" });
      mediaIds.push(row.id);
    }
    return { ok: true, mediaIds };
  } catch (err) {
    if (err instanceof MediaError) return { error: err.message };
    if (err instanceof StorageUnavailable) return { error: "Screenshots are off right now." };
    console.error("evidence failed", { err: err instanceof Error ? err.message : err });
    return { error: "The screenshot didn't go through. Try again." };
  }
}
