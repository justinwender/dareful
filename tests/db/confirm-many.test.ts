/**
 * The ConfirmMany typed data, checked against the deployed ledger with a read-only eth_call: nothing is sent
 * and nothing is spent. The seed never calls confirmMany, and Foundry builds its digest with its own hashing,
 * so this is the only place the app's typed data meets the contract's. Each acceptance is paired with a
 * tampered control, so a pass cannot mean "the call never reverts".
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { mnemonicToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { relayer } from "@/lib/chain/relayer";
import { ledgerDomain, ledgerTypes } from "@/lib/chain/typed-data";
import * as claims from "@/lib/ledger/claims";
import { bufferToHex, uuidToBytes16 } from "@/lib/ledger/ids";
import { CONFIRM_MANY_MAX, confirmManyTypedData, loadConfirmBatch } from "@/lib/ledger/proposals";
import { cleanup, cover, ghost, tempUser } from "./fixture";

const CAST = ["alex", "sam", "jordan", "riley", "casey", "morgan", "taylor"];
type Message = { groupIds: Hex[]; denomIds: Hex[]; creditors: Address[]; qtys: bigint[]; obligationIds: Hex[]; uniques: boolean[] };
let message: Message;
let signature: Hex;
let signer: ReturnType<typeof mnemonicToAccount>;

before(async () => {
  const mnemonic = process.env.SEED_MNEMONIC;
  if (!mnemonic) throw new Error("SEED_MNEMONIC is not set");
  const rows = await db.execute<{ group_id: string; g_on: Buffer; d_on: Buffer }>(sql`
    select d.group_id, g.onchain_id as g_on, d.onchain_id as d_on
    from denominations d join groups g on g.id = d.group_id
    where d.onchain_id is not null and g.onchain_id is not null and not g.is_dyad and d.quantifiable
    order by g.created_at asc limit 1`);
  const oc = Array.from(rows)[0];
  if (!oc) throw new Error("no onchain seed group with a registered unit; run the seed first");
  const members = await db.select({ u: schema.users }).from(schema.groupMembers).innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id)).where(eq(schema.groupMembers.groupId, oc.group_id));
  const [debtor, k1, k2] = members.map((m) => m.u).filter((u) => u.dynamicUserId.startsWith("seed:"));
  if (!debtor || !k1 || !k2) throw new Error("need three seed members in the onchain group");
  signer = mnemonicToAccount(mnemonic, { accountIndex: 0, addressIndex: CAST.indexOf(debtor.dynamicUserId.replace(/^seed:/, "")) });
  if (signer.address.toLowerCase() !== debtor.ledgerWallet) throw new Error("seed wallet does not match the user");
  message = {
    groupIds: [bufferToHex(oc.g_on), bufferToHex(oc.g_on), bufferToHex(oc.g_on)],
    denomIds: [bufferToHex(oc.d_on), bufferToHex(oc.d_on), bufferToHex(oc.d_on)],
    creditors: [k1.ledgerWallet, k2.ledgerWallet, k1.ledgerWallet] as Address[],
    qtys: [3n, 1n, 7n],
    obligationIds: [uuidToBytes16(randomUUID()), uuidToBytes16(randomUUID()), uuidToBytes16(randomUUID())],
    uniques: [false, false, false],
  };
  const { chainId, ledger } = contracts();
  signature = await signer.signTypedData({ domain: ledgerDomain(chainId, ledger.address), types: ledgerTypes, primaryType: "ConfirmMany", message });
});
after(cleanup);

function simulate(m: Message, sig: Hex = signature) {
  const { ledger } = contracts();
  const { publicClient, account } = relayer();
  return publicClient.simulateContract({ address: ledger.address, abi: ledger.abi, functionName: "confirmMany", args: [m.groupIds, m.denomIds, m.creditors, m.qtys, m.obligationIds, m.uniques, sig], account });
}

test("the deployed ledger accepts a batch signed through the app's typed data, and refuses the same signature over any altered batch", async () => {
  await simulate(message);
  // The controls: without them, "accepted" could mean the call never reverts. They exercise the deployed
  // contract rather than this repository, so they live with the acceptance they give meaning to.
  const [a, b, c] = message.obligationIds as [Hex, Hex, Hex];
  const [k1, k2] = message.creditors as [Address, Address, Address];
  await assert.rejects(() => simulate({ ...message, qtys: [3n, 1n, 8n] }), "altered quantity");
  await assert.rejects(() => simulate({ ...message, obligationIds: [b, a, c] }), "reordered");
  await assert.rejects(() => simulate({ ...message, creditors: [k2, k2, k1] }), "different creditor");
});

test("the batch builder keeps the signed order and names each creditor's ledger address", async () => {
  const [A, C] = [await tempUser("Ana"), await tempUser("Cy")];
  const U = await tempUser("Gabe");
  const [g1, g2] = [await ghost(A.id, "Gabe"), await ghost(C.id, "Gabe")];
  const [p1, p2] = [await cover(A.id, g1, "first"), await cover(C.id, g2, "second")];
  await claims.bindClaimToUser(g1, U.id);
  await claims.bindClaimToUser(g2, U.id);
  for (const order of [[p1, p2], [p2, p1]] as const) {
    const batch = await loadConfirmBatch(order.map((p) => p.id), U.id);
    const typed = confirmManyTypedData(batch.proposals, batch.creditorLedgers);
    assert.deepEqual(typed.message.obligationIds, order.map((p) => uuidToBytes16(p.id)));
    assert.deepEqual(typed.message.creditors.map((c) => c.toLowerCase()), order.map((p) => (p.toUser === A.id ? A.ledgerWallet : C.ledgerWallet)));
    assert.deepEqual(typed.message.qtys, [1200n, 1200n]);
  }
});

test("a batch naming someone else's row is refused", async () => {
  const A = await tempUser("Ana");
  const U = await tempUser("Gabe");
  const stranger = await tempUser("Stranger");
  const g = await ghost(A.id, "Gabe");
  const p = await cover(A.id, g, "first");
  await claims.bindClaimToUser(g, U.id);
  await assert.rejects(() => loadConfirmBatch([p.id], stranger.id));
  await loadConfirmBatch([p.id], U.id);
});

test("a batch is capped, because the declared gas grows per item and Monad charges what is declared", async () => {
  const U = await tempUser("Gabe");
  const ids = (n: number) => Array.from({ length: n }, () => randomUUID());
  await assert.rejects(() => loadConfirmBatch(ids(CONFIRM_MANY_MAX + 1), U.id), /more than 12 at once/);
  // At the cap the refusal is about the rows (these ids are unknown), not about the size.
  await assert.rejects(() => loadConfirmBatch(ids(CONFIRM_MANY_MAX), U.id), /unknown proposal/);
});

test("a batch listing the same row twice is refused", async () => {
  const id = randomUUID();
  const U = await tempUser("Gabe");
  await assert.rejects(() => loadConfirmBatch([id, id], U.id), /listed twice/);
});
