/**
 * The service worker's notification tap, run for real against stand-ins for the browser's objects. The bug this
 * guards shipped: a tap focused the app without navigating it, so it opened whatever question the phone was last
 * on. These stand-ins are a contract, not a phone: what iOS actually does on a cold start is checked on a device.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

type Win = { url: string; focus: () => Promise<Win>; navigate?: (u: string) => Promise<Win | null>; postMessage: (m: unknown) => void };

function worker(wins: Win[]) {
  const calls: string[] = [];
  const listeners = new Map<string, (e: unknown) => void>();
  const stored = new Map<string, string>();
  const self = {
    location: { origin: "https://dareful.app" },
    addEventListener: (name: string, fn: (e: unknown) => void) => listeners.set(name, fn),
    skipWaiting: () => undefined,
    registration: { showNotification: async () => undefined },
    clients: {
      claim: async () => undefined,
      matchAll: async () => wins,
      openWindow: async (u: string) => {
        calls.push(`open:${u}`);
        return null;
      },
    },
    caches: { open: async () => ({ put: async (k: string, r: Response) => void stored.set(k, await r.text()) }) },
  };
  vm.runInNewContext(readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8"), { self, URL, Response, JSON, Date, Object, String });
  const tap = async (url: string) => {
    let done: Promise<unknown> = Promise.resolve();
    listeners.get("notificationclick")?.({ notification: { close: () => calls.push("close"), data: { url } }, waitUntil: (p: Promise<unknown>) => (done = p) });
    await done;
  };
  return { calls, stored, tap };
}
const win = (calls: string[], over: Partial<Win> = {}): Win => {
  const w: Win = { url: "https://dareful.app/m/old", focus: async () => (calls.push("focus"), w), navigate: async (u) => (calls.push(`navigate:${u}`), w), postMessage: (m) => calls.push(`message:${JSON.stringify(m)}`), ...over };
  return w;
};

test("a tap on a backgrounded app focuses it and then takes it to the question the notification was about", async () => {
  const calls: string[] = [];
  const w = worker([win(calls)]);
  w.calls.push = calls.push.bind(calls) as never;
  await w.tap("https://dareful.app/m/new-one#ballot");
  assert.deepEqual(calls.filter((c) => c !== "close"), ["focus", "navigate:https://dareful.app/m/new-one#ballot"]);
});

test("when the browser refuses to navigate, the page is told where to go instead of being left where it was", async () => {
  const calls: string[] = [];
  const w = worker([win(calls, { navigate: async () => Promise.reject(new Error("refused")) })]);
  await w.tap("https://dareful.app/m/new-one");
  assert.deepEqual(calls, ["focus", 'message:{"type":"dareful:open","url":"https://dareful.app/m/new-one"}']);
  const noNav = worker([win(calls.splice(0) && calls, { navigate: undefined })]);
  await noNav.tap("https://dareful.app/m/new-one");
  assert.ok(calls.some((c) => c.startsWith("message:")));
});

test("with the app fully closed a window is opened at the question, and the address is left for a start page that ignores it", async () => {
  const w = worker([]);
  await w.tap("https://dareful.app/m/cold");
  assert.deepEqual(w.calls, ["close", "open:https://dareful.app/m/cold"]);
  assert.equal((JSON.parse(w.stored.get("/__pending-notification") ?? "{}") as { url: string }).url, "https://dareful.app/m/cold");
});

test("a notification can only ever open this app", async () => {
  const w = worker([]);
  await w.tap("https://evil.example.com/steal");
  assert.deepEqual(w.calls, ["close", "open:https://dareful.app/"]);
});
