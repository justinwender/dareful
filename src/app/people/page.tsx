import Link from "next/link";
import { redirect } from "next/navigation";
import { Avatar, AvatarStack } from "@/components/ledger/avatar";
import { ObligationToken } from "@/components/ledger/obligation-token";
import { Screen } from "@/components/ledger/screen";
import { LinkPending } from "@/components/ui/link-pending";
import { TabBar } from "@/components/ui/tab-bar";
import { currentUser } from "@/lib/auth/session";
import { ghostsForCreator } from "@/lib/ledger/claims";
import { liveFor, peopleFor, squareSentence } from "@/lib/ledger/home";
import { hueFor } from "@/lib/ui/hue";
import { viewerClock } from "@/lib/ui/zone";

export const dynamic = "force-dynamic";

/**
 * People, the second root (docs/design.md 6.1): the list, and through it the person view, where the thesis lives.
 * People with something open get a row each; everyone who is square collapses into one row with an avatar stack
 * and a sentence, because four rows that each say "nothing open" is four repetitions of nothing (4.7). The
 * standings segment (who has been fronting what) is not built: nothing here pretends to be it.
 */
export default async function PeoplePage() {
  const me = await currentUser();
  if (!me) redirect("/");
  const clock = await viewerClock();
  const [people, ghosts, live] = await Promise.all([peopleFor(me), ghostsForCreator(me.id), liveFor(me, new Date(clock.now))]);
  const nobody = people.people.length === 0 && people.square.length === 0 && ghosts.length === 0;

  return (
    <Screen>
      <h1 className="pt-5 text-label text-ink-3">People</h1>
      <div className="flex flex-col gap-7 py-4">
        {nobody ? (
          <p className="text-body text-ink-2">Nobody yet. Ask something and send it around; whoever gets in turns up here.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {people.people.map(({ user: p, token }) => (
              <li key={p.id}>
                <Link prefetch={false} href={`/p/${p.id}`} className="relative flex min-h-14 items-center gap-3 rounded-button bg-surface px-3">
                  <LinkPending />
                  <Avatar name={p.displayName} hue={hueFor(p.id)} size={36} />
                  <span className="min-w-0 flex-1 truncate text-body-strong text-ink">{p.displayName}</span>
                  {token ? (
                    <ObligationToken
                      owner={token.ownerId === me.id ? { id: me.id, displayName: me.displayName, hue: hueFor(me.id) } : { id: p.id, displayName: p.displayName, hue: hueFor(p.id) }}
                      other={token.ownerId === me.id ? p : me}
                      viewerId={me.id}
                      denomination={token.denomination}
                      quantity={token.quantity}
                    />
                  ) : null}
                </Link>
              </li>
            ))}
            {/* Never repeat an empty phrase down a list: everyone square is one row that names them. */}
            {people.square.length > 0 ? (
              <li>
                <details className="group rounded-button bg-surface">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-3">
                    <AvatarStack people={people.square.map((p) => ({ name: p.displayName, hue: hueFor(p.id) }))} size={26} />
                    <span className="min-w-0 flex-1 text-body-sm text-ink-2">{squareSentence(people.square.map((p) => p.displayName))}</span>
                    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink-3 transition-transform group-open:rotate-90">
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </summary>
                  <ul className="flex flex-col border-t border-line">
                    {people.square.map((p) => (
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
        )}
      </div>
      <TabBar active="/people" live={live} start />
    </Screen>
  );
}
