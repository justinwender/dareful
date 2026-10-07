/**
 * Old routing against new on what production has actually asked (the first-contact round, 2026-10-04), before the
 * switch: every question written by a person (the write-up, the type, the date, the copy rules, whether it parsed,
 * the seconds and the tokens), every argument's triage, and every question the tiebreaker ruled on (its outcome
 * against the one recorded). Old is what the deployed build calls (Sonnet 5 drafts, Fable 5.1 weighs); new is this
 * round's (Haiku 4.5 drafts, Sonnet 5.5 weighs and writes Help define's terms). It reads production and the live API
 * and writes nothing anywhere but the report it prints.
 *
 *   npx tsx --env-file=.env.local scripts/dev/compare-models.ts > report.json
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { MODELS, usageTap } from "@/lib/ai/client";
import { arbitrate, arbitrateAnswer, arbitrateNumber, triage } from "@/lib/ai/settler";
import { proposeAnswer, proposeNumber, proposeOutcome } from "@/lib/ai/markets";
import { deadlineMismatch } from "@/lib/ledger/decide-by";
import { answersOf, unitOf } from "@/lib/ledger/markets";
import { writeUp } from "@/lib/ledger/write-up";
import { cutPhrasesIn } from "@/lib/ui/copy-rules";
import { kindForQuestion } from "@/lib/ui/question-shape";

const ROUTES = {
  old: { drafting: "claude-sonnet-5", ruling: "claude-fable-5-1" },
  new: { drafting: "claude-haiku-4-5-20251001", ruling: "claude-sonnet-5-5" },
} as const;
/** Dollars per million tokens, in and out, from Anthropic's pricing page on 2026-10-04. */
const PRICE: Record<string, [number, number]> = {
  "claude-haiku-4-5-20251001": [1, 5],
  "claude-sonnet-5": [2, 10],
  "claude-sonnet-5-5": [2, 10],
  "claude-opus-5-5": [4, 20],
  "claude-fable-5-1": [10, 50],
};
const BANNED = /\b(owes?|owed|debt|balance|outstanding|overdue|odds|price|wager|bet|gambl\w*|money|market)\b|—|the one picked|the chosen one/i;

type Spend = { calls: number; input: number; output: number; dollars: number; ms: number; models: string[] };
function route(name: keyof typeof ROUTES): void {
  (MODELS as { drafting: string; ruling: string }).drafting = ROUTES[name].drafting;
  (MODELS as { drafting: string; ruling: string }).ruling = ROUTES[name].ruling;
}
async function measured<T>(run: () => Promise<T>): Promise<{ value: T | null; error: string | null; spend: Spend; seconds: number }> {
  const spend: Spend = { calls: 0, input: 0, output: 0, dollars: 0, ms: 0, models: [] };
  usageTap.fn = (u) => {
    spend.calls += 1;
    spend.input += u.input;
    spend.output += u.output;
    spend.ms += u.ms;
    spend.models.push(u.model);
    const [i, o] = PRICE[u.model] ?? [0, 0];
    spend.dollars += (u.input * i + u.output * o) / 1_000_000;
  };
  const started = Date.now();
  try {
    const value = await run();
    return { value, error: null, spend, seconds: (Date.now() - started) / 1000 };
  } catch (err) {
    return { value: null, error: err instanceof Error ? err.message.slice(0, 160) : String(err), spend, seconds: (Date.now() - started) / 1000 };
  } finally {
    usageTap.fn = null;
  }
}

