/**
 * Dev tooling: confirm a pending proposal as a seed user, signing with the seed wallet instead of a Dynamic
 * embedded wallet. Exercises the same server path the confirm screen uses (signature check, lazy onchain
 * registration, relayer submit, shadow row).
 *
 *   npx tsx --env-file=.env.local scripts/dev/confirm-as-seed.ts <proposalId | latest>
 */
import { mnemonicToAccount } from "viem/accounts";
import { desc, eq } from "drizzle-orm";
import type { Address } from "viem";
import { db, schema } from "../../src/db";
import { confirmProposal, confirmTypedData } from "../../src/lib/ledger/proposals";

const CAST = ["alex", "sam", "jordan", "riley", "casey", "morgan", "taylor"];

async function main(): Promise<void> {
  const mnemonic = process.env.SEED_MNEMONIC;
  if (!mnemonic) throw new Error("SEED_MNEMONIC is not set");
  const arg = process.argv[2] ?? "latest";
  const [proposal] =
    arg === "latest"
      ? await db.select().from(schema.obligationProposals).where(eq(schema.obligationProposals.status, "pending")).orderBy(desc(schema.obligationProposals.createdAt)).limit(1)
      : await db.select().from(schema.obligationProposals).where(eq(schema.obligationProposals.id, arg)).limit(1);
  if (!proposal || !proposal.fromUser || !proposal.toUser) throw new Error("no pending proposal");
  const [debtor] = await db.select().from(schema.users).where(eq(schema.users.id, proposal.fromUser)).limit(1);
  const [creditor] = await db.select().from(schema.users).where(eq(schema.users.id, proposal.toUser)).limit(1);
  if (!debtor || !creditor) throw new Error("unknown users");
  const key = debtor.dynamicUserId.replace(/^seed:/, "");
  const idx = CAST.indexOf(key);
  if (idx < 0) throw new Error(`${debtor.displayName} is not a seed user`);
  const account = mnemonicToAccount(mnemonic, { accountIndex: 0, addressIndex: idx });
  if (account.address.toLowerCase() !== debtor.ledgerWallet) throw new Error("seed wallet does not match the user");

  const typed = confirmTypedData(proposal, creditor.ledgerWallet as Address);
  const signature = await account.signTypedData(typed);
  console.log(`[dev] ${debtor.displayName} confirms proposal ${proposal.id} (${creditor.displayName} got this one)`);
  const result = await confirmProposal(proposal.id, debtor.id, signature);
  console.log(`[dev] confirmed: obligation ${result.obligationId} tx ${result.txHash}`);
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
