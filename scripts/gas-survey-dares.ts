/**
 * Gas calibration for the DarefulDares entries in src/lib/chain/gas.ts. Not a production path.
 *
 * Monad charges the declared limit, its opcode schedule is not a local EVM's, and its receipts report gasUsed
 * equal to the limit, so neither Foundry's gas report nor a receipt can size a limit. This asks Monad's own
 * eth_estimateGas, against real state:
 *
 *   create   estimated for 2 to 6 positions in the largest seeded group, then actually sent (with generous gas)
 *            so that a locked market exists to estimate against;
 *   resolve  estimated on each of those locked markets in its worst case: every score distinct, so every pair
 *            mints an edge, N(N-1)/2 of them, each a first mint for that debtor;
 *            and again for a VOID outcome, which mints nothing.
 *
 * The markets it creates are left locked under ids that exist nowhere offchain. They cost a little testnet gas
 * and nothing else.   npx tsx --env-file=.env.local scripts/gas-survey-dares.ts
 */
import { randomUUID } from "node:crypto";
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { eq, like } from "drizzle-orm";
import { db, schema } from "../src/db";
import { contracts } from "../src/lib/chain/contracts";
import { relayer } from "../src/lib/chain/relayer";
import { daresDomain, daresTypes, Kind, Pace, Stalemate, VOID } from "../src/lib/chain/typed-data";

const toHex = (b: Buffer): Hex => `0x${b.toString("hex")}`;

/** `number` surveys a number market instead (Phase 5): the same struct with Kind.Numeric and a scale, entries as whole numbers. */
const NUMERIC = process.argv.includes("number");

