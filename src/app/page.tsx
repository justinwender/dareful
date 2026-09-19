import Link from "next/link";
import { LinkPending } from "@/components/ui/link-pending";
import { MarketCardFrom } from "@/components/markets/market-card-from";
import { z } from "zod";
import { SignInButton } from "@/components/auth/sign-in-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Avatar, AvatarStack } from "@/components/ledger/avatar";
import { CoveredCard } from "@/components/ledger/covered-card";
import { Screen, SectionLabel, TopBar } from "@/components/ledger/screen";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { CodeJoinCompact } from "@/components/home/code-join";
import { GroupChips } from "@/components/home/group-chips";
import { GroupControls } from "@/components/home/group-controls";
import { NeedsYou } from "@/components/home/needs-you";
import { homeFor } from "@/lib/ledger/home";
import { closesLabel } from "@/lib/ui/copy";
import { ButtonLink } from "@/components/ui/button";
import { SuggestedGhost } from "@/components/ledger/suggested-ghost";
import { currentUser } from "@/lib/auth/session";
import { boundPendingForDebtor, ghostsForCreator, suggestedGhostsFor } from "@/lib/ledger/claims";
import type { GroupChip } from "@/lib/ledger/groups";
import { hueFor } from "@/lib/ui/hue";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

export default async function Home({ searchParams }: { searchParams: Promise<{ g?: string; all?: string }> }) {
  const clock = await viewerClock();
  const user = await currentUser();
  if (!user) return <SignedOut />;
  const sp = await searchParams;
  const groupId = z.string().uuid().safeParse(sp.g).success ? sp.g : undefined;
  const now = new Date(clock.now);

  const [home, ghosts, waiting, suggested] = await Promise.all([
    homeFor(user, { groupId, now, closes: (at) => closesLabel(at, now, clock.zone) }),
    ghostsForCreator(user.id),
    boundPendingForDebtor(user.id),
    suggestedGhostsFor(user.id, user.displayName),
  ]);
  const empty = !home.hasAnything && ghosts.length === 0 && suggested.length === 0 && waiting.length === 0;
  const me = (
    <Link href={`/p/${user.id}`} aria-label="You" className="inline-flex h-12 w-12 items-center justify-center rounded-pill">
      <Avatar name={user.displayName} hue={hueFor(user.id)} size={28} />
    </Link>
  );

  // docs/design.md 3.14 and the "First run, nothing yet" board. Nothing happens here until somebody else is in
  // it, so the screen says that, and offers the two ways somebody else gets in.
  if (empty) {
    return (
      <Screen>
        <TopBar title="dareful" right={me} />
        <div className="flex flex-1 flex-col gap-7 py-6">
          <div className="flex flex-col gap-3">
            <h1 className="text-display text-ink">Nothing happens here until somebody else is in it.</h1>
            <p className="text-body text-ink-2">Ask your group chat something, or join something one of them already asked.</p>
          </div>
          <div className="flex flex-col gap-3">
            <ButtonLink href="/m/new" variant="primary">
              Ask something
            </ButtonLink>
            <p className="text-body-sm text-ink-2">Everyone who joins puts a number in. Whoever lands closest comes out best. You send the link to the chat and it starts.</p>
          </div>
          <CodeJoinCompact label="Someone sent you a code?" />
          <section className="flex flex-col gap-[10px]">
            <h2 className="text-label text-ink-2">Or start from one of these</h2>
            <ul className="flex flex-col gap-1.5">
              {STARTERS.map((line) => (
                <li key={line}>
                  <Link href={`/m/new?line=${encodeURIComponent(line)}`} className="relative flex min-h-14 items-center rounded-button bg-surface px-4 py-3 font-serif text-[17px] leading-[22px] text-ink">
                    <LinkPending />
                    {line}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <ButtonLink href="/new" variant="tertiary">
            Or log one you just got
          </ButtonLink>
          <div className="mt-auto pt-6">
            <SignOutButton />
          </div>
        </div>
      </Screen>
    );
  }

  return (
    <Screen>
      <TopBar title="dareful" right={me} />
      <div className="flex flex-col gap-7 py-2">
        {/* 4.7: ask, then join. One marigold control on the screen, and joining directly under it. */}
        <div className="flex flex-col gap-4">
          <ButtonLink href={home.selected ? `/m/new?group=${home.selected.id}` : "/m/new"} variant="primary">
            Ask something
          </ButtonLink>
          <CodeJoinCompact />
        </div>

        {home.selected ? <GroupStrip chip={home.selected} /> : null}

        {waiting.length > 0 && !home.selected ? (
          <Link href="/welcome" className="relative flex items-center justify-between gap-3 rounded-card border border-dashed border-line-strong px-4 py-3.5">
            <LinkPending />
            <span className="text-body-strong text-ink">{waiting.length === 1 ? "One thing was waiting for you" : "A few things were waiting for you"}</span>
            <span className="text-[15px] font-semibold text-ink-2">Have a look</span>
          </Link>
        ) : null}

        <NeedsYou rows={home.needs} viewer={user} showAll={sp.all === "1"} allHref={groupId ? `/?g=${groupId}&all=1` : "/?all=1"} />

        {suggested.length > 0 && !home.selected ? (
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

        {home.people.length > 0 || ghosts.length > 0 ? (
          <section className="flex flex-col gap-[10px]">
            <h2 className="text-label text-ink-2">People</h2>
            <ul className="flex flex-col gap-1.5">
              {home.people.map(({ user: p, token }) => (
                <li key={p.id}>
                  <Link href={`/p/${p.id}`} className="relative flex min-h-14 items-center gap-3 rounded-button bg-surface px-3">
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
                    ) : (
                      <span className="text-caption text-ink-3">Nothing open</span>
                    )}
                  </Link>
                </li>
              ))}
              {home.selected
                ? null
                : ghosts.map((g) => (
                    <li key={g.id}>
                      <Link href={`/p/c/${g.id}`} className="relative flex min-h-14 items-center gap-3 rounded-button bg-surface px-3">
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

        <GroupChips chips={home.chips} hidden={home.hidden} selectedId={home.selected?.id ?? null} />

        <div className="flex flex-col gap-1 pt-2">
          <ButtonLink href={home.selected ? `/new?group=${home.selected.id}` : "/new"} variant="secondary">
            I got this one
          </ButtonLink>
          <SignOutButton />
        </div>
      </div>
    </Screen>
  );
}

const STARTERS = ["Does John fall asleep during the movie?", "Does anyone actually show up on time Friday?", "Who gets to the bar first?"];

/** A chip is selected: who is in it, and the few things a group can have done to it. Never a screen of its own. */
function GroupStrip({ chip }: { chip: GroupChip }) {
  return (
    <section className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-[14px]">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-body-strong text-ink">{chip.label}</span>
        <AvatarStack people={chip.members.map((m) => ({ name: m.displayName, hue: m.userId ? hueFor(m.userId) : "stone", ghost: !m.userId }))} size={26} />
      </div>
      <GroupControls groupId={chip.id} named={chip.named} worthNaming={chip.worthNaming} archived={chip.archived} />
    </section>
  );
}

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
