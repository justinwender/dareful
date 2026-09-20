"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createGroup, createInvite, redeemInvite, revokeInvite } from "@/lib/ledger/groups";

const groupId = z.string().uuid();
const inviteId = z.string().regex(/^[0-9a-f]{64}$/);

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";
}

export async function createGroupAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("a group needs a name");
  const group = await createGroup({ name, createdBy: user.id });
  redirect("/");
}

/** Makes a link and returns it once. Only the hash is stored, so this is the only moment the link is readable. */
export async function createInviteAction(rawGroupId: string): Promise<{ url: string } | { error: string }> {
  const user = await requireUser();
  const parsed = groupId.safeParse(rawGroupId);
  if (!parsed.success) return { error: "That group does not exist." };
  try {
    const token = await createInvite(parsed.data, user.id);
    return { url: `${appUrl()}/join/${token}` };
  } catch {
    return { error: "Could not make a link for this group." };
  }
}

export async function revokeInviteAction(rawGroupId: string, rawInviteId: string): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  const g = groupId.safeParse(rawGroupId);
  const i = inviteId.safeParse(rawInviteId);
  if (!g.success || !i.success) return { error: "That link does not exist." };
  try {
    await revokeInvite(g.data, i.data, user.id);
    return { ok: true };
  } catch {
    return { error: "Could not turn that link off." };
  }
}

export async function redeemInviteAction(token: string): Promise<{ groupId: string } | { error: string }> {
  const user = await requireUser();
  const group = await redeemInvite(token, user.id);
  if (!group) return { error: "That link has expired or was never valid." };
  return { groupId: group.id };
}
