/**
 * A position belongs to a participant: an account-holder (`user_id`) or a ghost (`claim_id`), exactly one of
 * the two (PLANNING.md section 4). Screens read positions by participant id, so a ghost's number counts and
 * draws like anyone's; only signing, voting and the chain are for account-holders, and those paths check
 * `userId` themselves.
 */
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";

export type Participant = { id: string; displayName: string; ghost: boolean };

/** The participant id of a position: the user, or the ghost. */
export const pidOf = (p: { userId: string | null; claimId: string | null }): string => (p.userId ?? p.claimId) as string;

/** Names for participant ids, whichever kind each is. A merged ghost reads as itself; its rows were moved at the merge. */
export async function participantsOf(ids: string[]): Promise<Map<string, Participant>> {
  const unique = Array.from(new Set(ids.filter((x) => typeof x === "string" && x.length > 0)));
  if (unique.length === 0) return new Map();
  const [users, claims] = await Promise.all([
    db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, unique)),
    db.select({ id: schema.participantClaims.id, displayName: schema.participantClaims.displayName }).from(schema.participantClaims).where(inArray(schema.participantClaims.id, unique)),
  ]);
  const out = new Map<string, Participant>();
  for (const u of users) out.set(u.id, { id: u.id, displayName: u.displayName, ghost: false });
  for (const c of claims) if (!out.has(c.id)) out.set(c.id, { id: c.id, displayName: c.displayName, ghost: true });
  return out;
}
