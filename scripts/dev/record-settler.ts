/**
 * Records real settler responses into tests/fixtures/anthropic, like record-ai.ts. Run by hand when a settler
 * prompt, schema, or model changes:
 *   AI_RECORD_TO=tests/fixtures/anthropic node --import tsx --env-file=.env.local scripts/dev/record-settler.ts
 * The inputs are invented and say nothing about anybody.
 */
import { mkdirSync, renameSync } from "node:fs";
import { arbitrate, carefulQuestions, ruleClaim, triage } from "@/lib/ai/settler";

async function main(): Promise<void> {
  const dir = process.env.AI_RECORD_TO;
  if (!dir) throw new Error("set AI_RECORD_TO");
  mkdirSync(dir, { recursive: true });
  const keep = (as: string) => renameSync(`${dir}/triage-argument.json`, `${dir}/${as}.json`);
  await triage({ line: "The 2011 NBA finals went seven games" });
  keep("triage-checkable");
  await triage({ line: "Hitting a major league fastball is harder than returning a 130mph serve" });
  keep("triage-contestable");
  await triage({ line: "I was wrong to text her back after what she said" });
  keep("triage-interpersonal");
  await ruleClaim({ title: "Did the 2011 NBA finals go seven games?", terms: "Yes if the 2011 NBA finals series lasted seven games. No if it ended in fewer.", criterion: null });
  await carefulQuestions({ line: "Riley finishes the marathon in under four hours in November" });
  await arbitrate({
    title: "Does Riley finish the half marathon on Sunday?",
    terms: "Yes if Riley crosses the finish line of Sunday's half marathon, running or walking. No if Riley drops out or does not start.",
    positions: [{ name: "Sam", percent: 80 }, { name: "Alex", percent: 20 }],
    updates: [{ name: "Sam", said: "Riley crossed the line at 2:19, I was there" }],
    statements: [{ name: "Alex", said: "Riley walked the last three miles, that is not finishing a run" }, { name: "Sam", said: "The terms say running or walking" }],
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
