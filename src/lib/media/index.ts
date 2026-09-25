/**
 * Media on events (docs/marks-and-memories.md): today the settlement photo, the one an obligation gets when it
 * closes in the real world (PLANNING.md Principle 6). Visibility follows the event: a settlement photo is seen by
 * the two people in that obligation and nobody else, and a market's media by its participants and the group it
 * was asked in. Nothing is ever served from a public bucket; a photo leaves through a signed URL issued here,
 * after the check, for a minute.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { NotAPhoto, processPhoto } from "./pipeline";
import { putObject, removeObjects, signedUrl } from "./storage";

export type MediaRow = typeof schema.media.$inferSelect;
export type Size = "frame" | "thumb";

export const frameKey = (mediaId: string): string => `frames/${mediaId}.jpg`;
export const thumbKey = (mediaId: string): string => `thumbs/${mediaId}.jpg`;

export class MediaError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "not_party" | "already" | "not_a_photo" | "storage",
  ) {
    super(message);
    this.name = "MediaError";
  }
}

/** The two people in an obligation, and nobody else (docs/marks-and-memories.md, "Visibility follows the event"). */
export function canSeeSettlementPhoto(viewerId: string, obligation: { fromUser: string; toUser: string }): boolean {
  return viewerId === obligation.fromUser || viewerId === obligation.toUser;
}

/** Whether this person may see this media row at all. A row nobody may see reads as one that does not exist. */
export async function canSee(media: MediaRow, viewerId: string): Promise<boolean> {
  if (media.obligationId) {
    const [o] = await db.select({ fromUser: schema.obligations.fromUser, toUser: schema.obligations.toUser }).from(schema.obligations).where(eq(schema.obligations.id, media.obligationId)).limit(1);
    return o ? canSeeSettlementPhoto(viewerId, o) : false;
  }
  if (media.dareId) {
    const [d] = await db.select({ groupId: schema.dares.groupId }).from(schema.dares).where(eq(schema.dares.id, media.dareId)).limit(1);
    if (!d) return false;
    const [inIt] = await db.select({ dareId: schema.darePositions.dareId }).from(schema.darePositions).where(and(eq(schema.darePositions.dareId, media.dareId), eq(schema.darePositions.userId, viewerId))).limit(1);
    if (inIt) return true;
    const [member] = await db.select({ groupId: schema.groupMembers.groupId }).from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, d.groupId), eq(schema.groupMembers.userId, viewerId), isNull(schema.groupMembers.leftAt))).limit(1);
    return Boolean(member);
  }
  return false;
}

export async function mediaById(id: string): Promise<MediaRow | null> {
  const [row] = await db.select().from(schema.media).where(eq(schema.media.id, id)).limit(1);
  return row ?? null;
}

/** A URL that serves the photo for a minute, or null when there is no such photo for this person. */
export async function mediaUrl(mediaId: string, viewerId: string, size: Size): Promise<string | null> {
  const media = await mediaById(mediaId);
  if (!media || !(await canSee(media, viewerId))) return null;
  return signedUrl(size === "thumb" ? thumbKey(media.id) : media.storageKey);
}

/**
 * The settlement photo. Either of the two people may add it, once: the moment is theirs together. The photo is
 * processed (oriented, sized, every field of EXIF gone but when it was taken), both derivatives are written,
 * and only then does the row exist; a write that half succeeds is cleaned up and reported.
 */
export async function addSettlementPhoto(input: { obligationId: string; authorId: string; bytes: Buffer; viewerZone: string | null }): Promise<MediaRow> {
  const [o] = await db.select().from(schema.obligations).where(eq(schema.obligations.id, input.obligationId)).limit(1);
  if (!o) throw new MediaError("That one doesn't exist.", "not_found");
  if (!canSeeSettlementPhoto(input.authorId, o)) throw new MediaError("This one isn't yours to add to.", "not_party");
  if (o.mediaId) throw new MediaError("This one already has its photo.", "already");
  let photo;
  try {
    photo = await processPhoto(input.bytes, input.viewerZone);
  } catch (err) {
    throw new MediaError(err instanceof NotAPhoto ? err.message : "That photo couldn't be read.", "not_a_photo");
  }
  const id = randomUUID();
  const keys = [frameKey(id), thumbKey(id)];
  try {
    await putObject(keys[0] as string, photo.frame.bytes, "image/jpeg");
    await putObject(keys[1] as string, photo.thumb.bytes, "image/jpeg");
  } catch (err) {
    await removeObjects(keys);
    throw new MediaError(err instanceof Error ? err.message : "The photo couldn't be stored.", "storage");
  }
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(schema.media)
        .values({ id, obligationId: o.id, kind: "photo", storageKey: frameKey(id), width: photo.frame.width, height: photo.frame.height, authorId: input.authorId, capturedAt: photo.capturedAt })
        .returning();
      if (!row) throw new Error("media row");
      // One settlement photo per obligation: the update is conditional so two uploads at once cannot both win.
      const [claimed] = await tx.update(schema.obligations).set({ mediaId: row.id }).where(and(eq(schema.obligations.id, o.id), isNull(schema.obligations.mediaId))).returning({ id: schema.obligations.id });
      if (!claimed) throw new MediaError("This one already has its photo.", "already");
      return row;
    });
  } catch (err) {
    await removeObjects(keys);
    throw err;
  }
}
