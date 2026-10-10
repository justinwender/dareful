// The outside check (the ops round, section 3): production as a stranger sees it, from outside the app, so a dead tick, a
// dead database or a dead deploy still reaches the owner. Run by .github/workflows/watch.yml every fifteen minutes and on
// every production deploy, and by hand: `node scripts/ops/outside-check.mjs` (WATCH_URL picks another origin).
//
// It asks three things and fails when a core system is down or any of the three does not answer: /api/health (every
// system, 200 while the core ones are up), the home page, and the live numbers picture. Slow is reported, never failed.
// The health answer must be production's own run (WATCH_ENV names another environment for a run by hand against it):
// every environment keeps its runs in the one database, and one stored under the wrong name would never reach the owner.
// It needs nothing but Node: no dependency, no secret.

const base = (process.env.WATCH_URL ?? "https://dareful.app").replace(/\/$/, "");
const expected = process.env.WATCH_ENV ?? "production";
// Just after a deploy the domain can take a moment to move to it, so a deploy's run asks a few times before it fails.
const tries = process.env.WAIT_FOR_DEPLOY === "1" ? 4 : 2;
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithin(url, ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { signal: controller.signal, redirect: "follow", headers: { "user-agent": "DarefulWatch/1 (+https://github.com/justinwender/dareful) curl/8" } });
  } finally {
    clearTimeout(timer);
  }
}

/** One thing asked, tried again after a pause if it failed, with what it saw. */
async function ask(name, run) {
  let last = null;
  for (let i = 1; i <= tries; i += 1) {
    try {
      const seen = await run();
      return { name, ok: seen.ok, said: seen.said };
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    if (i < tries) await pause(Number(process.env.WATCH_PAUSE_MS ?? 15_000));
  }
  return { name, ok: false, said: `no answer (${last})` };
}

const results = [];

results.push(
  await ask("health", async () => {
    const res = await fetchWithin(`${base}/api/health`, 30_000);
    if (res.status !== 200 && res.status !== 503) throw new Error(`answered ${res.status}`);
    const body = await res.json();
    const lines = (body.checks ?? []).map((c) => `${c.core ? "core " : ""}${c.name}: ${c.state}${c.note ? ` (${c.note})` : ""}`);
    const down = (body.checks ?? []).filter((c) => c.core && c.state === "down").map((c) => c.name);
    const own = body.env === expected;
    return { ok: res.status === 200 && body.ok === true && down.length === 0 && own, said: `${res.status}, read at ${body.at}${own ? "" : `; the run is ${body.env ?? "nobody"}'s, not ${expected}'s`}${down.length ? `; core down: ${down.join(", ")}` : ""}\n    ${lines.join("\n    ")}` };
  }),
);

results.push(
  await ask("home page", async () => {
    const res = await fetchWithin(`${base}/`, 20_000);
    const html = await res.text();
    if (res.status !== 200) throw new Error(`answered ${res.status}`);
    const titled = /<title>[^<]*Dareful/i.test(html);
    return { ok: titled, said: titled ? `200, ${html.length} bytes` : "200, but not Dareful's page" };
  }),
);

results.push(
  await ask("numbers picture", async () => {
    const res = await fetchWithin(`${base}/numbers`, 30_000);
    if (res.status !== 200) throw new Error(`answered ${res.status}`);
    const bytes = (await res.arrayBuffer()).byteLength;
    const png = (res.headers.get("content-type") ?? "").startsWith("image/png");
    return { ok: png && bytes > 1_000, said: `200, ${res.headers.get("content-type")}, ${bytes} bytes${res.headers.get("x-drawn-at") ? `, drawn ${res.headers.get("x-drawn-at")}` : ""}` };
  }),
);

const failed = results.filter((r) => !r.ok);
const report = `Production at ${base}, ${new Date().toISOString()}:\n${results.map((r) => `- ${r.ok ? "ok" : "FAILED"} ${r.name}: ${r.said}`).join("\n")}\n`;
console.log(report);
if (process.env.GITHUB_STEP_SUMMARY) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Production\n\n\`\`\`\n${report}\`\`\`\n`);
}
process.exit(failed.length === 0 ? 0 : 1);