async function main(): Promise<void> {
  const { dares, ledger, chainId } = contracts();
  const { publicClient, walletClient, account: relayerAccount } = relayer();
  const mnemonic = process.env.SEED_MNEMONIC;
  if (!mnemonic) throw new Error("SEED_MNEMONIC is not set");
  const domain = daresDomain(chainId, dares.address);

  const seedUsers = await db.select().from(schema.users).where(like(schema.users.dynamicUserId, "seed:%")).orderBy(schema.users.createdAt);
  const CAST = ["alex", "sam", "jordan", "riley", "casey", "morgan", "taylor"];
  const keys = new Map(
    seedUsers.map((u) => {
      const i = CAST.indexOf(u.dynamicUserId.replace(/^seed:/, ""));
      return [u.id, { ledger: mnemonicToAccount(mnemonic, { accountIndex: 0, addressIndex: i }), governance: mnemonicToAccount(mnemonic, { accountIndex: 1, addressIndex: i }), row: u }] as const;
    }),
  );
  for (const k of keys.values()) if (k.ledger.address.toLowerCase() !== k.row.ledgerWallet) throw new Error("seed users do not match SEED_MNEMONIC");

  // The largest onchain seed group with a quantifiable registered unit.
  const groups = await db.select().from(schema.groups);
  let best: { groupId: Hex; denomId: Hex; members: string[] } | null = null;
  for (const g of groups) {
    if (!g.onchainId || g.isDyad) continue;
    const [denom] = (await db.select().from(schema.denominations).where(eq(schema.denominations.groupId, g.id))).filter((d) => d.onchainId && d.quantifiable);
    const members = (await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, g.id))).map((m) => m.userId).filter((id): id is string => Boolean(id) && keys.has(id as string));
    if (denom?.onchainId && members.length > (best?.members.length ?? 0)) best = { groupId: toHex(g.onchainId), denomId: toHex(denom.onchainId), members };
  }
  if (!best) throw new Error("no onchain seed group; run the seed first");
  const quorum = (await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "governanceOf", args: [best.groupId] })) as readonly Address[];
  console.log(`group with ${best.members.length} seed members, quorum of ${quorum.length}, threshold ${Math.floor(quorum.length / 2) + 1}\n`);

  const rows: Array<{ n: number; create: bigint; resolve: bigint | null; resolveVoid: bigint | null; edges: number }> = [];
  // A number survey sends two markets, the smallest and the largest, which is enough for the per-position slope.
  const sizes = NUMERIC ? [2, Math.min(6, best.members.length)] : Array.from({ length: Math.min(6, best.members.length) - 1 }, (_, i) => i + 2);
  for (const n of sizes) {
    const people = best.members.slice(0, n).map((id) => keys.get(id)!);
    const creator = people[0]!;
    const dareId = keccak256(stringToHex(`dareful:gas-survey:${randomUUID()}`));
    const resolvesBy = BigInt(Math.floor(Date.now() / 1000) + 3600);
    const create = { dareId, groupId: best.groupId, kind: NUMERIC ? Kind.Numeric : Kind.Binary, pace: Pace.Dare, termsHash: keccak256(stringToHex("gas survey")), denomId: best.denomId, range: NUMERIC ? 20n : 0n, options: 0, stalemate: Stalemate.Arbitrate, resolvesBy };
    const creatorSig = await creator.ledger.signTypedData({ domain, types: daresTypes, primaryType: "Create", message: create });
    // Distinct probabilities and distinct, large stakes: every pair differs, so every pair mints.
    // Distinct numbers on a scale of 20 (every score distinct, so every pair mints), or distinct probabilities.
    const positions = people.map((p, i) => ({ ledger: p.ledger.address, stake: BigInt(5000 + 1000 * i), value: NUMERIC ? BigInt(10 + 3 * i) : BigInt(Math.round((10000 * (i + 1)) / (n + 1))), confidenceBps: 0 }));
    const sigs = await Promise.all(people.map((p, i) => p.ledger.signTypedData({ domain, types: daresTypes, primaryType: "Enter", message: { dareId, stake: positions[i]!.stake, value: positions[i]!.value, confidenceBps: 0, stalemate: Stalemate.Arbitrate } })));
    const struct = { id: dareId, groupId: best.groupId, kind: create.kind, pace: Pace.Dare, creator: creator.ledger.address, termsHash: create.termsHash, denomId: best.denomId, range: create.range, options: 0, stalemate: Stalemate.Arbitrate, quorum: [] as Address[], threshold: 0, resolvesBy, status: 0, outcome: 0n };
    const args = [struct, positions, sigs, creatorSig] as const;

    const createGas = await publicClient.estimateContractGas({ account: relayerAccount, address: dares.address, abi: dares.abi, functionName: "create", args });
    const hash = await walletClient.writeContract({ account: relayerAccount, chain: walletClient.chain, address: dares.address, abi: dares.abi, functionName: "create", args, gas: createGas * 2n });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`create with ${n} positions reverted at twice its estimate`);

    const threshold = Math.floor(quorum.length / 2) + 1;
    const voters = [...keys.values()].filter((k) => quorum.map((q) => q.toLowerCase()).includes(k.governance.address.toLowerCase())).slice(0, threshold);
    const voteSigs = (outcome: bigint) => Promise.all(voters.map((v) => v.governance.signTypedData({ domain, types: daresTypes, primaryType: "Vote", message: { dareId, outcome } })));
    const est = async (outcome: bigint) =>
      publicClient.estimateContractGas({ account: relayerAccount, address: dares.address, abi: dares.abi, functionName: "resolve", args: [dareId, outcome, await voteSigs(outcome)] }).catch((e: unknown) => {
        console.log(`  resolve(${outcome === VOID ? "VOID" : outcome}) with ${n}: could not estimate (${e instanceof Error ? e.message.split("\n")[0] : e})`);
        return null;
      });
    // A number market resolves at 10: every entry a different distance from it.
    rows.push({ n, create: createGas, resolve: await est(NUMERIC ? 10n : 1n), resolveVoid: await est(VOID), edges: (n * (n - 1)) / 2 });
    console.log(`n=${n}  create ${createGas}   resolve(yes, ${(n * (n - 1)) / 2} edges, ${threshold} votes) ${rows.at(-1)!.resolve}   resolve(VOID) ${rows.at(-1)!.resolveVoid}`);
  }

  // Least-squares-free fit: per-position and per-edge increments from the ends of the range.
  const first = rows[0]!;
  const last = rows.at(-1)!;
  const perPosition = (last.create - first.create) / BigInt(last.n - first.n);
  const createBase = first.create - perPosition * BigInt(first.n);
  console.log(`\ncreate  ~ ${createBase} + ${perPosition} per position (quorum of ${quorum.length} included in the base)`);
  if (first.resolve && last.resolve) {
    const perEdge = (last.resolve - first.resolve) / BigInt(last.edges - first.edges);
    console.log(`resolve ~ ${first.resolve - perEdge * BigInt(first.edges)} + ${perEdge} per edge (threshold votes included in the base)`);
  }
  await db.$client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
