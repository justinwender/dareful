/**
 * The database pool, guarded (pre-submission bug fixes 1). postgres.js hands a query that finds every connection busy
 * to a busy one, behind the query already there, and Supabase's transaction pooler stops answering a connection once
 * parameterless queries are queued on it that way: twenty or forty at once over five connections stalled every time on
 * October 10, whether sent by the simple protocol or the extended one, while a parameterised query is never queued
 * behind another (the driver waits for its description first) and queries queued inside one transaction are answered.
 * A stalled connection never answers again, so one burst of judges loading pages could hold an instance for good.
 *
 * So the guard keeps the driver from ever queueing: at most as many top-level queries and transactions in flight as
 * the pool has connections, the rest waiting here in order, each handed a connection the driver has free. Queries
 * inside a transaction run on its own connection and take no slot, and transactions take one slot fewer than there
 * are, so a slow one (a send waiting under the relayer's lock) never leaves a page's reads with nowhere to go. And a
 * pool that stops answering anyway (every slot busy, something waiting `STALL_MS` for one, and nothing answered in that
 * time) is replaced: a fresh pool takes every new and waiting query, and the old one is ended, which fails what it held
 * at once instead of leaving it hanging. How long something has run never counts, only how long something has waited
 * for a slot with every slot taken: a statement can wait on a lock for twenty seconds (two upserts did, in production's
 * statistics) and a send holds its transaction for up to fifteen, and neither may take down what the pool holds.
 */
import type postgres from "postgres";

type Sql = postgres.Sql;
type Entry = { generation: number; transaction: boolean; pool: Sql };

/** How long something may wait for a slot, every slot busy and nothing answered, before the pool is taken for stalled. */
export const STALL_MS = 10_000;
/** How often the guard looks, besides on every query. */
export const CHECK_EVERY_MS = 1_000;

export type GuardOptions = {
  /** Queries and transactions in flight at once: the pool's connections. */
  slots: number;
  stallMs?: number;
  now?: () => number;
  /** Told when the pool is replaced, with why. */
  onReplace?: (why: string) => void;
};

export type Guard = {
  /** The client drizzle is given: whichever pool is current, through the guard. */
  client: Sql;
  /** In flight, waiting, and how many times the pool was replaced. */
  stats: () => { inFlight: number; waiting: number; replaced: number };
  /** Looks for a stall now, and replaces the pool if it finds one. */
  check: (at?: number) => boolean;
};

/**
 * Whether the guard takes the pool for stalled (pre-submission bug fixes 1, as the owner asked before the commit): every
 * slot has been busy for `stallMs` (`fullSince`, when the last free one was taken), something has waited that long for
 * one, and nothing has answered in that time. Running long is never waiting: a lone statement on a lock, a full pool of
 * slow ones with nothing behind them, and transactions queued behind the relayer's lock with a slot still free for reads
 * are all the app at work, and a wait begun while a slot was free counts only from when the last one was taken. Pure.
 */
export function stalled(input: { fullSince: number | null; oldestWaiting: number | null; lastAnswer: number; now: number; stallMs: number }): boolean {
  if (input.fullSince === null || input.oldestWaiting === null) return false;
  return input.now - Math.max(input.fullSince, input.oldestWaiting) >= input.stallMs && input.now - input.lastAnswer >= input.stallMs;
}

/**
 * Whether a failed query still heard from the database: a refusal (a constraint, a syntax error) is an answer, and so
 * is an error thrown inside a transaction by the app's own code; a connection that closed, ended, was destroyed or
 * timed out is not. Pure.
 */
export function heardBack(err: unknown): boolean {
  const code = typeof err === "object" && err !== null && "code" in err ? String((err as { code: unknown }).code) : "";
  return !/^(CONNECTION_|CONNECT_TIMEOUT$|E[A-Z]{3,}$)/.test(code);
}

