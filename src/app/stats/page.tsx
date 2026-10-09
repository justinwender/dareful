import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { notFound } from "next/navigation";
import { Screen, TopBar } from "@/components/ledger/screen";
import { StatsActions } from "@/components/you/stats-actions";
import { TallyWait } from "@/components/ui/tally-loader";
import { currentUser } from "@/lib/auth/session";
import { isOwner } from "@/lib/usage/owner";
import { countedOnchain, countStats, PERCENT_STATS, snapshots, STATS, windowFor } from "@/lib/usage/stats";
import { onchainCounts, ONCHAIN_COUNT_CAP } from "@/lib/ledger/envio";
import { explorerAddressUrl } from "@/lib/chain/explorer";
import { monOf, relayerRunway, RUNWAY_DAYS } from "@/lib/chain/watch";
import { within, SECTION_LIMIT_MS } from "@/lib/usage/within";
import { redactKeys } from "@/lib/redact";

export const metadata: Metadata = { title: "Dareful", robots: { index: false, follow: false } };

/**
 * The numbers (the field round, 3.1): the owner's page and nobody else's. Anyone who is not the owner, signed in
 * or not, gets the code screen exactly as for an address with no screen, so the page tells nobody it exists.
 * Two columns, since launch and the last seven days, each number with its definition; then the relayer, the chain's
 * counts, and the daily snapshots with the two buttons that write them. Every count leaves excluded accounts out.
 *
 * Each section reads on its own, with its own time limit and its own line when it cannot (the touch-ups round,
 * section 1): the header goes out at once, every section shows the loader while it reads, and one slow or failing
 * source (the indexer, a heavy count, the node) blanks only its own section, never the page.
 */
export default async function StatsPage() {
  const me = await currentUser();
  if (!me || !isOwner(me.id)) notFound();
  return (
    <Screen>
      <TopBar back />
      <div className="flex flex-col gap-7 py-2" data-stats="">
        <header className="flex flex-col gap-1">
          <h1 className="text-serif-l text-ink">The numbers</h1>
          <p className="text-body-sm text-ink-2">Since launch, and the last seven days. Excluded accounts are left out of everything here.</p>
        </header>
        <Suspense fallback={<TallyWait />}>
          <Counts />
        </Suspense>
        <section className="flex flex-col gap-3" data-stats-relayer="">
          <h2 className="text-label text-ink-2">The relayer</h2>
          <Suspense fallback={<TallyWait />}>
            <Relayer />
          </Suspense>
        </section>
        <section className="flex flex-col gap-3" data-stats-chain="">
          <h2 className="text-label text-ink-2">On the chain</h2>
          <Suspense fallback={<TallyWait />}>
            <Chain />
          </Suspense>
          <p className="text-caption text-ink-3">Counted from the indexer, since the contracts were deployed: questions with someone counted in them, and the people counted, their obligations and their sets. The test runs share the contracts and are left out.</p>
          <Contracts />
        </section>
        <section className="flex flex-col gap-3" data-stats-days="">
          <h2 className="text-label text-ink-2">By the day (Eastern)</h2>
          <StatsActions />
          <Suspense fallback={<TallyWait />}>
            <Days />
          </Suspense>
        </section>
      </div>
    </Screen>
  );
}

/** A section's line when it could not be read in its time, or at all. The failure goes to the log, never the page. */
function Unread({ what, err }: { what: string; err: unknown }): ReactNode {
  // The line that goes to the log carries no key, whatever the failure said (the submission round, section 4).
  console.error("a section of the numbers could not be read", { what, why: redactKeys(err instanceof Error ? err.message.split("\n")[0] : String(err)) });
  return (
    <p className="text-body-sm text-ink-2" data-stats-unread={what}>
      {what === "counts" ? "The counts couldn’t be read just now." : what === "relayer" ? "The relayer couldn’t be read just now." : what === "chain" ? "The chain’s counts couldn’t be read just now." : "The days couldn’t be read just now."}
    </p>
  );
}

