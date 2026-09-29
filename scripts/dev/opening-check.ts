/**
 * The opening, watched in a browser that really paints (docs/testing.md, the logo round). The development
 * browser's pane paints nothing while it is hidden, so the opening's frames and the moment the first screen's
 * shell is painted are read here instead: Chrome, headless, a fresh profile, a phone's screen.
 *
 *   npx tsx scripts/dev/opening-check.ts [--base=http://localhost:3000] [--path=/] [--scheme=dark|light]
 *        [--reduce] [--still] [--hold=800] [--cpu=4] [--latency=400] [--mbps=4] [--wait=3000]
 *        [--theme=dark|light] [--shots=<folder>] [--runs=5]
 *
 *   --still   the instrument's switch: open without the count, to time against a run with it
 *   --hold    keep the first screen's shell back this many milliseconds after the first frame has gone out, as a
 *             slow start would, so the count can be seen drawing and stopping where it is; the page is relayed
 *             through a small proxy here, and the app itself is untouched
 *   --latency every request waits this long, as a phone's network would, so the scripts arrive after the opening
 *             has gone and the app starts on a page the handoff has already changed
 *   --theme   the Appearance choice kept on the phone, against whatever --scheme says the phone itself is in
 *   --shots   save a picture every 100ms of the first two and a half seconds
 *
 * From the command line it signs nobody in and writes nothing to the app: what it reads is the signed-out first
 * screen. The http suite calls `watchOpening` with its own test account's cookie, to watch Now's shell the same way.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer, request as httpRequest, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const chromeIsHere = (): boolean => existsSync(CHROME);

export type OpeningRun = {
  counted: boolean;
  firstByte: number;
  firstPaint: number | null;
  /** The handoff began: the first screen's shell had painted. */
  shell: number | null;
  handoff: number | null;
  /** The opening left the page. */
  removed: number | null;
  /** Where each stroke's clip stood when it was stopped. */
  strokes: string[];
  content: number | null;
  live: number | null;
  sdk: number | null;
  dressed: boolean;
  /** Whether the opening is on the page at the end of the run, after everything has had time to start. */
  opening: boolean;
  wordmark: boolean;
  tabBar: boolean;
  now: string | null;
  /** The ground `html` wears at the end of the run. */
  ground: string;
  /** Whatever the page threw or logged as an error. */
  errors: string[];
};

export type OpeningOptions = { base?: string; path?: string; scheme?: "dark" | "light"; reduce?: boolean; still?: boolean; hold?: number; cpu?: number; latency?: number; mbps?: number; wait?: number; shots?: string; runs?: number; /** The Appearance choice (8.1), as the row on You keeps it. */ theme?: "dark" | "light"; /** The session cookie's value, for a signed-in run. */ session?: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** With a hold: the page relayed in two pieces, everything up to the app's root and then, after the hold, the rest. */
function startProxy(base: URL, hold: number): Promise<Server> {
  const server = createServer((req, res) => {
    const upstream = httpRequest({ host: base.hostname, port: base.port, path: req.url, method: req.method, headers: { ...req.headers, host: base.host, "accept-encoding": "identity" } }, (up) => {
      const html = String(up.headers["content-type"] ?? "").includes("text/html");
      const headers = { ...up.headers };
      delete headers["content-length"];
      res.writeHead(up.statusCode ?? 200, headers);
      if (!html) return void up.pipe(res);
      let held = "";
      let split = false;
      let release: NodeJS.Timeout | null = null;
      const queue: Buffer[] = [];
      up.on("data", (chunk: Buffer) => {
        if (split) return void queue.push(chunk);
        held += chunk.toString("utf8");
        const at = held.indexOf('<div id="app"');
        if (at === -1) return;
        split = true;
        res.write(held.slice(0, at));
        const rest = held.slice(at);
        release = setTimeout(() => {
          res.write(rest);
          for (const c of queue) res.write(c);
          queue.length = 0;
          release = null;
          if (up.complete) res.end();
        }, hold);
      });
      up.on("end", () => {
        if (!split) return void res.end(held);
        if (release === null) res.end();
      });
    });
    upstream.on("error", () => res.destroy());
    req.pipe(upstream);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

type Message = { id?: number; method?: string; params?: Record<string, unknown>; result?: unknown; error?: { message: string } };

/** One connection to one page, speaking the browser's own protocol. */
function connect(url: string) {
  const ws = new WebSocket(url);
  let id = 0;
  const waiting = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();
  const listeners: Array<(m: Message) => void> = [];
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(String(e.data)) as Message;
    const w = m.id ? waiting.get(m.id) : undefined;
    if (m.id && w) {
      waiting.delete(m.id);
      if (m.error) w.reject(new Error(m.error.message));
      else w.resolve(m.result);
    } else if (m.method) for (const l of listeners) l(m);
  });
  const opened = new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("the browser's socket did not open")));
  });
  return {
    opened,
    send: <T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> =>
      new Promise<T>((resolve, reject) => {
        id += 1;
        waiting.set(id, { resolve: resolve as (v: unknown) => void, reject });
        ws.send(JSON.stringify({ id, method, params }));
      }),
    on: (l: (m: Message) => void) => listeners.push(l),
    close: () => ws.close(),
  };
}

