/**
 * The TypeScript scoring mirror against the deployed contract's own pure functions, by read-only eth_call.
 * The mirror was written from the specification and the contract from the specification; this is where the two
 * meet. A disagreement here means one of them is wrong about the rule a judge will check.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { contracts } from "@/lib/chain/contracts";
import { relayer } from "@/lib/chain/relayer";
import { pairwiseTransfer, scoreBinary, scoreNumeric } from "@/lib/ledger/scoring";

test("scores agree with the deployed contract across the whole probability range", async () => {
  const { dares } = contracts();
  const { publicClient } = relayer();
  for (const value of [0n, 1n, 99n, 2000n, 3333n, 5000n, 6999n, 7000n, 9999n, 10000n]) {
    for (const outcome of [0n, 1n]) {
      const onchain = await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "scoreBinary", args: [value, outcome] });
      assert.equal(BigInt(onchain), scoreBinary(value, outcome), `value ${value}, outcome ${outcome}`);
    }
  }
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
    const onchain = await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "pairwiseTransfer", args: [si, sj, a, b, n] });
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
    const onchain = await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "scoreNumeric", args: [value, outcome, range] });
    assert.equal(BigInt(onchain), scoreNumeric(value, outcome, range), `value ${value}, outcome ${outcome}, scale ${range}`);
  }
});
