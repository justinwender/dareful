/**
 * The terms being written, on the client (docs/design.md 9.8): the write-up route streams the model's answer as
 * pieces of JSON, and the step shows each value's words as they arrive, at the pace they arrive. `partialValues`
 * reads the title and the terms out of the JSON written so far, unfinished string and all; the stream helper
 * turns the route's lines into those readings and ends with the same result the server action returns. Pure
 * parsing, so a half-written answer has a test.
 */
export type PartialWriteUp = { title: string | null; terms: string | null };

/** A JSON string's contents so far, escapes undone, up to its closing quote or the end of what has arrived. */
function partialString(json: string, key: string): string | null {
  const at = json.indexOf(`"${key}"`);
  if (at === -1) return null;
  const colon = json.indexOf(":", at + key.length + 2);
  if (colon === -1) return null;
  const open = json.indexOf('"', colon + 1);
  if (open === -1) return null;
  let out = "";
  for (let i = open + 1; i < json.length; i++) {
    const c = json[i] as string;
    if (c === "\\") {
      const n = json[i + 1];
      if (n === undefined) break;
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === "u") {
        const hex = json.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else out += n;
      i++;
      continue;
    }
    if (c === '"') return out;
    out += c;
  }
  return out;
}

export function partialValues(json: string): PartialWriteUp {
  return { title: partialString(json, "title"), terms: partialString(json, "terms") };
}

export type WriteUpBody = { line: string; criterion?: string; answers?: Array<{ question: string; yes: boolean }>; kind?: "binary" | "numeric" | "categorical"; choices?: string[] };

/**
 * Read the route's stream. `onPartial` is called with each new reading; the promise resolves with the final
 * result (the same shape as `scopeMarketAction`), and rejects when the stream cannot be read at all, so the
 * caller can fall back to the action.
 */
export async function streamWriteUp<T>(body: WriteUpBody, onPartial: (p: PartialWriteUp) => void, signal?: AbortSignal): Promise<T> {
  const res = await fetch("/api/m/write-up", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!res.ok || !res.body) throw new Error(`the write-up route answered ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let json = "";
  let done: T | undefined;
  for (;;) {
    const { value, done: ended } = await reader.read();
    if (ended) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      if (!line.trim()) continue;
      const o = JSON.parse(line) as { t?: string; done?: T };
      if (typeof o.t === "string") {
        json += o.t;
        onPartial(partialValues(json));
      }
      if (o.done !== undefined) done = o.done;
    }
  }
  if (done === undefined) throw new Error("the write-up stream ended without a result");
  return done;
}