/** What the page records about its own opening, from before anything else runs. */
const RECORDER = `(() => {
  const seen = (window.__opening = { handoff: null, removed: null, strokes: [] });
  const look = () => {
    const o = document.getElementById("opening");
    if (!o) return;
    if (seen.handoff === null && o.classList.contains("handoff")) {
      seen.handoff = performance.now();
      seen.strokes = [...o.querySelectorAll(".s")].map((s) => getComputedStyle(s).clipPath);
    }
  };
  new MutationObserver(() => {
    look();
    if (seen.handoff !== null && seen.removed === null && !document.getElementById("opening")) seen.removed = performance.now();
  }).observe(document, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
})();`;

const READING = `(() => { const n = performance.getEntriesByType("navigation")[0]; const at = (k) => { const e = performance.getEntriesByName(k)[0]; return e ? Math.round(e.startTime) : null; }; const o = window.__opening || {}; return { counted: document.documentElement.getAttribute("data-tally") !== "off", firstByte: Math.round(n.responseStart), firstPaint: at("first-contentful-paint"), shell: at("dareful:shell"), handoff: o.handoff == null ? null : Math.round(o.handoff), removed: o.removed == null ? null : Math.round(o.removed), strokes: o.strokes || [], content: at("dareful:content"), live: at("dareful:live"), sdk: at("dareful:sdk"), dressed: document.documentElement.hasAttribute("data-dressed"), opening: !!document.getElementById("opening"), wordmark: !!document.querySelector("[data-wordmark]"), tabBar: !!document.querySelector("[data-tab-bar]"), now: (document.querySelector("[data-now]") || { getAttribute: () => null }).getAttribute("data-now"), ground: getComputedStyle(document.documentElement).backgroundColor }; })()`;

