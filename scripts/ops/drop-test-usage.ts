/**
 * Removes the usage rows the development machine's own runs wrote to production (the second-pass round,
 * 2026-10-06): the simulators' error and link reports, which the stats page counts because a guest's or a device's
 * rows always count, and a model comparison's escalation. Only rows with no account and no guest behind them, from
 * the devices listed, inside each run's window. The rows a run made under its temporary accounts, questions and
 * guests went with them when the test sweep removed those, by the table's own cascade.
 *
 * Also one row a production change made untrue: the Red Sox question's void by the final score, which its
 * resettlement replaced with a decision of its own row, so the stats would count the one question twice. And one
 * row from each mutation audit since the door shipped: the door's test posts a sign-in the browser may not report,
 * and the mutant that opens the door let it through on no question, where the test's cleanup never looked (it
 * removes its own device's rows now). No count reads a sign-in with no account, so those seven change no number.
 *
 * It changes production data, so it runs with --apply only on the owner's go-ahead. A day already snapshotted for
 * the stats page counted these rows, so its snapshot goes too and is taken again.
 *
 *   npx tsx --env-file=.env.local scripts/ops/drop-test-usage.ts            lists what it would remove
 *   npx tsx --env-file=.env.local scripts/ops/drop-test-usage.ts --apply    removes it
 */
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db, schema } from "@/db";

type Batch = { name: string; from: string; to: string; devices: string[]; names: string[]; serverRows?: Array<{ name: string; at: string }> };

/** Each run's window and its devices, read from the table on the day of the run (see docs/decisions.md 2026-10-06). */
const BATCHES: Batch[] = [
  {
    name: "first contact: thirty guest runs and the sheet checks on the iOS 26 and iOS 27 simulators (2026-10-04 evening, Eastern)",
    from: "2026-10-05T00:30:00Z",
    to: "2026-10-05T05:00:00Z",
    devices: ["e6d896bd-9dbd-4a45-9782-4fa545dd4d36", "f467fcfc-20f6-4524-9b13-836eaf3625e9", "42015239-bebb-41a8-a2e4-2ce757f9c340", "9b81e5d5-dbc9-4fa9-abed-7aade566feb2", "eaadf04e-127f-40c1-814f-b26ad0f50dcf", "ed92d4a8-dda9-40f0-9f15-53e23ad556e3"],
    names: ["error_shown", "link_opened"],
    // The model comparison's one escalation, recorded by the write-up it ran through.
    serverRows: [{ name: "model_escalated", at: "2026-10-05T00:41:42Z" }],
  },
  {
    name: "first contact, second pass: the simulator checks on iOS 26 and iOS 27 (2026-10-06 afternoon and evening, Eastern)",
    from: "2026-10-06T19:00:00Z",
    to: "2026-10-07T06:00:00Z",
    // The two Safari jars and their loopback ones, and the two tabs opened from outside the simulator, whose code
    // screen reported its line as it loaded (2026-10-06 19:57 and 20:20 UTC, seconds after each tab was opened).
    devices: ["42015239-bebb-41a8-a2e4-2ce757f9c340", "684c3813-ccaf-4fd0-a5f3-5f9e890a2895", "f467fcfc-20f6-4524-9b13-836eaf3625e9", "eaadf04e-127f-40c1-814f-b26ad0f50dcf", "54cf63a8-51ab-4f9a-89c4-da738caf6c40", "a55b68f0-f7d6-4f59-b662-ba10bc0e112f"],
    names: ["error_shown", "link_opened"],
  },
  {
    name: "the audits' door check: a sign-in let through by the mutant that opens the door, one per audit run (2026-10-02 to 2026-10-06)",
    from: "2026-10-02T00:00:00Z",
    to: "2026-10-07T00:00:00Z",
    devices: ["897d5db7-32c0-4063-aa40-de2c4c0623c9", "1a5bcc3f-7b44-43a9-ba2f-bfdd4c4566c2", "20482b50-15b6-4a34-a6e1-dafed286ff52", "fa851662-1978-4e7d-9520-f80021ae93e8", "5bd376f2-9def-4677-a6e4-3f55fa2a9638", "00880957-fc77-46eb-b0dd-9cbfd8821574", "6eff2941-78d9-448b-bc7f-54af23c24c8b"],
    names: ["signed_in"],
  },
];

