/**
 * The audit of the test suite (Principle 9 applied to the checks themselves): a check that cannot fail is
 * worse than no check. Each mutant below breaks one rule in the source; the runner applies it, runs the tests
 * that claim to cover that rule, and requires every one of them to FAIL. It then restores the file. At the end
 * it lists any test in the suite that no mutant killed: that test has not been shown to exercise anything.
 *
 *   npm run test:audit                 every mutant
 *   npm run test:audit -- unit db      only those layers
 *   npm run test:audit -- --only=id    one mutant
 *   npm run test:audit -- http --from=id   that layer from one mutant on (after a run that stopped)
 *   npm run test:audit -- --ids=file       the mutants named in a file, one id to a line (a round's own scope)
 *
 * The working tree is restored after every mutant and verified byte-for-byte at the end. HTTP mutants need the
 * dev server running (it recompiles the mutated file on the next request), and the runner asks it before and
 * after every one: a server that has gone away fails every test, and a test failing for that reason proves
 * nothing about the mutant (2026-09-30: the dev server's compiler crashed forty-five minutes into a run and
 * every later http mutant was reported killed). The run stops there and says where to resume.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { MUTANTS, type Mutant } from "./mutants";

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const from = args.find((a) => a.startsWith("--from="))?.slice(7);
const idsFile = args.find((a) => a.startsWith("--ids="))?.slice(6);
const wanted = idsFile ? new Set(readFileSync(idsFile, "utf8").split(/\s+/).filter(Boolean)) : null;
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:3000";

/** Whether the app under the http tests answers at all. Synchronous, like the rest of the runner. */
function serverAnswers(): boolean {
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = spawnSync("curl", ["-s", "-o", "/dev/null", "-m", "30", "-w", "%{http_code}", `${BASE}/manifest.webmanifest`], { encoding: "utf8" });
    if (r.status === 0 && /^[1-5]\d\d$/.test(r.stdout.trim())) return true;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000);
  }
  return false;
}
const layers = args.filter((a) => !a.startsWith("--"));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The database fixture's refusal when the relayer holds under the test floor (`TEST_FLOOR_MARK`, src/lib/chain/watch.ts,
 * written out here so the runner never opens a connection of its own): a run that met it proves nothing about the
 * mutant, so it is never read as a kill (the touch-ups round).
 */
const FLOOR_MARK = "relayer under the test floor";
let floorHit = false;

function runTests(file: string, names: string[] | null): Map<string, boolean> {
  // One process, no per-file worker: a timeout can then actually kill the run. With a worker, the kill takes
  // the parent and orphans the child, which sits on its database connections until someone notices.
  const argv = ["--import", "tsx", "--env-file=.env.local", "--test", "--test-isolation=none", "--test-reporter=tap"];
  if (names) argv.push(`--test-name-pattern=^(${names.map(esc).join("|")})$`);
  const r = spawnSync("node", [...argv, file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: names ? 240_000 : 900_000, killSignal: "SIGKILL" });
  if (r.error) throw new Error(`the test run did not finish (${r.error.message}); rerun this one with --only, then npm run test:sweep`);
  if (`${r.stdout}\n${r.stderr}`.includes(FLOOR_MARK)) floorHit = true;
  const out = new Map<string, boolean>();
  for (const line of r.stdout.split("\n")) {
    const m = /^(not ok|ok) \d+ - (.*?)(?: # (SKIP|TODO).*)?$/.exec(line);
    if (m && m[2] && !m[3] && m[2] !== file) out.set(m[2], m[1] === "ok");
  }
  return out;
}

type Edit = { file: string; find: string; replace: string; nth?: number };

/** Originals of whatever is currently mutated, on disk, so a killed run can be undone by the next one. */
const JOURNAL = "tests/mutation/.restore.json";
function journal(file: string, original: string | null): void {
  const j: Record<string, string> = existsSync(JOURNAL) ? JSON.parse(readFileSync(JOURNAL, "utf8")) : {};
  if (original === null) delete j[file];
  else if (!(file in j)) j[file] = original;
  if (Object.keys(j).length === 0) rmSync(JOURNAL, { force: true });
  else writeFileSync(JOURNAL, JSON.stringify(j));
}
if (existsSync(JOURNAL)) {
  for (const [file, original] of Object.entries(JSON.parse(readFileSync(JOURNAL, "utf8")) as Record<string, string>)) {
    writeFileSync(file, original);
    console.log(`restored ${file} from an interrupted run`);
  }
  rmSync(JOURNAL, { force: true });
}

function applyEdit(id: string, e: Edit): () => void {
  const original = readFileSync(e.file, "utf8");
  const parts = original.split(e.find);
  const n = e.nth ?? 1;
  if (e.nth === undefined && parts.length !== 2) throw new Error(`${id}: "${e.find.slice(0, 60)}" occurs ${parts.length - 1} times in ${e.file}; say which with nth`);
  if (parts.length - 1 < n) throw new Error(`${id}: occurrence ${n} of "${e.find.slice(0, 60)}" not found in ${e.file}`);
  journal(e.file, original);
  writeFileSync(e.file, parts.slice(0, n).join(e.find) + e.replace + parts.slice(n).join(e.find));
  return () => {
    writeFileSync(e.file, original);
    journal(e.file, null);
  };
}

/** A rule guarded in two places is only broken when both guards go, so a mutant may carry further edits. */
function applyMutant(m: Mutant): () => void {
  const undo: Array<() => void> = [];
  try {
    for (const e of [m, ...(m.also ?? [])]) undo.unshift(applyEdit(m.id, e));
  } catch (err) {
    for (const u of undo) u();
    throw err;
  }
  return () => undo.forEach((u) => u());
}

const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const inLayers = MUTANTS.filter((m) => (only ? m.id === only : (wanted === null || wanted.has(m.id)) && (layers.length === 0 || layers.some((l) => m.suite.includes(`/${l}/`)))));
if (wanted) for (const id of wanted) if (!MUTANTS.some((m) => m.id === id)) throw new Error(`--ids: no mutant ${id}`);
if (from && !inLayers.some((m) => m.id === from)) throw new Error(`--from=${from}: no such mutant in the layers chosen`);
const chosen = from ? inLayers.slice(inLayers.findIndex((m) => m.id === from)) : inLayers;
const ids = new Set<string>();
for (const m of MUTANTS) {
  if (ids.has(m.id)) throw new Error(`duplicate mutant id ${m.id}`);
  ids.add(m.id);
}
const originals = new Map(chosen.flatMap((m) => [m, ...(m.also ?? [])]).map((e) => [e.file, readFileSync(e.file, "utf8")]));

const killed = new Set<string>();
const problems: string[] = [];
let restore: (() => void) | null = null;
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"] as const) {
  process.on(sig, () => {
    restore?.();
    process.exit(130);
  });
}

