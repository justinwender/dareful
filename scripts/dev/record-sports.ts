/**
 * Records real responses from the two sports sources into tests/fixtures/sports, so the parsers are tested
 * against what the sources actually send and not what somebody thought they send (CLAUDE.md: a fixture that
 * stands in for an external system is derived from that system). Run by hand when a shape is in doubt:
 *   node --import tsx --env-file=.env.local scripts/dev/record-sports.ts
 * Each file is the raw body as received. Nothing about the key is in a response, and the key is read from the
 * environment, never written.
 */
import { mkdirSync, writeFileSync } from "node:fs";

const DIR = "tests/fixtures/sports";
const ESPN = (sport: string, league: string, date: string) => `https://site.api.espn.com/apis/site/v2/sports/${sport}/${league}/scoreboard?dates=${date}`;
const BDL = (path: string, date: string) => `https://api.balldontlie.io/${path}/games?dates[]=${date}&per_page=25`;

async function save(name: string, url: string, headers: Record<string, string> = {}): Promise<void> {
  const r = await fetch(url, { headers });
  const text = await r.text();
  writeFileSync(`${DIR}/${name}.json`, text);
  let summary = "";
  try {
    const j = JSON.parse(text) as { events?: unknown[]; data?: unknown[] };
    summary = j.events ? `${j.events.length} events` : j.data ? `${j.data.length} games` : "";
  } catch {
    summary = "not JSON";
  }
  console.log(`${name}: HTTP ${r.status}, ${text.length} bytes ${summary}`);
}

async function main(): Promise<void> {
  mkdirSync(DIR, { recursive: true });
  const which = process.argv[2] ?? "all";
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  if (which === "all" || which === "espn") {
    // A day of finals, a day of scheduled games, and today, which is live on a Saturday afternoon in September.
    await save("espn-nfl-final", ESPN("football", "nfl", "20260921"));
    await save("espn-nfl-scheduled", ESPN("football", "nfl", "20260927"));
    await save("espn-mlb-final", ESPN("baseball", "mlb", "20260925"));
    await save("espn-mlb-today", ESPN("baseball", "mlb", today));
    await save("espn-nba-final", ESPN("basketball", "nba", "20260410"));
    await save("espn-nhl-scheduled", ESPN("hockey", "nhl", "20261008"));
    await save("espn-empty", ESPN("hockey", "nhl", "20260715"));
  }
  if (which === "all" || which === "balldontlie") {
    const key = process.env.BALLDONTLIE_API_KEY;
    if (!key) throw new Error("BALLDONTLIE_API_KEY is not set");
    const h = { authorization: key };
    await save("balldontlie-nfl-final", BDL("nfl/v1", "2026-09-21"), h);
    await save("balldontlie-mlb-final", BDL("mlb/v1", "2026-09-25"), h);
    await save("balldontlie-nba-final", BDL("v1", "2026-04-10"), h);
    await save("balldontlie-nhl-refused", BDL("nhl/v1", "2026-04-10"), h);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
