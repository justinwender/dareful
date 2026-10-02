import type { Metadata } from "next";
import { claimShareCard } from "@/lib/ledger/share";
import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { Avatar } from "@/components/ledger/avatar";
import { ClaimChoice, ConcedeButton } from "@/components/ledger/claim-landing";
import { ClaimGone } from "@/components/ledger/claim-gone";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { Screen, TopBar } from "@/components/ledger/screen";
import { coveredSentence, dayLabel, gotSentence } from "@/lib/ui/copy";
import { readClaimTokens } from "@/lib/auth/claim-cookie";
import { currentUser } from "@/lib/auth/session";
import { claimsForBrowserTokens, pendingForClaim, readClaimLink } from "@/lib/ledger/claims";
import { denominationsByIds } from "@/lib/ledger/denominations";
import { viewerClock } from "@/lib/ui/zone";
import { LinkOpened } from "@/components/ui/usage";

export const dynamic = "force-dynamic";

/**
 * The text beside the card a messaging app shows for this link (the image is opengraph-image.tsx). Both are
 * fetched by a preview bot with no session, so they say only what the sender's own message already implies:
 * who sent it. Never what it was or how much. A dead link reads as the plain card.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const share = await claimShareCard(token);
  return {
    title: share.title,
    description: share.description,
    robots: { index: false, follow: false },
    openGraph: { title: share.title, description: share.description },
  };
}

/**
 * Where a claim link lands. Opening it changes nothing: no token is issued, nobody is signed in, and a
 * preview bot fetching it leaves no trace. It shows what the sender says is between you, who they think you
 * are, and the choice. A link never authenticates.
 */
export default async function ClaimLinkPage({ params }: { params: Promise<{ token: string }> }) {
  const clock = await viewerClock();
  const { token } = await params;
  const link = await readClaimLink(token);
  const me = await currentUser();

  if (!link) return <ClaimGone state="expired" signedIn={Boolean(me)} />;

  const { claim, creatorName } = link;
  if (me && claim.claimedBy === me.id) redirect("/welcome");
  if (me && claim.createdBy === me.id) return <ClaimGone state="own" signedIn name={claim.displayName} claimId={claim.id} />;
  if (claim.claimedBy) return <ClaimGone state="used" signedIn={Boolean(me)} creatorName={creatorName} />;

  const rows = await pendingForClaim(claim.id);
  const denoms = await denominationsByIds(Array.from(new Set(rows.map((r) => r.denomId))));
  const creditorIds = Array.from(new Set(rows.map((r) => r.toUser).filter((x): x is string => Boolean(x))));
  const creditors = creditorIds.length ? await db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, creditorIds)) : [];
  const creditorById = new Map(creditors.map((c) => [c.id, c]));
  const held = me ? false : (await claimsForBrowserTokens(await readClaimTokens())).some((c) => c.id === claim.id);
  // The cards are written to "you": this page is for the person the sender thinks you are.
  const you = { id: claim.id, displayName: claim.displayName, ghost: true };

  return (
    <Screen>
      <LinkOpened link="claim" signedIn={Boolean(me)} />
      <TopBar wordmark back={Boolean(me)} info="claim-landing" />
      <div className="flex flex-col gap-6 py-6">
        <div className="flex items-center gap-4">
          <Avatar name={claim.displayName} hue="stone" size={56} ghost />
          <p className="text-body text-ink-2">
            {creatorName} thinks you’re <span className="text-body-strong text-ink">{claim.displayName}</span>.
          </p>
        </div>
        <h1 className="text-serif-xl text-ink">{rows.length === 1 ? `${creatorName} got this one.` : rows.length === 0 ? `${creatorName} added you.` : `${creatorName} got these.`}</h1>
        {rows.length > 0 ? (
          // Claim rows (docs/design.md 3.38, 4.8): a 13px 600 kicker with the date, the subject in body 600 whatever kind of
          // event it is, and one body-sm line carrying the token. Never an event card: that would put serif 26 beside the serif 40 headline.
          <div className="flex flex-col divide-y divide-line rounded-card border border-line bg-surface">
            {rows.map((r) => {
              const denomination = denoms.get(r.denomId);
              const creditor = r.toUser ? creditorById.get(r.toUser) : undefined;
              if (!denomination || !creditor) return null;
              return (
                <div key={r.id} className="flex flex-col gap-1 px-4 py-3">
                  <p className="text-label text-ink-3">
                    Covered · {dayLabel(r.createdAt, clock.zone)}
                  </p>
                  <p className="text-body-strong text-ink">{r.memo ?? coveredSentence(creditor, claim.id)}</p>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-body-sm text-ink-2">{gotSentence(you, creditor, claim.id)}</span>
                    <ObligationToken owner={{ id: you.id, displayName: you.displayName, hue: "stone", ghost: true }} other={creditor} viewerId={claim.id} denomination={denomination} quantity={r.quantity ?? 1n} pending />
                  </div>
                  {held ? <ConcedeButton proposalId={r.id} conceded={r.concededAt !== null} /> : null}
                </div>
              );
            })}
            <p className="px-4 py-3 text-caption text-ink-3">Nothing counts until you say so.</p>
          </div>
        ) : (
          <p className="text-body text-ink-2">Nothing needs a yes from you. They just wanted you in.</p>
        )}
        <ClaimChoice token={token} name={claim.displayName} signedIn={Boolean(me)} held={held} />
        {me ? <p className="text-caption text-ink-3">Not you? Just close this. Nothing happens unless you tap.</p> : null}
      </div>
    </Screen>
  );
}
