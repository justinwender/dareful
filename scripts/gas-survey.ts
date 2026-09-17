/**
 * Gas calibration for src/lib/chain/gas.ts. Not a production path.
 *
 * Asks Monad's own eth_estimateGas for each ledger function, signed by seed wallets against state the seed
 * left in Postgres and onchain. Monad's opcode schedule differs from a local EVM (cold storage 8100 per
 * 128-slot page, ecrecover 6000, cold account access 10100), so limits come from here and from
 * RELAYER_LOG_GAS output, never from `forge test --gas-report`.
 *
 *   npx tsx --env-file=.env.local scripts/gas-survey.ts
 */
import { randomUUID } from "node:crypto";
import { keccak256, stringToHex, type Address, type Hex } from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { eq, like } from "drizzle-orm";
import { db, schema } from "../src/db";
import { contracts } from "../src/lib/chain/contracts";
import { relayer } from "../src/lib/chain/relayer";
import { CloseReason, ledgerDomain, ledgerTypes } from "../src/lib/chain/typed-data";

const toHex = (b: Buffer | null): Hex => `0x${(b ?? Buffer.alloc(0)).toString("hex")}` as Hex;
const uuidToBytes16 = (u: string): Hex => `0x${u.replace(/-/g, "")}` as Hex;

async function main(): Promise<void> {
  const { ledger, chainId } = contracts();
  const { publicClient, account: relayerAccount } = relayer();
  const mnemonic = process.env.SEED_MNEMONIC;
  if (!mnemonic) throw new Error("SEED_MNEMONIC is not set");
  const domain = ledgerDomain(chainId, ledger.address);
  const est = new Map<string, bigint>();
  const estimate = (label: string, functionName: "confirm" | "close" | "net" | "createGroup" | "createDenom", args: readonly unknown[]) =>
    publicClient
      .estimateContractGas({ account: relayerAccount, address: ledger.address, abi: ledger.abi, functionName, args } as Parameters<typeof publicClient.estimateContractGas>[0])
      .then((g) => est.set(label, g))
      .catch((e: unknown) => console.log(`${label}: could not estimate (${e instanceof Error ? e.message.split("\n")[0] : String(e)})`));

  // Seed wallets, keyed by lowercase address.
  const seedUsers = await db.select().from(schema.users).where(like(schema.users.dynamicUserId, "seed:%"));
  const wallets = new Map(seedUsers.map((u, i) => [u.ledgerWallet, mnemonicToAccount(mnemonic, { accountIndex: 0, addressIndex: i })]));
  for (const [addr, acct] of wallets) {
    if (acct.address.toLowerCase() !== addr) throw new Error("seed users in Postgres do not match SEED_MNEMONIC derivation order");
  }
  const userWallet = new Map(seedUsers.map((u) => [u.id, u.ledgerWallet]));

  const groups = await db.select().from(schema.groups);
  const denoms = await db.select().from(schema.denominations);
  const obligations = await db.select().from(schema.obligations);

  // confirm + createDenom on the first seeded group with a quantifiable denomination
  for (const g of groups) {
    if (!g.onchainId) continue;
    const groupId = toHex(g.onchainId);
    const denom = denoms.find((d) => d.groupId === g.id && d.quantifiable && d.onchainId);
    const members = await db.select().from(schema.groupMembers).where(eq(schema.groupMembers.groupId, g.id));
    const [m0, m1] = members.map((m) => (m.userId ? userWallet.get(m.userId) : undefined));
    const debtor = m0 ? wallets.get(m0) : undefined;
    const creditorAddr = m1;
    if (!denom || !debtor || !creditorAddr) continue;
    const denomId = toHex(denom.onchainId);
    const obligationId = uuidToBytes16(randomUUID());
    const sig = await debtor.signTypedData({ domain, types: ledgerTypes, primaryType: "Confirm", message: { groupId, denomId, creditor: creditorAddr as Address, qty: 1234n, obligationId, unique: false } });
    await estimate("confirm", "confirm", [groupId, denomId, creditorAddr, 1234n, obligationId, false, sig]);
    await estimate("createDenom", "createDenom", [groupId, keccak256(stringToHex(`survey:${randomUUID()}`)), true]);
    break;
  }

  // close: any seeded obligation still open for its creditor
  for (const o of obligations) {
    const creditorAddr = userWallet.get(o.toUser);
    const creditor = creditorAddr ? wallets.get(creditorAddr) : undefined;
    if (!creditor) continue;
    const obligationId = uuidToBytes16(o.id);
    const ob = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "obligationOf", args: [obligationId] }).catch(() => undefined);
    if (!ob || ob.closed >= ob.minted) continue;
    const bal = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "balanceOf", args: [creditor.address, ob.tokenId] });
    if (bal === 0n) continue;
    const sig = await creditor.signTypedData({ domain, types: ledgerTypes, primaryType: "Close", message: { id: ob.tokenId, qty: 1n, reason: CloseReason.Settled, obligationId, nonce: ob.closes } });
    await estimate("close", "close", [ob.tokenId, 1n, CloseReason.Settled, obligationId, sig]);
    break;
  }

  // net: any seeded pair with reciprocal open edges in the same group and denomination
  const edgeKey = (o: { groupId: string; denomId: string; fromUser: string; toUser: string }) => `${o.groupId}|${o.denomId}|${o.fromUser}|${o.toUser}`;
  const keys = new Set(obligations.map(edgeKey));
  for (const o of obligations) {
    if (!keys.has(`${o.groupId}|${o.denomId}|${o.toUser}|${o.fromUser}`)) continue;
    const g = groups.find((x) => x.id === o.groupId);
    const d = denoms.find((x) => x.id === o.denomId);
    const aAddr = userWallet.get(o.fromUser);
    const bAddr = userWallet.get(o.toUser);
    const a = aAddr ? wallets.get(aAddr) : undefined;
    if (!g?.onchainId || !d?.onchainId || !a || !bAddr) continue;
    const groupId = toHex(g.onchainId);
    const denomId = toHex(d.onchainId);
    const nonce = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "netNonceOf", args: [groupId, denomId, a.address, bAddr as Address] });
    const sig = await a.signTypedData({ domain, types: ledgerTypes, primaryType: "Net", message: { groupId, denomId, a: a.address, b: bAddr as Address, nonce } });
    await estimate("net", "net", [groupId, denomId, a.address, bAddr, sig]);
    if (est.has("net")) break;
  }

  // createGroup with five fresh members (never registered, so the pairing check is cold)
  const fresh = Array.from({ length: 5 }, (_, i) => mnemonicToAccount(mnemonic, { accountIndex: 7, addressIndex: i }));
  const freshGov = Array.from({ length: 5 }, (_, i) => mnemonicToAccount(mnemonic, { accountIndex: 8, addressIndex: i }));
  await estimate("createGroup(5)", "createGroup", [keccak256(stringToHex(`survey:group:${randomUUID()}`)), fresh.map((f, i) => ({ ledger: f.address, governance: (freshGov[i] ?? f).address }))]);
  const two = fresh.slice(0, 2).map((f, i) => ({ ledger: f.address, governance: (freshGov[i] ?? f).address }));
  await estimate("createGroup(2)", "createGroup", [keccak256(stringToHex(`survey:group:${randomUUID()}`)), two]);

  console.log("\n== Monad eth_estimateGas (calibration only; production uses gas.ts) ==");
  for (const [fn, g] of est) console.log(`${fn.padEnd(16)} ${g}`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
