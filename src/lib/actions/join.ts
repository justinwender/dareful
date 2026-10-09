"use server";

import { createHmac } from "node:crypto";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { currentUser } from "@/lib/auth/session";
import { WORDS } from "@/lib/ui/errors";
import { dismissNamePrompt, nameGroup } from "@/lib/ledger/groups";
import { MarketError } from "@/lib/ledger/markets";
import { readPastedLink } from "@/lib/ledger/room-code";
import { joinByCode, joinByMarketLink, marketForCode, roomCodeFor } from "@/lib/ledger/rooms";
import { gameById } from "@/lib/sports";
import { deviceId, record } from "@/lib/usage";

const uuid = z.string().uuid();
type Refusal = { error: string; at: "field" | "form" };
/** What the paste field says to a text with no link of this app's in it. */
const NOT_A_LINK = "That isn't a Dareful link. It starts with dareful.app.";

/**
 * The network a request came from, as a keyed hash and never the address: what a guest's wrong codes are counted
 * against, since a guest has no account and a cookie can be cleared (the submission round, section 0). The platform
 * sets the forwarded address; anything without one is counted as one local network.
 */
async function networkOfRequest(): Promise<string> {
  const h = await headers();
  const address = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "local";
  return createHmac("sha256", process.env.SESSION_SECRET ?? "dareful").update(`code-guess:${address}`).digest("hex").slice(0, 32);
}

/**
 * A code someone read out. A wrong shape is the field's problem; a code that matches nothing, or too many
 * tries, is the form's, and what was typed is kept either way (docs/design.md 3.16). Success is a redirect to
 * the market, already a member or not. A code stands for its question's link (the submission round, section 0): for
 * someone with no session it opens that question, or its game's page, where a guest joins with a name exactly as from
 * the link, its wrong guesses counted against the network it came from.
 */
export async function joinByCodeAction(raw: string): Promise<Refusal> {
  const user = await currentUser();
  if (!user) return codeForGuest(raw);
  const typed = z.string().max(40).safeParse(raw);
  if (!typed.success) return { error: "Codes are six characters.", at: "field" };
  let marketId: string;
  try {
    ({ marketId } = await joinByCode(typed.data, user.id));
    await record("code_used", {}, { userId: user.id }, { dareId: marketId });
  } catch (err) {
    if (err instanceof MarketError) return { error: err.message, at: err.code === "bad_input" ? "field" : "form" };
    console.error("join by code failed", err);
    return { error: "That didn't go through. Try again.", at: "form" };
  }
  revalidatePath("/");
  redirect(`/m/${marketId}`);
}

/**
 * A code typed by someone with no session (the submission round, section 0): the question it is for, joining nobody,
 * and that question's own screen, where a guest joins with a name exactly as from its link (a game's question goes on
 * to its page). A miss is counted against the network it came from.
 */
async function codeForGuest(raw: string): Promise<Refusal> {
  const typed = z.string().max(40).safeParse(raw);
  if (!typed.success) return { error: "Codes are six characters.", at: "field" };
  let guestTo: string;
  try {
    guestTo = (await marketForCode(typed.data, { network: await networkOfRequest() })).id;
    await record("code_used", {}, { deviceId: await deviceId() }, { dareId: guestTo });
  } catch (err) {
    if (err instanceof MarketError) return { error: err.message, at: err.code === "bad_input" ? "field" : "form" };
    console.error("a guest's code failed", err);
    return { error: "That didn't go through. Try again.", at: "form" };
  }
  redirect(`/m/${guestTo}`);
}

/**
 * A link pasted into the joining screen: any link Dareful makes (the final round, section 4). A question's joins its
 * set and opens it, as tapping it in the chat would; a game's page opens for its set with its question, and joins
 * nobody (a person gets in by entering a question); a claim opens its own page. A text with none of these in it is the
 * field's problem.
 */
export async function joinByLinkAction(raw: string): Promise<Refusal> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut, at: "form" };
  const typed = z.string().max(600).safeParse(raw);
  const link = typed.success ? readPastedLink(typed.data) : null;
  if (!link) return { error: NOT_A_LINK, at: "field" };
  let to: string;
  try {
    if (link.kind === "market") to = `/m/${(await joinByMarketLink(link.marketId, user.id)).marketId}`;
    else if (link.kind === "game") {
      if (!(await gameById(link.gameId))) return { error: "That link doesn't go anywhere. Ask them to send it again.", at: "form" };
      to = `/on/${link.gameId}${link.groupId ? `/${link.groupId}` : ""}${link.questionId ? `?q=${link.questionId}` : ""}`;
    } else to = `/c/${link.token}`;
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
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
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
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
  const id = uuid.safeParse(rawId);
  if (!id.success) return { error: "That one doesn't exist." };
  try {
    const code = await roomCodeFor(id.data, user.id);
    await record("code_shown", {}, { userId: user.id }, { dareId: id.data });
    return { code };
  } catch (err) {
    return { error: err instanceof MarketError ? err.message : "Couldn't make a code. Try again." };
  }
}

export async function nameGroupAction(rawId: string, rawName: string): Promise<{ ok: true } | { error: string }> {
  const user = await currentUser();
  if (!user) return { error: WORDS.signedOut };
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
  const user = await currentUser();
  if (!user) return;
  const id = uuid.safeParse(rawId);
  if (id.success) await dismissNamePrompt(id.data, user.id);
}
