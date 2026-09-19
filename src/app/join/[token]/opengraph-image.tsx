import { groupWithMembers, readInvite } from "@/lib/ledger/groups";
import { clip, plainCard, renderShareCard, shareCardContentType, shareCardSize } from "@/lib/ui/share-card";

export const alt = "You’re invited";
export const size = shareCardSize;
export const contentType = shareCardContentType;

/** The card for a group invite: the group's name and how many are in. A dead link gets the plain card. */
export default async function Image({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const invite = await readInvite(token).catch(() => null);
  const group = invite ? await groupWithMembers(invite.groupId) : null;
  if (!group || !group.name) return renderShareCard(plainCard);
  const n = group.members.length;
  return renderShareCard({
    kicker: "You’re invited",
    headline: clip(group.name, 40),
    footer: n === 1 ? "One person is in. Join them." : `${n} people are in. Join them.`,
  });
}
