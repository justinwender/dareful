import { describe, expect, it } from "vitest";
import { createTestIndexer } from "envio";

// Hand-rolled ids: bytes32 for groups/denoms/dares, bytes16 for obligations, 20-byte addresses.
const GROUP = `0x${"11".repeat(32)}`;
const USD = `0x${"22".repeat(32)}`;
const DARE = `0x${"33".repeat(32)}`;
const A = `0x${"a".repeat(40)}`;
const B = `0x${"b".repeat(40)}`;
const C = `0x${"c".repeat(40)}`;
const GA = `0x${"1a".repeat(20)}`;
const GB = `0x${"1b".repeat(20)}`;
const GC = `0x${"1c".repeat(20)}`;
const ob = (n: number) => `0x${n.toString(16).padStart(32, "0")}`;
const tx = (n: number) => `0x${n.toString(16).padStart(64, "0")}`;

const setup = (t0: number) => [
  {
    contract: "DarefulLedger" as const,
    event: "GroupCreated" as const,
    params: { groupId: GROUP, ledgers: [A, B, C], governances: [GA, GB, GC] },
    transaction: { hash: tx(1) },
    block: { timestamp: t0 },
  },
  {
    contract: "DarefulLedger" as const,
    event: "DenomCreated" as const,
    params: { groupId: GROUP, denomId: USD, quantifiable: true },
    transaction: { hash: tx(2) },
    block: { timestamp: t0 + 1 },
  },
];

const confirmed = (n: number, debtor: string, creditor: string, qty: bigint, t: number, hash = tx(100 + n)) => ({
  contract: "DarefulLedger" as const,
  event: "Confirmed" as const,
  params: { groupId: GROUP, denomId: USD, debtor, creditor, id: BigInt(debtor), qty, obligationId: ob(n), unique: false },
  transaction: { hash },
  block: { timestamp: t },
});

describe("DarefulLedger handlers", () => {
  it("registers groups, members, and denominations", async () => {
    const indexer = createTestIndexer();
    await indexer.process({ chains: { 10143: { simulate: setup(1000) } } });
    const group = await indexer.Group.getOrThrow(GROUP);
    expect(group.createdTx).toBe(tx(1));
    const member = await indexer.Member.getOrThrow(`${GROUP}-${A}`);
    expect(member.governance).toBe(GA);
    const denom = await indexer.Denom.getOrThrow(`${GROUP}-${USD}`);
    expect(denom.quantifiable).toBe(true);
  });

  it("a confirmed obligation is open for its full quantity", async () => {
    const indexer = createTestIndexer();
    await indexer.process({ chains: { 10143: { simulate: [...setup(1000), confirmed(1, A, B, 500n, 1002)] } } });
    const o = await indexer.Obligation.getOrThrow(ob(1));
    expect(o.remaining).toBe(500n);
    expect(o.qty).toBe(500n);
    expect(o.debtor).toBe(A);
    expect(o.creditor).toBe(B);
    expect(o.confirmTx).toBe(tx(101));
    expect(o.dare_id).toBeUndefined();
  });

  it("nets are attributed oldest-first on both sides of the pair", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            ...setup(1000),
            confirmed(1, A, B, 500n, 1002), // A owes B 500 (oldest)
            confirmed(2, A, B, 300n, 1003), // A owes B 300
            confirmed(3, B, A, 600n, 1004), // B owes A 600
            {
              contract: "DarefulLedger" as const,
              event: "Netted" as const,
              params: { groupId: GROUP, denomId: USD, a: A, b: B, qty: 600n },
              transaction: { hash: tx(200) },
              block: { number: 99_000_077, timestamp: 1005 },
              logIndex: 5,
            },
          ],
        },
      },
    });
    const o1 = await indexer.Obligation.getOrThrow(ob(1));
    const o2 = await indexer.Obligation.getOrThrow(ob(2));
    const o3 = await indexer.Obligation.getOrThrow(ob(3));
    expect(o1.remaining).toBe(0n);
    expect(o1.netted).toBe(500n);
    expect(o2.remaining).toBe(200n);
    expect(o2.netted).toBe(100n);
    expect(o3.remaining).toBe(0n);
    expect(o3.netted).toBe(600n);
    const netted = await indexer.NettedEvent.getOrThrow("10143_99000077_5");
    expect(netted.qty).toBe(600n);
  });

  it("a close drains the named obligation first and records the reason", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            ...setup(1000),
            confirmed(1, A, B, 500n, 1002),
            confirmed(2, A, B, 300n, 1003),
            {
              contract: "DarefulLedger" as const,
              event: "Closed" as const,
              params: { id: BigInt(A), creditor: B, qty: 200n, reason: 1n, obligationId: ob(2) },
              transaction: { hash: tx(300) },
              block: { timestamp: 1004 },
            },
            {
              contract: "DarefulLedger" as const,
              event: "Closed" as const,
              params: { id: BigInt(A), creditor: B, qty: 500n, reason: 0n, obligationId: ob(1) },
              transaction: { hash: tx(301) },
              block: { timestamp: 1005 },
            },
          ],
        },
      },
    });
    const o1 = await indexer.Obligation.getOrThrow(ob(1));
    const o2 = await indexer.Obligation.getOrThrow(ob(2));
    expect(o2.remaining).toBe(100n);
    expect(o2.forgiven).toBe(200n);
    expect(o1.remaining).toBe(0n);
    expect(o1.settled).toBe(500n);
    expect(o1.lastClosedAt).toBe(1005);
  });

  it("a close larger than its obligation's indexed remainder spills onto the same edge, oldest first", async () => {
    // After a net attributed 500 to ob(1), the chain still lets the creditor close ob(1) for up to its
    // minted 500 as long as the fungible balance covers it. The excess drains ob(2).
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            ...setup(1000),
            confirmed(1, A, B, 500n, 1002),
            confirmed(2, A, B, 300n, 1003),
            confirmed(3, B, A, 400n, 1004),
            {
              contract: "DarefulLedger" as const,
              event: "Netted" as const,
              params: { groupId: GROUP, denomId: USD, a: A, b: B, qty: 400n },
              transaction: { hash: tx(200) },
              block: { timestamp: 1005 },
            },
            {
              contract: "DarefulLedger" as const,
              event: "Closed" as const,
              params: { id: BigInt(A), creditor: B, qty: 300n, reason: 0n, obligationId: ob(1) },
              transaction: { hash: tx(300) },
              block: { timestamp: 1006 },
            },
          ],
        },
      },
    });
    const o1 = await indexer.Obligation.getOrThrow(ob(1));
    const o2 = await indexer.Obligation.getOrThrow(ob(2));
    expect(o1.remaining).toBe(0n); // 500 - 400 netted - 100 settled
    expect(o1.settled).toBe(100n);
    expect(o2.remaining).toBe(100n); // 300 - 200 settled spillover
    expect(o2.settled).toBe(200n);
  });
});

