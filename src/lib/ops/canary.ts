/**
 * The canary (the ops round, section 4): every six hours, one question run through every system the way people's taps
 * run it, by two accounts whose keys the canary holds (from `CANARY_MNEMONIC`, never a person's). It asks with the
 * write-up, both enter, it closes onto the chain, it is said to have happened, both vote and it settles on the chain,
 * the hosted indexer is waited on until it shows the settlement, and then the question's rows are removed. The two
 * accounts and their set stay between runs, left out of every count, so the chain registers them once.
 *
 * A step that fails emails `OPS_EMAIL` at once, naming the step and what it said (keys taken out), and every run is kept
 * in `canary_runs` with its steps' times and its transactions, for the morning email. Off, and saying so, until the
 * mnemonic is set.
 *
 * The canary's governance keys are held by the server, which is how it can vote for itself; they are the canary's own,
 * on two accounts that are nobody, so the rule that the server never casts a person's vote is untouched.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import { db, schema } from "@/db";
import { sendOps } from "@/lib/notify/channels";
import { SendPending } from "@/lib/chain/relayer";
import { ensureUsd } from "@/lib/ledger/denominations";
import { createGroup } from "@/lib/ledger/groups";
import { bufferToHex } from "@/lib/ledger/ids";
import { dareByOnchainId } from "@/lib/ledger/envio";
import * as markets from "@/lib/ledger/markets";
import { sayItHappened } from "@/lib/ledger/calls";
import { writeUp, type ScopeResult } from "@/lib/ledger/write-up";
import { redactKeys } from "@/lib/redact";

/** The line the canary asks, every run the same, so the write-up is the only thing that varies. */
export const CANARY_LINE = "Will the canary sing before the hour is out?";
/** Its two accounts' Dynamic ids: not Dynamic's (it has no sign-in), so no email or sign-in ever reaches one. */
export const CANARY_IDS = { a: "canary:a", b: "canary:b" } as const;
export const CANARY_SET = "The canary";
/** How long the canary waits for a chain write the tick is finishing, and for the hosted indexer, before it fails the step. */
export const WAIT_MS = 75_000;

export type CanaryStep = "accounts" | "write-up" | "ask" | "enter" | "close" | "vote" | "settle" | "indexer" | "remove";
export type CanaryResult = { id: string; ok: boolean; step: CanaryStep; error: string | null; dareId: string | null; txs: Array<{ step: CanaryStep; hash: string }>; steps: Array<{ step: CanaryStep; ms: number }> };

type Signer = { userId: string; ledger: HDAccount; governance: HDAccount };

export type CanaryDeps = {
  mnemonic: string;
  /** Who the two accounts are: the canary's own, or a test's, under its own prefix. */
  ids?: { a: string; b: string };
  writeUp?: (line: string, userId: string) => Promise<ScopeResult | { error: string }>;
  /** Whether the hosted indexer shows this question settled. */
  indexerShows?: (onchainId: string) => Promise<boolean>;
  /** Told when a step fails. */
  tell?: (subject: string, text: string) => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  waitMs?: number;
};

/** The canary's four keys from its mnemonic: each account's ledger key and governance key at their own index. Pure. */
export function canaryKeys(mnemonic: string): { a: { ledger: HDAccount; governance: HDAccount }; b: { ledger: HDAccount; governance: HDAccount } } {
  const at = (addressIndex: number) => mnemonicToAccount(mnemonic, { addressIndex });
  return { a: { ledger: at(0), governance: at(1) }, b: { ledger: at(2), governance: at(3) } };
}

/** Whether the canary can run here, and why not when it cannot. Pure but for the environment it is given. */
export function canaryOff(env: NodeJS.ProcessEnv = process.env): string | null {
  if (!env.CANARY_MNEMONIC) return "CANARY_MNEMONIC is not set";
  return null;
}