async function Counts() {
  const now = new Date();
  let launch: Awaited<ReturnType<typeof countStats>>;
  let week: Awaited<ReturnType<typeof countStats>>;
  try {
    [launch, week] = await within(SECTION_LIMIT_MS.counts, Promise.all([countStats(windowFor("launch", now)), countStats(windowFor("week", now))]));
  } catch (err) {
    return <Unread what="counts" err={err} />;
  }
  const show = (key: (typeof STATS)[number]["key"], n: number) => (PERCENT_STATS.has(key) ? `${n}%` : String(n));
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface" data-stats-counts="">
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
  );
}

/** The relayer's balance and the days it covers at the past week's rate (the touch-ups round, section 0). */
async function Relayer() {
  let runway: Awaited<ReturnType<typeof relayerRunway>>;
  try {
    runway = await within(SECTION_LIMIT_MS.relayer, relayerRunway(new Date()));
  } catch (err) {
    return <Unread what="relayer" err={err} />;
  }
  const low = runway.perDay > 0n && runway.balance < runway.perDay * RUNWAY_DAYS;
  return (
    <>
      <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 text-body-sm text-ink" data-relayer-low={low ? "" : undefined}>
        <dt>Balance</dt>
        <dd className="text-right tabular-nums" data-relayer-balance="">{monOf(runway.balance)} MON</dd>
        <dt>Spent a day, the past week</dt>
        <dd className="text-right tabular-nums">{monOf(runway.perDay)} MON</dd>
        <dt>Days it covers</dt>
        <dd className="text-right tabular-nums" data-relayer-days="">{runway.days === null ? "Nothing spent" : `About ${runway.days}`}</dd>
      </dl>
      <p className="text-caption text-ink-3">The week counts every transaction the relayer signed, the test suites’ included, since they share it. You’re emailed when it covers less than three days.</p>
    </>
  );
}

async function Chain() {
  let chain: Awaited<ReturnType<typeof onchainCounts>>;
  try {
    // Real use only (the final round, section 0): what Postgres says is real use, asked of the indexer by id.
    chain = await within(
      SECTION_LIMIT_MS.chain,
      (async () => {
        const counted = await countedOnchain();
        return onchainCounts(counted, counted.questionGroups);
      })(),
    );
  } catch (err) {
    return <Unread what="chain" err={err} />;
  }
  const upTo = (n: number) => (n >= ONCHAIN_COUNT_CAP ? `${n} or more` : String(n));
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-2 rounded-card border border-line bg-surface px-4 py-3 text-body-sm text-ink" data-stats-chain-counts="">
      <dt>Obligations minted</dt>
      <dd className="text-right tabular-nums">{upTo(chain.obligations)}</dd>
      <dt>Questions closed onto it</dt>
      <dd className="text-right tabular-nums">{upTo(chain.questions)}</dd>
      <dt>People registered</dt>
      <dd className="text-right tabular-nums">{upTo(chain.people)}</dd>
      <dt>Sets registered</dt>
      <dd className="text-right tabular-nums">{upTo(chain.sets)}</dd>
      <dt>Questions in a group of their own</dt>
      <dd className="text-right tabular-nums">{upTo(chain.questionGroups)}</dd>
    </dl>
  );
}

function Contracts() {
  const chainId = Number(process.env.MONAD_CHAIN_ID ?? 10143);
  const contracts = [
    { label: "The ledger", address: process.env.DAREFUL_LEDGER_ADDRESS ?? null },
    { label: "The questions", address: process.env.DAREFUL_DARES_ADDRESS ?? null },
  ];
  return (
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
  );
}

async function Days() {
  let days: Awaited<ReturnType<typeof snapshots>>;
  try {
    days = await within(SECTION_LIMIT_MS.days, snapshots(60));
  } catch (err) {
    return <Unread what="days" err={err} />;
  }
  const shown = STATS.slice(0, 8);
  if (days.length === 0) return <p className="text-body-sm text-ink-2">No day written yet.</p>;
  return (
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
  );
}
