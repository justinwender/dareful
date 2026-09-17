"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { createGroup, redeemInvite } from "@/lib/ledger/groups";

export async function createGroupAction(formData: FormData): Promise<void> {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) throw new Error("a group needs a name");
  const group = await createGroup({ name, createdBy: user.id });
  redirect(`/g/${group.id}`);
}

export async function redeemInviteAction(token: string): Promise<{ groupId: string } | { error: string }> {
  const user = await requireUser();
  const group = await redeemInvite(token, user.id);
  if (!group) return { error: "That link has expired or was never valid." };
  return { groupId: group.id };
}
