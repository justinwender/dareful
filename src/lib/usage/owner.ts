/**
 * Who may read the numbers (the field round, 3.1): the owner's account ids, from a server-only variable and
 * nowhere else. Anyone else gets the code screen, as for an address that does not exist, so the page's
 * existence is not told.
 */
export function ownerIds(env: NodeJS.ProcessEnv = process.env): Set<string> {
  return new Set((env.OWNER_USER_IDS ?? "").split(",").map((s) => s.trim()).filter((s) => s.length > 0));
}

export function isOwner(userId: string | null | undefined, env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(userId) && ownerIds(env).has(userId as string);
}
