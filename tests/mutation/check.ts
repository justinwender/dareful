// Static check of the mutants: every find occurs where it says, every suite exists, every test named exists.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { MUTANTS } from "./mutants";

const names = new Map<string, Set<string>>();
function testsIn(file: string): Set<string> {
  let s = names.get(file);
  if (s) return s;
  s = new Set();
  if (existsSync(file)) {
    const src = readFileSync(file, "utf8");
    for (const m of src.matchAll(/(?:^|\n)\s*test\(\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g)) {
      const raw = m[1] as string;
      try {
        s.add(raw.startsWith('"') ? JSON.parse(raw) : raw.slice(1, -1).replace(/\\(['`])/g, "$1"));
      } catch {
        s.add(raw.slice(1, -1));
      }
    }
  }
  names.set(file, s);
  return s;
}
// A test named from a template (`no banned word on ${name}`) runs under every expansion; a kill matches it when the
// literal parts match, and the template counts as covered when any kill in its suite matches it.
const isTemplate = (t: string) => t.includes("${");
function templateMatches(template: string, name: string): boolean {
  const re = new RegExp("^" + template.split(/\$\{[^}]*\}/).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+") + "$");
  return re.test(name);
}
function hasTest(suite: string, k: string): boolean {
  const s = testsIn(suite);
  if (s.has(k)) return true;
  for (const t of s) if (isTemplate(t) && templateMatches(t, k)) return true;
  return false;
}
let bad = 0;
const out: string[] = [];
for (const m of MUTANTS) {
  const problems: string[] = [];
  for (const e of [m, ...(m.also ?? [])]) {
    if (!existsSync(e.file)) { problems.push(`file missing: ${e.file}`); continue; }
    const n = readFileSync(e.file, "utf8").split(e.find).length - 1;
    const nth = (e as { nth?: number }).nth;
    if (nth === undefined ? n !== 1 : n < nth) problems.push(`find occurs ${n} times in ${e.file}: ${JSON.stringify(e.find.slice(0, 90))}`);
  }
  if (!existsSync(m.suite)) problems.push(`suite missing: ${m.suite}`);
  else for (const k of m.kills) if (!hasTest(m.suite, k)) problems.push(`no test named ${JSON.stringify(k.slice(0, 110))} in ${m.suite}`);
  if (problems.length) { bad++; out.push(`${m.id} [${m.suite.split("/")[1]}]\n   ` + problems.join("\n   ")); }
}
// Tests no mutant names.
const covered = new Set(MUTANTS.flatMap((m) => m.kills.map((k) => `${m.suite}::${k}`)));
const uncovered: string[] = [];
for (const dir of ["tests/unit", "tests/db", "tests/http"]) {
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".test.ts"))) {
    for (const t of testsIn(`${dir}/${f}`)) {
      const suite = `${dir}/${f}`;
      const hit = covered.has(`${suite}::${t}`) || (isTemplate(t) && MUTANTS.some((m) => m.suite === suite && m.kills.some((k) => templateMatches(t, k))));
      if (!hit) uncovered.push(`${suite}::${t.slice(0, 120)}`);
    }
  }
}
console.log(`${MUTANTS.length} mutants, ${bad} stale`);
console.log(out.join("\n"));
console.log(`\n${uncovered.length} tests no mutant names:`);
console.log(uncovered.join("\n"));
