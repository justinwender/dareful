/**
 * The delegation gate (docs/decisions.md 2026-09-27), run by hand against the sandbox once a real account
 * has delegated its ledger wallet from the development page (`/dev/delegation`) and Dynamic's webhook has
 * landed on the deployed endpoint:
 *
 *   npx tsx --env-file=.env.local scripts/dev/delegation-gate.ts "<display name or user id>"
 *
 * It prints, and never stores or shows a share, a key or an exported private key:
 *   1. the account's two wallets as Dynamic's read-only API reports them (ids, share sets, key generation
 *      ids), to compare with the values recorded before delegation: the governance wallet's must not change;
 *   2. which wallets have delegation rows here: the ledger wallet and nothing for the governance wallet;
 *   3. the refusal: this module refuses the governance address before any lookup; Dynamic refuses a signing
 *      request for the governance wallet's id made with the ledger wallet's materials; and the ledger wallet
 *      signs a harmless check message that recovers to its address (recorded in `delegated_signatures`);
 *   4. export: whether Dynamic lets the delegated materials export the ledger wallet's private key. Whatever
 *      comes back is discarded at once. No code path in the app calls export.
 */
import { eq, or } from "drizzle-orm";
import { recoverTypedDataAddress, type Hex } from "viem";
import { db, schema } from "@/db";
import { delegatedWalletFor, GovernanceNeverDelegated, open, storeKey } from "@/lib/chain/delegated-signer";

const CHECK = {
  domain: { name: "Dareful delegation check", version: "1" },
  types: { Check: [{ name: "at", type: "uint256" }] },
  primaryType: "Check",
  message: { at: BigInt(Date.now()) },
} as const;

type Wallet = { credId: string; walletId: string; address: string; shareSetId: string | null; keygenIds: string[]; otherShareSets: unknown[] };

async function dynamicWallets(dynamicUserId: string): Promise<Wallet[]> {
  const env = process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "";
  const token = process.env.DYNAMIC_API_TOKEN ?? "";
  if (!env || !token) throw new Error("NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID and DYNAMIC_API_TOKEN are needed");
  const res = await fetch(`https://app.dynamicauth.com/api/v0/environments/${env}/users/${dynamicUserId}`, { headers: { authorization: `Bearer ${token}`, accept: "application/json" } });
  if (!res.ok) throw new Error(`Dynamic answered ${res.status} for the user`);
  const body = (await res.json()) as { user?: { verifiedCredentials?: unknown[]; wallets?: { id?: string; publicKey?: string }[] } };
  const u = body.user ?? (body as { verifiedCredentials?: unknown[]; wallets?: { id?: string; publicKey?: string }[] });
  const ids = new Map((u.wallets ?? []).map((w) => [String(w.publicKey ?? "").toLowerCase(), String(w.id ?? "")]));
  return (u.verifiedCredentials ?? [])
    .filter((c): c is Record<string, unknown> => typeof c === "object" && c !== null && (c as { format?: unknown }).format === "blockchain")
    .map((c) => {
      const wp = (c.wallet_properties ?? {}) as Record<string, unknown>;
      const shares = Array.isArray(wp.keyShares) ? (wp.keyShares as Record<string, unknown>[]) : [];
      const address = String(c.address ?? "");
      return {
        credId: String(c.id ?? ""),
        walletId: ids.get(address.toLowerCase()) ?? "",
        address,
        shareSetId: typeof wp.shareSetId === "string" ? wp.shareSetId : null,
        keygenIds: shares.map((s) => String(s.keygenId ?? "")),
        otherShareSets: Array.isArray(wp.otherShareSets) ? wp.otherShareSets : [],
      };
    });
}

