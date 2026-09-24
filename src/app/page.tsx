import Link from "next/link";
import { LinkPending } from "@/components/ui/link-pending";
import { MarketCardFrom } from "@/components/markets/market-card-from";
import { SignInButton } from "@/components/auth/sign-in-button";
import { CoveredCard } from "@/components/ledger/covered-card";
import { Screen, SectionLabel, TopBar } from "@/components/ledger/screen";
import { CodeJoinCompact } from "@/components/home/code-join";
import { NeedsYou } from "@/components/home/needs-you";
import { Running } from "@/components/home/running";
import { nowFor, timeBound } from "@/lib/ledger/home";
import { closesLabel, todayLabel } from "@/lib/ui/copy";
import { ButtonLink } from "@/components/ui/button";
import { TabBar } from "@/components/ui/tab-bar";
import { SuggestedGhost } from "@/components/ledger/suggested-ghost";
import { currentUser } from "@/lib/auth/session";
import { boundPendingForDebtor, suggestedGhostsFor } from "@/lib/ledger/claims";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

/**
 * Now, the root (docs/design.md 4.7, 6.1): what is live and what is waiting on this person. It routes rather than
 * does: creating things lives behind Start, people on their own tab, the account behind You. Three sections in a
 * fixed order, each gone when it is empty, and nothing here counts, badges or ages.
 */
export default async function Now({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const clock = await viewerClock();
  const user = await currentUser();
  if (!user) return <SignedOut />;
  const sp = await searchParams;
  const now = new Date(clock.now);

  const [home, waiting, suggested] = await Promise.all([nowFor(user, { now, closes: (at) => closesLabel(at, now, clock.zone) }), boundPendingForDebtor(user.id), suggestedGhostsFor(user.id, user.displayName)]);
  const empty = !home.hasAnything && suggested.length === 0 && waiting.length === 0;
  const today = <h2 className="pt-5 text-label text-ink-3">{todayLabel(now, clock.zone)}</h2>;

  if (empty) {
    return (
      <Screen>
        {today}
        <div className="flex flex-1 flex-col gap-7 py-6">
          <div className="flex flex-col gap-3">
            <h1 className="text-display-xl text-ink">Nothing happens here until somebody else is in it.</h1>
            <p className="text-body text-ink-2">Ask your group chat something, or join something one of them already asked.</p>
          </div>
          {/* Before anything (3.14): asking is the one chalk control, so Start stays hidden, and the code field sits under it. */}
          <div className="flex flex-col gap-3">
            <ButtonLink prefetch href="/m/new" variant="primary">
              Ask something
            </ButtonLink>
            <CodeJoinCompact label="Someone sent you a code?" />
          </div>
          <section className="flex flex-col gap-[10px]">
            <h2 className="text-label text-ink-2">Or start from one of these</h2>
            <ul className="flex flex-col gap-1.5">
              {STARTERS.map((line) => (
                <li key={line}>
                  <Link prefetch={false} href={`/m/new?line=${encodeURIComponent(line)}`} className="relative flex min-h-14 items-center rounded-button bg-surface px-4 py-3 text-body-strong text-ink">
                    <LinkPending />
                    {line}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <TabBar active="/" live={false} start={false} />
      </Screen>
    );
  }

  return (
    <Screen>
      {today}
      <div className="flex flex-col gap-7 py-4">
        {waiting.length > 0 ? (
          <Link prefetch={false} href="/welcome" className="relative flex items-center justify-between gap-3 rounded-card border border-dashed border-line-strong px-4 py-3.5">
            <LinkPending />
            <span className="text-body-strong text-ink">{waiting.length === 1 ? "One thing was waiting for you" : "A few things were waiting for you"}</span>
            <span className="text-[15px] font-semibold text-ink-2">Have a look</span>
          </Link>
        ) : null}

        <NeedsYou rows={home.needs} viewer={user} showAll={sp.all === "1"} allHref="/?all=1" />

        {suggested.length > 0 ? (
          <section className="flex flex-col gap-3">
            <SectionLabel>Is this you?</SectionLabel>
            {suggested.map((g) => (
              <SuggestedGhost key={g.claimId} claimId={g.claimId} name={g.displayName} creatorName={g.creatorName} />
            ))}
          </section>
        ) : null}

        <Running rows={home.running} />

        {home.happened.length > 0 ? (
          <section className="flex flex-col gap-[10px]">
            <h2 className="text-label text-ink-2">Just happened</h2>
            <div className="flex flex-col gap-3">
              {home.happened.map((e) =>
                e.kind === "market" ? (
                  <MarketCardFrom key={e.market.dare.id} m={e.market} viewerId={user.id} clock={clock} />
                ) : (
                  <CoveredCard
                    key={e.obligation.id}
                    clock={clock}
                    viewerId={user.id}
                    creditor={e.to}
                    debtor={e.from}
                    denomination={e.denomination}
                    quantity={e.obligation.quantity ?? 1n}
                    amountCents={e.obligation.amountCents}
                    memo={e.obligation.memo}
                    at={e.at}
                    groupName={e.groupLabel}
                    state="open"
                    href={`/p/${e.from.id === user.id ? e.to.id : e.from.id}`}
                  />
                ),
              )}
            </div>
          </section>
        ) : null}
      </div>
      <TabBar active="/" live={timeBound(home.needs)} start />
    </Screen>
  );
}

const STARTERS = ["Does John fall asleep during the movie?", "Does anyone actually show up on time Friday?", "Who gets to the bar first?"];

function SignedOut() {
  return (
    <Screen>
      <TopBar title="Dareful" />
      <div className="flex flex-1 flex-col justify-center gap-6 py-10">
        <h1 className="text-display-xl text-ink">Who’s got the next one?</h1>
        <p className="text-body text-ink-2">The bets, the rounds, and the “I got this one” between friends, kept where you can find them. No spreadsheet, no nagging.</p>
        <SignInButton />
        <p className="text-caption text-ink-3">An email or a phone number is all it takes.</p>
      </div>
    </Screen>
  );
}
