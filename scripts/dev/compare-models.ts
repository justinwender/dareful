/**
 * Old routing against new on what production has actually asked (the first-contact round, 2026-10-04), before the
 * switch: every question written by a person (the write-up, the type, the date, the copy rules, whether it parsed,
 * the seconds and the tokens), every argument's triage, and every question the tiebreaker ruled on (its outcome
 * against the one recorded). Old is what the deployed build calls (Sonnet 5 drafts, Fable 5.1 weighs); new is this
 * round's (Haiku 4.5 drafts, Sonnet 5.5 weighs and writes Help define's terms). It reads production and the live API
 * and writes nothing anywhere but the report it prints.
 *
 *   npx tsx --env-file=.env.local scripts/dev/compare-models.ts > report.json
 *   npx tsx --env-file=.env.local scripts/dev/compare-models.ts --part=current > cost.json   what a question costs today
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { MODELS, usageTap } from "@/lib/ai/client";
import { PRICES } from "@/lib/ai/spend";
import { arbitrate, arbitrateAnswer, arbitrateNumber, carefulQuestions, eitherOr, ruleAnswerClaim, ruleClaim, triage } from "@/lib/ai/settler";
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
/** Dollars per million tokens, in and out: the app's own price table (src/lib/ai/spend.ts, nano-dollars a token), so the comparison and the runway price alike. */
const PRICE: Record<string, [number, number]> = Object.fromEntries(Object.entries(PRICES).map(([model, p]) => [model, [Number(p.input) / 1000, Number(p.output) / 1000]]));
const BANNED = /\b(owes?|owed|debt|balance|outstanding|overdue|odds|price|wager|bet|gambl\w*|money|market)\b|—|the one picked|the chosen one/i;