/** The outcome proposal each question with something said about it gets, old against new, and every argument's triage again; `--part=proposals`. */
async function proposals(): Promise<void> {
  const said = await db.select().from(schema.dareStatements).where(eq(schema.dareStatements.kind, "update")).orderBy(asc(schema.dareStatements.statedAt));
  const ids = [...new Set(said.map((s) => s.dareId))];
  const rows = [];
  for (const id of ids) {
    const [d] = await db.select().from(schema.dares).where(eq(schema.dares.id, id));
    if (!d) continue;
    const users = await db.select({ id: schema.users.id, name: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, said.filter((s) => s.dareId === id).map((s) => s.userId)));
    const statements = said.filter((s) => s.dareId === id).map((s) => ({ name: (users.find((u) => u.id === s.userId)?.name ?? "Someone").split(/\s+/)[0] ?? "Someone", said: s.statement }));
    const answers = answersOf(d);
    const unit = unitOf(d);
    const row: Record<string, unknown> = { id: d.id.slice(0, 8), title: d.title, resolved: d.resolvedOutcome?.toString() ?? null };
    for (const name of ["old", "new"] as const) {
      route(name);
      const r = await measured(async () => {
        if (answers) return (await proposeAnswer({ title: d.title, terms: d.termsText, answers: answers.map((a) => a.text), statements, now: new Date() })).answer?.toString() ?? "-1";
        if (unit) return (await proposeNumber({ title: d.title, terms: d.termsText, unit, statements, now: new Date() })).number?.toString() ?? "-1";
        const p = await proposeOutcome({ title: d.title, terms: d.termsText, statements, now: new Date() });
        return p.outcome === "yes" ? "1" : p.outcome === "no" ? "0" : "-1";
      });
      row[name] = { outcome: r.value, error: r.error, seconds: r.seconds, spend: r.spend };
    }
    rows.push(row);
  }
  const triages = [];
  for (const d of await db.select().from(schema.dares).where(eq(schema.dares.pace, "argument"))) {
    route("new");
    const r = await measured(() => triage({ line: d.title }));
    triages.push({ id: d.id.slice(0, 8), tier: d.tier, result: r.value ? (r.value as { tier: string }).tier : null, error: r.error, seconds: r.seconds, dollars: r.spend.dollars });
  }
  console.log(JSON.stringify({ when: new Date().toISOString(), proposals: rows, triageAgain: triages }, null, 2));
}

/**
 * Every tiebreaker ruling production has recorded, asked again with this round's instructions (void unless what is in
 * front of it clearly supports one outcome under the recorded terms, and name that outcome) on Opus 5.5 and on Sonnet
 * 5.5, each beside the recorded ruling, which stands (the second-pass round, 2026-10-06); `--part=rulings`. It reads
 * production and the live API and writes nothing anywhere but the report it prints.
 */
