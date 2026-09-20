"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { dismissNamePrompt, nameGroup, redeemInvite } from "@/lib/ledger/groups";
import { MarketError } from "@/lib/ledger/markets";
import { readPastedLink } from "@/lib/ledger/room-code";
import { joinByCode, joinByMarketLink, roomCodeFor } from "@/lib/ledger/rooms";

const uuid = z.string().uuid();
type Refusal = { error: string; at: "field" | "form" };

/**
 * A code someone read out. A wrong shape is the field's problem; a code that matches nothing, or too many
 * tries, is the form's, and what was typed is kept either way (docs/design.md 3.16). Success is a redirect to
 * the market, already a member or not.
 */
export async function joinByCodeAction(raw: string): Promise<Refusal> {
  const user = await requireUser();
  const typed = z.string().max(40).safeParse(raw);
  if (!typed.success) return { error: "Codes are six characters.", at: "field" };
  let marketId: string;
  try {
    ({ marketId } = await joinByCode(typed.data, user.id));
  } catch (err) {
    if (err instanceof MarketError) return { error: err.message, at: err.code === "bad_input" ? "field" : "form" };
    console.error("join by code failed", err);
    return { error: "That didn't go through. Try again.", at: "form" };
  }
  revalidatePath("/");
  redirect(`/m/${marketId}`);
}

/** A link pasted into the joining screen: a question's link or a group's. Only this app's own paths are read. */
export async function joinByLinkAction(raw: string): Promise<Refusal> {
  const user = await requireUser();
  const typed = z.string().max(400).safeParse(raw);
  const link = typed.success ? readPastedLink(typed.data) : null;
  if (!link) return { error: "That isn't a Dareful link. It starts with dareful.app.", at: "field" };
  let to: string;
  try {
    if ("marketId" in link) to = `/m/${(await joinByMarketLink(link.marketId, user.id)).marketId}`;
    else {
      const group = await redeemInvite(link.inviteToken, user.id);
      if (!group) return { error: "That link has been turned off or has run out. Ask for a new one.", at: "form" };
      to = "/";
    }
  } catch (err) {
    if (err instanceof MarketError) return { error: err.message, at: "form" };
    console.error("join by link failed", err);
    return { error: "That didn't go through. Try again.", at: "form" };
  }
  revalidatePath("/");
  redirect(to);
}

/** "Join as Sam": the person looking at a question's invitation says yes to it. */
export async function joinMarketAction(rawId: string): Promise<{ error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  if (!id.success) return { error: "That link doesn't go anywhere. Ask them to send it again." };
  try {
    await joinByMarketLink(id.data, user.id);
  } catch (err) {
    return { error: err instanceof MarketError ? err.message : "That didn't go through. Try again." };
  }
  revalidatePath("/");
  redirect(`/m/${id.data}`);
}

export async function roomCodeAction(rawId: string): Promise<{ code: string } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  if (!id.success) return { error: "That one doesn't exist." };
  try {
    return { code: await roomCodeFor(id.data, user.id) };
  } catch (err) {
    return { error: err instanceof MarketError ? err.message : "Couldn't make a code. Try again." };
  }
}

export async function nameGroupAction(rawId: string, rawName: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  const name = z.string().trim().min(2).max(40).safeParse(rawName);
  if (!id.success) return { error: "That group doesn't exist." };
  if (!name.success) return { error: "A name needs at least two characters." };
  try {
    await nameGroup(id.data, user.id, name.data);
  } catch {
    return { error: "Only someone in the group can name it." };
  }
  revalidatePath("/");
  return { ok: true };
}

/** "Not now" on the naming question under the picker. */
export async function dismissNamePromptAction(rawId: string): Promise<void> {
  const user = await requireUser();
  const id = uuid.safeParse(rawId);
  if (id.success) await dismissNamePrompt(id.data, user.id);
}
