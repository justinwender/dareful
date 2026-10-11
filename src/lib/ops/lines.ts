/**
 * The owner's lines (the ops round, section 1). For everything production uses up, the level at which the owner is
 * warned and the level at which it is urgent, far enough ahead of the limit that he tops up or upgrades before anyone
 * notices. Every line is here and nowhere else, so moving one is one edit. Each line tells the owner once when it is
 * crossed, by email and a push to his phone, and again only after the level has recovered and crossed it again
 * (src/lib/ops/alerts.ts); the morning email shows every level against its lines, every day (src/lib/ops/morning.ts).
 */

const MON = 10n ** 18n;

/** Decimal units, as the plans state them ("500 MB", "1 GB"): a line read against these is a little early, never late. */
const MB = 1_000_000;
const GB = 1_000_000_000;

export const LINES = {
  /** The relayer's balance (wei): under these. Five is the suites' floor (`TEST_FLOOR`); three days at the past week's rate is urgent too. */
  relayer: { warn: 10n * MON, urgent: 5n * MON, urgentDays: 3 },
  /** The model API's credit (cents), as entered on /stats less what the app has spent since: under these, or any answer saying the balance is too low. */
  anthropic: { warnCents: 500n, urgentCents: 200n },
  /** Supabase's database against the free plan's 500 MB, past which the project goes read-only: percent used. */
  database: { limitBytes: 500 * MB, warnPercent: 70, urgentPercent: 90 },
  /** Supabase Storage's objects against the free plan's 1 GB: percent used. */
  storage: { limitBytes: 1 * GB, warnPercent: 70, urgentPercent: 90 },
  /** Resend's free plan: 100 a UTC day and 3,000 a month, counted from the app's own sends. */
  resend: { dayLimit: 100, dayWarn: 70, dayUrgent: 90, monthLimit: 3_000, monthWarn: 2_100, monthUrgent: 2_700 },
  /** Alchemy's free plan: 30 million compute units a month, the app's own calls at each method's cost: percent used, or any refusal. */
  alchemy: { limitCu: 30_000_000, warnPercent: 70, urgentPercent: 90 },
  /**
   * The hosted indexer's deployment, which the Development plan deletes at 30 days: days left, or any refusal from its
   * 100 queries a minute. Its start is read from the deployment `ENVIO_GRAPHQL_URL` points at (when it first caught up
   * with the chain), so a redeploy moves the line with no edit here. For the record: ad29726's caught up at 02:19 UTC on
   * 2026-09-19 and goes around October 19; its redeploy, 81dc636 (pre-submission bug fixes 1, the same tree), caught up
   * at 18:26 UTC on 2026-10-10, lasts to November 9, and is read once `ENVIO_GRAPHQL_URL` points at it.
   */
  indexer: { lifespanDays: 30, warnDaysLeft: 7, urgentDaysLeft: 3 },
  /**
   * Dynamic's sandbox, which holds 1,000 users, after which nobody new can sign in until some are deleted (Dynamic's docs,
   * "Sandbox vs live"); the README's test code makes accounts with no inbox, so judging fills it faster than people do
   * (pre-submission bug fixes 1). Users in the environment, read from Dynamic's API. Deleting test accounts: docs/decisions.md 2026-10-10.
   */
  dynamic: { limit: 1_000, warn: 700, urgent: 900 },
} as const;

/** How long a refusal (for rate, for credit) keeps its line urgent after the last one. */
export const REFUSAL_HOLDS_MS = 60 * 60_000;

/** A core system down this long reaches the owner at once, by email and push (section 5). */
export const DOWN_TELLS_AFTER_MS = 10 * 60_000;

/** The two no API answers on these plans: named in the morning email with where to read them and the line to read them against. */
export const BY_HAND = [
  { what: "Vercel's Active CPU", line: "2 of the Hobby plan's 4 hours over 30 days (1 hour 14 minutes on October 9); a Hobby project that passes a limit loses that feature for up to 30 days", url: "https://vercel.com/justinwenders-projects/~/usage" },
  { what: "Supabase's egress", line: "70% of the free plan's 5 GB in the billing cycle", url: "https://supabase.com/dashboard/org/_/usage" },
] as const;