async function rulingsAgain(): Promise<void> {
  const ruled = await db.select().from(schema.dares).where(eq(schema.dares.resolvedBy, "arbitration")).orderBy(asc(schema.dares.resolvedAt));
  const rows = [];
  for (const d of ruled) {
    const positions = await db.select().from(schema.darePositions).where(eq(schema.darePositions.dareId, d.id));
    const said = await db.select().from(schema.dareStatements).where(eq(schema.dareStatements.dareId, d.id)).orderBy(asc(schema.dareStatements.statedAt));
    const evidence = await db.select({ id: schema.media.id }).from(schema.media).where(and(eq(schema.media.dareId, d.id), eq(schema.media.role, "evidence")));
    const ids = [...new Set([...positions.map((p) => p.userId), ...said.map((s) => s.userId)].filter((x): x is string => Boolean(x)))];
    const users = ids.length ? await db.select({ id: schema.users.id, name: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, ids)) : [];
    const claims = await db.select({ id: schema.participantClaims.id, name: schema.participantClaims.displayName }).from(schema.participantClaims).where(inArray(schema.participantClaims.id, positions.map((p) => p.claimId).filter((x): x is string => Boolean(x))));
    const nameOf = (userId: string | null, claimId?: string | null) => ((users.find((u) => u.id === userId)?.name ?? claims.find((c) => c.id === claimId)?.name ?? "Someone").split(/\s+/)[0] ?? "Someone");
    const updates = said.filter((s) => s.kind === "update").map((s) => ({ name: nameOf(s.userId), said: s.statement }));
    const statements = said.filter((s) => s.kind === "statement").map((s) => ({ name: nameOf(s.userId), said: s.statement }));
    const answers = answersOf(d);
    const unit = unitOf(d);
    const row: Record<string, unknown> = { id: d.id.slice(0, 8), title: d.title, kind: d.kind, recorded: { outcome: d.resolvedOutcome?.toString() ?? null, ruling: d.rulingText?.slice(0, 400) ?? null }, evidenceOnRecord: evidence.length, saidLines: updates.length, cases: statements.length };
    for (const model of ["claude-opus-5-5", "claude-sonnet-5-5"] as const) {
      (MODELS as { tiebreaker: string }).tiebreaker = model;
      const r = await measured(async () => {
        if (answers) {
          const a = await arbitrateAnswer({ title: d.title, terms: d.termsText, answers: answers.map((x) => x.text), positions: positions.map((p) => ({ name: nameOf(p.userId, p.claimId), answer: answers[Number(p.value)]?.text ?? "?" })), updates, statements, evidence: [] });
          return { outcome: a.outcome === "answer" && a.answer !== null ? String(a.answer) : "-1", ruling: a.ruling };
        }
        if (unit) {
          const n = await arbitrateNumber({ title: d.title, terms: d.termsText, unit, positions: positions.map((p) => ({ name: nameOf(p.userId, p.claimId), number: p.value.toString() })), updates, statements, evidence: [] });
          return { outcome: n.outcome === "number" && n.number !== null ? String(n.number) : "-1", ruling: n.ruling };
        }
        const a = await arbitrate({ title: d.title, terms: d.termsText, positions: positions.map((p) => ({ name: nameOf(p.userId, p.claimId), percent: Math.round(Number(p.value) / 100) })), updates, statements, evidence: [] });
        return { outcome: a.outcome === "yes" ? "1" : a.outcome === "no" ? "0" : "-1", ruling: a.ruling };
      });
      row[model] = { outcome: r.value?.outcome ?? null, agreesWithRecorded: r.value ? r.value.outcome === (d.resolvedOutcome?.toString() ?? null) : null, ruling: r.value?.ruling ?? null, error: r.error, seconds: Math.round(r.seconds * 10) / 10, dollars: Math.round(r.spend.dollars * 10000) / 10000, models: r.spend.models };
      console.error(`ruling ${rows.length + 1}/${ruled.length} on ${model}: ${r.value?.outcome ?? r.error}`);
    }
    rows.push(row);
  }
  console.log(JSON.stringify({ when: new Date().toISOString(), rulings: rows }, null, 2));
}

