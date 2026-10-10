/**
 * Reads in turns (the ops round): at most a few in flight at once, the rest waiting here rather than in the database
 * driver. The driver pipelines queries that find every connection busy onto busy ones, and Supabase's transaction pooler
 * stops answering once a few are pipelined on one connection: twelve queries at once over the app's five connections
 * stalled every time on October 9, and the owner's page, forty at once, timed out after 300 seconds on October 8. The
 * operations jobs and the counts read in turns of `TURN` so they can never queue that deep.
 */

/** How many reads one of these jobs keeps in flight at most. */
export const TURN = 3;

/** Every task run, never more than `size` at once, each answer in its task's place. Pure but for the tasks it runs. */
export async function inTurns<T>(tasks: ReadonlyArray<() => Promise<T>>, size: number = TURN): Promise<T[]> {
  const out = new Array<T>(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      out[i] = await (tasks[i] as () => Promise<T>)();
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, tasks.length)) }, worker));
  return out;
}

/** The same, for a list of different reads, each answer keeping its own type in its place. */
export async function allInTurns<const T extends ReadonlyArray<() => Promise<unknown>>>(tasks: T, size: number = TURN): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  return (await inTurns(tasks as ReadonlyArray<() => Promise<unknown>>, size)) as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
