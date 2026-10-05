/**
 * The one place a model is called. Server-only. Every function in this directory takes and returns typed,
 * Zod-validated data; no prompt lives in a component and no model output is trusted unparsed.
 *
 * A model is a suggestion engine here and nothing else. It drafts terms the creator approves, proposes an
 * anchor people argue with, and proposes an outcome a quorum can overrule. It never signs, never votes, and
 * has no onchain effect, so every caller must work, with a plainer result, when this throws or times out.
 */
import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";
import { timed } from "@/lib/timing";

/**
 * Which model does what (the first-contact round, 2026-10-04): Haiku 4.5 drafts and reads (the write-up, its date,
 * the questions under Help define the terms); Sonnet 5.5 weighs what people decide by (the argument's triage, the
 * outcome proposals, the tiebreaker's ruling) and writes the final terms under Help define the terms. Nothing
 * calls Fable. Both overridable. A Haiku answer that fails its shape or runs out of time is asked once more of
 * Sonnet, and that is counted (`model_escalated`).
 */
export const MODELS = {
  ruling: process.env.AI_MODEL_RULING || "claude-sonnet-5-5",
  drafting: process.env.AI_MODEL_DRAFTING || "claude-haiku-4-5-20251001",
} as const;

/** Why a drafting answer is asked again of the ruling model: it failed its shape, or it ran out of time. Anything else (an outage, a refusal) is not a reason. Pure, so it has a test. */
export function escalationWhy(err: unknown): "invalid" | "timeout" | null {
  if (err instanceof Error && err.name === "ZodError") return "invalid";
  if (err instanceof Error && /did not answer|ran out of room/.test(err.message)) return "invalid";
  if (err instanceof Error && /timed? ?out|Timeout/i.test(`${err.name} ${err.message}`)) return "timeout";
  return null;
}

/** Which task a call is, for the count: a write-up, Help define's questions, or anything else. */
export function taskOf(label: string): "write_up" | "careful" | "other" {
  if (label.startsWith("scope")) return "write_up";
  if (label.startsWith("careful")) return "careful";
  return "other";
}

/** Models that refused a forced tool choice in this process: asked plainly from then on, so the refusal is paid for once and not on every call. */
const asksPlainly = new Set<string>();

/** Whether a call opens by forcing the tool: every model does until it has refused once. Pure but for the set it reads. */
export function forcesTool(model: string, refused: ReadonlySet<string> = asksPlainly): boolean {
  return !refused.has(model);
}

/**
 * What each answer cost, for a script that compares routings (scripts/dev/compare-models.ts) and nothing else: the
 * app never reads it, and usage is never stored (the first-contact round).
 */
export const usageTap: { fn: ((u: { label: string; model: string; input: number; output: number; ms: number }) => void) | null } = { fn: null };

/** Whether this process may call the live API: never under the test runner, which sets `NODE_TEST_CONTEXT` for every test file and so for the mutation audit too. Pure but for the environment it is given. */
export function liveCallsAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return !env.NODE_TEST_CONTEXT && env.DAREFUL_NO_LIVE_AI !== "1";
}

let client: Anthropic | undefined;
function anthropic(): Anthropic {
  if (typeof window !== "undefined") throw new Error("model calls are server-only");
  // No test and no audit ever reaches the live API (the first-contact round): they run on recorded answers.
  if (!liveCallsAllowed()) throw new Error("live model calls are off under the test runner");
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  client ??= new Anthropic({ apiKey, maxRetries: 1 });
  return client;
}

/**
 * One structured answer. The model is asked to call a single tool whose input is the answer, and that input is
 * then parsed with the caller's Zod schema: a shape the model invented, or no tool call at all, throws and never
 * reaches the caller.
 */
type StructuredRequest<T> = { label: string; model: string; system: string; user: string; toolName: string; toolDescription: string; inputSchema: Record<string, unknown>; shape: z.ZodType<T>; timeoutMs: number; maxTokens?: number; /** Screenshots attached to what happened, each labelled with who supplied it (`evidenceBlocks`). */ images?: EvidenceImage[]; /** Each piece of the answer's JSON as the model writes it (docs/design.md 9.8): given, the call streams; the parse at the end is the same. */ onDelta?: (partialJson: string) => void; /** The streamed answer starts over: a drafting answer failed and the ruling model is asked. */ onReset?: () => void; /** What a drafting answer must also have to stand (a write-up's date): without it the ruling model is asked once, and its answer stands either way. */ accept?: (value: T) => boolean };

