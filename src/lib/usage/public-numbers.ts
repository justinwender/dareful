/**
 * The public numbers (the submission round, section 2): what the README's image says, read from the app as it runs, so
 * the numbers keep counting through judging without a commit. They are /stats's own, by its definitions: counted
 * accounts and counted guests apart, the questions played (someone besides the asker got in) with how they stand, and
 * the sets of people that came back for a second question (the ops round, section 6, which took questions asked off the
 * picture), all since launch, and the chain's counts for real use only, with every excluded account and guest left out.
 * Aggregates only: nothing here names anyone.
 */
import { onchainCounts } from "@/lib/ledger/envio";
import { redactKeys } from "@/lib/redact";
import { countedOnchain, publicCounts, windowFor, type PublicCounts } from "./stats";
import { SECTION_LIMIT_MS, within } from "./within";

export type ChainNumbers = { obligations: number; questions: number; people: number; sets: number };
export type PublicNumbers = PublicCounts & {
  /** The chain's counts for real use, or null when the indexer could not be read in time. */
  chain: ChainNumbers | null;
  /** When the numbers were read, as an ISO string (it travels through the cache as text). */
  at: string;
};

/**
 * Every number the image draws, read now. The database's numbers are the image: if they cannot be read this throws, so a
 * failure is never kept for five minutes. The chain's counts are read from the indexer within the time /stats gives
 * them, and a read that fails leaves them out of this one picture.
 */
export async function publicNumbers(now = new Date()): Promise<PublicNumbers> {
  const four = await publicCounts(windowFor("launch", now));
  let chain: ChainNumbers | null = null;
  try {
    const counted = await countedOnchain();
    const c = await within(SECTION_LIMIT_MS.chain, onchainCounts(counted, counted.questionGroups));
    chain = { obligations: c.obligations, questions: c.questions, people: c.people, sets: c.sets };
  } catch (err) {
    console.error("the public numbers' chain counts could not be read", { why: redactKeys(err instanceof Error ? err.message.split("\n")[0] : String(err)) });
  }
  return { ...four, chain, at: now.toISOString() };
}
