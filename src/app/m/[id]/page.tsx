import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { SignInButton } from "@/components/auth/sign-in-button";
import { Avatar } from "@/components/ledger/avatar";
import { Chip } from "@/components/ledger/chip";
import { InviteShare } from "@/components/ledger/invite-share";
import { MarkStamp } from "@/components/ledger/mark-stamp";
import { Screen, SectionLabel, TopBar } from "@/components/ledger/screen";
import { When } from "@/components/ledger/when";
import { CallLine } from "@/components/markets/call-line";
import { Leaderboard, Transfers } from "@/components/markets/leaderboard";
import { Ballot, EntryPanel, LockButton, WhatHappened, type Signing, type StakeUnit } from "@/components/markets/market-actions";
import { currentUser } from "@/lib/auth/session";
import { contracts } from "@/lib/chain/contracts";
import { daresDomain, Stalemate } from "@/lib/chain/typed-data";
import { denominationById } from "@/lib/ledger/denominations";
import { isMember } from "@/lib/ledger/groups";
import { dareOnchainId } from "@/lib/ledger/ids";
import { numbersVisible } from "@/lib/ledger/market-view";
import { createTypedData, marketById, positionsOf, reconcileFromIndexer, stateOf, tally, VOID_OUTCOME, votesOf } from "@/lib/ledger/markets";
import { groupNumber } from "@/lib/ledger/scoring";
import { marketShare } from "@/lib/ledger/share";
import { hueFor } from "@/lib/ui/hue";
import { formatMoney, unitWords } from "@/lib/ui/units";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const share = await marketShare(id);
  return { title: share.title, description: share.description, robots: { index: false, follow: false }, openGraph: { title: share.title, description: share.description } };
}

const word = (o: bigint | null) => (o === null ? null : o === VOID_OUTCOME ? ("void" as const) : o === 1n ? ("yes" as const) : ("no" as const));

