/**
 * Every line the server logs goes through `redactKeys` (the submission round, section 4): a failure is often logged
 * with the error object beside it, and printing a viem error prints the address it called, key and all. A string is
 * cleaned as it is; anything else is printed as the console would print it, and handed on as that text only when a
 * key had to come out of it, so every other line reads as it always did. Server only (it prints with `node:util`);
 * `src/instrumentation.ts` puts it in place once per server instance.
 */
import { inspect } from "node:util";
import { redactKeys } from "./redact";

const GUARDED = Symbol.for("dareful.console.redacting");
const LEVELS = ["log", "info", "warn", "error", "debug"] as const;

/** One argument, with any key taken out of what it would print. Pure apart from `inspect`. */
export function redactArg(arg: unknown, env?: Record<string, string | undefined>): unknown {
  if (typeof arg === "string") return redactKeys(arg, env);
  if (arg === null || (typeof arg !== "object" && typeof arg !== "function")) return arg;
  const shown = inspect(arg, { depth: 8, breakLength: 120 });
  const clean = redactKeys(shown, env);
  return clean === shown ? arg : clean;
}

/** Puts the redaction in front of the console's own levels, once. */
export function guardConsole(c: Console = console, env?: Record<string, string | undefined>): void {
  const marked = c as Console & { [GUARDED]?: true };
  if (marked[GUARDED]) return;
  for (const level of LEVELS) {
    const original = c[level].bind(c);
    c[level] = (...args: unknown[]) => original(...args.map((a) => redactArg(a, env)));
  }
  marked[GUARDED] = true;
}
