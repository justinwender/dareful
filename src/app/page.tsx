import Link from "next/link";
import { LinkPending } from "@/components/ui/link-pending";
import { MarketCardFrom } from "@/components/markets/market-card-from";
import { SignInButton } from "@/components/auth/sign-in-button";
import { Avatar, AvatarStack } from "@/components/ledger/avatar";
import { CoveredCard } from "@/components/ledger/covered-card";
import { Screen, SectionLabel, TopBar } from "@/components/ledger/screen";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { CodeJoinCompact } from "@/components/home/code-join";
import { AccountMenu } from "@/components/home/account-menu";
import { NeedsYou } from "@/components/home/needs-you";
import { homeFor, squareSentence } from "@/lib/ledger/home";
import { closesLabel } from "@/lib/ui/copy";
import { ButtonLink } from "@/components/ui/button";
import { SuggestedGhost } from "@/components/ledger/suggested-ghost";
import { currentUser } from "@/lib/auth/session";
import { boundPendingForDebtor, ghostsForCreator, suggestedGhostsFor } from "@/lib/ledger/claims";
import { hueFor } from "@/lib/ui/hue";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const clock = await viewerClock();
  const user = await currentUser();
  if (!user) return <SignedOut />;
  const sp = await searchParams;
  const now = new Date(clock.now);

  const [home, ghosts, waiting, suggested] = await Promise.all([
    homeFor(user, { now, closes: (at) => closesLabel(at, now, clock.zone) }),
    ghostsForCreator(user.id),
    boundPendingForDebtor(user.id),
    suggestedGhostsFor(user.id, user.displayName),
  ]);
  const empty = !home.hasAnything && ghosts.length === 0 && suggested.length === 0 && waiting.length === 0;
  const me = <AccountMenu name={user.displayName} hue={hueFor(user.id)} href={`/p/${user.id}`} />;

  // docs/design.md 4.7. Three tiers in three weights, and nothing that leaves: asking is the one marigold
  // control, joining is a field and an outlined button directly under it, and logging a cover is text.
  const acts = (
    <div className="flex flex-col gap-3">
      <ButtonLink prefetch href="/m/new" variant="primary">
        Ask something
      </ButtonLink>
      <CodeJoinCompact />
      <ButtonLink href="/new" variant="tertiary" className="self-start">
        I got this one
      </ButtonLink>
    </div>
  );

  if (empty) {
    return (
      <Screen>
        <TopBar title="dareful" right={me} />
        <div className="flex flex-1 flex-col gap-7 py-6">
          <div className="flex flex-col gap-3">
            <h1 className="text-display text-ink">Nothing happens here until somebody else is in it.</h1>
            <p className="text-body text-ink-2">Ask your group chat something, or join something one of them already asked.</p>
          </div>
          {acts}
          <section className="flex flex-col gap-[10px]">
            <h2 className="text-label text-ink-2">Or start from one of these</h2>
            <ul className="flex flex-col gap-1.5">
              {STARTERS.map((line) => (
                <li key={line}>
                  <Link prefetch={false} href={`/m/new?line=${encodeURIComponent(line)}`} className="relative flex min-h-14 items-center rounded-button bg-surface px-4 py-3 font-serif text-[17px] leading-[22px] text-ink">
                    <LinkPending />
                    {line}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="dareful" right={me} />
      <div className="flex flex-col gap-7 py-2">
        {acts}

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

        {home.people.length > 0 || home.square.length > 0 || ghosts.length > 0 ? (
          <section className="flex flex-col gap-[10px]">
            <h2 className="text-label text-ink-2">People</h2>
            <ul className="flex flex-col gap-1.5">
              {home.people.map(({ user: p, token }) => (
                <li key={p.id}>
                  <Link prefetch={false} href={`/p/${p.id}`} className="relative flex min-h-14 items-center gap-3 rounded-button bg-surface px-3">
                    <LinkPending />
                    <Avatar name={p.displayName} hue={hueFor(p.id)} size={36} />
                    <span className="min-w-0 flex-1 truncate text-body-strong text-ink">{p.displayName}</span>
                    {token ? (
                      <ObligationToken
                        owner={token.ownerId === user.id ? { id: user.id, displayName: user.displayName, hue: hueFor(user.id) } : { id: p.id, displayName: p.displayName, hue: hueFor(p.id) }}
                        other={token.ownerId === user.id ? p : user}
                        viewerId={user.id}
                        denomination={token.denomination}
                        quantity={token.quantity}
                      />
                    ) : null}
                  </Link>
                </li>
              ))}
              {/* Never repeat an empty phrase down a list: everyone square is one row that names them. */}
              {home.square.length > 0 ? (
                <li>
                  <details className="group rounded-button bg-surface">
                    <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3">
                      <AvatarStack people={home.square.map((p) => ({ name: p.displayName, hue: hueFor(p.id) }))} size={26} />
                      <span className="min-w-0 flex-1 text-body-sm text-ink-2">{squareSentence(home.square.map((p) => p.displayName))}</span>
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3 transition-transform group-open:rotate-90">
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </summary>
                    <ul className="flex flex-col border-t border-line">
                      {home.square.map((p) => (
                        <li key={p.id}>
                          <Link prefetch={false} href={`/p/${p.id}`} className="relative flex min-h-12 items-center gap-3 px-3">
                            <LinkPending />
                            <Avatar name={p.displayName} hue={hueFor(p.id)} size={28} />
                            <span className="min-w-0 flex-1 truncate text-body-sm text-ink">{p.displayName}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              ) : null}
              {ghosts.map((g) => (
                <li key={g.id}>
                  <Link prefetch={false} href={`/p/c/${g.id}`} className="relative flex min-h-14 items-center gap-3 rounded-button bg-surface px-3">
                    <LinkPending />
                    <Avatar name={g.displayName} hue="stone" size={36} ghost />
                    <span className="min-w-0 flex-1 truncate text-body-strong text-ink">{g.displayName}</span>
                    <span className="text-caption text-ink-3">not here yet</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
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
