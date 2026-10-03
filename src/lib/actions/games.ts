"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { isHex, type Hex } from "viem";
import { z } from "zod";
import { db, schema } from "@/db";
import { and, eq, gte } from "drizzle-orm";
import { currentUser } from "@/lib/auth/session";
import { WORDS } from "@/lib/ui/errors";
import { denominationById, ensureUnitInGroup, ensureUsd } from "@/lib/ledger/denominations";
import { createOccasionGroup, isMember, setForPeople } from "@/lib/ledger/groups";
import { createTypedData, MarketError, marketById, openMarket, stateOf } from "@/lib/ledger/markets";
import { notifyOpened } from "@/lib/notify";
import { sportDueForSync, startGame, syncSchedule } from "@/lib/sports";
import { viewerZone } from "@/lib/ui/zone";

const uuid = z.string().uuid();
const say = (err: unknown, fallback: string) => (err instanceof MarketError ? err.message : fallback);

const Unit = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("usd") }),
  z.object({ kind: z.literal("existing"), id: uuid }),
  z.object({ kind: z.literal("new"), template: z.enum(["beer", "coffee", "round", "next_time"]).nullable(), label: z.string().trim().min(1).max(40) }),
]);
const Who = z.discriminatedUnion("kind", [z.object({ kind: z.literal("set"), groupId: uuid }), z.object({ kind: z.literal("people"), userIds: z.array(uuid).min(1).max(11) }), z.object({ kind: z.literal("link") })]);
const Start = z.object({ gameId: uuid, keys: z.array(z.enum(["home_wins", "margin", "total", "first_drive"])).min(1).max(4), who: Who, unit: Unit, blind: z.boolean().default(false) });

/** What the asker signs for each question started: the `Create` message, as strings, and the draft's id. */
export type ToOpen = { id: string; title: string; create: { dareId: Hex; groupId: Hex; kind: number; pace: number; termsHash: Hex; denomId: Hex; range: string; options: number; stalemate: number; resolvesBy: string } };

/**
 * Starting a game (docs/design.md 3.33): one ordinary market per chosen question, all with the same people, all
 * closing at kickoff, one stakes row covering them all. The drafts come back with what the asker signs to open
 * each, since a draft is only its asker's until their `Create` signature; the group sees only those.
 */
export async function startGameAction(input: z.input<typeof Start>): Promise<{ ok: true; groupId: string; toOpen: ToOpen[] } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  const parsed = Start.safeParse(input);
  if (!parsed.success) return { error: "Something in that is off." };
  const d = parsed.data;
  try {
    if (d.who.kind === "set" && !(await isMember(d.who.groupId, user.id))) return { error: "You're not one of those people." };
    if (d.who.kind !== "set" && d.unit.kind === "existing") return { error: "That unit isn't around any more. Pick another." };
    const groupId = d.who.kind === "set" ? d.who.groupId : d.who.kind === "people" ? (await setForPeople(user.id, d.who.userIds)).id : (await createOccasionGroup(user.id)).id;
    const denom = d.unit.kind === "usd" ? await ensureUsd(groupId, user.id) : d.unit.kind === "existing" ? await denominationById(d.unit.id) : await ensureUnitInGroup(groupId, user.id, d.unit);
    if (!denom) return { error: "That unit isn't around any more. Pick another." };
    const drafts = await startGame({ gameId: d.gameId, keys: d.keys, creatorId: user.id, groupId, denomId: denom.id, zone: await viewerZone(), blind: d.blind });
    const toOpen: ToOpen[] = drafts.map((row) => {
      const m = createTypedData(row).message;
      return { id: row.id, title: row.title, create: { dareId: m.dareId, groupId: m.groupId, kind: m.kind, pace: m.pace, termsHash: m.termsHash, denomId: m.denomId, range: m.range.toString(), options: m.options, stalemate: m.stalemate, resolvesBy: m.resolvesBy.toString() } };
    });
    return { ok: true, groupId, toOpen };
  } catch (err) {
    return { error: say(err, "Couldn't start that.") };
  }
}

/** The asker's `Create` signatures, one per question started: each opens its market for the group. A signature that fails leaves that one a draft, listed on the page as such. */
export async function openGameQuestionsAction(signed: Array<{ id: string; signature: string }>): Promise<{ ok: true; opened: string[] } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  const parsed = z.array(z.object({ id: uuid, signature: z.string() })).min(1).max(4).safeParse(signed);
  if (!parsed.success || parsed.data.some((s) => !isHex(s.signature))) return { error: "That didn't come through. Try again." };
  const opened: string[] = [];
  for (const s of parsed.data) {
    try {
      const row = await openMarket(s.id, user.id, s.signature as Hex);
      if (stateOf(row) === "open") {
        opened.push(row.id);
        after(() => notifyOpened(row.id, user.id));
      }
    } catch (err) {
      return { error: say(err, "That didn't go through. Try again.") };
    }
  }
  revalidatePath("/");
  revalidatePath("/on");
  return { ok: true, opened };
}

/** "Try again" on the failed-feed state (3.32): re-reads the stalest sport's schedule now, once a minute at most for everyone. */
export async function refreshWhatsOnAction(): Promise<{ ok: true } | { error: string }> {
  if (!(await currentUser())) return { error: WORDS.signedOut };
  const recent = await db.select({ sport: schema.sportsFeedReads.sport }).from(schema.sportsFeedReads).where(and(eq(schema.sportsFeedReads.source, "espn"), gte(schema.sportsFeedReads.lastOkAt, new Date(Date.now() - 60_000)))).limit(1);
  if (recent.length > 0) {
    revalidatePath("/on");
    return { ok: true };
  }
  const sport = (await sportDueForSync(new Date())) ?? "nfl";
  try {
    await syncSchedule(sport, new Date());
  } catch {
    return { error: "Couldn’t get the latest games." };
  }
  revalidatePath("/on");
  return { ok: true };
}

/** Whether a market is one this person may read as a draft to finish on the game page. */
export async function draftOwnedAction(rawId: string): Promise<boolean> {
  const user = await currentUser();
  if (!user) return false;
  const id = uuid.safeParse(rawId);
  if (!id.success) return false;
  const d = await marketById(id.data);
  return d !== null && d.creatorId === user.id && stateOf(d) === "draft";
}
