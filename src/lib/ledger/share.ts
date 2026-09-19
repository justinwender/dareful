/**
 * What a share card may say about a cover (docs/decisions.md, "What a share card says"). These links land in
 * group chats where everyone sees the preview, and a preview is fetched by a bot with no session and cached.
 * So: the first name of the person who covered, and that there is something to look at. Never an amount, a
 * unit, a memo, or the other person's name. Anything that is not a live cover between two account-holders
 * gets the plain card, identical for an unknown id, a malformed one, and a closed one.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { pendingForClaim, readClaimLink } from "@/lib/ledger/claims";
import { clip, plainCard, type ShareCard } from "@/lib/ui/share-card";
import { firstName } from "@/lib/ui/copy";

/** What a share route shows a visitor with no session: the card, and the text metadata beside it. */
export type ProposalShare = { card: ShareCard; title: string; description: string; sender: string | null };

const PLAIN: ProposalShare = { card: plainCard, title: "Dareful", description: plainCard.footer, sender: null };
const DESCRIPTION = "Have a look. Nothing counts until you say so.";

export async function proposalShareCard(rawId: string): Promise<ProposalShare> {
  const id = z.string().uuid().safeParse(rawId);
  if (!id.success) return PLAIN;
  const rows = await db
    .select({ status: schema.obligationProposals.status, creditor: schema.users.displayName })
    .from(schema.obligationProposals)
    .innerJoin(schema.users, eq(schema.users.id, schema.obligationProposals.toUser))
    .where(eq(schema.obligationProposals.id, id.data))
    .limit(1)
    .catch(() => []);
  const row = rows[0];
  if (!row || row.status !== "pending") return PLAIN;
  const who = clip(firstName(row.creditor), 18);
  if (!who) return PLAIN;
  const title = `${who} got this one`;
  return { card: { kicker: "Dareful", headline: `${title}.`, footer: DESCRIPTION }, title, description: DESCRIPTION, sender: who };
}

/** A claim link: the sender's first name and whether it is one thing or several. A dead link gets the plain card. */
export async function claimShareCard(token: string): Promise<ProposalShare> {
  const link = await readClaimLink(token).catch(() => null);
  if (!link || link.claim.claimedBy) return PLAIN;
  const who = clip(firstName(link.creatorName), 18);
  if (!who) return PLAIN;
  const n = (await pendingForClaim(link.claim.id)).length;
  const title = `${who} got this one`;
  return { card: { kicker: "Dareful", headline: n > 1 ? `${who} got these.` : `${title}.`, footer: DESCRIPTION }, title, description: DESCRIPTION, sender: who };
}

/**
 * A question someone asked their group. The card carries the question, because the question is the invitation
 * (PLANNING.md 8b: the terms are on the card before anyone enters), and how many are in. Never a number anyone
 * gave, never what is on it, never a name. A draft, or an id that matches nothing, gets the plain card.
 */
export async function marketShare(rawId: string): Promise<ProposalShare & { question: string | null }> {
  const id = z.string().uuid().safeParse(rawId);
  if (!id.success) return { ...PLAIN, question: null };
  const rows = await db
    .select({ title: schema.dares.title, opened: schema.dares.creatorSignature, resolvedAt: schema.dares.resolvedAt })
    .from(schema.dares)
    .where(eq(schema.dares.id, id.data))
    .limit(1)
    .catch(() => []);
  const row = rows[0];
  if (!row || !row.opened) return { ...PLAIN, question: null };
  const question = clip(row.title, 110);
  const description = row.resolvedAt ? "See how everyone did." : "Put your number on it.";
  return { card: { kicker: "Dareful", headline: question, footer: description }, title: question, description, sender: null, question };
}