/** A pool behind the guard, made by `make`; a replacement is made the same way and given the first one's type parsers. */
export function guardPool(make: () => Sql, opts: GuardOptions): Guard {
  const now = opts.now ?? Date.now;
  const stallMs = opts.stallMs ?? STALL_MS;
  let current = make();
  let generation = 0;
  let replaced = 0;
  let lastAnswer = now();
  /** When every slot was last taken, while they all still are; null while one is free. */
  let fullSince: number | null = null;
  const inFlight = new Set<Entry>();
  const waiting: Array<{ since: number; transaction: boolean; go: () => void }> = [];
  const mine = () => [...inFlight].filter((e) => e.generation === generation);
  const busy = () => mine().length;
  const transactionSlots = Math.max(1, opts.slots - 1);

  /** Starts whatever is waiting and can go, in order: a query while a slot is free, a transaction while one of theirs is. */
  const dispatch = () => {
    for (let i = 0; i < waiting.length && busy() < opts.slots; ) {
      const w = waiting[i] as (typeof waiting)[number];
      if (w.transaction && mine().filter((e) => e.transaction).length >= transactionSlots) {
        i += 1;
        continue;
      }
      waiting.splice(i, 1);
      w.go();
    }
    if (busy() < opts.slots) fullSince = null;
    else fullSince ??= now();
  };

  const acquire = (transaction: boolean): Promise<Entry> =>
    new Promise((resolve) => {
      const since = now();
      const go = () => {
        // The pool it was given its slot in, which is the pool it runs on, whatever is current by the time it starts.
        const entry = { generation, transaction, pool: current };
        inFlight.add(entry);
        resolve(entry);
      };
      waiting.push({ since, transaction, go });
      dispatch();
      check();
    });

  const release = (entry: Entry, answered: boolean) => {
    inFlight.delete(entry);
    if (answered && entry.generation === generation) lastAnswer = now();
    dispatch();
  };

  const replace = (why: string) => {
    const old = current;
    current = make();
    // drizzle sets its own parsers on the client it is given (drizzle-orm/postgres-js/driver.js); a replacement gets the same.
    Object.assign(current.options.parsers, old.options.parsers);
    Object.assign(current.options.serializers, old.options.serializers);
    generation += 1;
    replaced += 1;
    lastAnswer = now();
    opts.onReplace?.(why);
    // Ending it fails what it held at once (CONNECTION_DESTROYED), each releasing its slot in the old pool's count.
    void old.end({ timeout: 0 }).catch(() => undefined);
    dispatch();
  };

  function check(at = now()): boolean {
    const oldest = waiting.reduce<number | null>((min, w) => (min === null || w.since < min ? w.since : min), null);
    if (!stalled({ fullSince, oldestWaiting: oldest, lastAnswer, now: at, stallMs })) return false;
    replace(`every slot busy for ${Math.round((at - (fullSince ?? at)) / 1000)}s with something waiting, and nothing answered for ${Math.round((at - lastAnswer) / 1000)}s`);
    return true;
  }

  const timer = setInterval(() => check(), CHECK_EVERY_MS);
  timer.unref?.();

  /** One top-level query: sent only once it has a slot, so the driver never queues it behind another. */
  const query = (string: string, args?: unknown, options?: unknown) => {
    let values = false;
    let run: Promise<unknown> | null = null;
    const start = () =>
      (run ??= acquire(false).then(async (entry) => {
        try {
          const q = (entry.pool.unsafe as (s: string, a?: unknown, o?: unknown) => postgres.PendingQuery<postgres.Row[]>)(string, args, options);
          const out = await (values ? q.values() : q);
          release(entry, true);
          return out;
        } catch (err) {
          release(entry, heardBack(err));
          throw err;
        }
      }));
    const pending = {
      values() {
        values = true;
        return pending;
      },
      then<A, B>(ok?: (v: unknown) => A | PromiseLike<A>, no?: (e: unknown) => B | PromiseLike<B>) {
        return start().then(ok, no);
      },
      catch<B>(no?: (e: unknown) => B | PromiseLike<B>) {
        return start().catch(no);
      },
      finally(f?: () => void) {
        return start().finally(f);
      },
    };
    return pending;
  };

  /** One transaction: one slot from its begin to its end; the queries inside run on its own connection. */
  const begin = async (...args: unknown[]) => {
    const entry = await acquire(true);
    try {
      const out = await (entry.pool.begin as (...a: unknown[]) => Promise<unknown>)(...args);
      release(entry, true);
      return out;
    } catch (err) {
      release(entry, heardBack(err));
      throw err;
    }
  };

  const end = async (o?: { timeout?: number }) => {
    clearInterval(timer);
    return current.end(o);
  };

  const client = new Proxy(function guarded() {} as unknown as Sql, {
    get(_target, prop) {
      if (prop === "unsafe") return query;
      if (prop === "begin") return begin;
      if (prop === "end") return end;
      const value = Reflect.get(current, prop, current) as unknown;
      return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(current) : value;
    },
    apply() {
      throw new Error("the database client is used through drizzle; a tagged query here would skip the guard");
    },
  });

  return { client, stats: () => ({ inFlight: busy(), waiting: waiting.length, replaced }), check };
}
