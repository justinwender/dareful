/**
 * Records real model responses into tests/fixtures, so the parsing tests read what the API sent and not what
 * somebody thought it sends. Run by hand when a prompt, a schema, or a model changes:
 *   AI_RECORD_TO=tests/fixtures/anthropic node --import tsx --env-file=.env.local scripts/dev/record-ai.ts
 * The inputs are invented and say nothing about anybody.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, writeFileSync } from "node:fs";
import { MODELS } from "@/lib/ai/client";
import { proposeNumber, proposeOutcome, scopeMarket, scopeNumber } from "@/lib/ai/markets";
import { arbitrate, arbitrateNumber } from "@/lib/ai/settler";
import sharp from "sharp";

/** An invented scoreboard, drawn here: the evidence recordings need an image, and no real screenshot belongs in the repository. */
async function scoreboard(): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#111"/><text x="40" y="120" font-family="Helvetica" font-size="48" fill="#fff">FINAL</text><text x="40" y="220" font-family="Helvetica" font-size="72" fill="#fff">RIVERSIDE 21</text><text x="40" y="310" font-family="Helvetica" font-size="72" fill="#fff">HARBOR 17</text></svg>`;
  return (await sharp(Buffer.from(svg)).jpeg({ quality: 80 }).toBuffer()).toString("base64");
}

async function main(): Promise<void> {
  const dir = process.env.AI_RECORD_TO;
  if (!dir) throw new Error("set AI_RECORD_TO");
  mkdirSync(dir, { recursive: true });
  const now = new Date();
  // `evidence` records only the calls that carry a screenshot (the media phase), leaving the earlier recordings as they are.
  if (process.argv.includes("evidence")) {
    const evidence = [{ by: "Sam", mediaType: "image/jpeg" as const, base64: await scoreboard() }];
    const terms = "Yes if Riverside beats Harbor on Saturday by four points or more, on the final score. No otherwise.";
    await proposeOutcome({ title: "Does Riverside beat Harbor by four or more on Saturday?", terms, statements: [{ name: "Sam", said: "Here is the final board" }], now, evidence });
    await arbitrate({ title: "Does Riverside beat Harbor by four or more on Saturday?", terms, positions: [{ name: "Sam", percent: 80 }, { name: "Theo", percent: 30 }], updates: [{ name: "Sam", said: "Here is the final board" }, { name: "Theo", said: "It was 21 to 18 after the late free throw" }], statements: [{ name: "Sam", said: "The board says 21 to 17, that is four" }, { name: "Theo", said: "The board was shot before the last free throw went in" }], evidence });
    return;
  }
  // `number` records only the number-market calls (Phase 5), leaving the earlier recordings as they are.
  if (process.argv.includes("number")) {
    await scopeNumber({ line: "how many shirts can Gabe wear at once", now });
    const unit = { singular: "shirt", plural: "shirts" };
    const terms = "Gabe puts on as many shirts as he can, one over another, on Friday night. The count is how many are on him at once when he stops or one tears.";
    await proposeNumber({ title: "How many shirts can Gabe wear at once?", terms, unit, statements: [{ name: "Sam", said: "14, then the seam on the fifteenth gave out" }], now });
    await arbitrateNumber({ title: "How many shirts can Gabe wear at once?", terms, unit, positions: [{ name: "Sam", number: "14" }, { name: "Theo", number: "12" }, { name: "Maya", number: "9" }], updates: [{ name: "Sam", said: "14, then the seam on the fifteenth gave out" }, { name: "Theo", said: "I counted 15 with the torn one" }], statements: [{ name: "Theo", said: "The torn one was on him when he stopped, so it counts" }, { name: "Sam", said: "The terms say on him at once when one tears, so the torn one is out" }] });
    return;
  }
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
