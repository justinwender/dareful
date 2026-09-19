/**
 * Records real model responses into tests/fixtures, so the parsing tests read what the API sent and not what
 * somebody thought it sends. Run by hand when a prompt, a schema, or a model changes:
 *   AI_RECORD_TO=tests/fixtures/anthropic node --import tsx --env-file=.env.local scripts/dev/record-ai.ts
 * The inputs are invented and say nothing about anybody.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { MODELS } from "@/lib/ai/client";
import { proposeOutcome, scopeMarket } from "@/lib/ai/markets";

async function main(): Promise<void> {
  const dir = process.env.AI_RECORD_TO;
  if (!dir) throw new Error("set AI_RECORD_TO");
  mkdirSync(dir, { recursive: true });
  const now = new Date();
  await scopeMarket({ line: "does Riley finish the half marathon on Sunday", now });
  await proposeOutcome({ title: "Does Riley finish the half marathon on Sunday?", terms: "Yes if Riley crosses the finish line of Sunday's half marathon, running or walking. No if Riley drops out or does not start.", statements: [{ name: "Sam", said: "Riley finished in 2:19, I was at the line" }], now });
  // What a response looks like when the model answers in prose and calls nothing: the case the parser must refuse.
  const prose = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({ model: MODELS.drafting, max_tokens: 60, messages: [{ role: "user", content: "Say hello in five words." }] });
  writeFileSync(`${dir}/prose-only.json`, JSON.stringify(prose, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