/** The two accounts, made the first time and kept: left out of every count from the moment they exist. */
async function ensureAccounts(mnemonic: string, ids: { a: string; b: string }): Promise<{ a: Signer; b: Signer }> {
  const keys = canaryKeys(mnemonic);
  const one = async (dynamicUserId: string, k: { ledger: HDAccount; governance: HDAccount }, name: string): Promise<Signer> => {
    await db
      .insert(schema.users)
      .values({ dynamicUserId, ledgerWallet: k.ledger.address.toLowerCase(), governanceWallet: k.governance.address.toLowerCase(), displayName: name, excludedFromCounts: true })
      .onConflictDoNothing({ target: schema.users.dynamicUserId });
    const [u] = await db.select().from(schema.users).where(eq(schema.users.dynamicUserId, dynamicUserId)).limit(1);
    if (!u) throw new Error(`the account ${dynamicUserId} could not be made`);
    if (u.ledgerWallet.toLowerCase() !== k.ledger.address.toLowerCase()) throw new Error(`the account ${dynamicUserId} holds other keys than the mnemonic gives`);
    if (!u.excludedFromCounts) await db.update(schema.users).set({ excludedFromCounts: true }).where(eq(schema.users.id, u.id));
    return { userId: u.id, ledger: k.ledger, governance: k.governance };
  };
  return { a: await one(ids.a, keys.a, "Canary"), b: await one(ids.b, keys.b, "Canary Two") };
}

/** Their set, exactly the two of them, made once and kept; its unit with it. */
async function ensureSet(a: string, b: string): Promise<{ groupId: string; denomId: string }> {
  const mine = await db.execute(
    sql`select g.id from groups g where g.created_by = ${a} and g.name = ${CANARY_SET} and (select count(*) from group_members m where m.group_id = g.id and m.left_at is null) = 2 and exists (select 1 from group_members m where m.group_id = g.id and m.user_id = ${b}) order by g.created_at limit 1`,
  );
  const found = (mine as unknown as Array<{ id: string }>)[0];
  const groupId = found?.id ?? (await createGroup({ name: CANARY_SET, createdBy: a, memberUserIds: [b] })).id;
  const usd = await ensureUsd(groupId, a);
  return { groupId, denomId: usd.id };
}

/** The question's rows, all of them: the run leaves nothing of it here (the chain keeps its record, as it keeps everything). */
export async function removeCanaryQuestion(dareId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const ids = [dareId];
    await tx.delete(schema.notificationLog).where(inArray(schema.notificationLog.dareId, ids));
    await tx.delete(schema.roomCodes).where(inArray(schema.roomCodes.dareId, ids));
    await tx.delete(schema.personalLinks).where(inArray(schema.personalLinks.dareId, ids));
    await tx.delete(schema.nowArchive).where(inArray(schema.nowArchive.dareId, ids));
    await tx.delete(schema.dareNumberSeries).where(inArray(schema.dareNumberSeries.dareId, ids));
    await tx.delete(schema.media).where(inArray(schema.media.dareId, ids));
    await tx.delete(schema.dareVotes).where(inArray(schema.dareVotes.dareId, ids));
    await tx.delete(schema.dareCloseCalls).where(inArray(schema.dareCloseCalls.dareId, ids));
    await tx.delete(schema.dareStatements).where(inArray(schema.dareStatements.dareId, ids));
    await tx.delete(schema.dareAgreements).where(inArray(schema.dareAgreements.dareId, ids));
    await tx.delete(schema.dareDisputes).where(inArray(schema.dareDisputes.dareId, ids));
    await tx.delete(schema.usageEvents).where(inArray(schema.usageEvents.dareId, ids));
    await tx.delete(schema.darePositions).where(inArray(schema.darePositions.dareId, ids));
    await tx.delete(schema.obligations).where(and(eq(schema.obligations.origin, "dare"), inArray(schema.obligations.originId, ids)));
    await tx.delete(schema.obligationProposals).where(and(eq(schema.obligationProposals.origin, "dare"), inArray(schema.obligationProposals.originId, ids)));
    await tx.delete(schema.chainFailures).where(sql`${schema.chainFailures.key} like ${`%${dareId}%`}`);
    await tx.delete(schema.dares).where(inArray(schema.dares.id, ids));
  });
}