export async function watchOpening(options: OpeningOptions = {}): Promise<OpeningRun[]> {
  const base = new URL(options.base ?? "http://localhost:3000");
  const path = options.path ?? "/";
  const hold = options.hold ?? 0;
  const latency = options.latency ?? 0;
  const runsWanted = options.runs ?? (options.shots ? 1 : 5);
  const profile = mkdtempSync(join(tmpdir(), "dareful-opening-"));
  const port = 9300 + Math.floor(Math.random() * 400);
  const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--window-size=393,852", "about:blank"], { stdio: "ignore" });
  const proxy = hold > 0 ? await startProxy(base, hold) : null;
  const origin = proxy ? `http://127.0.0.1:${(proxy.address() as AddressInfo).port}` : base.origin;
  try {
    let target: { webSocketDebuggerUrl: string } | null = null;
    for (let i = 0; i < 50 && !target; i += 1) {
      await sleep(200);
      target = await fetch(`http://127.0.0.1:${port}/json/list`)
        .then((r) => r.json() as Promise<Array<{ type: string; webSocketDebuggerUrl: string }>>)
        .then((l) => l.find((t) => t.type === "page") ?? null)
        .catch(() => null);
    }
    if (!target) throw new Error("the browser did not start");
    const page = connect(target.webSocketDebuggerUrl);
    await page.opened;
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Network.enable");
    await page.send("Log.enable");
    await page.send("Emulation.setDeviceMetricsOverride", { width: 393, height: 852, deviceScaleFactor: 3, mobile: true });
    await page.send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: options.scheme ?? "dark" }, { name: "prefers-reduced-motion", value: options.reduce ? "reduce" : "no-preference" }] });
    if ((options.cpu ?? 1) > 1) await page.send("Emulation.setCPUThrottlingRate", { rate: options.cpu });
    if (options.session) await page.send("Network.setCookie", { name: "dareful_session", value: options.session, url: origin, httpOnly: true });
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: `${RECORDER}\ntry{${options.still ? 'localStorage.setItem("dareful.tally","off")' : 'localStorage.removeItem("dareful.tally")'};${options.theme ? `localStorage.setItem("dareful.theme","${options.theme}")` : 'localStorage.removeItem("dareful.theme")'}}catch(e){}` });
    const errors: string[] = [];
    page.on((m) => {
      const p = m.params as { exceptionDetails?: { text: string; exception?: { description?: string } }; type?: string; args?: Array<{ value?: unknown; description?: string }>; entry?: { level: string; text: string } } | undefined;
      if (m.method === "Runtime.exceptionThrown" && p?.exceptionDetails) errors.push(String(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text).split("\n")[0] ?? "");
      if (m.method === "Runtime.consoleAPICalled" && p?.type === "error") errors.push((String(p.args?.[0]?.value ?? p.args?.[0]?.description ?? "").split("\n")[0] ?? "").slice(0, 200));
      if (m.method === "Log.entryAdded" && p?.entry?.level === "error") errors.push(p.entry.text.slice(0, 200));
    });

    // Once to fill the cache with the stylesheet and the scripts, as an installed app has them; the runs after it are the reading.
    await page.send("Page.navigate", { url: origin + path });
    await sleep(2500 + hold);
    if (latency > 0) {
      // A phone's network: nothing is kept from the last load, and every request waits.
      await page.send("Network.setCacheDisabled", { cacheDisabled: true });
      await page.send("Network.emulateNetworkConditions", { offline: false, latency, downloadThroughput: ((options.mbps ?? 4) * 1024 * 1024) / 8, uploadThroughput: (1024 * 1024) / 8 });
    }

    const runs: OpeningRun[] = [];
    for (let run = 0; run < runsWanted; run += 1) {
      await page.send("Page.navigate", { url: "about:blank" });
      await sleep(300);
      const started = Date.now();
      errors.length = 0;
      await page.send("Page.navigate", { url: origin + path });
      if (options.shots) {
        mkdirSync(options.shots, { recursive: true });
        for (let t = 100; t <= 2500; t += 100) {
          const wait = started + t - Date.now();
          if (wait > 0) await sleep(wait);
          const shot = await page.send<{ data: string }>("Page.captureScreenshot", { format: "png" }).catch(() => null);
          if (shot) writeFileSync(join(options.shots, `${String(t).padStart(4, "0")}.png`), Buffer.from(shot.data, "base64"));
        }
      }
      await sleep(Math.max(0, (options.wait ?? 3000) + hold + 6 * latency - (Date.now() - started)));
      const { result } = await page.send<{ result: { value: Omit<OpeningRun, "errors"> } }>("Runtime.evaluate", { returnByValue: true, expression: READING });
      runs.push({ ...result.value, errors: [...errors] });
    }
    page.close();
    return runs;
  } finally {
    chrome.kill();
    proxy?.close();
    await sleep(300);
    rmSync(profile, { recursive: true, force: true });
  }
}

// From the command line.
if ((process.argv[1] ?? "").endsWith("opening-check.ts")) {
  const args = Object.fromEntries(
    process.argv
      .slice(2)
      .filter((a) => a.startsWith("--"))
      .map((a) => a.slice(2).split("="))
      .map(([k, v]) => [k, v ?? "1"]),
  ) as Record<string, string>;
  const n = (k: string): number | undefined => (args[k] === undefined ? undefined : Number(args[k]));
  const options: OpeningOptions = { base: args["base"], path: args["path"], scheme: args["scheme"] === "light" ? "light" : "dark", reduce: Boolean(args["reduce"]), still: Boolean(args["still"]), hold: n("hold"), cpu: n("cpu"), latency: n("latency"), mbps: n("mbps"), wait: n("wait"), shots: args["shots"], runs: n("runs"), ...(args["theme"] === "dark" || args["theme"] === "light" ? { theme: args["theme"] } : {}) };
  watchOpening(options)
    .then((runs) => console.log(JSON.stringify({ page: (options.base ?? "http://localhost:3000") + (options.path ?? "/"), scheme: options.scheme, reduce: options.reduce, hold: options.hold ?? 0, cpu: options.cpu ?? 1, latency: options.latency ?? 0, runs }, null, 2)))
    .catch((err: unknown) => {
      console.error(err);
      process.exit(1);
    });
}
