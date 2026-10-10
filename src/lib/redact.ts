/**
 * Keys out of every error the app logs, stores or shows (the submission round, section 4). Production's error logs
 * carried the RPC's address with its key in full: viem puts the address it called in its errors, in the message, the
 * meta messages and a `url` property, and a log line that prints the error prints all three. Every secret the app
 * holds is taken out by its value, and anything shaped like a key is taken out wherever it sits in an address, a query
 * or a connection string, so no log, row, email, screenshot or recording carries one. Pure: no Node import, so any
 * module may use it.
 */

/** What a key becomes. */
export const KEY_MARK = "[key]";

/** The variables whose values are secrets (`.env.example`): every one is taken out by its value wherever it appears. */
export const SECRET_NAMES = [
  "MONAD_RPC_URL",
  "RELAYER_PRIVATE_KEY",
  "ANTHROPIC_API_KEY",
  "RESEND_API_KEY",
  "SUPABASE_SECRET_KEY",
  "DATABASE_URL",
  "DATABASE_URL_SESSION",
  "DYNAMIC_API_TOKEN",
  "DYNAMIC_SERVER_API_TOKEN",
  "DYNAMIC_WEBHOOK_SECRET",
  "DYNAMIC_DELEGATION_PRIVATE_KEY",
  "DELEGATION_STORE_KEY",
  "DYNAMIC_TEST_CODE",
  "SESSION_SECRET",
  "TICK_SECRET",
  "PHONE_HASH_SALT",
  "VAPID_PRIVATE_KEY",
  "BALLDONTLIE_API_KEY",
  "SEED_MNEMONIC",
  "CANARY_MNEMONIC",
  "ENVIO_API_TOKEN",
] as const;

/** A value too short to be a secret is never searched for: it would take out ordinary words. */
const SHORTEST_SECRET = 8;

/**
 * The secret values to take out, longest first so one inside another goes whole; an address-shaped value keeps its
 * origin, since the host is what a reader of the log needs and the key is what they must not see. Pure.
 */
export function secretValues(env: Record<string, string | undefined>): Array<{ value: string; becomes: string }> {
  const out: Array<{ value: string; becomes: string }> = [];
  for (const name of SECRET_NAMES) {
    const value = env[name]?.trim();
    if (!value || value.length < SHORTEST_SECRET) continue;
    let becomes = KEY_MARK;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
      try {
        const u = new URL(value);
        becomes = `${u.protocol}//${u.hostname}/${KEY_MARK}`;
      } catch {
        becomes = KEY_MARK;
      }
    }
    out.push({ value, becomes });
  }
  return out.sort((a, b) => b.value.length - a.value.length);
}

/**
 * The text with every key taken out: the app's own secrets by value, then anything shaped like a key in an RPC's or an
 * API's address (`/v2/<key>`, as Alchemy's carries it), in a query (`api_key=`, `key=`, `token=` and their kind), in a
 * connection string's password, or after "Bearer". Pure.
 */
export function redactKeys(text: string, env: Record<string, string | undefined> = typeof process === "undefined" ? {} : process.env): string {
  let out = text;
  for (const s of secretValues(env)) out = out.split(s.value).join(s.becomes);
  return out
    .replace(/(https?:\/\/[^\s"'`<>]+?\/v\d+\/)[A-Za-z0-9_-]{16,}/g, `$1${KEY_MARK}`)
    .replace(/([?&](?:api[_-]?key|apikey|key|token|access[_-]?token|secret|auth|password)=)[^&\s"'`<>]+/gi, `$1${KEY_MARK}`)
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^:\s/"'`<>@]+:)[^@\s"'`<>]+@/gi, `$1${KEY_MARK}@`)
    .replace(/(bearer\s+)[A-Za-z0-9._~+/=-]{12,}/gi, `$1${KEY_MARK}`);
}
