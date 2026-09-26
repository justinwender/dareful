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
export async function structured<T>(req: { label: string; model: string; system: string; user: string; toolName: string; toolDescription: string; inputSchema: Record<string, unknown>; shape: z.ZodType<T>; timeoutMs: number; maxTokens?: number; /** Screenshots attached to what happened, each labelled with who supplied it (`evidenceBlocks`). */ images?: EvidenceImage[] }): Promise<T> {
  const content = req.images && req.images.length > 0 ? [{ type: "text" as const, text: req.user }, ...evidenceBlocks(req.images)] : req.user;
  const ask = (forced: boolean) =>
    anthropic().messages.create(
      {
        model: req.model,
        max_tokens: req.maxTokens ?? 900,
        system: forced ? req.system : `${req.system}\n\nAnswer by calling the ${req.toolName} tool exactly once, and write nothing else.`,
        messages: [{ role: "user", content }],
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
