// The sign-in pass (the ops round, section 3): every six hours, a real browser signs in through the app with Dynamic's
// test account, then opens Now, a person's page and a question, as a person would. Run by .github/workflows/watch.yml,
// which installs Playwright for it; never part of the app. Skipped, and saying so, until the account's email and code
// are in the repository's secrets (WATCH_EMAIL, WATCH_CODE), and never printing either.
//
// The browser is headless Chrome, whose user agent the usage door refuses as a crawler's, and the account is left out of
// every count, so nothing it does reaches a number. It writes nothing of its own: the tips it passes are not marked
// seen (that write is stopped here), so anyone else signing in with the same test account still gets them.

import { appendFileSync, mkdirSync } from "node:fs";

const base = (process.env.WATCH_URL ?? "https://dareful.app").replace(/\/$/, "");
const email = process.env.WATCH_EMAIL ?? "";
const code = process.env.WATCH_CODE ?? "";

const notes = [];
const say = (line) => (notes.push(line), console.log(line));
function summary(title) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${title}\n\n${notes.map((n) => `- ${n}`).join("\n")}\n`);
}

if (!email || !code) {
  say("Skipped: the test account's email and code are not in the repository's secrets yet (WATCH_EMAIL, WATCH_CODE).");
  summary("Sign-in pass");
  process.exit(0);
}

// Loaded only now, so the skip above needs no browser installed.
const { chromium } = await import("playwright");
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const page = await context.newPage();
// Dynamic's own API as this runner reaches it: a refusal at its edge is said as that, not as the app failing.
let refusedBy = null;
page.on("response", (r) => {
  if (!/dynamicauth\.com/.test(r.url())) return;
  const mitigated = r.headers()["cf-mitigated"];
  if (r.status() === 403 || r.status() === 429 || mitigated) refusedBy ??= `${r.status()}${mitigated ? ` (${mitigated})` : ""} from ${new URL(r.url()).pathname.split("/").slice(0, 5).join("/")}`;
});
// A tip passed by is not marked seen: the test account is shared with whoever else signs in with it.
await page.route("**/*", (route) => {
  const req = route.request();
  if (req.method() === "POST" && req.headers()["next-action"] && (req.postData() ?? "").includes("/tips/")) return route.abort();
  return route.continue();
});

let step = "the home page";
let failed = null;
try {
  await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  step = "Get started";
  // Enabled once Dynamic's SDK has loaded in the page.
  await page.locator("[data-sign-in]:not([disabled])").first().click({ timeout: 45_000 });
  step = "the email";
  await page.locator('[data-account-step="address"] input[type="email"]').fill(email, { timeout: 20_000 });
  await page.locator("[data-account-continue]").click();
  step = "the code";
  await page.locator('[data-account-step="code"] input[autocomplete="one-time-code"]').fill(code, { timeout: 30_000 });
  await page.locator('[data-account-step="code"] button', { hasText: "Continue" }).click();
  step = "signed in";
  // Signed in, Now is drawn with the tab bar: the session cookie is set and the first screen rendered.
  await page.locator('nav[data-tab-bar]').waitFor({ timeout: 60_000 });
  say(`Signed in and Now drawn at ${page.url()}.`);

  step = "a person's page";
  await page.goto(`${base}/people`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.locator('nav[data-tab-bar]').waitFor({ timeout: 30_000 });
  const person = await page.locator("[data-person-row]").first().getAttribute("href", { timeout: 5_000 }).catch(() => null);
  if (person) {
    const res = await page.goto(`${base}${person}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (!res || res.status() !== 200) throw new Error(`the person's page answered ${res ? res.status() : "nothing"}`);
    await page.locator("main, [data-screen], body").first().waitFor({ timeout: 20_000 });
    say(`A person's page opened (${res.status()}).`);
  } else say("The account shares a set with nobody yet, so there is no person's page to open.");

  step = "a question";
  const question = await page.locator('a[href^="/m/"]').first().getAttribute("href", { timeout: 5_000 }).catch(() => null);
  const fromNow = question ? null : await (async () => {
    await page.goto(`${base}/`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    return page.locator('a[href^="/m/"]').first().getAttribute("href", { timeout: 5_000 }).catch(() => null);
  })();
  const href = question ?? fromNow;
  if (href && !href.startsWith("/m/new")) {
    const res = await page.goto(`${base}${href}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (!res || res.status() !== 200) throw new Error(`the question answered ${res ? res.status() : "nothing"}`);
    say(`A question opened (${res.status()}).`);
  } else say("The account is in no question yet, so there is none to open.");
} catch (err) {
  failed = `${step}: ${err instanceof Error ? err.message.split("\n")[0] : String(err)}`;
}

if (failed) {
  mkdirSync("watch", { recursive: true });
  await page.screenshot({ path: "watch/failed.png", fullPage: true }).catch(() => undefined);
  say(`FAILED at ${failed}`);
  if (refusedBy) say(`Dynamic's edge refused this runner: ${refusedBy}. A refusal there is Dynamic's bot protection meeting a cloud address, not the app.`);
}
await browser.close();
summary("Sign-in pass");
process.exit(failed ? 1 : 0);