async function main(): Promise<void> {
  const who = process.argv[2];
  if (!who) throw new Error("say whose delegation to check: a display name or a user id");
  const [user] = await db.select().from(schema.users).where(or(eq(schema.users.displayName, who), eq(schema.users.id, who)));
  if (!user) throw new Error(`no user ${who}`);
  const ledger = user.ledgerWallet.toLowerCase();
  const governance = user.governanceWallet.toLowerCase();
  console.log(`user ${user.id} (${user.displayName}): ledger ${ledger}, governance ${governance}`);

  // 1. The wallets as Dynamic reports them.
  console.log("\n1. Dynamic's record of the two wallets (compare with the values recorded before delegation):");
  const wallets = await dynamicWallets(user.dynamicUserId);
  for (const w of wallets) {
    const role = w.address.toLowerCase() === ledger ? "ledger" : w.address.toLowerCase() === governance ? "governance" : "other";
    console.log(`   ${role}: wallet ${w.walletId || "?"} cred ${w.credId} shareSet ${w.shareSetId} keygen ${w.keygenIds.join(",")} otherShareSets ${JSON.stringify(w.otherShareSets)}`);
  }
  const gov = wallets.find((w) => w.address.toLowerCase() === governance);

  // 2. The rows here.
  console.log("\n2. Delegation rows in the database for this user:");
  const rows = await db.select().from(schema.delegations).where(eq(schema.delegations.userId, user.id));
  for (const r of rows) {
    const role = r.walletAddress === ledger ? "ledger" : r.walletAddress === governance ? "GOVERNANCE (must never happen)" : "other";
    console.log(`   ${role}: wallet ${r.walletId} shareSet ${r.shareSetId} granted ${r.grantedAt.toISOString()} revoked ${r.revokedAt?.toISOString() ?? "no"} event ${r.eventId} material ${r.encryptedShare.length > 0 ? "present" : "wiped"}`);
  }
  if (rows.length === 0) console.log("   none: delegate from /dev/delegation first, and check the webhook reached the deployed endpoint");
  const govRows = rows.filter((r) => r.walletAddress === governance);
  console.log(`   governance rows: ${govRows.length} ${govRows.length === 0 ? "(good)" : "(FAIL)"}`);

  // 3. The refusals, and the ledger wallet signing.
  console.log("\n3. The refusal:");
  try {
    await delegatedWalletFor(user.id, user.governanceWallet);
    console.log("   FAIL: this module built a delegated wallet for the governance address");
  } catch (err) {
    console.log(`   ours: ${err instanceof GovernanceNeverDelegated ? "refused the governance address before any lookup (good)" : `FAIL: ${err instanceof Error ? err.message : err}`}`);
  }
  const active = rows.find((r) => r.walletAddress === ledger && r.revokedAt === null && r.encryptedShare.length > 0);
  if (!active) {
    console.log("   no active ledger delegation, so Dynamic's refusal and the signing check cannot run yet");
  } else {
    const wallet = await delegatedWalletFor(user.id, user.ledgerWallet);
    const signature = await wallet.sign(CHECK, { action: "check", subject: "gate", request: "scripts/dev/delegation-gate.ts" });
    const signer = await recoverTypedDataAddress({ ...CHECK, signature: signature as Hex });
    console.log(`   ledger: signed a check message; recovers to ${signer.toLowerCase() === ledger ? "the ledger wallet (good)" : `${signer} (FAIL)`}`);
    // Dynamic's own refusal: the ledger wallet's materials, the governance wallet's id.
    if (!gov?.walletId) console.log("   Dynamic: the governance wallet's id could not be read from the API, so its refusal was not tried");
    else {
      const mod = await import("@dynamic-labs-wallet/node-evm");
      const client = mod.createDelegatedEvmWalletClient({ environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "", apiKey: process.env.DYNAMIC_SERVER_API_TOKEN ?? "" });
      const key = storeKey();
      const binding = `delegation:${user.id}:${active.walletId}`;
      const share = open(active.encryptedShare, key, binding);
      const apiKey = open(active.encryptedApiKey, key, binding);
      if (!share || !apiKey) throw new Error("the stored material does not open");
      const keyShare = JSON.parse(share.toString("utf8")) as Parameters<typeof mod.delegatedSignTypedData>[1]["keyShare"];
      try {
        const s = await mod.delegatedSignTypedData(client, { walletId: gov.walletId, walletApiKey: apiKey.toString("utf8"), keyShare, typedData: CHECK as unknown as Parameters<typeof mod.delegatedSignTypedData>[1]["typedData"] });
        const signer = await recoverTypedDataAddress({ ...CHECK, signature: s as Hex });
        console.log(`   Dynamic: FAIL, it signed for wallet id ${gov.walletId}; the signature recovers to ${signer.toLowerCase() === governance ? "THE GOVERNANCE WALLET" : signer}`);
      } catch (err) {
        console.log(`   Dynamic: refused a request for the governance wallet's id made with the ledger wallet's materials (good): ${err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160)}`);
      }

      // 4. Export.
      console.log("\n4. Export with the delegated materials:");
      try {
        const evm = new mod.DynamicEvmWalletClient({ environmentId: process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID ?? "" });
        await evm.authenticateApiToken(apiKey.toString("utf8"));
        const out = await evm.exportPrivateKey({ walletMetadata: { walletId: active.walletId, accountAddress: user.ledgerWallet, chainName: "EVM" } as Parameters<typeof evm.exportPrivateKey>[0]["walletMetadata"], externalServerKeyShares: [keyShare] });
        const got = typeof out?.derivedPrivateKey === "string" && out.derivedPrivateKey.length > 0;
        console.log(`   ${got ? "EXPORT SUCCEEDED: the per-wallet key and the share export the ledger wallet's private key (discarded; a server breach would hand the key over outright)" : "export answered without a key"}`);
      } catch (err) {
        console.log(`   export refused (good): ${err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200)}`);
      }
      share.fill(0);
      apiKey.fill(0);
    }
  }
  console.log("\nSigned with delegation, recorded:");
  for (const s of await db.select().from(schema.delegatedSignatures).where(eq(schema.delegatedSignatures.userId, user.id))) console.log(`   ${s.createdAt.toISOString()} ${s.action} ${s.subject} via ${s.request} ${s.requestId ?? ""}`);
}

main()
  .catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