export async function structured<T>(req: StructuredRequest<T>): Promise<T> {
  return withEscalation(req, (model) => structuredOnce(req, model));
}

/** Says an escalation happened: a warning in the log and a usage event, never the question. */
function noteEscalation(label: string, why: "invalid" | "timeout", err?: unknown): void {
  console.warn("a drafting answer was asked again of the ruling model", { label, why, err: err instanceof Error ? err.message : err });
  void import("@/lib/usage").then(({ record }) => record("model_escalated", { task: taskOf(label), why })).catch(() => undefined);
}

/**
 * A drafting call and its one escalation (the first-contact round, 2026-10-04): an answer that fails its shape or its
 * time, or parses but falls short where the quick model falls short (`accept`: a write-up with no date, 2 of 42 in the
 * comparison), is asked once of the ruling model, whose answer stands either way. `once` makes the call on a model;
 * passed in so the rule is tested without the API and without recording anything.
 */
export async function withEscalation<T>(req: Pick<StructuredRequest<T>, "label" | "model" | "onReset" | "accept">, once: (model: string) => Promise<T>, note: typeof noteEscalation = noteEscalation): Promise<T> {
  const escalates = req.model === MODELS.drafting && MODELS.drafting !== MODELS.ruling;
  const again = (why: "invalid" | "timeout", err?: unknown) => {
    note(req.label, why, err);
    req.onReset?.();
    return once(MODELS.ruling);
  };
  let value: T;
  try {
    value = await once(req.model);
  } catch (err) {
    const why = escalationWhy(err);
    if (!escalates || why === null) throw err;
    return again(why, err);
  }
  if (escalates && req.accept && !req.accept(value)) return again("invalid");
  return value;
}

async function structuredOnce<T>(req: StructuredRequest<T>, model: string): Promise<T> {
  if (req.onDelta) return structuredStream({ ...req, model }, req.onDelta);
  const content = req.images && req.images.length > 0 ? [{ type: "text" as const, text: req.user }, ...evidenceBlocks(req.images)] : req.user;
  const ask = (forced: boolean) =>
    anthropic().messages.create(
      {
        model,
        max_tokens: req.maxTokens ?? 900,
        system: forced ? req.system : `${req.system}\n\nAnswer by calling the ${req.toolName} tool exactly once, and write nothing else.`,
        messages: [{ role: "user", content }],
        tools: [{ name: req.toolName, description: req.toolDescription, input_schema: { type: "object", ...req.inputSchema } }],
        tool_choice: forced ? { type: "tool", name: req.toolName } : { type: "auto" },
      },
      // A drafting call that times out goes to the ruling model at once rather than waiting out a second try of its own.
      { timeout: req.timeoutMs, ...(model === MODELS.drafting ? { maxRetries: 0 } : {}) },
    );
  const started = Date.now();
  const res = await timed(`ai ${req.label}`, async () => {
    if (!forcesTool(model)) return ask(false);
    try {
      return await ask(true);
    } catch (err) {
      // Some models refuse a forced tool choice. They are asked instead; the parse below enforces the shape.
      if (err instanceof Anthropic.BadRequestError && /tool_choice/.test(err.message)) {
        asksPlainly.add(model);
        return ask(false);
      }
      throw err;
    }
  });
  usageTap.fn?.({ label: req.label, model, input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0, ms: Date.now() - started });
  if (process.env.AI_RECORD_TO) (await import("node:fs")).writeFileSync(`${process.env.AI_RECORD_TO}/${req.label.replace(/\s+/g, "-")}.json`, JSON.stringify(res, null, 2));
  // An answer cut off by the token limit is a tool call with fields missing. Say that, rather than a parse error.
  if (res.stop_reason === "max_tokens") throw new Error(`the model ran out of room before finishing (${req.label})`);
  return answerFrom(res, req.toolName, req.shape, req.label);
}

