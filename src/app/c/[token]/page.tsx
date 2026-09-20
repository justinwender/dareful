import type { Metadata } from "next";
import { claimShareCard } from "@/lib/ledger/share";
import Link from "next/link";
import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { Avatar } from "@/components/ledger/avatar";
import { ClaimChoice, ConcedeButton } from "@/components/ledger/claim-landing";
import { CoveredCard } from "@/components/ledger/covered-card";
import { Screen, TopBar } from "@/components/ledger/screen";
import { readClaimTokens } from "@/lib/auth/claim-cookie";
import { currentUser } from "@/lib/auth/session";
import { claimsForBrowserTokens, pendingForClaim, readClaimLink } from "@/lib/ledger/claims";
import { denominationsByIds } from "@/lib/ledger/denominations";
import { viewerClock } from "@/lib/ui/zone";

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

  if (!link) {
    return (
      <Screen>
        <TopBar title="Dareful" />
        <div className="flex flex-1 flex-col justify-center gap-6 py-10">
          <h1 className="text-display text-ink">That link has expired.</h1>
          <p className="text-body text-ink-2">Ask whoever sent it for a fresh one.</p>
        </div>
      </Screen>
    );
  }

  const { claim, creatorName } = link;
  if (me && claim.claimedBy === me.id) redirect("/welcome");
  if (me && claim.createdBy === me.id) {
    return (
      <Screen>
        <TopBar title="Dareful" back={{ href: `/p/c/${claim.id}`, label: "Back" }} />
        <div className="flex flex-1 flex-col justify-center gap-6 py-10">
          <h1 className="text-display text-ink">This is the link you made for {claim.displayName}.</h1>
          <p className="text-body text-ink-2">Send it to them from your own messages. It does nothing for you.</p>
          <Link prefetch={false} href={`/p/c/${claim.id}`} className="text-[15px] font-semibold text-ink-2">
            Back to {claim.displayName}
          </Link>
        </div>
      </Screen>
    );
  }
  if (claim.claimedBy) {
    return (
      <Screen>
        <TopBar title="Dareful" />
        <div className="flex flex-1 flex-col justify-center gap-6 py-10">
          <h1 className="text-display text-ink">Someone already said this was them.</h1>
          <p className="text-body text-ink-2">If that was you, sign in and it’s all there. If it wasn’t, tell {creatorName}.</p>
          {me ? (
            <Link prefetch={false} href="/" className="text-[15px] font-semibold text-ink-2">
              Go home
            </Link>
          ) : null}
        </div>
      </Screen>
    );
  }

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
      <TopBar title="Dareful" />
      <div className="flex flex-col gap-6 py-6">
        <div className="flex items-center gap-4">
          <Avatar name={claim.displayName} hue="stone" size={56} ghost />
          <p className="text-body text-ink-2">
            {creatorName} thinks you’re <span className="text-body-strong text-ink">{claim.displayName}</span>.
          </p>
        </div>
        <h1 className="text-display-xl text-ink">{rows.length === 1 ? `${creatorName} got this one.` : rows.length === 0 ? `${creatorName} added you.` : `${creatorName} got these.`}</h1>
        {rows.length > 0 ? (
          <div className="flex flex-col gap-3">
            {rows.map((r) => {
              const denomination = denoms.get(r.denomId);
              const creditor = r.toUser ? creditorById.get(r.toUser) : undefined;
              if (!denomination || !creditor) return null;
              return (
                <div key={r.id} className="flex flex-col gap-1">
                  <CoveredCard
                    clock={clock}
                    viewerId={claim.id}
                    creditor={creditor}
                    debtor={you}
                    denomination={denomination}
                    quantity={r.quantity ?? 1n}
                    amountCents={r.amountCents}
                    memo={r.memo}
                    at={r.createdAt}
                    groupName={null}
                    state="pending"
                    pendingHint="Nothing counts until you say so"
                  />
                  {held ? <ConcedeButton proposalId={r.id} conceded={r.concededAt !== null} /> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-body text-ink-2">Nothing is waiting on you. They just wanted you in.</p>
        )}
        <ClaimChoice token={token} name={claim.displayName} signedIn={Boolean(me)} held={held} />
        {me ? <p className="text-caption text-ink-3">Not you? Just close this. Nothing happens unless you tap.</p> : null}
      </div>
    </Screen>
  );
}
