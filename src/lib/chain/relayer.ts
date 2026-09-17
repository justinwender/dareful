/**
 * The relayer: one server-controlled EOA that submits every contract mutation and pays gas. It holds no
 * user keys and cannot originate an action; it forwards messages users have signed.
 *
 * Every submission carries an explicit `gas` from gas.ts. The call is simulated first (an eth_call, not an
 * estimate) so a revert is caught before the declared gas is charged, then submitted, then awaited, and a
 * receipt that is not `success` throws. Principle 9: a chain write that fails must fail loudly.
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  type Abi,
  type Address,
  type ContractFunctionArgs,
  type ContractFunctionName,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { monadChain, rpcUrl } from "./contracts";

export type Relayer = {
  account: PrivateKeyAccount;
  publicClient: PublicClient;
  walletClient: WalletClient;
};

let cached: Relayer | undefined;

export function relayer(): Relayer {
  if (cached) return cached;
  const pk = process.env.RELAYER_PRIVATE_KEY;
  if (!pk || !pk.startsWith("0x")) throw new Error("RELAYER_PRIVATE_KEY is not set");
  const account = privateKeyToAccount(pk as Hex);
  const expected = process.env.RELAYER_ADDRESS;
  if (expected && expected.toLowerCase() !== account.address.toLowerCase()) {
    throw new Error("RELAYER_PRIVATE_KEY does not match RELAYER_ADDRESS");
  }
  const chain = monadChain();
  // Transient HTTP failures (rate limits, gateway hiccups) retry with backoff before anything fails loudly.
  const transport = http(rpcUrl(), { retryCount: 6, retryDelay: 1500, timeout: 30_000 });
  cached = {
    account,
    publicClient: createPublicClient({ chain, transport }),
    walletClient: createWalletClient({ account, chain, transport }),
  };
  return cached;
}

export class RelayerTransactionFailed extends Error {
  constructor(
    public readonly label: string,
    public readonly hash: Hex,
    public readonly receipt: TransactionReceipt,
  ) {
    super(`${label}: transaction ${hash} reverted in block ${receipt.blockNumber}`);
    this.name = "RelayerTransactionFailed";
  }
}

export type SubmitResult = { hash: Hex; receipt: TransactionReceipt };

/**
 * Simulate, submit with explicit gas, wait, and verify. `gas` is required by type; there is no default.
 */
export async function submit<
  const TAbi extends Abi,
  TFn extends ContractFunctionName<TAbi, "nonpayable" | "payable">,
>(req: {
  label: string;
  address: Address;
  abi: TAbi;
  functionName: TFn;
  args: ContractFunctionArgs<TAbi, "nonpayable" | "payable", TFn>;
  gas: bigint;
}): Promise<SubmitResult> {
  const { account, publicClient, walletClient } = relayer();
  const chain = monadChain();

  // eth_call with the relayer as sender: catches reverts before the declared gas is charged.
  await publicClient.simulateContract({
    account,
    address: req.address,
    abi: req.abi,
    functionName: req.functionName,
    args: req.args,
  } as Parameters<PublicClient["simulateContract"]>[0]);

  const hash = await walletClient.writeContract({
    account,
    chain,
    address: req.address,
    abi: req.abi,
    functionName: req.functionName,
    args: req.args,
    gas: req.gas,
  } as Parameters<WalletClient["writeContract"]>[0]);

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (process.env.RELAYER_LOG_GAS) {
    // Monad receipts report gasUsed equal to the declared limit, so this line only tells you whether the
    // limit was enough (success) or not (reverted). Size gas.ts from scripts/gas-survey.ts, not from here.
    console.log(`[relayer] ${req.label}: limit ${req.gas}, receipt gasUsed ${receipt.gasUsed}, ${receipt.status}`);
  }
  if (receipt.status !== "success") throw new RelayerTransactionFailed(req.label, hash, receipt);
  return { hash, receipt };
}