type Superseded = { name: string; dareId: string; at: string; why: string };

/** Rows a later production change made untrue, each by its question and the second it was written. */
const SUPERSEDED: Superseded[] = [
  {
    name: "settled",
    dareId: "30c186f0-8d54-4f8e-aa56-7f6f6c0082d8",
    at: "2026-10-04T23:47:00Z",
    why: "the Red Sox question's void by the final score (a conflict between the sources), replaced by its resettlement on 2026-10-06 19:08 UTC, which wrote its own settled row",
  },
];

const U = schema.usageEvents;

async function rowsOf(b: Batch) {
  const deviceRows = await db
    .select({ id: U.id, name: U.name, device: U.deviceId, at: U.at })
    .from(U)
    .where(and(inArray(U.deviceId, b.devices), inArray(U.name, b.names), isNull(U.userId), isNull(U.claimId), gte(U.at, new Date(b.from)), lte(U.at, new Date(b.to))));
  const serverRows = [];
  for (const r of b.serverRows ?? []) {
    const at = new Date(r.at);
    serverRows.push(...(await db.select({ id: U.id, name: U.name, device: U.deviceId, at: U.at }).from(U).where(and(eq(U.name, r.name), isNull(U.userId), isNull(U.claimId), isNull(U.deviceId), gte(U.at, at), lte(U.at, new Date(at.getTime() + 1000))))));
  }
  return [...deviceRows, ...serverRows];
}

async function supersededRows(r: Superseded) {
  const at = new Date(r.at);
  return db.select({ id: U.id, name: U.name, device: U.deviceId, at: U.at }).from(U).where(and(eq(U.name, r.name), eq(U.dareId, r.dareId), gte(U.at, at), lte(U.at, new Date(at.getTime() + 1000))));
}

/** The days a snapshot may hold: every calendar day either end of a window touches, and the day either side. */
function daysOf(from: string, to: string): string[] {
  const out = new Set<string>();
  for (let t = new Date(from).getTime() - 86_400_000; t <= new Date(to).getTime() + 86_400_000; t += 86_400_000) out.add(new Date(t).toISOString().slice(0, 10));
  return [...out];
}

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const ids: string[] = [];
  const days = new Set<string>();
  for (const b of BATCHES) {
    const rows = await rowsOf(b);
    const byName = rows.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.name]: (acc[r.name] ?? 0) + 1 }), {});
    console.log(JSON.stringify({ batch: b.name, rows: rows.length, byName }, null, 2));
    ids.push(...rows.map((r) => r.id));
    for (const d of daysOf(b.from, b.to)) days.add(d);
  }
  for (const r of SUPERSEDED) {
    const rows = await supersededRows(r);
    console.log(JSON.stringify({ superseded: r.why, rows: rows.length }, null, 2));
    ids.push(...rows.map((x) => x.id));
    for (const d of daysOf(r.at, r.at)) days.add(d);
  }
  const snapshots = await db.select({ day: schema.usageSnapshots.day }).from(schema.usageSnapshots).where(inArray(schema.usageSnapshots.day, [...days]));
  console.log(JSON.stringify({ total: ids.length, snapshotsToRetake: snapshots.map((s) => s.day), apply }, null, 2));
  if (!apply) {
    console.log("dry run: nothing changed. Run again with --apply on the owner's go-ahead.");
    return;
  }
  await db.transaction(async (tx) => {
    if (ids.length) await tx.delete(U).where(inArray(U.id, ids));
    if (snapshots.length) await tx.delete(schema.usageSnapshots).where(inArray(schema.usageSnapshots.day, snapshots.map((s) => s.day)));
  });
  console.log(`removed ${ids.length} rows and ${snapshots.length} snapshots`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
