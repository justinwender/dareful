/**
 * Picture marks: stickers (docs/design.md 1.7, 3.28, 3.29; docs/marks-and-memories.md). Their own table, by the
 * decision of 2026-09-18: a mark belongs to the person who made it and can be the mark on any question they ask,
 * so it is not a `media` row on one event. The two objects (the 512px source with alpha, the 256px derivative
 * with the die-cut edge) sit in the private bucket and leave only through `/api/mark/[id]` after a check.
 *
 * Who may see a sticker: the person who made it, and anyone in a group where a question carries it as its mark,
 * which is everyone who can see that question's stamp. A sticker is also drawn into the question's link tile,
 * server-side, because a mark rides both tiles (docs/marks-and-memories.md, "Where a market's mark appears"):
 * choosing a sticker as a mark is choosing to send it where the question is sent.
 */
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { isInkName, type InkName } from "@/lib/ui/ink";
import { NotACutout, processSticker } from "./sticker";
import { putObject, removeObjects, signedUrl } from "./storage";

export type PictureMarkRow = typeof schema.pictureMarks.$inferSelect;
export type MarkSize = "stamp" | "source";

export const stickerSourceKey = (id: string): string => `stickers/${id}.png`;
export const stickerStampKey = (id: string): string => `stamps/${id}.png`;

export class MarkError extends Error {
  constructor(
    message: string,
    public readonly code: "not_a_cutout" | "storage" | "not_found",
  ) {
    super(message);
    this.name = "MarkError";
  }
}

/** A pasted cutout becomes this person's sticker: processed, both objects written, and only then the row. */
export async function addSticker(input: { ownerId: string; bytes: Buffer }): Promise<PictureMarkRow> {
  let s;
  try {
    s = await processSticker(input.bytes);
  } catch (err) {
    throw new MarkError(err instanceof NotACutout ? err.message : "That cutout couldn’t be read.", "not_a_cutout");
  }
  const id = randomUUID();
  const keys = [stickerSourceKey(id), stickerStampKey(id)];
  try {
    await putObject(keys[0] as string, s.source.bytes, "image/png");
    await putObject(keys[1] as string, s.stamp.bytes, "image/png");
  } catch (err) {
    await removeObjects(keys);
    throw new MarkError(err instanceof Error ? err.message : "The sticker couldn’t be stored.", "storage");
  }
  try {
    const [row] = await db
      .insert(schema.pictureMarks)
      .values({ id, ownerId: input.ownerId, kind: "sticker", sourceKey: keys[0] as string, stampKey: keys[1] as string, width: s.source.width, height: s.source.height, ink: s.ink })
      .returning();
    if (!row) throw new Error("picture mark row");
    return row;
  } catch (err) {
    await removeObjects(keys);
    throw err;
  }
}

export async function pictureMarkById(id: string): Promise<PictureMarkRow | null> {
  const [row] = await db.select().from(schema.pictureMarks).where(eq(schema.pictureMarks.id, id)).limit(1);
  return row ?? null;
}

/** This person's stickers, newest first, for the picker's "Your stickers" row. */
export async function stickersOf(ownerId: string): Promise<Array<{ id: string; ink: InkName | null }>> {
  const rows = await db.select({ id: schema.pictureMarks.id, ink: schema.pictureMarks.ink, createdAt: schema.pictureMarks.createdAt }).from(schema.pictureMarks).where(eq(schema.pictureMarks.ownerId, ownerId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).map((r) => ({ id: r.id, ink: isInkName(r.ink) ? r.ink : null }));
}

/** Whether this person may see this mark: its owner, or someone in a group where a question wears it. */
export async function canSeeMark(mark: PictureMarkRow, viewerId: string): Promise<boolean> {
  if (mark.ownerId === viewerId) return true;
  const [worn] = await db
    .select({ id: schema.dares.id })
    .from(schema.dares)
    .innerJoin(schema.groupMembers, eq(schema.groupMembers.groupId, schema.dares.groupId))
    .where(and(eq(schema.dares.markValue, mark.id), eq(schema.groupMembers.userId, viewerId), isNull(schema.groupMembers.leftAt)))
    .limit(1);
  return Boolean(worn);
}

/** A URL that serves the sticker for a minute, or null when there is no such mark for this person. */
export async function markUrl(id: string, viewerId: string, size: MarkSize): Promise<string | null> {
  const mark = await pictureMarkById(id);
  if (!mark || !(await canSeeMark(mark, viewerId))) return null;
  return signedUrl(size === "source" ? mark.sourceKey : mark.stampKey);
}