export default async function MarketPage({ params }: { params: Promise<{ id: string }> }) {
  const clock = await viewerClock();
  const { id } = await params;
  const me = await currentUser();
  if (!me) {
    // A pasted link gets its card from this page, so it answers instead of redirecting, and says only the question.
    const share = await marketShare(id);
    return (
      <Screen>
        <div className="flex flex-col gap-6 py-10">
          <h1 className="text-question text-ink">{share.question ?? "Nothing to see here yet."}</h1>
          <p className="text-body text-ink-2">{share.question ? "Sign in to put your number on it." : "If a friend sent you this, sign in and it will be there."}</p>
          <SignInButton label="Sign in" />
        </div>
      </Screen>
    );
  }

  let d = await marketById(id);
  if (!d) notFound();
  const member = await isMember(d.groupId, me.id);
  // A locked market the chain has already decided, whose result never got written here: take the chain's word.
  if (d.lockedAt && !d.resolvedAt && member && (await reconcileFromIndexer(d.id))) d = (await marketById(id)) ?? d;
  const state = stateOf(d);
  if (state === "draft" && d.creatorId !== me.id) notFound();

  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, d.groupId)).limit(1);
  if (!member) {
    return (
      <Screen>
        <TopBar back={{ href: "/", label: "Back" }} />
        <div className="flex flex-col gap-4 py-6">
          <h1 className="text-question text-ink">{d.title}</h1>
          <p className="text-body text-ink-2">This one is for the people in {group?.name ?? "its group"}. Ask one of them for the group’s link, and it will be waiting.</p>
        </div>
      </Screen>
    );
  }

  const denomination = await denominationById(d.denomId);
  if (!denomination) notFound();
  const [positions, votes, statements, seats] = await Promise.all([
    positionsOf(d.id),
    votesOf(d.id),
    db.select({ userId: schema.dareStatements.userId, statement: schema.dareStatements.statement, statedAt: schema.dareStatements.statedAt }).from(schema.dareStatements).where(eq(schema.dareStatements.dareId, d.id)).orderBy(asc(schema.dareStatements.statedAt)),
    db.select({ userId: schema.groupMembers.userId }).from(schema.groupMembers).where(and(eq(schema.groupMembers.groupId, d.groupId), isNotNull(schema.groupMembers.userId), isNull(schema.groupMembers.leftAt))),
  ]);
  const ids = Array.from(new Set([d.creatorId, ...positions.map((p) => p.userId as string), ...votes.map((v) => v.userId), ...statements.map((s) => s.userId)]));
  const users = await db.select({ id: schema.users.id, displayName: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, ids));
  const person = new Map(users.map((u) => [u.id, u]));
  const nameOf = (uid: string) => (uid === me.id ? "You" : (person.get(uid)?.displayName ?? "Someone"));

  const mine = positions.find((p) => p.userId === me.id) ?? null;
  const show = numbersVisible(d, mine !== null);
  const others = positions.filter((p) => p.userId !== me.id);
  const pins = positions.map((p) => ({ id: p.userId as string, name: person.get(p.userId as string)?.displayName ?? "Someone", percent: Number(p.value) / 100 }));
  const avg = groupNumber(others.map((p) => ({ stake: p.stake, value: p.value })));
  const average = others.length === 0 || d.revealMode === "blind" ? (others.length ? ({ kind: "hidden", names: others.map((p) => nameOf(p.userId as string)) } as const) : null) : ({ kind: "shown", percent: Math.round(Number(avg ?? 0n) / 100), names: others.map((p) => nameOf(p.userId as string)) } as const);

  const { chainId, dares } = contracts();
  const signing: Signing = {
    domain: daresDomain(chainId, dares.address),
    dareOnchainId: dareOnchainId(d.id),
    stalemate: d.stalemate === "void" ? Stalemate.Void : Stalemate.Arbitrate,
    ledgerWallet: me.ledgerWallet,
    governanceWallet: me.governanceWallet,
  };
  if (state === "draft") {
    const c = createTypedData(d).message;
    signing.create = { groupId: c.groupId, kind: c.kind, pace: c.pace, termsHash: c.termsHash, denomId: c.denomId, range: "0", options: 0, resolvesBy: c.resolvesBy.toString() };
  }
  const unit: StakeUnit = { monetary: denomination.monetary, quantifiable: denomination.quantifiable, singular: denomination.template === "next_time" ? "next time" : denomination.label, plural: denomination.pluralLabel };
  const stakeWords = (s: bigint) => (denomination.monetary ? formatMoney(s) : unitWords(denomination, s));
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://dareful.app";
  const outcome = word(d.resolvedOutcome);
  const leading = tally(votes)[0];
  const edges = state === "resolved" ? await db.select().from(schema.obligations).where(and(eq(schema.obligations.origin, "dare"), eq(schema.obligations.originId, d.id))) : [];

  return (
    <Screen>
      <TopBar back={{ href: `/g/${d.groupId}`, label: "Back" }} right={group?.name ? <Chip>{group.name}</Chip> : null} />
      <div className="flex flex-col gap-7 py-2">
        <header className="flex flex-col gap-3">
          <h1 className="flex items-start gap-3 text-question text-ink">
            {d.markKind === "emoji" && d.markValue ? <MarkStamp kind="emoji" value={d.markValue} size={28} /> : null}
            <span>{d.title}</span>
          </h1>
          <p className="text-caption text-ink-3">
            {nameOf(d.creatorId)} asked · <When iso={d.createdAt.toISOString()} zone={clock.zone} serverNow={clock.now} />
          </p>
          <details className="rounded-card border border-line bg-surface px-4 py-3" open={state === "draft" || (state === "open" && !mine)}>
            <summary className="cursor-pointer text-body-strong text-ink">How we’ll know</summary>
            <p className="pt-2 text-body-sm-prose text-ink-2">{d.termsText}</p>
            {d.resolvesBy ? (
              <p className="pt-2 text-body-sm text-ink-2">
                The group calls it together, by <When iso={d.resolvesBy.toISOString()} zone={clock.zone} serverNow={clock.now} style="day" />. {d.stalemate === "void" ? "If you can’t agree by then, it’s called off and nothing changes hands." : "If you can’t agree by then, everyone says their piece and the app calls it. Being in means you’re fine with that."}
              </p>
            ) : null}
          </details>
        </header>

        {state === "resolved" && outcome && outcome !== "void" ? (
          <>
            <section className="flex flex-col gap-4">
              <p className="text-outcome text-ink">{outcome === "yes" ? "Yes." : "No."}</p>
              <CallLine pins={pins} state="resolved" outcome={outcome === "yes" ? 1 : 0} size="screen" surface="var(--ground)" />
            </section>
            <section className="flex flex-col gap-3">
              <SectionLabel>Who was closest</SectionLabel>
              <Leaderboard viewerId={me.id} outcome={outcome === "yes" ? 1 : 0} standings={positions.map((p) => ({ userId: p.userId as string, name: person.get(p.userId as string)?.displayName ?? "Someone", percent: Number(p.value) / 100, score: p.score ?? 0 }))} />
            </section>
            <section className="flex flex-col gap-2">
              <SectionLabel>What changes hands</SectionLabel>
              <Transfers viewerId={me.id} denomination={denomination} people={new Map(users.map((u) => [u.id, u]))} transfers={edges.map((e) => ({ fromId: e.fromUser, toId: e.toUser, quantity: e.quantity ?? 1n }))} />
              <p className="text-caption text-ink-3">Every pair squares on how much closer one was than the other, never for more than the smaller of what the two put on it.</p>
            </section>
          </>
        ) : null}

        {state === "voided" ? (
          <section className="flex flex-col gap-3">
            <p className="text-outcome text-ink">No answer.</p>
            <p className="text-body text-ink-2">Nobody could tell, so it’s void. Nothing changes hands.</p>
            <CallLine pins={pins} state="in" size="screen" surface="var(--ground)" />
          </section>
        ) : null}

        {state === "draft" ? (
          <section className="flex flex-col gap-4">
            <p className="text-body text-ink-2">Only you can see this so far. Put your own number on it and it goes live for {group?.name ?? "the group"}.</p>
            <EntryPanel dareId={d.id} signing={signing} unit={unit} mode="open" mark={d.markKind === "emoji" ? d.markValue : null} suggestion={d.anchorValue !== null ? { percent: Math.round(Number(d.anchorValue) / 100), rationale: d.anchorRationale } : null} average={null} />
          </section>
        ) : null}

        {state === "open" ? (
          <>
            <section className="flex flex-col gap-3">
              <SectionLabel>
                {positions.length} of {seats.length} in
              </SectionLabel>
              {show ? <CallLine pins={pins} state="in" size="screen" surface="var(--ground)" /> : <CallLine pins={[]} state="hidden" />}
              <ul className="flex flex-wrap gap-2">
                {positions.map((p) => (
                  <li key={p.userId} className="inline-flex items-center gap-2 rounded-pill border border-line-strong py-1 pr-3 pl-1 text-[13px] text-ink-2">
                    <Avatar name={person.get(p.userId as string)?.displayName ?? "?"} hue={hueFor(p.userId as string)} size={24} />
                    {nameOf(p.userId as string)}
                    {show ? ` · ${Number(p.value) / 100}% · ${stakeWords(p.stake)}` : ""}
                  </li>
                ))}
              </ul>
            </section>
            <section className="flex flex-col gap-4">
              {mine ? <SectionLabel>Your number</SectionLabel> : null}
              <EntryPanel
                dareId={d.id}
                signing={signing}
                unit={unit}
                mode={mine ? "change" : "enter"}
                mark={d.markKind === "emoji" ? d.markValue : null}
                suggestion={d.anchorValue !== null ? { percent: Math.round(Number(d.anchorValue) / 100), rationale: d.anchorRationale } : null}
                average={average}
                initial={mine ? { percent: Number(mine.value) / 100, stake: mine.stake.toString() } : undefined}
              />
            </section>
            <section className="flex flex-col gap-3">
              <SectionLabel>Get the others in</SectionLabel>
              <InviteShare url={`${appUrl}/m/${d.id}`} text={`${d.title} Put your number on it:`} />
            </section>
            {d.creatorId === me.id ? (
              <section className="flex flex-col gap-3 border-t border-line pt-6">
                <p className="text-body-sm text-ink-2">When everyone who wants in is in, lock it. After that nobody’s number moves, and everyone sees everyone’s.</p>
                <LockButton dareId={d.id} count={positions.length} />
              </section>
            ) : null}
          </>
        ) : null}

        {state === "locked" ? (
          <>
            <section className="flex flex-col gap-3">
              <SectionLabel>Everyone’s in, and numbers are locked</SectionLabel>
              <CallLine pins={pins} state="in" size="screen" surface="var(--ground)" />
              <ul className="flex flex-col">
                {positions.map((p) => (
                  <li key={p.userId} className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
                    <span className="flex items-center gap-2 text-body-sm text-ink">
                      <Avatar name={person.get(p.userId as string)?.displayName ?? "?"} hue={hueFor(p.userId as string)} size={24} />
                      {nameOf(p.userId as string)}
                    </span>
                    <span className="text-body-sm text-ink-2">
                      {Number(p.value) / 100}% · {stakeWords(p.stake)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="flex flex-col gap-3">
              <SectionLabel>How did it come out?</SectionLabel>
              {statements.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {statements.map((s) => (
                    <li key={s.userId} className="rounded-card border border-line bg-surface px-4 py-3 text-body-sm text-ink-2">
                      <span className="text-body-strong text-ink">{nameOf(s.userId)}:</span> {s.statement}
                    </li>
                  ))}
                </ul>
              ) : null}
              <WhatHappened dareId={d.id} mine={statements.find((s) => s.userId === me.id)?.statement ?? null} />
            </section>

            <section className="flex flex-col gap-3">
              {d.aiRationale ? (
                <div className="rounded-card border border-dashed border-line-strong px-4 py-3">
                  <p className="text-body-strong text-ink">{d.aiOutcome === null ? "The app can’t tell yet." : `The app thinks: ${word(d.aiOutcome) === "void" ? "nobody can tell" : word(d.aiOutcome)}.`}</p>
                  <p className="pt-1 text-body-sm-prose text-ink-2">{d.aiRationale}</p>
                  <p className="pt-2 text-caption text-ink-3">It’s a suggestion. The group decides, and can say otherwise.</p>
                </div>
              ) : null}
              <Ballot
                dareId={d.id}
                signing={signing}
                suggested={word(d.aiOutcome)}
                myVote={word(votes.find((v) => v.userId === me.id)?.outcome ?? null)}
                tallyLine={votes.length === 0 ? `It takes ${d.threshold} of you agreeing to decide it.` : `${votes.length} ${votes.length === 1 ? "has" : "have"} said so far${leading ? `, ${leading.votes} for ${word(leading.outcome) === "void" ? "nobody can tell" : word(leading.outcome)}` : ""}. It takes ${d.threshold} agreeing.`}
              />
            </section>
          </>
        ) : null}
      </div>
    </Screen>
  );
}
