/**
 * Dev tooling: move a market through its life with seed wallets instead of Dynamic embedded wallets, through the
 * same server functions the screens call (signature checks, lock, vote relay, settlement mirror). Seed users only.
 *
 *   npx tsx --env-file=.env.local scripts/dev/market-as-seed.ts <marketId> open <name> <percent> <stake>
 *   ...                                                              enter <name> <percent> <stake>
 *   ...                                                              lock
 *   ...                                                              vote <name> yes|no|void
 */
import { eq, like } from "drizzle-orm";
import { mnemonicToAccount } from "viem/accounts";
import { db, schema } from "../../src/db";
import * as markets from "../../src/lib/ledger/markets";

const CAST = ["alex", "sam", "jordan", "riley", "casey", "morgan", "taylor"];

async function main(): Promise<void> {
  const [id, step, name, a, b] = process.argv.slice(2);
  const mnemonic = process.env.SEED_MNEMONIC;
  if (!mnemonic || !id || !step) throw new Error("usage: <marketId> open|enter|lock|vote ...");
  const d = await markets.marketById(id);
  if (!d) throw new Error("no such market");
  const seed = await db.select().from(schema.users).where(like(schema.users.dynamicUserId, "seed:%"));
  const who = (n: string) => {
    const i = CAST.indexOf(n.toLowerCase());
    const user = seed.find((u) => u.dynamicUserId === `seed:${n.toLowerCase()}`);
    if (i < 0 || !user) throw new Error(`${n} is not a seed user`);
    return { user, ledger: mnemonicToAccount(mnemonic, { accountIndex: 0, addressIndex: i }), governance: mnemonicToAccount(mnemonic, { accountIndex: 1, addressIndex: i }) };
  };

  if (step === "open" || step === "enter") {
    const p = who(name ?? "");
    const stake = BigInt(b ?? "1000");
    const valueBps = BigInt(Math.round(Number(a ?? "50") * 100));
    if (step === "open") await markets.openMarket(d.id, p.user.id, await p.ledger.signTypedData(markets.createTypedData(d)));
    const fresh = (await markets.marketById(d.id)) as markets.DareRow;
    await markets.enterMarket({ dareId: d.id, userId: p.user.id, stake, valueBps, signature: await p.ledger.signTypedData(markets.enterTypedData(fresh, stake, valueBps)) });
    console.log(`${p.user.displayName} is in at ${a}% with ${stake}`);
  } else if (step === "lock") {
    const [creator] = await db.select().from(schema.users).where(eq(schema.users.id, d.creatorId));
    console.log(await markets.lockMarket(d.id, (creator as typeof schema.users.$inferSelect).id));
  } else if (step === "vote") {
    const p = who(name ?? "");
    const outcome = a === "yes" ? 1n : a === "no" ? 0n : markets.VOID_OUTCOME;
    console.log(await markets.castVote({ dareId: d.id, userId: p.user.id, outcome, signature: await p.governance.signTypedData(markets.voteTypedData(d, outcome)) }));
  } else throw new Error(`unknown step ${step}`);
  await db.$client.end();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