/** Waits, a few seconds at a time, until `done` answers true or the wait runs out. */
async function until(done: () => Promise<boolean>, waitMs: number, sleep: (ms: number) => Promise<void>): Promise<boolean> {
  const ends = Date.now() + waitMs;
  for (;;) {
    if (await done().catch(() => false)) return true;
    if (Date.now() >= ends) return false;
    await sleep(3_000);
  }
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** The hosted indexer shows the question settled: resolved, with what it minted. */
export async function indexerShowsSettled(onchainId: string): Promise<boolean> {
  const d = await dareByOnchainId(onchainId);
  return d !== null && d.status === "RESOLVED" && d.edges.length > 0;
}

/** One run, end to end. Never throws: a failure is the run's answer, kept and told. */
export async function runCanary(deps: CanaryDeps): Promise<CanaryResult> {
  const sleep = deps.sleep ?? realSleep;
  const waitMs = deps.waitMs ?? WAIT_MS;
  const [row] = await db.insert(schema.canaryRuns).values({}).returning({ id: schema.canaryRuns.id });
  const runId = (row as { id: string }).id;
  const steps: CanaryResult["steps"] = [];
  const txs: CanaryResult["txs"] = [];
  let step: CanaryStep = "accounts";
  let dareId: string | null = null;
  const timed = async <T>(s: CanaryStep, fn: () => Promise<T>): Promise<T> => {
    step = s;
    const started = Date.now();
    const out = await fn();
    steps.push({ step: s, ms: Date.now() - started });
    return out;
  };
  let error: string | null = null;
  try {
    const { a, b, set } = await timed("accounts", async () => {
      const ids = deps.ids ?? CANARY_IDS;
      // A run a dying process left midway leaves its question behind: removed before this one starts.
      for (const stray of await strayCanaryQuestions(ids)) await removeCanaryQuestion(stray);
      const people = await ensureAccounts(deps.mnemonic, ids);
      return { ...people, set: await ensureSet(people.a.userId, people.b.userId) };
    });
    const scope = await timed("write-up", async () => {
      const s = await (deps.writeUp ?? ((line, userId) => writeUp({ line }, userId, "America/New_York")))(CANARY_LINE, a.userId);
      if ("error" in s) throw new Error(s.error);
      // A write-up that fell back to the line as typed is the model not answering: the step it exists to check.
      if (s.plain) throw new Error("the write-up fell back to the line as typed");
      return s;
    });
    const d = await timed("ask", async () => {
      const draft = await markets.draftMarket({ creatorId: a.userId, groupId: set.groupId, denomId: set.denomId, title: scope.title, termsText: scope.terms, resolvesBy: new Date(Date.now() + 24 * 3_600_000), zone: "America/New_York", outcomeWords: scope.outcomes });
      dareId = draft.id;
      return markets.openMarket(draft.id, a.userId, await a.ledger.signTypedData(markets.createTypedData(draft)));
    });
    await timed("enter", async () => {
      for (const [who, value] of [[a, 7000n], [b, 3000n]] as const) {
        await markets.enterMarket({ dareId: d.id, userId: who.userId, stake: 100n, value, signature: await who.ledger.signTypedData(markets.enterTypedData(d, 100n, value)), questionSignature: await who.ledger.signTypedData(markets.questionCreateTypedData(d)) });
      }
    });
    await timed("close", async () => {
      const r = await markets.lockMarket(d.id, a.userId);
      if (r.expired) throw new Error("it ended as an expiry instead of closing");
      if (r.txHash !== "0x") txs.push({ step: "close", hash: r.txHash });
      const onchain = await until(async () => Boolean((await markets.marketById(d.id))?.onchainId), waitMs, sleep);
      if (!onchain) throw new Error("its create did not land on the chain in time");
    });
    const locked = (await markets.marketById(d.id)) as markets.DareRow;
    await timed("vote", async () => {
      await sayItHappened(d.id, { userId: a.userId });
      for (const who of [a, b]) {
        try {
          const r = await markets.castVote({ dareId: d.id, userId: who.userId, outcome: 1n, signature: await who.governance.signTypedData(markets.voteTypedData(locked, 1n)) });
          if (r.txHash && r.txHash !== "0x") txs.push({ step: "settle", hash: r.txHash });
        } catch (err) {
          // The resolve went and its receipt is still to come: the tick finishes it, and the next step waits for it.
          if (!(err instanceof SendPending)) throw err;
          txs.push({ step: "settle", hash: err.hash });
        }
      }
    });
    const settled = await timed("settle", async () => {
      const done = await until(async () => Boolean((await markets.marketById(d.id))?.resolvedAt), waitMs, sleep);
      if (!done) throw new Error("its resolve did not land on the chain in time");
      const after = (await markets.marketById(d.id)) as markets.DareRow;
      if (after.resolvedBy !== "quorum" || after.resolvedOutcome !== 1n) throw new Error(`it settled as ${after.resolvedBy ?? "nothing"}, not by its two votes`);
      return after;
    });
    await timed("indexer", async () => {
      const id = bufferToHex(settled.onchainId as Buffer);
      const shows = await until(() => (deps.indexerShows ?? indexerShowsSettled)(id), waitMs, sleep);
      if (!shows) throw new Error("the hosted indexer did not show the settlement in time");
    });
  } catch (err) {
    error = redactKeys(err instanceof Error ? (err.message.split("\n")[0] ?? err.name) : String(err)).slice(0, 300);
  }
  const failedAt: CanaryStep = step;
  // The question's rows go whether it passed or not: a failed run leaves nothing for anyone to count or see.
  if (dareId) {
    try {
      step = "remove";
      const started = Date.now();
      await removeCanaryQuestion(dareId);
      steps.push({ step: "remove", ms: Date.now() - started });
    } catch (err) {
      error ??= `its rows could not be removed: ${redactKeys(err instanceof Error ? (err.message.split("\n")[0] ?? err.name) : String(err)).slice(0, 200)}`;
    }
  }
  const ok = error === null;
  const at: CanaryStep = ok ? "remove" : error?.startsWith("its rows could not be removed") ? "remove" : failedAt;
  await db.update(schema.canaryRuns).set({ finishedAt: new Date(), ok, step: at, error, dareId, txs, steps }).where(eq(schema.canaryRuns.id, runId));
  if (!ok) {
    const tell = deps.tell ?? sendOps;
    await tell(`Dareful: the canary failed at ${at}`, `The canary's run at ${new Date().toISOString().slice(11, 16)} UTC failed at the step "${at}": ${error}\n\nSteps that passed: ${steps.map((s) => `${s.step} ${Math.round(s.ms / 100) / 10}s`).join(", ") || "none"}.\nTransactions: ${txs.map((t) => `${t.step} ${t.hash}`).join(", ") || "none"}.\n\nThe question's rows were removed. The health route and dareful.app/stats say how the rest stands.`).catch(() => false);
  }
  return { id: runId, ok, step: at, error, dareId, txs, steps };
}

/** Runs left mid-way by a process that died: none of their questions' rows are left, by the canary's own accounts. */
export async function strayCanaryQuestions(ids: { a: string; b: string } = CANARY_IDS): Promise<string[]> {
  const rows = await db
    .select({ id: schema.dares.id })
    .from(schema.dares)
    .innerJoin(schema.users, eq(schema.users.id, schema.dares.creatorId))
    .where(and(eq(schema.users.dynamicUserId, ids.a), isNull(schema.dares.templateId)));
  return rows.map((r) => r.id);
}
