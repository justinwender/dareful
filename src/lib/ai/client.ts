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

/** Judgment (rulings a quorum reads) gets the most capable model; drafting gets a faster one. Both overridable. */
export const MODELS = {
  ruling: process.env.AI_MODEL_RULING || "claude-fable-5-1",
  drafting: process.env.AI_MODEL_DRAFTING || "claude-sonnet-5",
} as const;

let client: Anthropic | undefined;
function anthropic(): Anthropic {
  if (typeof window !== "undefined") throw new Error("model calls are server-only");
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
export async function structured<T>(req: { label: string; model: string; system: string; user: string; toolName: string; toolDescription: string; inputSchema: Record<string, unknown>; shape: z.ZodType<T>; timeoutMs: number; maxTokens?: number }): Promise<T> {
  const ask = (forced: boolean) =>
    anthropic().messages.create(
      {
        model: req.model,
        max_tokens: req.maxTokens ?? 900,
        system: forced ? req.system : `${req.system}\n\nAnswer by calling the ${req.toolName} tool exactly once, and write nothing else.`,
        messages: [{ role: "user", content: req.user }],
        tools: [{ name: req.toolName, description: req.toolDescription, input_schema: { type: "object", ...req.inputSchema } }],
        tool_choice: forced ? { type: "tool", name: req.toolName } : { type: "auto" },
      },
      { timeout: req.timeoutMs },
    );
  const res = await timed(`ai ${req.label}`, async () => {
    try {
      return await ask(true);
    } catch (err) {
      // Some models refuse a forced tool choice. They are asked instead; the parse below enforces the shape.
      if (err instanceof Anthropic.BadRequestError && /tool_choice/.test(err.message)) return ask(false);
      throw err;
    }
  });
  if (process.env.AI_RECORD_TO) (await import("node:fs")).writeFileSync(`${process.env.AI_RECORD_TO}/${req.label.replace(/\s+/g, "-")}.json`, JSON.stringify(res, null, 2));
  // An answer cut off by the token limit is a tool call with fields missing. Say that, rather than a parse error.
  if (res.stop_reason === "max_tokens") throw new Error(`the model ran out of room before finishing (${req.label})`);
  return answerFrom(res, req.toolName, req.shape, req.label);
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
