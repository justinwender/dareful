import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Screen, TopBar } from "@/components/ledger/screen";
import { StatsActions } from "@/components/you/stats-actions";
import { currentUser } from "@/lib/auth/session";
import { isOwner } from "@/lib/usage/owner";
import { countStats, PERCENT_STATS, snapshots, STATS, windowFor } from "@/lib/usage/stats";
import { onchainCounts, ONCHAIN_COUNT_CAP } from "@/lib/ledger/envio";
import { explorerAddressUrl } from "@/lib/chain/explorer";

export const metadata: Metadata = { title: "Dareful", robots: { index: false, follow: false } };

/**
 * The numbers (the field round, 3.1): the owner's page and nobody else's. Anyone who is not the owner, signed in
 * or not, gets the code screen exactly as for an address with no screen, so the page tells nobody it exists.
 * Two columns, since launch and the last seven days, each number with its definition; then the daily snapshots
 * and the two buttons that write them. Every count leaves excluded accounts out.
 */
export default async function StatsPage() {
  const me = await currentUser();
  if (!me || !isOwner(me.id)) notFound();
  const now = new Date();
  // The chain's counts are the indexer's; a read that fails says so and never takes the page down.
  const [launch, week, days, chain] = await Promise.all([countStats(windowFor("launch", now)), countStats(windowFor("week", now)), snapshots(60), onchainCounts().catch(() => null)]);
  const chainId = Number(process.env.MONAD_CHAIN_ID ?? 10143);
  const contracts = [
    { label: "The ledger", address: process.env.DAREFUL_LEDGER_ADDRESS ?? null },
    { label: "The questions", address: process.env.DAREFUL_DARES_ADDRESS ?? null },
  ];
  const show = (key: (typeof STATS)[number]["key"], n: number) => (PERCENT_STATS.has(key) ? `${n}%` : String(n));
  const upTo = (n: number) => (n >= ONCHAIN_COUNT_CAP ? `${n} or more` : String(n));
  const shown = STATS.slice(0, 8);
  return (
    <Screen>
      <TopBar back />
      <div className="flex flex-col gap-7 py-2" data-stats="">
        <header className="flex flex-col gap-1">
          <h1 className="text-serif-l text-ink">The numbers</h1>
          <p className="text-body-sm text-ink-2">Since launch, and the last seven days. Excluded accounts are left out of everything here.</p>
        </header>
        <section className="overflow-hidden rounded-card border border-line bg-surface">
          <table className="w-full border-collapse text-body-sm text-ink">
            <thead>
              <tr className="border-b border-line text-label text-ink-3">
                <th scope="col" className="px-4 py-2 text-left font-semibold">What</th>
                <th scope="col" className="px-2 py-2 text-right font-semibold">Launch</th>
                <th scope="col" className="px-4 py-2 text-right font-semibold">7 days</th>
              </tr>
            </thead>
            <tbody>
              {STATS.map((s) => (
                <tr key={s.key} className="border-b border-line last:border-b-0" data-stat={s.key}>
                  <th scope="row" className="px-4 py-2 text-left font-normal">
                    <span className="block text-body-sm text-ink">{s.label}</span>
                    <span className="block text-caption text-ink-3">{s.definition}</span>
                  </th>
                  <td className="px-2 py-2 text-right text-numeral-sm tabular-nums">{show(s.key, launch[s.key])}</td>
                  <td className="px-4 py-2 text-right text-numeral-sm tabular-nums">{show(s.key, week[s.key])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="flex flex-col gap-3" data-stats-chain="">
          <h2 className="text-label text-ink-2">On the chain</h2>
          {chain ? (
            <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 text-body-sm text-ink">
              <dt>Obligations minted</dt>
              <dd className="text-right tabular-nums">{upTo(chain.obligations)}</dd>
              <dt>Questions closed onto it</dt>
              <dd className="text-right tabular-nums">{upTo(chain.questions)}</dd>
              <dt>Members registered</dt>
              <dd className="text-right tabular-nums">{upTo(chain.members)}</dd>
              <dt>Groups registered</dt>
              <dd className="text-right tabular-nums">{upTo(chain.groups)}</dd>
            </dl>
          ) : (
            <p className="text-body-sm text-ink-2">The chain’s counts couldn’t be read just now.</p>
          )}
          <p className="text-caption text-ink-3">Counted from the indexer, since the contracts were deployed. Every account is in these, test accounts included.</p>
          <ul className="flex flex-col gap-1 text-body-sm">
            {contracts.map((c) =>
              c.address ? (
                <li key={c.label}>
                  <a href={explorerAddressUrl(chainId, c.address)} target="_blank" rel="noreferrer" className="link-tertiary press-line" data-press="line" data-explorer="">
                    {c.label}, on the explorer
                  </a>
                </li>
              ) : null,
            )}
          </ul>
        </section>
        <section className="flex flex-col gap-3">
          <h2 className="text-label text-ink-2">By the day (Eastern)</h2>
          <StatsActions />
          {days.length === 0 ? (
            <p className="text-body-sm text-ink-2">No day written yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-card border border-line bg-surface">
              <table className="w-full border-collapse text-caption text-ink">
                <thead>
                  <tr className="border-b border-line text-ink-3">
                    <th scope="col" className="px-3 py-2 text-left font-semibold">Day</th>
                    {shown.map((s) => (
                      <th key={s.key} scope="col" className="px-2 py-2 text-right font-semibold">
                        {s.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={d.day} className="border-b border-line last:border-b-0" data-snapshot-day={d.day}>
                      <th scope="row" className="px-3 py-2 text-left font-normal tabular-nums">{d.day}</th>
                      {shown.map((s) => (
                        <td key={s.key} className="px-2 py-2 text-right tabular-nums">
                          {d.counts[s.key] ?? 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </Screen>
  );
}
