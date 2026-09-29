import { redirect } from "next/navigation";
import { inArray } from "drizzle-orm";
import type { Address } from "viem";
import { db, schema } from "@/db";
import { ConfirmAll, type ClaimRow, type ConfirmAllPayload } from "@/components/ledger/confirm-all";
import { Screen, TopBar } from "@/components/ledger/screen";
import { currentUser } from "@/lib/auth/session";
import { boundPendingForDebtor, linkEntriesFor } from "@/lib/ledger/claims";
import { contracts } from "@/lib/chain/contracts";
import { daresDomain, Stalemate } from "@/lib/chain/typed-data";
import { dareOnchainId } from "@/lib/ledger/ids";
import { answersOf, confidenceFor, unitOf } from "@/lib/ledger/markets";
import { unitPhrase } from "@/lib/ledger/number-axis";
import { inkOf } from "@/lib/ui/ink";
import { markRefOf } from "@/lib/ui/mark";
import { formatMoney, unitWords } from "@/lib/ui/units";
import type { LinkEntryRow } from "@/components/ledger/confirm-all";
import { denominationsByIds } from "@/lib/ledger/denominations";
import { CONFIRM_MANY_MAX, confirmManyTypedData } from "@/lib/ledger/proposals";
import { alreadyInLine, dayLabel, spanWords } from "@/lib/ui/copy";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

/**
 * The claimant's first screen (PLANNING.md section 4): what was waiting for someone before they had an
 * account, grouped by who it is with, each one open to a yes or a no, and one yes for all of it at the top.
 * This is the payoff for signing up. Someone with nothing waiting never sees an empty inbox: they go home,
 * to the ordinary empty state (docs/design.md 3.10).
 */
export default async function WelcomePage() {
  const clock = await viewerClock();
  const me = await currentUser();
  if (!me) redirect("/");
  const [rows, linkEntries] = await Promise.all([boundPendingForDebtor(me.id), linkEntriesFor(me.id)]);
  if (rows.length === 0 && linkEntries.length === 0) redirect("/");
  // Entries made from a link (3.17, 3.38): each as a claim row whose line is the entry, pressed by default; keeping one signs it, leaving it out sends it back to a ghost under the typed name.
  const entryDenoms = await denominationsByIds(Array.from(new Set(linkEntries.map((e) => e.dare.denomId))));
  const { chainId, dares } = contracts();
  const entries: LinkEntryRow[] = linkEntries.flatMap((e) => {
    const denomination = entryDenoms.get(e.dare.denomId);
    if (!denomination) return [];
    const unit = unitOf(e.dare);
    const answers = answersOf(e.dare);
    const said = answers ? `You’re in: ${answers.find((a) => a.index === Number(e.value))?.text ?? "?"}` : unit ? `You’re in at ${unitPhrase(e.value, unit)}` : `You’re in at ${Number(e.value) / 100}%`;
    const stakeWords = denomination.monetary ? formatMoney(e.stake) : unitWords(denomination, e.stake);
    return [{ dareId: e.dare.id, title: e.dare.title, line: `${said} · ${stakeWords}`, name: e.name, mark: markRefOf(e.dare), ink: inkOf(e.dare), ledgerWallet: me.ledgerWallet, domain: daresDomain(chainId, dares.address), dareOnchainId: dareOnchainId(e.dare.id), stalemate: e.dare.stalemate === "void" ? Stalemate.Void : Stalemate.Arbitrate, confidenceBps: confidenceFor(e.dare), stake: e.stake.toString(), value: e.value.toString(), position: answers ? { stake: e.stake.toString(), answer: Number(e.value) } : unit ? { stake: e.stake.toString(), number: e.value.toString() } : { stake: e.stake.toString(), valueBps: Number(e.value) } }];
  });

  const creditorIds = Array.from(new Set(rows.map((r) => r.toUser).filter((x): x is string => Boolean(x))));
  const creditors = await db.select().from(schema.users).where(inArray(schema.users.id, creditorIds));
  const creditorById = new Map(creditors.map((c) => [c.id, c]));
  const denoms = await denominationsByIds(Array.from(new Set(rows.map((r) => r.denomId))));
  const groupIds = Array.from(new Set(rows.map((r) => r.groupId)));
  const groups = await db.select({ id: schema.groups.id, name: schema.groups.name }).from(schema.groups).where(inArray(schema.groups.id, groupIds));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));

  // One approval covers at most CONFIRM_MANY_MAX, oldest first. The rest are still here afterwards.
  const batch = rows.slice(0, CONFIRM_MANY_MAX);
  const typed = batch.length > 0 ? confirmManyTypedData(batch, new Map(creditors.map((c) => [c.id, c.ledgerWallet as Address]))) : null;
  const payload: ConfirmAllPayload | null = typed
    ? {
        proposalIds: batch.map((r) => r.id),
        ledgerWallet: me.ledgerWallet,
        domain: typed.domain,
        message: { ...typed.message, qtys: typed.message.qtys.map((q) => q.toString()) },
      }
    : null;
  const total = rows.length + entries.length;

  // The claim rows (3.38): a kicker with the kind and the date, the memo or who got it, the token; each pressed by default, drawn by ConfirmAll with its check.
  const claims: ClaimRow[] = batch.flatMap((r) => {
    const creditor = r.toUser ? creditorById.get(r.toUser) : undefined;
    const denomination = denoms.get(r.denomId);
    if (!creditor || !denomination) return [];
    const first = creditor.displayName.split(/\s+/)[0] ?? creditor.displayName;
    return [{ proposalId: r.id, creditor: { id: creditor.id, displayName: creditor.displayName }, kicker: `Covered · ${dayLabel(r.createdAt, clock.zone)}`, subject: r.memo?.trim() || `${first} got this one`, denomination, quantity: (r.quantity ?? 1n).toString(), conceded: r.concededAt !== null }];
  });
  // "Two weeks with the Friday crew, kept under your name, Maya." (3.38): the span of what was waiting, the one set it came from or your friends.
  const whens = [...rows.map((r) => r.createdAt), ...linkEntries.map((e) => e.dare.createdAt)].map((d) => d.getTime());
  const setNames = Array.from(new Set(rows.map((r) => groupName.get(r.groupId)).filter((x): x is string => Boolean(x))));
  const withWhom = setNames.length === 1 ? `the ${setNames[0]}`.replace(/^the the /i, "the ") : "your friends";
  const line = whens.length > 0 ? `${spanWords(new Date(Math.min(...whens)), new Date(Math.max(...whens)))} with ${withWhom}, kept under your name, ${me.displayName.split(/\s+/)[0] ?? me.displayName}.` : null;

  return (
    <Screen>
      <TopBar wordmark info="claimant" />
      <div className="flex flex-col gap-7 py-4">
        <div className="flex flex-col gap-3">
          <h1 className="text-serif-xl text-ink">{alreadyInLine(total)}</h1>
          {line ? <p className="text-body text-ink-2">{line}</p> : null}
        </div>
        <ConfirmAll payload={payload} entries={entries} claims={claims} viewer={{ id: me.id, displayName: me.displayName }} />
        {rows.length > batch.length ? <p className="text-caption text-ink-3">That covers the first {batch.length}. The rest will still be here.</p> : null}
      </div>
    </Screen>
  );
}
