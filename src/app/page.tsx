import Link from "next/link";
import { inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { SignInButton } from "@/components/auth/sign-in-button";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Avatar, AvatarStack } from "@/components/ledger/avatar";
import { CoveredCard } from "@/components/ledger/covered-card";
import { ActionArea, Screen, SectionLabel, TopBar } from "@/components/ledger/screen";
import { ButtonLink } from "@/components/ui/button";
import { currentUser } from "@/lib/auth/session";
import { denominationsByIds } from "@/lib/ledger/denominations";
import { groupsForUser, peopleForUser } from "@/lib/ledger/groups";
import { pendingForDebtor } from "@/lib/ledger/proposals";
import { hueFor } from "@/lib/ui/hue";

export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();
  if (!user) return <SignedOut />;

  const [groups, people, pending] = await Promise.all([groupsForUser(user.id), peopleForUser(user.id), pendingForDebtor(user.id)]);
  const creditorIds = Array.from(new Set(pending.map((p) => p.toUser).filter((x): x is string => Boolean(x))));
  const creditors = creditorIds.length ? await db.select().from(schema.users).where(inArray(schema.users.id, creditorIds)) : [];
  const creditorById = new Map(creditors.map((c) => [c.id, c]));
  const denoms = await denominationsByIds(pending.map((p) => p.denomId));
  const groupName = new Map(groups.map((g) => [g.id, g.name]));
  const empty = groups.length === 0 && people.length === 0 && pending.length === 0;

  return (
    <Screen>
      <TopBar
        title="Dareful"
        right={
          <Link href={`/p/${user.id}`} aria-label="You" className="inline-flex h-12 w-12 items-center justify-center rounded-pill">
            <Avatar name={user.displayName} hue={hueFor(user.id)} size={28} />
          </Link>
        }
      />
      {empty ? (
        <div className="flex flex-1 flex-col justify-center gap-6 py-10">
          <div className="flex items-center gap-3">
            <span className="h-3 w-3 rounded-pill bg-marigold" aria-hidden="true" />
            <span className="text-label text-ink-2">Today</span>
          </div>
          <h1 className="text-display text-ink">Nothing here yet, {user.displayName}.</h1>
          <p className="text-body text-ink-2">Start a group with the people you already cover for, or log the one you just got.</p>
          <div className="flex flex-col gap-3">
            <ButtonLink href="/g/new" variant="primary">
              Start a group
            </ButtonLink>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-7 py-2">
          {pending.length > 0 ? (
            <section className="flex flex-col gap-3">
              <SectionLabel>Needs you</SectionLabel>
              {pending.map((p) => {
                const creditor = p.toUser ? creditorById.get(p.toUser) : undefined;
                const denomination = denoms.get(p.denomId);
                if (!creditor || !denomination) return null;
                return (
                  <CoveredCard
                    key={p.id}
                    viewerId={user.id}
                    creditor={creditor}
                    debtor={user}
                    denomination={denomination}
                    quantity={p.quantity ?? 1n}
                    amountCents={p.amountCents}
                    memo={p.memo}
                    at={p.createdAt}
                    groupName={groupName.get(p.groupId) ?? null}
                    state="pending"
                    href={`/o/${p.id}`}
                  />
                );
              })}
            </section>
          ) : null}

          <section className="flex flex-col gap-3">
            <SectionLabel>People</SectionLabel>
            {people.length === 0 ? (
              <p className="text-body-sm text-ink-2">Nobody yet. Share a group link and they show up here.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {people.map(({ user: p, sharedGroups }) => (
                  <li key={p.id}>
                    <Link href={`/p/${p.id}`} className="flex h-14 items-center gap-3 rounded-button bg-surface px-3">
                      <Avatar name={p.displayName} hue={hueFor(p.id)} size={32} />
                      <span className="flex-1 text-body-strong text-ink">{p.displayName}</span>
                      <span className="text-caption text-ink-3">{sharedGroups === 1 ? "1 group" : `${sharedGroups} groups`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <SectionLabel>Groups</SectionLabel>
              <Link href="/g/new" className="text-[15px] font-semibold text-ink-2">
                New group
              </Link>
            </div>
            <ul className="flex flex-col gap-1.5">
              {groups
                .filter((g) => !g.isDyad)
                .map((g) => (
                  <li key={g.id}>
                    <Link href={`/g/${g.id}`} className="flex h-14 items-center gap-3 rounded-button bg-surface px-3">
                      <span className="flex-1 text-body-strong text-ink">{g.name}</span>
                      <AvatarStack people={g.members.map((m) => ({ name: m.displayName, hue: m.userId ? hueFor(m.userId) : "stone", ghost: !m.userId }))} size={26} />
                    </Link>
                  </li>
                ))}
            </ul>
          </section>

          <div className="pt-6">
            <SignOutButton />
          </div>
        </div>
      )}
      {!empty && people.length > 0 ? (
        <ActionArea>
          <ButtonLink href="/new" variant="primary" className="w-full">
            I got this one
          </ButtonLink>
        </ActionArea>
      ) : null}
    </Screen>
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