type Spend = { calls: number; input: number; output: number; dollars: number; ms: number; models: string[]; searches: number };
/** Web search's own price, on top of the tokens its results add: ten dollars a thousand. */
const SEARCH_DOLLARS = 0.01;
function route(name: keyof typeof ROUTES): void {
  (MODELS as { drafting: string; ruling: string }).drafting = ROUTES[name].drafting;
  (MODELS as { drafting: string; ruling: string }).ruling = ROUTES[name].ruling;
}
async function measured<T>(run: () => Promise<T>): Promise<{ value: T | null; error: string | null; spend: Spend; seconds: number }> {
  const spend: Spend = { calls: 0, input: 0, output: 0, dollars: 0, ms: 0, models: [], searches: 0 };
  usageTap.fn = (u) => {
    spend.calls += 1;
    spend.input += u.input;
    spend.output += u.output;
    spend.ms += u.ms;
    spend.models.push(u.model);
    spend.searches += u.searches;
    const [i, o] = PRICE[u.model] ?? [0, 0];
    spend.dollars += (u.input * i + u.output * o) / 1_000_000 + u.searches * SEARCH_DOLLARS;
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

/**
 * Drafting on Haiku 4.5 against Haiku 5.5 (the touch-ups round, section 4), on everything production has asked: the
 * quick write-up of every question a person wrote (parsed, its date, its copy, an escalation, the seconds and the
 * dollars, and the words, for reading side by side), and Help define's three questions for each (how many came back,
 * and any either-or answered by yes and no). Help define's final terms stay on Sonnet 5.5 and are not compared. Search
 * is off for both, so the models are compared and not the web; `--part=search` measures search on its own. Reads
 * production and the live API and writes nothing but the report it prints.
 */
async function haiku(): Promise<void> {
  process.env.DAREFUL_NO_SEARCH = "1";
  const dares = await db.select().from(schema.dares).where(isNull(schema.dares.templateId)).orderBy(asc(schema.dares.createdAt));
  const rows: Array<Record<string, unknown>> = [];
  for (const d of dares) {
    const zone = d.zone ?? "America/New_York";
    const kind = d.kind as "binary" | "numeric" | "categorical";
    const row: Record<string, unknown> = { id: d.id.slice(0, 8), title: d.title, kind, pace: d.pace };
    for (const model of ["claude-haiku-4-5-20251001", "claude-haiku-5-5"] as const) {
      (MODELS as { drafting: string }).drafting = model;
      (MODELS as { ruling: string }).ruling = "claude-sonnet-5-5";
      const w = await measured(() => writeUp({ line: d.title, kind, choices: kind === "categorical" ? d.outcomeLabels : undefined }, "00000000-0000-4000-8000-000000000000", zone));
      const v = w.value && !("error" in w.value) ? w.value : null;
      const c = await measured(() => carefulQuestions({ line: d.title, kind, choices: kind === "categorical" ? d.outcomeLabels : undefined }));
      const qs = c.value && "questions" in c.value ? c.value.questions : [];
      row[model] = {
        writeUp: { parsed: v !== null && !v.plain, escalated: w.spend.models.some((m) => m !== model), decideBy: v?.decideBy ?? null, datesAgree: v && v.decideBy ? deadlineMismatch(v.terms, v.decideBy, new Date(), zone) === null : null, copy: v ? cutPhrasesIn(`${v.title} ${v.terms}`).concat(BANNED.exec(`${v.title} ${v.terms}`)?.[0] ?? []) : [], seconds: Math.round(w.seconds * 10) / 10, dollars: Math.round(w.spend.dollars * 100000) / 100000, title: v?.title ?? null, terms: v?.terms ?? null, error: w.error },
        careful: { count: qs.length, ask: c.value && "ask" in c.value ? c.value.ask.subject : null, eitherOrWithoutAnswers: qs.filter((q) => !q.answers && eitherOr(q.question)).length, withOwnAnswers: qs.filter((q) => q.answers).length, escalated: c.spend.models.some((m) => m !== model), seconds: Math.round(c.seconds * 10) / 10, dollars: Math.round(c.spend.dollars * 100000) / 100000, questions: qs.map((q) => (q.answers ? `${q.question} [${q.answers.join(" | ")}]` : q.question)), error: c.error },
      };
    }
    rows.push(row);
    console.error(`haiku ${rows.length}/${dares.length}`);
  }
  const sum = (model: string, part: "writeUp" | "careful", key: "dollars" | "seconds") => rows.reduce((acc, r) => acc + (((r[model] as Record<string, Record<string, number>>)[part]?.[key]) ?? 0), 0);
  const count = (model: string, test: (r: Record<string, Record<string, unknown>>) => boolean) => rows.filter((r) => test(r[model] as Record<string, Record<string, unknown>>)).length;
  const summary = Object.fromEntries(
    ["claude-haiku-4-5-20251001", "claude-haiku-5-5"].map((m) => [
      m,
      {
        writeUpsParsed: count(m, (x) => x.writeUp?.parsed === true),
        writeUpsEscalated: count(m, (x) => x.writeUp?.escalated === true),
        withDate: count(m, (x) => x.writeUp?.decideBy !== null),
        datesDisagree: count(m, (x) => x.writeUp?.datesAgree === false),
        copyFlags: count(m, (x) => Array.isArray(x.writeUp?.copy) && (x.writeUp?.copy as unknown[]).length > 0),
        carefulThree: count(m, (x) => x.careful?.count === 3),
        carefulEitherOrUnanswered: rows.reduce((acc, r) => acc + (((r[m] as Record<string, Record<string, number>>).careful?.eitherOrWithoutAnswers) ?? 0), 0),
        carefulEscalated: count(m, (x) => x.careful?.escalated === true),
        writeUpDollars: Math.round(sum(m, "writeUp", "dollars") * 10000) / 10000,
        carefulDollars: Math.round(sum(m, "careful", "dollars") * 10000) / 10000,
        writeUpSeconds: Math.round((sum(m, "writeUp", "seconds") / Math.max(1, rows.length)) * 10) / 10,
        carefulSeconds: Math.round((sum(m, "careful", "seconds") / Math.max(1, rows.length)) * 10) / 10,
      },
    ]),
  );
  console.log(JSON.stringify({ when: new Date().toISOString(), questions: rows.length, summary, rows }, null, 2));
}

/**
 * What a quick search costs Help define the terms (the touch-ups round, section 4): its questions and its final terms
 * for each question that names real people, teams or events, with search and without, on the routing this round ships.
 */
async function searchCost(): Promise<void> {
  const lines = (process.env.SEARCH_LINES ?? "Will the Yankees fire Boone?|Who gets fired first: Mike McDaniel or Aaron Boone?|Will the Rays beat the Yankees tonight?").split("|");
  const rows = [];
  for (const line of lines) {
    const row: Record<string, unknown> = { line };
    for (const search of [false, true]) {
      process.env.DAREFUL_NO_SEARCH = search ? "0" : "1";
      const c = await measured(() => carefulQuestions({ line, kind: "binary" }));
      const qs = c.value && "questions" in c.value ? c.value.questions : [];
      const answers = qs.map((q) => ({ question: q.question, yes: true, ...(q.answers ? { answer: q.answers[0] } : {}) }));
      const w = await measured(() => writeUp({ line, kind: "binary", answers }, "00000000-0000-4000-8000-000000000000", "America/New_York"));
      const v = w.value && !("error" in w.value) ? w.value : null;
      row[search ? "withSearch" : "without"] = { questions: qs.map((q) => (q.answers ? `${q.question} [${q.answers.join(" | ")}]` : q.question)), carefulSeconds: Math.round(c.seconds * 10) / 10, carefulSearches: c.spend.searches, carefulDollars: Math.round(c.spend.dollars * 100000) / 100000, terms: v?.terms ?? null, termsSeconds: Math.round(w.seconds * 10) / 10, termsSearches: w.spend.searches, termsDollars: Math.round(w.spend.dollars * 100000) / 100000, errors: [c.error, w.error].filter(Boolean) };
    }
    rows.push(row);
    console.error(`search ${rows.length}/${lines.length}`);
  }
  console.log(JSON.stringify({ when: new Date().toISOString(), rows }, null, 2));
}

/**
 * What a question costs on the routing in use (the submission round, section 5): every question a counted person wrote,
 * replayed as production runs it (the write-up, with search where the line calls for it; an argument's triage and its
 * ruling at the ask, the one sealed into its terms; the outcome proposal for each question someone said what happened
 * on), with the models as configured, at the prices
 * above; `--part=current`. The tiebreaker is priced from its own measured rulings (`--part=rulings`), since it runs
 * only when the people in a question do not decide it. Reads production and the live API and writes nothing but the
 * report it prints.
 */
async function current(): Promise<void> {
  const counted = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.excludedFromCounts, false));
  const dares = (await db.select().from(schema.dares).where(isNull(schema.dares.templateId)).orderBy(asc(schema.dares.createdAt))).filter((d) => counted.some((u) => u.id === d.creatorId));
  const said = await db.select().from(schema.dareStatements).where(eq(schema.dareStatements.kind, "update"));
  const rows: Array<{ id: string; pace: string; writeUp: number; triage: number | null; sealed: number | null; proposal: number | null; searches: number; models: string[]; errors: string[] }> = [];
  for (const d of dares) {
    const zone = d.zone ?? "America/New_York";
    const kind = d.kind as "binary" | "numeric" | "categorical";
    const w = await measured(() => writeUp({ line: d.title, kind, choices: kind === "categorical" ? d.outcomeLabels : undefined }, "00000000-0000-4000-8000-000000000000", zone));
    const t = d.pace === "argument" ? await measured(() => triage({ line: d.title })) : null;
    const answersAsked = d.kind === "categorical" ? (d.outcomeLabels ?? []) : null;
    const r = d.pace === "argument" ? await measured(async (): Promise<string> => (answersAsked ? String((await ruleAnswerClaim({ title: d.title, terms: d.termsText, criterion: d.criterion, answers: answersAsked })).index) : (await ruleClaim({ title: d.title, terms: d.termsText, criterion: d.criterion })).outcome)) : null;
    const statements = said.filter((s) => s.dareId === d.id).map((s) => ({ name: "Someone", said: s.statement }));
    const answers = answersOf(d);
    const unit = unitOf(d);
    const p = statements.length
      ? await measured(async () => {
          if (answers) return (await proposeAnswer({ title: d.title, terms: d.termsText, answers: answers.map((a) => a.text), statements, now: new Date() })).answer?.toString() ?? "-1";
          if (unit) return (await proposeNumber({ title: d.title, terms: d.termsText, unit, statements, now: new Date() })).number?.toString() ?? "-1";
          return (await proposeOutcome({ title: d.title, terms: d.termsText, statements, now: new Date() })).outcome;
        })
      : null;
    rows.push({ id: d.id.slice(0, 8), pace: d.pace, writeUp: w.spend.dollars, triage: t ? t.spend.dollars : null, sealed: r ? r.spend.dollars : null, proposal: p ? p.spend.dollars : null, searches: w.spend.searches + (t?.spend.searches ?? 0) + (r?.spend.searches ?? 0) + (p?.spend.searches ?? 0), models: [...new Set([...w.spend.models, ...(t?.spend.models ?? []), ...(r?.spend.models ?? []), ...(p?.spend.models ?? [])])], errors: [w.error, t?.error, r?.error, p?.error].filter((e): e is string => Boolean(e)) });
    console.error(`current ${rows.length}/${dares.length}`);
  }
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const r5 = (x: number) => Math.round(x * 100000) / 100000;
  const writeUps = rows.map((r) => r.writeUp);
  const triages = rows.flatMap((r) => (r.triage === null ? [] : [r.triage]));
  const sealedRulings = rows.flatMap((r) => (r.sealed === null ? [] : [r.sealed]));
  const props = rows.flatMap((r) => (r.proposal === null ? [] : [r.proposal]));
  console.log(
    JSON.stringify(
      {
        when: new Date().toISOString(),
        models: MODELS,
        questions: rows.length,
        arguments: triages.length,
        proposals: props.length,
        searches: rows.reduce((a, r) => a + r.searches, 0),
        dollars: { writeUpMean: r5(mean(writeUps)), writeUpMax: r5(Math.max(0, ...writeUps)), triageMean: r5(mean(triages)), sealedRulingMean: r5(mean(sealedRulings)), proposalMean: r5(mean(props)), questionMean: r5(mean(writeUps) + mean(props)), argumentMean: r5(mean(writeUps) + mean(triages) + mean(sealedRulings)), total: r5([...writeUps, ...triages, ...sealedRulings, ...props].reduce((a, b) => a + b, 0)) },
        errors: rows.flatMap((r) => r.errors.map((e) => `${r.id}: ${e}`)),
        rows,
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  if (process.argv.includes("--part=current")) return current();
  if (process.argv.includes("--part=proposals")) return proposals();
  if (process.argv.includes("--part=rulings")) return rulingsAgain();
  if (process.argv.includes("--part=haiku")) return haiku();
  if (process.argv.includes("--part=search")) return searchCost();
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