describe("DarefulDares handlers", () => {
  it("links the edges minted in a settlement transaction to their market", async () => {
    const indexer = createTestIndexer();
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            ...setup(1000),
            {
              contract: "DarefulDares" as const,
              event: "DareCreated" as const,
              params: {
                dareId: DARE,
                groupId: GROUP,
                kind: 0n,
                pace: 0n,
                creator: A,
                termsHash: `0x${"44".repeat(32)}`,
                denomId: USD,
                range: 0n,
                options: 0n,
                stalemate: 0n,
                resolvesBy: 1_800_000_000n,
              },
              transaction: { hash: tx(400) },
              block: { timestamp: 1002 },
            },
            {
              contract: "DarefulDares" as const,
              event: "Entered" as const,
              params: { dareId: DARE, participant: A, stake: 1000n, value: 2000n, confidenceBps: 0n },
              transaction: { hash: tx(400) },
              block: { timestamp: 1002 },
            },
            {
              contract: "DarefulDares" as const,
              event: "Entered" as const,
              params: { dareId: DARE, participant: B, stake: 1000n, value: 7000n, confidenceBps: 0n },
              transaction: { hash: tx(400) },
              block: { timestamp: 1002 },
            },
            {
              contract: "DarefulDares" as const,
              event: "DareResolved" as const,
              params: { dareId: DARE, outcome: 1n, votes: 2n },
              transaction: { hash: tx(500) },
              block: { timestamp: 1003 },
            },
            {
              contract: "DarefulDares" as const,
              event: "Scored" as const,
              params: { dareId: DARE, participant: A, score: 3600n },
              transaction: { hash: tx(500) },
              block: { timestamp: 1003 },
            },
            {
              contract: "DarefulDares" as const,
              event: "Scored" as const,
              params: { dareId: DARE, participant: B, score: 9100n },
              transaction: { hash: tx(500) },
              block: { timestamp: 1003 },
            },
            confirmed(9, A, B, 550n, 1003, tx(500)),
          ],
        },
      },
    });
    const dare = await indexer.Dare.getOrThrow(DARE);
    expect(dare.status).toBe("RESOLVED");
    expect(dare.outcome).toBe(1n);
    expect(dare.votes).toBe(2);
    const pa = await indexer.Position.getOrThrow(`${DARE}-${A}`);
    expect(pa.score).toBe(3600);
    const edge = await indexer.Obligation.getOrThrow(ob(9));
    expect(edge.dare_id).toBe(DARE);
    expect(edge.remaining).toBe(550n);
  });

  it("void, arbitration, and expiry set the right status", async () => {
    const indexer = createTestIndexer();
    const create = (id: string, t: number) => ({
      contract: "DarefulDares" as const,
      event: "DareCreated" as const,
      params: { dareId: id, groupId: GROUP, kind: 0n, pace: 0n, creator: A, termsHash: `0x${"44".repeat(32)}`, denomId: USD, range: 0n, options: 0n, stalemate: 0n, resolvesBy: 1n },
      transaction: { hash: tx(600) },
      block: { timestamp: t },
    });
    const D1 = `0x${"51".repeat(32)}`;
    const D2 = `0x${"52".repeat(32)}`;
    const D3 = `0x${"53".repeat(32)}`;
    const RULING = `0x${"66".repeat(32)}`;
    await indexer.process({
      chains: {
        10143: {
          simulate: [
            ...setup(1000),
            create(D1, 1002),
            create(D2, 1002),
            create(D3, 1002),
            { contract: "DarefulDares" as const, event: "DareVoided" as const, params: { dareId: D1, votes: 3n }, transaction: { hash: tx(601) }, block: { timestamp: 1003 } },
            { contract: "DarefulDares" as const, event: "DareArbitrated" as const, params: { dareId: D2, outcome: 0n, voided: true, rulingHash: RULING }, transaction: { hash: tx(602) }, block: { timestamp: 1004 } },
            { contract: "DarefulDares" as const, event: "DareExpired" as const, params: { dareId: D3 }, transaction: { hash: tx(603) }, block: { timestamp: 1005 } },
          ],
        },
      },
    });
    expect((await indexer.Dare.getOrThrow(D1)).status).toBe("VOIDED");
    const d2 = await indexer.Dare.getOrThrow(D2);
    expect(d2.status).toBe("VOIDED");
    expect(d2.voided).toBe(true);
    expect(d2.rulingHash).toBe(RULING);
    expect((await indexer.Dare.getOrThrow(D3)).status).toBe("EXPIRED");
  });
});
