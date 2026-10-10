/**
 * The operations jobs on the minute tick (the ops round): every five minutes the health checks and the runway, and from
 * 8am Eastern the day's email. They run after the ledger's jobs and one after another, never beside them, since the
 * database's pooler stalls on a deep queue of reads (src/lib/ops/turns.ts), and none of them can fail the tick. The tick
 * records each run it finishes (`tick` in `ops_state`), which is what the health check reads to know the scheduler is
 * alive.
 */
import { runHealth } from "./health";
import { sendMorning } from "./morning";
import { watchRunway } from "./runway";
import { putState } from "./state";

/** The health checks and the runway are read on the minutes divisible by this. */
export const OPS_EVERY_MIN = 5;

/** Whether this minute reads health and the runway. Pure. */
export function opsDue(now: Date): boolean {
  return now.getUTCMinutes() % OPS_EVERY_MIN === 0;
}

export type OpsReport = { health: boolean | null; told: string[]; morning: string };

export async function opsTick(now: Date): Promise<OpsReport> {
  const say = (what: string) => (err: unknown) => {
    console.error(`tick: ${what}`, err instanceof Error ? err.message.split("\n")[0] : err);
    return null;
  };
  let health: boolean | null = null;
  let told: string[] = [];
  if (opsDue(now)) {
    // One after the other, never beside each other: the database's pooler stalls on a deep queue (src/lib/ops/turns.ts).
    const run = await runHealth("tick", now).catch(say("the health checks failed"));
    const runway = await watchRunway(now).catch(say("the runway could not be read"));
    health = run ? run.ok : null;
    told = runway?.told ?? [];
  }
  const morning = await sendMorning(now).catch((err: unknown) => (say("the morning email failed")(err), "failed"));
  return { health, told, morning };
}

/** The tick's own record of a run it finished: when it started, and what it did, in counts. */
export async function beat(now: Date, report: Record<string, unknown>): Promise<void> {
  await putState("tick", report, now);
}
