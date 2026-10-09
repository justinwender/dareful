/**
 * The TypeScript scoring mirror against the deployed contract's own pure functions, by read-only eth_call.
 * The mirror was written from the specification and the contract from the specification; this is where the two
 * meet. A disagreement here means one of them is wrong about the rule a judge will check.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { contracts } from "@/lib/chain/contracts";
import { relayer } from "@/lib/chain/relayer";
import { pairwiseTransfer, scoreBinary, scoreCategorical, scoreNumeric } from "@/lib/ledger/scoring";

/**
 * One read at a time, at most twelve a second: the mutation audit reads the chain through Monad's public RPC, which
 * answers fifteen requests a second, so production's own key is never shared while the relayer sends (the submission
 * round). A read through the app's own RPC waits the same and loses nothing.
 */
let lastRead = 0;
async function paced<T>(read: () => Promise<T>): Promise<T> {
  const wait = lastRead + 85 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastRead = Date.now();
  return read();
}

test("scores agree with the deployed contract across the whole probability range", async () => {
  const { dares } = contracts();
  const { publicClient } = relayer();
  for (const value of [0n, 1n, 99n, 2000n, 3333n, 5000n, 6999n, 7000n, 9999n, 10000n]) {
    for (const outcome of [0n, 1n]) {
      const onchain = await paced(() => publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "scoreBinary", args: [value, outcome] }));
      assert.equal(BigInt(onchain), scoreBinary(value, outcome), `value ${value}, outcome ${outcome}`);
    }
  }
});

test("the deployed contract cannot score a yes-or-no market at the middle: a tie cannot resolve to 5000 until the redeploy, and the mirror refuses it too", async () => {
  const { dares } = contracts();
  const { publicClient } = relayer();
  // The owner's who-wins question would score a tie as the exact middle (docs/decisions.md, public markets). The
  // deployed contract's scoring takes 0 or 1 and its resolve and arbitrate paths refuse anything else, so until
  // the redeploy an NFL tie goes unsettled with no toll, and the middle outcome is on the redeploy list.
  for (const outcome of [2n, 5000n, 10_000n]) {
    await assert.rejects(paced(() => publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "scoreBinary", args: [5000n, outcome] })), /BadOutcome/, `outcome ${outcome} is refused by the contract`);
    assert.throws(() => scoreBinary(5000n, outcome), RangeError, `outcome ${outcome} is refused by the mirror`);
  }
  assert.equal(BigInt(await paced(() => publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "scoreBinary", args: [5000n, 1n] }))), 7500n, "the two outcomes it does score");
});

test("pairwise transfers agree with the deployed contract, including where truncation bites", async () => {
  const { dares } = contracts();
  const { publicClient } = relayer();
  const cases: Array<[bigint, bigint, number, number, bigint]> = [
    [1500n, 2000n, 3600, 9100, 4n],
    [500n, 2000n, 7500, 9100, 4n],
    [2000n, 5000n, 9100, 0, 4n],
    [2n, 2n, 10000, 0, 4n],
    [2n, 2n, 0, 10000, 4n],
    [1n, 1n, 6400, 9900, 2n],
    [7n, 3n, 1, 10000, 3n],
    [123456n, 99n, 5100, 5099, 7n],
    [10n ** 12n, 10n ** 12n, 10000, 0, 2n],
  ];
  for (const [si, sj, a, b, n] of cases) {
    const onchain = await paced(() => publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "pairwiseTransfer", args: [si, sj, a, b, n] }));
    assert.equal(onchain, pairwiseTransfer(si, sj, BigInt(a), BigInt(b), n), `stakes ${si}/${sj}, scores ${a}/${b}, n ${n}`);
  }
});

test("number scores agree with the deployed contract, across the shirts example, the edges of the scale and the contract's own table", async () => {
  const { dares } = contracts();
  const { publicClient } = relayer();
  const cases: Array<[bigint, bigint, bigint]> = [
    // The shirts (tests/unit/numbers.test.ts): five entries against 14 on a scale of 20.
    [14n, 14n, 20n],
    [18n, 14n, 20n],
    [12n, 14n, 20n],
    [9n, 14n, 20n],
    [200n, 14n, 20n],
    // The contract's own table (contracts/test/DarefulDares.t.sol).
    [60n, 50n, 100n],
    [0n, 50n, 100n],
    [150n, 50n, 100n],
    [151n, 50n, 100n],
    [1n, 0n, 3n],
    [2n, 0n, 3n],
    [20n, 12n, 20n],
    // A wide scale, where the integer division bites, and the largest number the field takes.
    [18n, 14n, 10_000n],
    [999_999_999n, 0n, 999_999_999n],
    [0n, 999_999_999n, 1n],
  ];
  for (const [value, outcome, range] of cases) {
    const onchain = await paced(() => publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "scoreNumeric", args: [value, outcome, range] }));
    assert.equal(BigInt(onchain), scoreNumeric(value, outcome, range), `value ${value}, outcome ${outcome}, scale ${range}`);
  }
});

test("pick-one scores agree with the deployed contract: a pick carrying everything scores full or nothing, and the formula holds short of everything", async () => {
  const { dares } = contracts();
  const { publicClient } = relayer();
  const cases: Array<[bigint, number, number, bigint]> = [
    // Who falls asleep first (tests/unit/pick-one.test.ts): five answers, John (0) does, every pick at 10000.
    [0n, 10000, 5, 0n],
    [2n, 10000, 5, 0n],
    [4n, 10000, 5, 0n],
    [1n, 10000, 5, 0n],
    // The edges of the answer count the design allows (3.29): two and six.
    [0n, 10000, 2, 0n],
    [1n, 10000, 2, 0n],
    [5n, 10000, 6, 5n],
    [0n, 10000, 6, 5n],
    // Short of everything: the contract's own table (contracts/test/DarefulDares.t.sol), where the dropped remainder shows.
    [0n, 7000, 3, 0n],
    [0n, 7000, 3, 1n],
    [2n, 5000, 4, 2n],
    [0n, 5000, 2, 1n],
    [0n, 0, 5, 0n],
    [1n, 5000, 5, 0n],
  ];
  for (const [pick, conf, options, outcome] of cases) {
    const onchain = await paced(() => publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "scoreCategorical", args: [pick, conf, options, outcome] }));
    assert.equal(BigInt(onchain), scoreCategorical(pick, BigInt(conf), BigInt(options), outcome), `pick ${pick} at ${conf} of ${options}, outcome ${outcome}`);
  }
  // What the contract refuses, the mirror refuses: more than everything, a pick or an outcome past the last answer, one answer.
  for (const [pick, conf, options, outcome] of [[0n, 10001, 5, 0n], [5n, 10000, 5, 0n], [0n, 10000, 5, 5n], [0n, 10000, 1, 0n]] as Array<[bigint, number, number, bigint]>) {
    await assert.rejects(paced(() => publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "scoreCategorical", args: [pick, conf, options, outcome] })), `the contract takes pick ${pick} at ${conf} of ${options}, outcome ${outcome}`);
    assert.throws(() => scoreCategorical(pick, BigInt(conf), BigInt(options), outcome), RangeError);
  }
});
