/**
 * The object store: one private Supabase Storage bucket, reached only from the server with the project's
 * secret key over the Storage REST API. No SDK, no anon key, and nothing here is ever reached by the browser:
 * a photo leaves through `/api/media/[id]`, which checks who is asking and answers with a signed URL that
 * expires in a minute (docs/marks-and-memories.md). `SUPABASE_SECRET_KEY` is the modern secret key
 * (`sb_secret_…`), which can be rotated on its own; the legacy `service_role` key cannot and is not read.
 */
export const BUCKET = "media";
const SIGNED_URL_SECONDS = 60;

export class StorageUnavailable extends Error {
  constructor() {
    super("Photos are off: SUPABASE_URL or SUPABASE_SECRET_KEY is not set");
    this.name = "StorageUnavailable";
  }
}

function config(): { url: string; key: string } {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new StorageUnavailable();
  return { url: url.replace(/\/$/, ""), key };
}

/** Whether photos can be stored at all, for a screen that would otherwise offer a camera that leads nowhere. */
export function storageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);
}

function headers(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: key, authorization: `Bearer ${key}`, ...extra };
}

/** Writes one object. A key is written once; a second write to the same key is refused, never overwritten. */
export async function putObject(key: string, bytes: Buffer, contentType: "image/jpeg" | "image/png"): Promise<void> {
  const { url, key: secret } = config();
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${key}`, {
    method: "POST",
    headers: headers(secret, { "content-type": contentType, "x-upsert": "false", "cache-control": "private, max-age=31536000" }),
    body: new Uint8Array(bytes),
  });
  if (!res.ok) throw new Error(`storage put ${key}: ${res.status} ${(await res.text()).slice(0, 200)}`);
}

/** A URL that serves one private object for a minute, and nothing else. Issued only after the caller has checked who is asking. */
export async function signedUrl(key: string, seconds: number = SIGNED_URL_SECONDS): Promise<string> {
  const { url, key: secret } = config();
  const res = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${key}`, {
    method: "POST",
    headers: headers(secret, { "content-type": "application/json" }),
    body: JSON.stringify({ expiresIn: seconds }),
  });
  if (!res.ok) throw new Error(`storage sign ${key}: ${res.status}`);
  const json = (await res.json()) as { signedURL?: string };
  if (!json.signedURL) throw new Error(`storage sign ${key}: no url in the answer`);
  return `${url}/storage/v1${json.signedURL}`;
}

/**
 * Reads one private object, for the server's own use: the tile renderer drawing a sticker mark, and the model
 * reading a screenshot attached to what happened. Never handed to a browser; a person's view goes through the
 * signed URL above.
 */
export async function getObject(key: string): Promise<Buffer> {
  const { url, key: secret } = config();
  const res = await fetch(`${url}/storage/v1/object/authenticated/${BUCKET}/${key}`, { headers: headers(secret) });
  if (!res.ok) throw new Error(`storage get ${key}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Removes objects, for a write that half succeeded. Never called for anything a person can see. */
export async function removeObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const { url, key: secret } = config();
  await fetch(`${url}/storage/v1/object/${BUCKET}`, {
    method: "DELETE",
    headers: headers(secret, { "content-type": "application/json" }),
    body: JSON.stringify({ prefixes: keys }),
  }).catch(() => undefined);
}
