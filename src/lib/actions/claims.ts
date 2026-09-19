"use server";

import { headers } from "next/headers";
import { z } from "zod";
import { addClaimToken, readClaimTokens } from "@/lib/auth/claim-cookie";
import { regionFromHeaders, tryHashPhone } from "@/lib/auth/phone";
import { currentUser, requireUser } from "@/lib/auth/session";
import {
  addGhostToGroup,
  bindClaimToUser,
  ClaimError,
  concede,
  createClaimLink,
  dismissGhost,
  issueBrowserToken,
  mergeGhost,
  readClaimLink,
  resolvePicked,
  spendContactResolution,
  suggestedGhostsFor,
} from "@/lib/ledger/claims";

const uuid = z.string().uuid();
const linkToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";
}

/** The plain message for the hourly limit on adding people by number. Surfaced, never a silent drop. */
const SLOW_DOWN = "That’s a lot of new people at once. Give it an hour, or add them by name for now.";

function say(err: unknown, fallback: string): string {
  if (!(err instanceof ClaimError)) return fallback;
  switch (err.code) {
    case "is_you":
      return "That one is you.";
    case "already_claimed":
      return "They have an account now.";
    case "not_yours":
      return "Only the person who added them can do that.";
    case "not_allowed":
      return "You can only do that with someone you share a group with.";
    case "slow_down":
      return SLOW_DOWN;
    default:
      return fallback;
  }
}

/** A link for one ghost, returned once for the creator's own composer. Dareful never sends anything. */
export async function createClaimLinkAction(rawClaimId: string): Promise<{ url: string } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawClaimId);
  if (!id.success) return { error: "That person does not exist." };
  try {
    return { url: `${appUrl()}/c/${await createClaimLink(id.data, user.id)}` };
  } catch (err) {
    return { error: say(err, "Could not make a link.") };
  }
}

/**
 * "That's me." The link never authenticates, so what this does depends on who is asking. Signed in, the tap
 * itself is the person saying the creator is right, and the ghost binds to them now. Signed out, nothing
 * binds: the browser keeps a token, and the ghost binds at the next login here.
 */
export async function thatsMeAction(rawToken: string): Promise<{ bound: true } | { held: true } | { error: string }> {
  const token = linkToken.safeParse(rawToken);
  if (!token.success) return { error: "That link has expired or was never valid." };
  const link = await readClaimLink(token.data);
  if (!link) return { error: "That link has expired or was never valid." };
  if (link.claim.claimedBy) return { error: "Someone already said that was them." };

  const me = await currentUser();
  if (me) {
    try {
      await bindClaimToUser(link.claim.id, me.id);
      return { bound: true };
    } catch (err) {
      return { error: say(err, "That didn't go through. Try again.") };
    }
  }
  const issued = await issueBrowserToken(token.data);
  if (!issued) return { error: "That link has expired or was never valid." };
  await addClaimToken(issued.browserToken);
  return { held: true };
}

/** A suggestion accepted: "Justin has things with a Gabe. Is that you?" Only ever on the person's own tap. */
export async function acceptSuggestionAction(rawClaimId: string): Promise<{ bound: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawClaimId);
  if (!id.success) return { error: "That person does not exist." };
  // The id must be one this person was actually offered: a same-named ghost in a group they are in.
  const offered = await suggestedGhostsFor(user.id, user.displayName);
  if (!offered.some((o) => o.claimId === id.data)) return { error: "That one isn't yours to take." };
  try {
    await bindClaimToUser(id.data, user.id);
    return { bound: true };
  } catch (err) {
    return { error: say(err, "That didn't go through. Try again.") };
  }
}

const MergeTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("user"), userId: uuid }),
  z.object({ kind: z.literal("claim"), claimId: uuid }),
]);

/** "This Gabe is that Gabe." */
export async function mergeGhostAction(rawClaimId: string, rawTarget: unknown): Promise<{ ok: true; to: string } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawClaimId);
  const target = MergeTarget.safeParse(rawTarget);
  if (!id.success || !target.success) return { error: "Pick who they are." };
  try {
    await mergeGhost(user.id, id.data, target.data);
    return { ok: true, to: target.data.kind === "user" ? `/p/${target.data.userId}` : `/p/c/${target.data.claimId}` };
  } catch (err) {
    return { error: say(err, "That didn't go through. Try again.") };
  }
}

export async function dismissGhostAction(rawClaimId: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const id = uuid.safeParse(rawClaimId);
  if (!id.success) return { error: "That person does not exist." };
  try {
    await dismissGhost(user.id, id.data);
    return { ok: true };
  } catch (err) {
    return { error: say(err, "That didn't go through. Try again.") };
  }
}

/** "Fine, you got me", from the browser holding the ghost's token. No account, and no binding force. */
export async function concedeAction(rawProposalId: string): Promise<{ ok: true } | { error: string }> {
  const id = uuid.safeParse(rawProposalId);
  if (!id.success) return { error: "That one does not exist." };
  const done = await concede(id.data, await readClaimTokens());
  return done ? { ok: true } : { error: "That one isn't yours to answer from here." };
}

const NewPerson = z.object({ name: z.string().trim().min(1).max(40), phone: z.string().max(40).optional() });

/** Adds someone to a named group before they exist, so every later market there just has them. */
export async function addGhostToGroupAction(rawGroupId: string, rawPerson: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const groupId = uuid.safeParse(rawGroupId);
  const person = NewPerson.safeParse(rawPerson);
  if (!groupId.success || !person.success) return { error: "Who is it?" };
  try {
    if (person.data.phone) await spendContactResolution(user.id);
    const phoneHash = person.data.phone ? tryHashPhone(person.data.phone, regionFromHeaders(await headers())) : null;
    const who = await resolvePicked({ creatorId: user.id, displayName: person.data.name, phoneHash });
    // Someone with an account joins by the group's link, on their own tap; a creator cannot seat them. The
    // answer is the same either way: whether the number belongs to an account stays on the server.
    if (who.kind === "claim") await addGhostToGroup(groupId.data, who.claimId, user.id);
    return { ok: true };
  } catch (err) {
    return { error: say(err, "Could not add that person.") };
  }
}
