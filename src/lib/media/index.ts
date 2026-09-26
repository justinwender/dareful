/**
 * Media on events (docs/marks-and-memories.md). The settlement photo, the one an obligation gets when it closes
 * in the real world (PLANNING.md Principle 6); and photos on a market: memories of the night added to a settled
 * question by the people who were in it, and screenshots attached to what happened while it is being called
 * (roles.ts). Visibility follows the event: a settlement photo is seen by the two people in that obligation and
 * nobody else, and a market's media by its participants and the group it was asked in. Nothing is ever served
 * from a public bucket; a photo leaves through a signed URL issued here, after the check, for a minute.
 */
import { randomUUID } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { marketById, stateOf } from "@/lib/ledger/markets";
import { isMember } from "@/lib/ledger/groups";
import { NotAPhoto, processPhoto } from "./pipeline";
import { evidenceAllowed, evidenceItems, frameItems, memoryAllowed, type MediaRole, type Refusal } from "./roles";
import { putObject, removeObjects, signedUrl } from "./storage";

export type MediaRow = typeof schema.media.$inferSelect;
export type Size = "frame" | "thumb";

export const frameKey = (mediaId: string): string => `frames/${mediaId}.jpg`;
export const thumbKey = (mediaId: string): string => `thumbs/${mediaId}.jpg`;

export class MediaError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "not_party" | "already" | "not_a_photo" | "storage" | Refusal,
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
  const { id, photo, keys } = await storePhoto(input.bytes, input.viewerZone);
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

/** The pipeline, then the bucket: both derivatives written, or neither. The row is the caller's to write. */
async function storePhoto(bytes: Buffer, viewerZone: string | null): Promise<{ id: string; photo: Awaited<ReturnType<typeof processPhoto>>; keys: string[] }> {
  let photo;
  try {
    photo = await processPhoto(bytes, viewerZone);
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
  return { id, photo, keys };
}

const REFUSED: Record<Refusal, string> = {
  not_settled: "Photos go on once it’s settled.",
  not_in: "This one is for the people who were in it.",
  full: "This one has all the photos it can hold.",
  not_voting: "It isn’t being called right now.",
  not_member: "This one is for the people in its group.",
};

/**
 * A photo on a market (docs/marks-and-memories.md, "Adding later is the point"). A memory: the market is settled,
 * the author was in it, and there is room. Evidence: the market is being called, the author is in its group (the
 * same people who may say what happened), and this person has not attached more than their share. The role is
 * decided by the control it came through and stored on the row; nothing later has to infer it.
 */
export async function addMarketPhoto(input: { dareId: string; authorId: string; bytes: Buffer; viewerZone: string | null; role: MediaRole }): Promise<MediaRow> {
  const d = await marketById(input.dareId);
  if (!d) throw new MediaError("That one doesn't exist.", "not_found");
  const state = stateOf(d);
  const existing = await db.select({ authorId: schema.media.authorId, role: schema.media.role }).from(schema.media).where(eq(schema.media.dareId, d.id));
  if (input.role === "memory") {
    const [inIt] = await db.select({ dareId: schema.darePositions.dareId }).from(schema.darePositions).where(and(eq(schema.darePositions.dareId, d.id), eq(schema.darePositions.userId, input.authorId))).limit(1);
    const allowed = memoryAllowed({ state, inIt: Boolean(inIt), count: existing.filter((m) => m.role === "memory").length });
    if (!allowed.ok) throw new MediaError(REFUSED[allowed.why], allowed.why);
  } else {
    const allowed = evidenceAllowed({ state, member: await isMember(d.groupId, input.authorId), mine: existing.filter((m) => m.role === "evidence" && m.authorId === input.authorId).length });
    if (!allowed.ok) throw new MediaError(REFUSED[allowed.why], allowed.why);
  }
  const { id, photo, keys } = await storePhoto(input.bytes, input.viewerZone);
  try {
    const [row] = await db
      .insert(schema.media)
      .values({ id, dareId: d.id, kind: "photo", role: input.role, storageKey: frameKey(id), width: photo.frame.width, height: photo.frame.height, authorId: input.authorId, capturedAt: photo.capturedAt })
      .returning();
    if (!row) throw new Error("media row");
    return row;
  } catch (err) {
    await removeObjects(keys);
    throw err;
  }
}

export type MarketMedia = { id: string; role: MediaRole; author: { id: string; displayName: string }; capturedAt: Date | null; createdAt: Date };

/** Every photo on a market with its author, for the frame (memories) and the claim (evidence), split by `frameItems` and `evidenceItems`. */
export async function mediaOnMarket(dareId: string): Promise<{ memories: MarketMedia[]; evidence: MarketMedia[] }> {
  const rows = await db.select({ id: schema.media.id, role: schema.media.role, authorId: schema.media.authorId, capturedAt: schema.media.capturedAt, createdAt: schema.media.createdAt }).from(schema.media).where(eq(schema.media.dareId, dareId));
  return splitMedia(rows, await namesOf(rows.map((r) => r.authorId)));
}

/** The same, for many markets at once (a timeline): only memories are needed there, and only settled markets have them. */
export async function memoriesOnMarkets(dareIds: string[]): Promise<Map<string, MarketMedia[]>> {
  const out = new Map<string, MarketMedia[]>();
  if (dareIds.length === 0) return out;
  const rows = await db.select({ id: schema.media.id, dareId: schema.media.dareId, role: schema.media.role, authorId: schema.media.authorId, capturedAt: schema.media.capturedAt, createdAt: schema.media.createdAt }).from(schema.media).where(inArray(schema.media.dareId, dareIds));
  const names = await namesOf(rows.map((r) => r.authorId));
  for (const dareId of dareIds) out.set(dareId, splitMedia(rows.filter((r) => r.dareId === dareId), names).memories);
  return out;
}

async function namesOf(ids: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids));
  if (unique.length === 0) return new Map();
  const users = await db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, unique));
  return new Map(users.map((u) => [u.id, u.displayName]));
}

function splitMedia(rows: Array<{ id: string; role: string; authorId: string; capturedAt: Date | null; createdAt: Date }>, names: Map<string, string>): { memories: MarketMedia[]; evidence: MarketMedia[] } {
  const shape = (r: (typeof rows)[number]): MarketMedia => ({ id: r.id, role: r.role === "evidence" ? "evidence" : "memory", author: { id: r.authorId, displayName: names.get(r.authorId) ?? "Someone" }, capturedAt: r.capturedAt, createdAt: r.createdAt });
  return { memories: frameItems(rows).map(shape), evidence: evidenceItems(rows).map(shape) };
}
