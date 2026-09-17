/**
 * Checks that Envio's `OpenBetween` query (PLANNING.md section 10) agrees with the chain for every pair
 * of seed users, in every group and denomination. Run after `npm run seed` with the indexer up:
 *
 *   npm run verify:envio
 */
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { like } from "drizzle-orm";
import { db, schema } from "../src/db";
import { contracts } from "../src/lib/chain/contracts";
import { relayer } from "../src/lib/chain/relayer";
import { z } from "zod";

const OPEN_BETWEEN = /* GraphQL */ `
  query OpenBetween($a: String!, $b: String!) {
    Obligation(where: {
      remaining: { _gt: "0" },
      _or: [
        { debtor: { _eq: $a }, creditor: { _eq: $b } },
        { debtor: { _eq: $b }, creditor: { _eq: $a } }
      ]
    }) { id tokenId groupId denomId debtor creditor remaining unique }
  }
`;

const Response = z.object({
  data: z.object({
    Obligation: z.array(
      z.object({
        id: z.string(),
        tokenId: z.string(),
        groupId: z.string(),
        denomId: z.string(),
        debtor: z.string(),
        creditor: z.string(),
        remaining: z.string(),
        unique: z.boolean(),
      }),
    ),
  }),
});

function fungibleId(groupId: Hex, denomId: Hex, debtor: Address): bigint {
  return BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }], [groupId, denomId, debtor])));
}

async function openBetween(url: string, a: string, b: string) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query: OPEN_BETWEEN, variables: { a, b } }) });
  if (!res.ok) throw new Error(`Envio responded ${res.status}: ${await res.text()}`);
  return Response.parse(await res.json()).data.Obligation;
}

async function main(): Promise<void> {
  const url = process.env.ENVIO_GRAPHQL_URL;
  if (!url) throw new Error("ENVIO_GRAPHQL_URL is not set");
  const { ledger } = contracts();
  const { publicClient } = relayer();

  const users = await db.select().from(schema.users).where(like(schema.users.dynamicUserId, "seed:%"));
  if (users.length === 0) throw new Error("no seed users; run `npm run seed` first");
  const groups = await db.select().from(schema.groups);
  const denoms = await db.select().from(schema.denominations);
  const toHex = (b: Buffer | null): Hex => `0x${(b ?? Buffer.alloc(0)).toString("hex")}` as Hex;

  let checked = 0;
  let mismatches = 0;
  let totalOpen = 0n;
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      const a = users[i];
      const b = users[j];
      if (!a || !b) continue;
      const rows = await openBetween(url, a.ledgerWallet, b.ledgerWallet);
      // Envio's view, summed per (group, denom, debtor, creditor).
      const envio = new Map<string, bigint>();
      for (const r of rows) {
        const k = `${r.groupId}|${r.denomId}|${r.debtor.toLowerCase()}|${r.creditor.toLowerCase()}`;
        envio.set(k, (envio.get(k) ?? 0n) + BigInt(r.remaining));
        totalOpen += BigInt(r.remaining);
      }
      // The chain's view for every registered (group, denom) in both directions.
      for (const g of groups) {
        if (!g.onchainId) continue;
        const gid = toHex(g.onchainId);
        for (const d of denoms.filter((x) => x.groupId === g.id && x.onchainId)) {
          const did = toHex(d.onchainId);
          for (const [debtor, creditor] of [[a, b], [b, a]] as const) {
            const bal = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "balanceOf", args: [creditor.ledgerWallet as Address, fungibleId(gid, did, debtor.ledgerWallet as Address)] });
            const k = `${gid}|${did}|${debtor.ledgerWallet}|${creditor.ledgerWallet}`;
            const seen = envio.get(k) ?? 0n;
            checked++;
            if (seen !== bal) {
              mismatches++;
              console.error(`MISMATCH ${g.name}/${d.label} ${debtor.displayName} -> ${creditor.displayName}: envio ${seen}, chain ${bal}`);
            }
          }
        }
      }
    }
  }
  console.log(`[verify-envio] ${checked} edges checked across ${users.length} seed users; ${mismatches} mismatches; ${totalOpen} open units reported by Envio`);
  if (mismatches > 0) process.exit(1);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