/**
 * The same structured answer, streamed: the tool's input arrives as pieces of JSON, each handed to `onDelta` as it
 * is written, so the terms step can show the words at the pace they arrive (9.8); the final message is parsed
 * exactly as an unstreamed one, and a shape the model invented still throws.
 */
async function structuredStream<T>(req: { label: string; model: string; system: string; user: string; toolName: string; toolDescription: string; inputSchema: Record<string, unknown>; shape: z.ZodType<T>; timeoutMs: number; maxTokens?: number }, onDelta: (partialJson: string) => void): Promise<T> {
  // A model that refuses a forced tool choice (Sonnet 5.5, the pricing page lists none for it) is asked plainly, as the unstreamed path does (the first-contact round).
  const ask = async (forced: boolean) => {
    const stream = anthropic().messages.stream(
      {
        model: req.model,
        max_tokens: req.maxTokens ?? 900,
        system: forced ? req.system : `${req.system}\n\nAnswer by calling the ${req.toolName} tool exactly once, and write nothing else.`,
        messages: [{ role: "user", content: req.user }],
        tools: [{ name: req.toolName, description: req.toolDescription, input_schema: { type: "object", ...req.inputSchema } }],
        tool_choice: forced ? { type: "tool", name: req.toolName } : { type: "auto" },
      },
      { timeout: req.timeoutMs, ...(req.model === MODELS.drafting ? { maxRetries: 0 } : {}) },
    );
    for await (const event of stream) {
      if (event.type === "content_block_delta" && event.delta.type === "input_json_delta") onDelta(event.delta.partial_json);
    }
    return stream.finalMessage();
  };
  const started = Date.now();
  const res = await timed(`ai ${req.label} (streamed)`, async () => {
    if (!forcesTool(req.model)) return ask(false);
    try {
      return await ask(true);
    } catch (err) {
      if (err instanceof Anthropic.BadRequestError && /tool_choice/.test(err.message)) {
        asksPlainly.add(req.model);
        return ask(false);
      }
      throw err;
    }
  });
  usageTap.fn?.({ label: req.label, model: req.model, input: res.usage?.input_tokens ?? 0, output: res.usage?.output_tokens ?? 0, ms: Date.now() - started });
  if (res.stop_reason === "max_tokens") throw new Error(`the model ran out of room before finishing (${req.label})`);
  return answerFrom(res, req.toolName, req.shape, req.label);
}

export type EvidenceImage = { /** Who attached it, as a first name: the label the model reads it under. */ by: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif"; base64: string };
export type EvidenceBlock = { type: "text"; text: string } | { type: "image"; source: { type: "base64"; media_type: EvidenceImage["mediaType"]; data: string } };

/**
 * A screenshot attached to what happened, as the model receives it: inside a tag that names who supplied it, so
 * it is read as that person's claim and never as a bare fact (PLANNING.md open question 14; docs/decisions.md,
 * the media phase). The tag's name is cleaned the way every other name in a prompt is. Pure, so the shape has
 * a test: an image never travels without its supplier.
 */
export function evidenceBlocks(images: readonly EvidenceImage[]): EvidenceBlock[] {
  const clean = (s: string) => s.replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 40) || "Someone";
  return images.flatMap((img): EvidenceBlock[] => [
    { type: "text", text: `<screenshot by="${clean(img.by)}">` },
    { type: "image", source: { type: "base64", media_type: img.mediaType, data: img.base64 } },
    { type: "text", text: "</screenshot>" },
  ]);
}

/**
 * The answer inside a response, or a throw. Separate from the call so it can be run against responses recorded
 * from the API (tests/fixtures/anthropic-*.json) and not against a shape somebody imagined.
 */
export function answerFrom<T>(res: { content: ReadonlyArray<{ type: string; name?: string; input?: unknown }> }, toolName: string, shape: z.ZodType<T>, label: string): T {
  const block = res.content.find((b) => b.type === "tool_use" && b.name === toolName);
  if (!block) throw new Error(`the model did not answer (${label})`);
  return shape.parse(block.input);
}
