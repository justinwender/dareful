/**
 * Lazy onchain registration. Groups and denominations reach the ledger contract the first time an obligation
 * in them is confirmed (PLANNING.md 5b). Ids are deterministic from the offchain uuids, so a client can sign
 * over them before the registration transaction exists. Only account-holders register; a ghost joins when
 * they bind.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { gasFor } from "@/lib/chain/gas";
import { relayer, submit } from "@/lib/chain/relayer";
import { denomOnchainId, groupOnchainId, hexToBuffer } from "./ids";
import type { Address, Hex } from "viem";

async function accountHolderMembers(groupId: string) {
  return db
    .select({ id: schema.users.id, ledger: schema.users.ledgerWallet, governance: schema.users.governanceWallet })
    .from(schema.groupMembers)
    .innerJoin(schema.users, eq(schema.groupMembers.userId, schema.users.id))
    .where(and(eq(schema.groupMembers.groupId, groupId), isNull(schema.groupMembers.leftAt)));
}

/** Registers the group with every account-holder member, or adds any member registered since. Returns the id. */
export async function ensureGroupOnchain(groupId: string): Promise<Hex> {
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId)).limit(1);
  if (!group) throw new Error(`unknown group ${groupId}`);
  const { ledger } = contracts();
  const { publicClient } = relayer();
  const onchainId = groupOnchainId(groupId);
  const members = await accountHolderMembers(groupId);
  if (members.length === 0) throw new Error(`group ${groupId} has no account-holder members to register`);

  const exists = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "groupExists", args: [onchainId] });
  if (!exists) {
    await submit({
      label: `createGroup ${groupId}`,
      address: ledger.address,
      abi: ledger.abi,
      functionName: "createGroup",
      args: [onchainId, members.map((m) => ({ ledger: m.ledger as Address, governance: m.governance as Address }))],
      gas: gasFor.createGroup(members.length),
    });
  } else {
    for (const m of members) {
      const registered = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "isLedgerMember", args: [onchainId, m.ledger as Address] });
      if (!registered) {
        await submit({
          label: `addMember ${groupId} ${m.ledger}`,
          address: ledger.address,
          abi: ledger.abi,
          functionName: "addMember",
          args: [onchainId, { ledger: m.ledger as Address, governance: m.governance as Address }],
          gas: gasFor.addMember(),
        });
      }
    }
  }
  if (!group.onchainId) {
    await db.update(schema.groups).set({ onchainId: hexToBuffer(onchainId) }).where(eq(schema.groups.id, groupId));
  }
  return onchainId;
}

/** Registers the denomination inside its (already registered) group. Returns the id. */
export async function ensureDenomOnchain(denomId: string): Promise<Hex> {
  const [denom] = await db.select().from(schema.denominations).where(eq(schema.denominations.id, denomId)).limit(1);
  if (!denom) throw new Error(`unknown denomination ${denomId}`);
  const groupId = await ensureGroupOnchain(denom.groupId);
  const onchainId = denomOnchainId(denomId);
  if (denom.onchainId) return onchainId;
  const { ledger } = contracts();
  const { publicClient } = relayer();
  let registered = true;
  try {
    await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "denomOf", args: [groupId, onchainId] });
  } catch {
    registered = false;
  }
  if (!registered) {
    await submit({
      label: `createDenom ${denomId}`,
      address: ledger.address,
      abi: ledger.abi,
      functionName: "createDenom",
      args: [groupId, onchainId, denom.quantifiable],
      gas: gasFor.createDenom(),
    });
  }
  await db.update(schema.denominations).set({ onchainId: hexToBuffer(onchainId) }).where(eq(schema.denominations.id, denomId));
  return onchainId;
}
