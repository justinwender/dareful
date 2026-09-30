/**
 * Where a photo added on a game's night goes (docs/design.md 3.37). The night's strip reads every question of the
 * game, but a photo attaches to one of them, and the server admits a memory only from someone in that question
 * (src/lib/media/index.ts). So it goes on the earliest question this person is in, never simply the first question
 * asked: someone in a later question alone was offered the plus and refused, with nothing said. Pure, so the
 * choice has a test.
 */
export function nightPhotoTarget<T extends { dare: { id: string; createdAt: Date; creatorSignature: Buffer | null } }>(running: readonly T[], positionsOfMarket: ReadonlyMap<string, ReadonlyArray<{ userId: string | null }>>, viewerId: string): T | null {
  const mine = running.filter((r) => r.dare.creatorSignature !== null && (positionsOfMarket.get(r.dare.id) ?? []).some((p) => p.userId === viewerId));
  return [...mine].sort((a, b) => a.dare.createdAt.getTime() - b.dare.createdAt.getTime())[0] ?? null;
}
