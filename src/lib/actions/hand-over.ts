"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth/session";
import { WORDS } from "@/lib/ui/errors";
import { enterFromHost, withdrawHostedEntry } from "@/lib/ledger/hand-over";
import { LOCK_AFTER } from "@/lib/ledger/pass-the-phone";
import { MarketError } from "@/lib/ledger/markets";
import { notifyEnteredFrom, notifyJoined, notifyAllIn } from "@/lib/notify";

const uuid = z.string().uuid();
const Position = z.object({ stake: z.string().regex(/^\d{1,30}$/), value: z.string().regex(/^-?\d{1,30}$/) });

/** The one explainer for passing the phone was seen (3.42): remembered on the account, so no phone of this person's shows it again. */
export async function handOverExplainedAction(): Promise<{ ok: true } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  await db.update(schema.users).set({ handOverExplainedAt: new Date() }).where(eq(schema.users.id, user.id));
  return { ok: true };
}

/**
 * The friend's entry from this phone (3.45, frame 5): the host's session makes the request, the friend's PIN
 * proves who they are, and the friend's own delegated share signs an entry the server built. A wrong PIN says so
 * with the tries left before the lock; three wrong end the handoff on the client. Nothing of the friend's is
 * kept here.
 */
export async function enterFromHostAction(rawDareId: string, rawPosition: unknown, rawFriendId: string, rawPin: string): Promise<{ ok: true; changeUntil: string | null } | { ok: false; wrong: true; triesLeft: number } | { ok: false; locked: true } | { ok: false; error: string }> {
  const host = await currentUser();
  if (!host) return { ok: false, error: WORDS.signedOut };
  const dareId = uuid.safeParse(rawDareId);
  const friendId = uuid.safeParse(rawFriendId);
  const position = Position.safeParse(rawPosition);
  if (!dareId.success || !friendId.success || !position.success || typeof rawPin !== "string") return { ok: false, error: "That didn't come through. Try again." };
  const r = await enterFromHost({ dareId: dareId.data, hostId: host.id, friendId: friendId.data, stake: BigInt(position.data.stake), value: BigInt(position.data.value), pin: rawPin, request: "enterFromHostAction" });
  if (!r.ok) {
    if ("pin" in r) return r.pin.locked ? { ok: false, locked: true } : { ok: false, wrong: true, triesLeft: Math.min(r.pin.triesLeft, LOCK_AFTER) };
    return { ok: false, error: r.refused };
  }
  revalidatePath(`/m/${dareId.data}`);
  revalidatePath("/");
  after(() => notifyJoined(dareId.data, friendId.data));
  after(() => notifyAllIn(dareId.data, friendId.data));
  after(() => notifyEnteredFrom(friendId.data, host.id, dareId.data).catch((err: unknown) => console.error("the entered-from notice did not go out", err instanceof Error ? err.message : err)));
  const [d] = await db.select({ resolvesBy: schema.dares.resolvesBy }).from(schema.dares).where(eq(schema.dares.id, dareId.data));
  return { ok: true, changeUntil: d?.resolvesBy?.toISOString() ?? null };
}

/** Withdrawing a blind entry made on a friend's phone, from the person's own phone (3.45). */
export async function withdrawHostedEntryAction(rawDareId: string): Promise<{ ok: true } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  const dareId = uuid.safeParse(rawDareId);
  if (!dareId.success) return { error: "That one doesn't exist." };
  try {
    await withdrawHostedEntry(dareId.data, user.id);
  } catch (err) {
    return { error: err instanceof MarketError ? err.message : "That didn't go through. Try again." };
  }
  revalidatePath(`/m/${dareId.data}`);
  revalidatePath("/");
  return { ok: true };
}