let serverGone: string | null = null;
let floorSince: string | null = null;
for (const m of chosen) {
  const http = m.suite.includes("/http/");
  const chain = m.suite.includes("/db/");
  if (http && serverGone) continue;
  if (chain && floorSince) continue;
  if (http && !serverAnswers()) {
    serverGone = m.id;
    continue;
  }
  try {
    restore = applyMutant(m);
    if (http) sleep(2500);
    const results = runTests(m.suite, m.kills);
    // A kill counts only if the server was still there to be asked: a dead one fails every test, whatever the mutant did.
    if (http && !serverAnswers()) {
      serverGone = m.id;
      console.log(`VOID      ${m.id}  (the server went away during this one)`);
      continue;
    }
    if (floorHit) {
      floorSince = m.id;
      floorHit = false;
      console.log(`VOID      ${m.id}  (the relayer is under the test floor)`);
      continue;
    }
    for (const name of m.kills) {
      const passed = results.get(name);
      if (passed === undefined) problems.push(`${m.id}: no test named "${name}" ran in ${m.suite}`);
      else if (passed) problems.push(`${m.id}: SURVIVED. "${name}" still passes with ${m.file} broken (${m.why})`);
      else killed.add(`${m.suite}::${name}`);
    }
    const survived = m.kills.filter((k) => results.get(k) !== false).length;
    console.log(`${survived === 0 ? "killed  " : "SURVIVED"}  ${m.id}  (${m.kills.length - survived}/${m.kills.length})`);
  } catch (err) {
    problems.push(`${m.id}: ${err instanceof Error ? err.message : String(err)}`);
    console.log(`ERROR     ${m.id}`);
  } finally {
    restore?.();
    restore = null;
    if (http) sleep(2500);
  }
}

for (const [file, text] of originals) if (readFileSync(file, "utf8") !== text) problems.push(`${file} was not restored`);
if (serverGone) {
  const left = chosen.filter((m) => m.suite.includes("/http/")).length - chosen.filter((m) => m.suite.includes("/http/")).findIndex((m) => m.id === serverGone);
  problems.push(`nothing answers at ${BASE} since ${serverGone}: ${left} http mutant(s) were not run. Start the app again, then npm run test:audit -- http --from=${serverGone}`);
}

if (floorSince) {
  const dbLeft = chosen.filter((m) => m.suite.includes("/db/"));
  problems.push(`the relayer went under the test floor at ${floorSince}: ${dbLeft.length - dbLeft.findIndex((m) => m.id === floorSince)} database mutant(s) were not run. Refill it, then npm run test:audit -- db --from=${floorSince}`);
}

// A run from part-way through, or one the server left, has not seen every mutant: the baseline's "never killed" would accuse tests the missing ones cover.
if (!only && !from && !wanted && !serverGone && !floorSince) {
  for (const suite of new Set(chosen.map((m) => m.suite))) {
    const baseline = runTests(suite, null);
    for (const [name, passed] of baseline) {
      if (!passed) problems.push(`${suite}: "${name}" fails against the unbroken code`);
      else if (!killed.has(`${suite}::${name}`)) problems.push(`${suite}: "${name}" was never killed by any mutant: nothing shows it can fail`);
    }
    console.log(`baseline  ${suite}: ${baseline.size} tests`);
  }
}

console.log(problems.length === 0 ? `\n${chosen.length} mutants, every covered test killed, tree restored` : `\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join("\n")}`);
process.exit(problems.length === 0 ? 0 : 1);
