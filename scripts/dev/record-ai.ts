/**
 * Records real model responses into tests/fixtures, so the parsing tests read what the API sent and not what
 * somebody thought it sends. Run by hand when a prompt, a schema, or a model changes:
 *   AI_RECORD_TO=tests/fixtures/anthropic node --import tsx --env-file=.env.local scripts/dev/record-ai.ts
 * The inputs are invented and say nothing about anybody.
 */
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { MODELS } from "@/lib/ai/client";
import { latestDate, longDateWords } from "@/lib/ledger/decide-by";
import { proposeAnswer, proposeNumber, proposeOutcome, scopeMarket, scopeNumber, scopePickOne } from "@/lib/ai/markets";
import { arbitrate, arbitrateAnswer, arbitrateNumber, carefulQuestions } from "@/lib/ai/settler";
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
  const zone = "America/New_York";
  // The furthest a question can run, as the write-up is told it (the second-pass round).
  const latest = { date: latestDate(now, zone), words: longDateWords(latestDate(now, zone)) };
  // `rulings` records the tiebreaker's four calls on Opus 5.5 with this round's instructions (the second-pass round): void
  // unless what is in front of it clearly supports one outcome under the recorded terms. The same scenes as the other modes.
  if (process.argv.includes("rulings")) {
    const riley = "Yes if Riley crosses the finish line of Sunday's half marathon, running or walking. No if Riley drops out or does not start.";
    await arbitrate({ title: "Does Riley finish the half marathon on Sunday?", terms: riley, positions: [{ name: "Sam", percent: 80 }, { name: "Theo", percent: 30 }], updates: [{ name: "Sam", said: "Riley finished in 2:19, I was at the line" }, { name: "Theo", said: "Riley walked the last three miles" }], statements: [{ name: "Sam", said: "The terms say running or walking, so walking counts" }, { name: "Theo", said: "Walking the end is not really finishing the race" }] });
    const shirts = "Gabe puts on as many shirts as he can, one over another, on Friday night. The count is how many are on him at once when he stops or one tears.";
    await arbitrateNumber({ title: "How many shirts can Gabe wear at once?", terms: shirts, unit: { singular: "shirt", plural: "shirts" }, positions: [{ name: "Sam", number: "14" }, { name: "Theo", number: "12" }, { name: "Maya", number: "9" }], updates: [{ name: "Sam", said: "14, then the seam on the fifteenth gave out" }, { name: "Theo", said: "I counted 15 with the torn one" }], statements: [{ name: "Theo", said: "The torn one was on him when he stopped, so it counts" }, { name: "Sam", said: "The terms say on him at once when one tears, so the torn one is out" }] });
    const answers = ["John", "Priya", "Gabe", "Theo", "Nobody"];
    const asleep = "Whoever is first to be asleep on the couch, eyes shut and not answering, once the movie starts on Friday. If everyone makes it to the credits, Nobody.";
    await arbitrateAnswer({ title: "Who falls asleep first?", terms: asleep, answers, positions: [{ name: "Sam", answer: "John" }, { name: "Theo", answer: "Gabe" }, { name: "Maya", answer: "Nobody" }], updates: [{ name: "Sam", said: "John was out twenty minutes in, snoring" }, { name: "Theo", said: "Gabe had his eyes shut before John did" }], statements: [{ name: "Theo", said: "Gabe was not answering when I asked him about the popcorn" }, { name: "Sam", said: "Gabe answered the popcorn question, he was resting his eyes" }] });
    const evidence = [{ by: "Sam", mediaType: "image/jpeg" as const, base64: await scoreboard() }];
    const board = "Yes if Riverside beats Harbor on Saturday by four points or more, on the final score. No otherwise.";
    await arbitrate({ title: "Does Riverside beat Harbor by four or more on Saturday?", terms: board, positions: [{ name: "Sam", percent: 80 }, { name: "Theo", percent: 30 }], updates: [{ name: "Sam", said: "Here is the final board" }, { name: "Theo", said: "It was 21 to 18 after the late free throw" }], statements: [{ name: "Sam", said: "The board says 21 to 17, that is four" }, { name: "Theo", said: "The board was shot before the last free throw went in" }], evidence });
    return;
  }
  // `far` records two questions that cannot be known for decades (the second-pass round): the write-up keeps the real date
  // and offers one nearer version. Saved under their own names; the earlier write-up recordings are kept as they were.
  if (process.argv.includes("far")) {
    const kept = { market: readFileSync(`${dir}/scope-market.json`), pick: readFileSync(`${dir}/scope-pick-one.json`) };
    await scopePickOne({ line: "which country grows its economy the most over the next 30 years", answers: ["India", "Vietnam", "Nigeria", "Indonesia"], now, zone, latest });
    renameSync(`${dir}/scope-pick-one.json`, `${dir}/scope-pick-one-far.json`);
    await scopeMarket({ line: "will people be living on Mars by 2060", now, zone, latest });
    renameSync(`${dir}/scope-market.json`, `${dir}/scope-market-far.json`);
    writeFileSync(`${dir}/scope-market.json`, kept.market);
    writeFileSync(`${dir}/scope-pick-one.json`, kept.pick);
    return;
  }
  // `pickone` records only the pick-one calls (the categorical phase), leaving the earlier recordings as they are.
  if (process.argv.includes("pickone")) {
    const answers = ["John", "Priya", "Gabe", "Theo", "Nobody"];
    await scopePickOne({ line: "who falls asleep first on movie night", answers, now, zone, latest });
    const terms = "Whoever is first to be asleep on the couch, eyes shut and not answering, once the movie starts on Friday. If everyone makes it to the credits, Nobody.";
    await proposeAnswer({ title: "Who falls asleep first?", terms, answers, statements: [{ name: "Sam", said: "John was out twenty minutes in, snoring" }], now });
    await arbitrateAnswer({ title: "Who falls asleep first?", terms, answers, positions: [{ name: "Sam", answer: "John" }, { name: "Theo", answer: "Gabe" }, { name: "Maya", answer: "Nobody" }], updates: [{ name: "Sam", said: "John was out twenty minutes in, snoring" }, { name: "Theo", said: "Gabe had his eyes shut before John did" }], statements: [{ name: "Theo", said: "Gabe was not answering when I asked him about the popcorn" }, { name: "Sam", said: "Gabe answered the popcorn question, he was resting his eyes" }] });
    return;
  }
  // `careful` records careful mode's identity question (docs/decisions.md 2026-09-27): a line naming a bare "Nova", where the
  // model asks what Nova is, then the three questions once told she is a pet. The earlier careful recording is kept as it was.
  if (process.argv.includes("careful")) {
    const kept = readFileSync(`${dir}/careful-questions.json`);
    await carefulQuestions({ line: "does Nova refuse to come inside when it rains this week" });
    renameSync(`${dir}/careful-questions.json`, `${dir}/careful-subject.json`);
    writeFileSync(`${dir}/careful-questions.json`, kept);
    await carefulQuestions({ line: "does Nova refuse to come inside when it rains this week", subject: { name: "Nova", kind: "pet" } });
    return;
  }
  // `outcomes` records the write-up alone, now that it returns the outcomes in the question's own words (3.25).
  if (process.argv.includes("outcomes")) {
    await scopeMarket({ line: "does John fall asleep during the movie on Friday", now, zone, latest });
    return;
  }
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
    await scopeNumber({ line: "how many shirts can Gabe wear at once", now, zone, latest });
    const unit = { singular: "shirt", plural: "shirts" };
    const terms = "Gabe puts on as many shirts as he can, one over another, on Friday night. The count is how many are on him at once when he stops or one tears.";
    await proposeNumber({ title: "How many shirts can Gabe wear at once?", terms, unit, statements: [{ name: "Sam", said: "14, then the seam on the fifteenth gave out" }], now });
    await arbitrateNumber({ title: "How many shirts can Gabe wear at once?", terms, unit, positions: [{ name: "Sam", number: "14" }, { name: "Theo", number: "12" }, { name: "Maya", number: "9" }], updates: [{ name: "Sam", said: "14, then the seam on the fifteenth gave out" }, { name: "Theo", said: "I counted 15 with the torn one" }], statements: [{ name: "Theo", said: "The torn one was on him when he stopped, so it counts" }, { name: "Sam", said: "The terms say on him at once when one tears, so the torn one is out" }] });
    return;
  }
  await scopeMarket({ line: "does Riley finish the half marathon on Sunday", now, zone, latest });
  await proposeOutcome({ title: "Does Riley finish the half marathon on Sunday?", terms: "Yes if Riley crosses the finish line of Sunday's half marathon, running or walking. No if Riley drops out or does not start.", statements: [{ name: "Sam", said: "Riley finished in 2:19, I was at the line" }], now });
  // What a response looks like when the model answers in prose and calls nothing: the case the parser must refuse.
  const prose = await new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).messages.create({ model: MODELS.drafting, max_tokens: 60, messages: [{ role: "user", content: "Say hello in five words." }] });
  writeFileSync(`${dir}/prose-only.json`, JSON.stringify(prose, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