async function main(): Promise<void> {
  if (process.argv.includes("--part=proposals")) return proposals();
  if (process.argv.includes("--part=rulings")) return rulingsAgain();
  const dares = await db.select().from(schema.dares).where(isNull(schema.dares.templateId)).orderBy(asc(schema.dares.createdAt));
  const questions = [];
  for (const d of dares) {
    const zone = d.zone ?? "America/New_York";
    const kind = d.kind as "binary" | "numeric" | "categorical";
    const raw = { line: d.title, kind, choices: kind === "categorical" ? d.outcomeLabels : undefined };
    const row: Record<string, unknown> = { id: d.id.slice(0, 8), title: d.title, kind, pace: d.pace, shape: kindForQuestion(d.title) };
    for (const name of ["old", "new"] as const) {
      route(name);
      const r = await measured(() => writeUp(raw, "00000000-0000-4000-8000-000000000000", zone));
      const v = r.value && !("error" in r.value) ? r.value : null;
      row[name] = {
        parsed: v !== null && !v.plain,
        plain: v?.plain ?? null,
        error: r.error ?? (r.value && "error" in r.value ? r.value.error : null),
        decideBy: v?.decideBy ?? null,
        datesAgree: v && v.decideBy ? deadlineMismatch(v.terms, v.decideBy, new Date(), zone) === null : null,
        copy: v ? [...(BANNED.exec(`${v.title} ${v.terms}`)?.[0] ? [BANNED.exec(`${v.title} ${v.terms}`)?.[0]] : []), ...cutPhrasesIn(`${v.title} ${v.terms}`)] : [],
        escalated: r.spend.models.length > 1,
        seconds: r.seconds,
        spend: r.spend,
        terms: v?.terms.slice(0, 240) ?? null,
      };
    }
    questions.push(row);
    console.error(`write-up ${questions.length}/${dares.length}`);
  }

  const triages = [];
  for (const d of dares.filter((x) => x.pace === "argument")) {
    const row: Record<string, unknown> = { id: d.id.slice(0, 8), title: d.title, tier: d.tier };
    for (const name of ["old", "new"] as const) {
      route(name);
      const r = await measured(() => triage({ line: d.title }));
      row[name] = { result: r.value ? JSON.stringify(r.value).slice(0, 200) : null, error: r.error, seconds: r.seconds, spend: r.spend };
    }
    triages.push(row);
  }

  const ruled = await db.select().from(schema.dares).where(and(eq(schema.dares.resolvedBy, "arbitration")));
  const rulings = [];
  for (const d of ruled) {
    const positions = await db.select().from(schema.darePositions).where(eq(schema.darePositions.dareId, d.id));
    const said = await db.select().from(schema.dareStatements).where(eq(schema.dareStatements.dareId, d.id)).orderBy(asc(schema.dareStatements.statedAt));
    const ids = [...new Set([...positions.map((p) => p.userId), ...said.map((s) => s.userId)].filter((x): x is string => Boolean(x)))];
    const users = ids.length ? await db.select({ id: schema.users.id, name: schema.users.displayName }).from(schema.users).where(inArray(schema.users.id, ids)) : [];
    const nameOf = (id: string | null) => (users.find((u) => u.id === id)?.name ?? "Someone").split(/\s+/)[0] ?? "Someone";
    const updates = said.filter((s) => s.kind === "update").map((s) => ({ name: nameOf(s.userId), said: s.statement }));
    const statements = said.filter((s) => s.kind === "statement").map((s) => ({ name: nameOf(s.userId), said: s.statement }));
    const answers = answersOf(d);
    const unit = unitOf(d);
    const row: Record<string, unknown> = { id: d.id.slice(0, 8), title: d.title, recorded: d.resolvedOutcome?.toString() ?? null };
    for (const name of ["old", "new"] as const) {
      route(name);
      const r = await measured(async () => {
        if (answers) return (await arbitrateAnswer({ title: d.title, terms: d.termsText, answers: answers.map((a) => a.text), positions: positions.map((p) => ({ name: nameOf(p.userId), answer: answers[Number(p.value)]?.text ?? "?" })), updates, statements, evidence: [] })).answer?.toString() ?? "-1";
        if (unit) return (await arbitrateNumber({ title: d.title, terms: d.termsText, unit, positions: positions.map((p) => ({ name: nameOf(p.userId), number: p.value.toString() })), updates, statements, evidence: [] })).number?.toString() ?? "-1";
        const a = await arbitrate({ title: d.title, terms: d.termsText, positions: positions.map((p) => ({ name: nameOf(p.userId), percent: Math.round(Number(p.value) / 100) })), updates, statements, evidence: [] });
        return a.outcome === "yes" ? "1" : a.outcome === "no" ? "0" : "-1";
      });
      row[name] = { outcome: r.value, agrees: r.value === (d.resolvedOutcome?.toString() ?? null), error: r.error, seconds: r.seconds, spend: r.spend };
    }
    rulings.push(row);
  }

  const total = (rows: Array<Record<string, unknown>>, name: "old" | "new") => rows.reduce((acc, r) => acc + ((r[name] as { spend: Spend }).spend.dollars ?? 0), 0);
  console.log(JSON.stringify({ when: new Date().toISOString(), counts: { questions: questions.length, arguments: triages.length, rulings: rulings.length }, dollars: { old: { writeUps: total(questions, "old"), triage: total(triages, "old"), rulings: total(rulings, "old") }, new: { writeUps: total(questions, "new"), triage: total(triages, "new"), rulings: total(rulings, "new") } }, questions, triages, rulings }, null, 2));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
