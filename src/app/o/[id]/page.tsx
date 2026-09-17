import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { ConfirmProposal, type ConfirmPayload } from "@/components/ledger/confirm-proposal";
import { CoveredCard } from "@/components/ledger/covered-card";
import { Screen, TopBar } from "@/components/ledger/screen";
import { currentUser } from "@/lib/auth/session";
import { denominationById } from "@/lib/ledger/denominations";
import { confirmTypedData, proposalById } from "@/lib/ledger/proposals";
import type { Address } from "viem";

export const dynamic = "force-dynamic";

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser();
  if (!me) redirect("/");
  const { id } = await params;
  const proposal = await proposalById(id);
  if (!proposal || !proposal.fromUser || !proposal.toUser) notFound();
  if (proposal.fromUser !== me.id && proposal.toUser !== me.id) notFound();
  const [debtor] = await db.select().from(schema.users).where(eq(schema.users.id, proposal.fromUser)).limit(1);
  const [creditor] = await db.select().from(schema.users).where(eq(schema.users.id, proposal.toUser)).limit(1);
  const denomination = await denominationById(proposal.denomId);
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, proposal.groupId)).limit(1);
  if (!debtor || !creditor || !denomination) notFound();

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
      <TopBar back={{ href: `/p/${other.id}`, label: "Back" }} />
      <div className="flex flex-col gap-6 py-2">
        <h1 className="text-question text-ink">{iAmDebtor ? `${creditor.displayName} got this one.` : `You got this one.`}</h1>
        <CoveredCard
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
