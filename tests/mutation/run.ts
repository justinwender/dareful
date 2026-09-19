/**
 * The audit of the test suite (Principle 9 applied to the checks themselves): a check that cannot fail is
 * worse than no check. Each mutant below breaks one rule in the source; the runner applies it, runs the tests
 * that claim to cover that rule, and requires every one of them to FAIL. It then restores the file. At the end
 * it lists any test in the suite that no mutant killed: that test has not been shown to exercise anything.
 *
 *   npm run test:audit                 every mutant
 *   npm run test:audit -- unit db      only those layers
 *   npm run test:audit -- --only=id    one mutant
 *
 * The working tree is restored after every mutant and verified byte-for-byte at the end. HTTP mutants need the
 * dev server running (it recompiles the mutated file on the next request).
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { MUTANTS, type Mutant } from "./mutants";

const args = process.argv.slice(2);
const only = args.find((a) => a.startsWith("--only="))?.slice(7);
const layers = args.filter((a) => !a.startsWith("--"));
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function runTests(file: string, names: string[] | null): Map<string, boolean> {
  // One process, no per-file worker: a timeout can then actually kill the run. With a worker, the kill takes
  // the parent and orphans the child, which sits on its database connections until someone notices.
  const argv = ["--import", "tsx", "--env-file=.env.local", "--test", "--test-isolation=none", "--test-reporter=tap"];
  if (names) argv.push(`--test-name-pattern=^(${names.map(esc).join("|")})$`);
  const r = spawnSync("node", [...argv, file], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: names ? 240_000 : 900_000, killSignal: "SIGKILL" });
  if (r.error) throw new Error(`the test run did not finish (${r.error.message}); rerun this one with --only, then npm run test:sweep`);
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
const chosen = MUTANTS.filter((m) => (only ? m.id === only : layers.length === 0 || layers.some((l) => m.suite.includes(`/${l}/`))));
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

for (const m of chosen) {
  const http = m.suite.includes("/http/");
  try {
    restore = applyMutant(m);
    if (http) sleep(2500);
    const results = runTests(m.suite, m.kills);
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

if (!only) {
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
