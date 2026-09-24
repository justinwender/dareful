import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ConfirmProposal, type ConfirmPayload } from "@/components/ledger/confirm-proposal";
import { CoveredCard } from "@/components/ledger/covered-card";
import { Screen, TopBar } from "@/components/ledger/screen";
import { SignInButton } from "@/components/auth/sign-in-button";
import { currentUser } from "@/lib/auth/session";
import { proposalShareCard } from "@/lib/ledger/share";
import { claimById } from "@/lib/ledger/claims";
import { denominationById } from "@/lib/ledger/denominations";
import { confirmTypedData, proposalById } from "@/lib/ledger/proposals";
import type { Address } from "viem";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

/** The preview names who covered, by first name, and nothing about what, how much, or for whom. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const share = await proposalShareCard(id);
  return {
    title: share.title,
    description: share.description,
    robots: { index: false, follow: false },
    openGraph: { title: share.title, description: share.description },
  };
}

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const clock = await viewerClock();
  const me = await currentUser();
  const { id } = await params;
  if (!me) {
    // Signed out (which includes every preview bot): the page answers rather than redirecting, so a pasted
    // link gets its card, and it says no more than the card does. The link does not sign anyone in.
    const share = await proposalShareCard(id);
    return (
      <Screen>
        <TopBar title="dareful" />
        <div className="flex flex-col gap-6 py-10">
          <h1 className="text-question text-ink">{share.sender ? `${share.sender} got this one.` : "Nothing to see here yet."}</h1>
          <p className="text-body text-ink-2">{share.sender ? "Sign in to have a look. Nothing counts until you say so." : "If a friend sent you this, sign in and it will be there."}</p>
          <SignInButton label="Sign in" />
        </div>
      </Screen>
    );
  }
  const proposal = await proposalById(id);
  if (!proposal) notFound();

  // A cover logged against someone who is not here yet. Only the person who logged it can see it, and it is
  // where logging a cover for "someone new" always lands, whoever that person turned out to be.
  if (proposal.fromClaim && proposal.toUser === me.id) {
    const ghost = await claimById(proposal.fromClaim);
    const unit = await denominationById(proposal.denomId);
    const [g] = await db.select().from(schema.groups).where(eq(schema.groups.id, proposal.groupId)).limit(1);
    if (!ghost || !unit) notFound();
    return (
      <Screen>
        <TopBar back />
        <div className="flex flex-col gap-6 py-2">
          <h1 className="text-question text-ink">You got this one.</h1>
          <CoveredCard
            clock={clock}
            viewerId={me.id}
            creditor={me}
            debtor={{ id: ghost.id, displayName: ghost.displayName, ghost: true }}
            denomination={unit}
            quantity={proposal.quantity ?? 1n}
            amountCents={proposal.amountCents}
            memo={proposal.memo}
            at={proposal.createdAt}
            groupName={g?.name ?? null}
            state="pending"
          />
          <p className="text-body text-ink-2">{proposal.status === "pending" ? `Waiting for ${ghost.displayName}.` : "Not this one."}</p>
        </div>
      </Screen>
    );
  }
  if (!proposal.fromUser || !proposal.toUser) notFound();
  if (proposal.fromUser !== me.id && proposal.toUser !== me.id) notFound();
  const [debtor] = await db.select().from(schema.users).where(eq(schema.users.id, proposal.fromUser)).limit(1);
  const [creditor] = await db.select().from(schema.users).where(eq(schema.users.id, proposal.toUser)).limit(1);
  const denomination = await denominationById(proposal.denomId);
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, proposal.groupId)).limit(1);
  if (!debtor || !creditor || !denomination) notFound();

  // The person who covered used to be a ghost, and has since turned out to be someone. The one named here
  // confirms that afresh: their approval names the person it goes to, so it can only be given now, and it is
  // never given for them (PLANNING.md section 4, "Misbinding").
  const [wasGhost] = proposal.toBoundClaim
    ? await db.select({ displayName: schema.participantClaims.displayName }).from(schema.participantClaims).where(eq(schema.participantClaims.id, proposal.toBoundClaim)).limit(1)
    : [];

  const iAmDebtor = proposal.fromUser === me.id;
  const other = iAmDebtor ? creditor : debtor;
  const typed = confirmTypedData(proposal, creditor.ledgerWallet as Address);
  const payload: ConfirmPayload = {
    proposalId: proposal.id,
    ledgerWallet: debtor.ledgerWallet,
    domain: typed.domain,
    message: { ...typed.message, qty: typed.message.qty.toString() },
    redirectTo: `/p/${other.id}`,
  };
  const state = proposal.status === "pending" ? "pending" : proposal.status === "confirmed" ? "open" : "pending";

  return (
    <Screen>
      <TopBar back />
      <div className="flex flex-col gap-6 py-2">
        <h1 className="text-question text-ink">{iAmDebtor ? `${creditor.displayName} got this one.` : `You got this one.`}</h1>
        <CoveredCard
          clock={clock}
          viewerId={me.id}
          creditor={creditor}
          debtor={debtor}
          denomination={denomination}
          quantity={proposal.quantity ?? 1n}
          amountCents={proposal.amountCents}
          memo={proposal.memo}
          at={proposal.createdAt}
          groupName={group?.name ?? null}
          state={state}
        />
        {proposal.status !== "pending" ? (
          <p className="text-body text-ink-2">{proposal.status === "confirmed" ? "All set." : "Not this one."}</p>
        ) : iAmDebtor ? (
          <>
            {wasGhost ? (
              <p className="rounded-card border border-dashed border-line-strong px-4 py-3 text-body text-ink-2">
                The <span className="text-body-strong text-ink">{wasGhost.displayName}</span> this was with turned out to be{" "}
                <span className="text-body-strong text-ink">{creditor.displayName}</span>. If that’s the right person, say yes. If it isn’t, say not this one.
              </p>
            ) : null}
            <p className="text-body text-ink-2">Sound right? One tap and it’s on the record between you two.</p>
            <ConfirmProposal payload={payload} />
          </>
        ) : (
          <p className="text-body text-ink-2">Waiting for {debtor.displayName}.</p>
        )}
      </div>
    </Screen>
  );
}
