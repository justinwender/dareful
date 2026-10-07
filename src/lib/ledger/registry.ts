/**
 * Lazy onchain registration. Groups and denominations reach the ledger contract the first time something in them
 * reaches the chain (PLANNING.md 5b). Ids are deterministic from the offchain uuids, so a client can sign over them
 * before the registration transaction exists. Only account-holders register, and only the people acting (the
 * second-pass round, 2026-10-06): the two sides of a confirmation, or the people in a question and its asker at its
 * lock. The deployed contract asks a question's vote of everyone ever registered in its set, so registering anyone
 * else (someone who only opened the link, say) would make them a voter on a question they never entered. A ghost
 * registers once they bind and act.
 */
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { contracts } from "@/lib/chain/contracts";
import { gasFor } from "@/lib/chain/gas";
import { relayer, submit } from "@/lib/chain/relayer";
import { denomOnchainId, groupOnchainId, hexToBuffer } from "./ids";
import type { Address, Hex } from "viem";

async function accountHolders(userIds: readonly string[]) {
  const ids = Array.from(new Set(userIds));
  if (ids.length === 0) return [];
  return db.select({ id: schema.users.id, ledger: schema.users.ledgerWallet, governance: schema.users.governanceWallet }).from(schema.users).where(inArray(schema.users.id, ids));
}

/** The governance wallets the chain holds for a set today: who it would ask to vote on a question locked there now. None before the set is registered. */
export async function registeredVoters(groupId: string): Promise<readonly Address[]> {
  const { ledger } = contracts();
  const { publicClient } = relayer();
  const onchainId = groupOnchainId(groupId);
  const exists = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "groupExists", args: [onchainId] });
  if (!exists) return [];
  return (await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "governanceOf", args: [onchainId] })) as readonly Address[];
}

/**
 * Registers the group with the given account-holders, or adds whichever of them is not registered yet, and nobody
 * else. Returns the id.
 */
export async function ensureGroupOnchain(groupId: string, userIds: readonly string[]): Promise<Hex> {
  const [group] = await db.select().from(schema.groups).where(eq(schema.groups.id, groupId)).limit(1);
  if (!group) throw new Error(`unknown group ${groupId}`);
  const { ledger } = contracts();
  const { publicClient } = relayer();
  const onchainId = groupOnchainId(groupId);
  const members = await accountHolders(userIds);
  if (members.length === 0) throw new Error(`group ${groupId} has nobody to register`);
  const subject = { groupId, userIds: members.map((m) => m.id) };

  const exists = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "groupExists", args: [onchainId] });
  if (!exists) {
    await submit({
      label: `createGroup ${groupId}`,
      address: ledger.address,
      abi: ledger.abi,
      functionName: "createGroup",
      args: [onchainId, members.map((m) => ({ ledger: m.ledger as Address, governance: m.governance as Address }))],
      gas: gasFor.createGroup(members.length),
      write: { kind: "register", subject },
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
          write: { kind: "register", subject },
        });
      }
    }
  }
  if (!group.onchainId) {
    await db.update(schema.groups).set({ onchainId: hexToBuffer(onchainId) }).where(eq(schema.groups.id, groupId));
  }
  return onchainId;
}

/** Registers the denomination inside its group, registering the people acting in the group first. Returns the id. */
export async function ensureDenomOnchain(denomId: string, userIds: readonly string[]): Promise<Hex> {
  const [denom] = await db.select().from(schema.denominations).where(eq(schema.denominations.id, denomId)).limit(1);
  if (!denom) throw new Error(`unknown denomination ${denomId}`);
  const groupId = await ensureGroupOnchain(denom.groupId, userIds);
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
      write: { kind: "register", subject: { denomId, userIds: [...userIds] } },
    });
  }
  await db.update(schema.denominations).set({ onchainId: hexToBuffer(onchainId) }).where(eq(schema.denominations.id, denomId));
  return onchainId;
}

/**
 * The offchain mirror of a registration once the chain has it, and nothing more: for a write the earlier build left
 * in flight, whose own transaction says who it registers. True once mirrored or when there is nothing to mirror yet.
 */
export async function mirrorRegistration(input: { groupId: string | null; denomId: string | null }): Promise<boolean> {
  const { ledger } = contracts();
  const { publicClient } = relayer();
  if (input.denomId) {
    const [denom] = await db.select().from(schema.denominations).where(eq(schema.denominations.id, input.denomId)).limit(1);
    if (!denom) return true;
    try {
      await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "denomOf", args: [groupOnchainId(denom.groupId), denomOnchainId(denom.id)] });
    } catch {
      return true;
    }
    await db.update(schema.denominations).set({ onchainId: hexToBuffer(denomOnchainId(denom.id)) }).where(eq(schema.denominations.id, denom.id));
    return true;
  }
  if (input.groupId) {
    const onchainId = groupOnchainId(input.groupId);
    if (await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "groupExists", args: [onchainId] })) await db.update(schema.groups).set({ onchainId: hexToBuffer(onchainId) }).where(eq(schema.groups.id, input.groupId));
  }
  return true;
}
