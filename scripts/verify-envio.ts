/**
 * Checks that Envio's `OpenBetween` query (PLANNING.md section 10) agrees with the chain for every pair
 * of seed users, in every group and denomination. Run after `npm run seed` with the indexer up:
 *
 *   npm run verify:envio
 */
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";
import { isNotNull, like } from "drizzle-orm";
import { denomOnchainId, questionGroupOnchainId } from "../src/lib/ledger/ids";
import { db, schema } from "../src/db";
import { contracts } from "../src/lib/chain/contracts";
import { relayer } from "../src/lib/chain/relayer";
import { scoreBinary, scoreCategorical, scoreNumeric, settle } from "../src/lib/ledger/scoring";
import { scaleAfterward } from "../src/lib/ledger/scale";
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
  // Questions created in a group of their own: their chain group is not their set's.
  const ownGroups = (await db.select({ id: schema.dares.id, groupId: schema.dares.groupId, denomId: schema.dares.denomId, chainGroup: schema.dares.chainGroup }).from(schema.dares).where(isNotNull(schema.dares.chainGroup))).filter((q) => toHex(q.chainGroup).toLowerCase() === questionGroupOnchainId(q.id).toLowerCase());

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
      // The chain's view for every registered (group, denom) in both directions: each set's own group with its units,
      // and each question created in a group of its own with its one unit (the games-and-the-reveal round, 2026-10-07).
      const places = [
        ...groups.filter((g) => g.onchainId).flatMap((g) => denoms.filter((x) => x.groupId === g.id && x.onchainId).map((d) => ({ name: g.name ?? "a set", gid: toHex(g.onchainId), label: d.label, did: toHex(d.onchainId) }))),
        ...ownGroups.flatMap((q) => {
          const d = denoms.find((x) => x.id === q.denomId);
          return d ? [{ name: `question ${q.id.slice(0, 8)}`, gid: toHex(q.chainGroup), label: d.label, did: denomOnchainId(d.id) }] : [];
        }),
      ];
      for (const { name, gid, label, did } of places) {
        {
          for (const [debtor, creditor] of [[a, b], [b, a]] as const) {
            const bal = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "balanceOf", args: [creditor.ledgerWallet as Address, fungibleId(gid, did, debtor.ledgerWallet as Address)] });
            const k = `${gid}|${did}|${debtor.ledgerWallet}|${creditor.ledgerWallet}`;
            const seen = envio.get(k) ?? 0n;
            checked++;
            if (seen !== bal) {
              mismatches++;
              console.error(`MISMATCH ${name}/${label} ${debtor.displayName} -> ${creditor.displayName}: envio ${seen}, chain ${bal}`);
            }
          }
        }
      }
    }
  }
  console.log(`[verify-envio] ${checked} edges checked across ${users.length} seed users; ${mismatches} mismatches; ${totalOpen} open units reported by Envio`);
  const marketMismatches = await verifyMarkets();
  if (mismatches + marketMismatches > 0) process.exit(1);
}

/**
 * Markets, three ways at once. For every market Envio knows: the chain's own record (`dareOf`, `positionsOf`)
 * must match Envio's status, outcome, and positions; every edge Envio attributes to it must exist onchain with
 * that quantity and creditor (`obligationOf`); and the edges must be exactly the edges the scoring rule produces
 * from the positions and the outcome, computed here from the specification by `src/lib/ledger/scoring.ts`. The
 * last check is the one that would catch a settlement that was self-consistent and wrong.
 */
async function verifyMarkets(): Promise<number> {
  const { dares, ledger } = contracts();
  const { publicClient } = relayer();
  const url = process.env.ENVIO_GRAPHQL_URL;
  if (!url) throw new Error("ENVIO_GRAPHQL_URL is not set");
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query: `{ Dare(limit: 500, order_by: { createdAt: asc }) { id status outcome kind range options positions { participant stake value confidenceBps score } edges { id debtor creditor qty } } }` }),
  });
  const parsed = z
    .object({ data: z.object({ Dare: z.array(z.object({ id: z.string(), status: z.string(), outcome: z.string().nullable(), kind: z.number(), range: z.string(), options: z.number(), positions: z.array(z.object({ participant: z.string(), stake: z.string(), value: z.string(), confidenceBps: z.number(), score: z.number().nullable() })), edges: z.array(z.object({ id: z.string(), debtor: z.string(), creditor: z.string(), qty: z.string() })) })) }) })
    .parse(await res.json());

  const STATUS = ["LOCKED", "RESOLVED", "VOIDED", "EXPIRED"];
  let bad = 0;
  let edgesChecked = 0;
  let numeric = 0;
  let pickOne = 0;
  const fail = (m: string) => {
    bad++;
    console.error(`MARKET MISMATCH ${m}`);
  };
  for (const d of parsed.data.Dare) {
    const tag = d.id.slice(0, 12);
    const onchain = (await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "dareOf", args: [d.id as Hex] })) as { status: number; outcome: bigint; kind: number; range: bigint; options: number };
    if (onchain.kind !== d.kind || onchain.range !== BigInt(d.range)) fail(`${tag}: envio says kind ${d.kind} on a scale of ${d.range}, chain says ${onchain.kind} on ${onchain.range}`);
    if (onchain.options !== d.options) fail(`${tag}: envio says ${d.options} answers, chain says ${onchain.options}`);
    const ps = (await publicClient.readContract({ address: dares.address, abi: dares.abi, functionName: "positionsOf", args: [d.id as Hex] })) as ReadonlyArray<{ ledger: Address; stake: bigint; value: bigint; confidenceBps: number }>;
    if (STATUS[onchain.status] !== d.status) fail(`${tag}: envio says ${d.status}, chain says ${STATUS[onchain.status]}`);
    if (d.status === "RESOLVED" && BigInt(d.outcome ?? "-1") !== onchain.outcome) fail(`${tag}: envio outcome ${d.outcome}, chain ${onchain.outcome}`);
    const chainPositions = ps.map((p) => `${p.ledger.toLowerCase()}:${p.stake}:${p.value}:${p.confidenceBps}`).sort();
    const envioPositions = d.positions.map((p) => `${p.participant.toLowerCase()}:${p.stake}:${p.value}:${p.confidenceBps}`).sort();
    if (chainPositions.join() !== envioPositions.join()) fail(`${tag}: positions differ`);

    for (const e of d.edges) {
      const o = (await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "obligationOf", args: [e.id as Hex] })) as { minted: bigint; creditor: Address };
      edgesChecked++;
      if (o.minted !== BigInt(e.qty) || o.creditor.toLowerCase() !== e.creditor.toLowerCase()) fail(`${tag}: edge ${e.id} is ${e.qty} to ${e.creditor} in envio, ${o.minted} to ${o.creditor} onchain`);
    }

    const spell = (edges: Array<{ debtor: string; creditor: string; qty: bigint }>) => edges.map((e) => `${e.debtor.toLowerCase()}>${e.creditor.toLowerCase()}:${e.qty}`).sort().join();
    if (d.status === "RESOLVED") {
      // positionsOf is in entry order, which is the order the contract pairs people in. A pick-one market scores each pick
      // with the confidence it signed (everything, on a pick) over the market's own count of answers.
      const scored = ps.map((p) => ({ id: p.ledger.toLowerCase(), stake: p.stake, score: d.kind === 2 ? scoreCategorical(p.value, BigInt(p.confidenceBps), BigInt(onchain.options), onchain.outcome) : d.kind === 1 ? scoreNumeric(p.value, onchain.outcome, onchain.range) : scoreBinary(p.value, onchain.outcome) }));
      if (d.kind === 2) {
        pickOne++;
        const right = scored.filter((p) => p.score === 10000n).length;
        console.log(`[verify-envio] pick-one market ${tag}: ${onchain.options} answers, answer ${onchain.outcome}, picks ${ps.map((p) => `${p.value}@${p.confidenceBps}`).join(" ")}; ${right} of ${ps.length} called it${right === 0 || right === ps.length ? " (a tie: nothing changed hands)" : ""}`);
      }
      if (d.kind === 1) {
        // The scale and the answer, together, so a scale that turned out wrong is visible afterward (src/lib/ledger/scale.ts).
        numeric++;
        const after = scaleAfterward(scored.map((p) => p.score));
        console.log(`[verify-envio] number market ${tag}: scale ${onchain.range}, answer ${onchain.outcome}, entries ${ps.map((p) => p.value).join(" ")}; ${after.floored} of ${after.of} floored at zero${after.allNear ? "; every score within five percent of perfect (the scale was wide)" : ""}`);
      }
      for (const p of scored) {
        const seen = d.positions.find((x) => x.participant.toLowerCase() === p.id)?.score;
        if (seen === null || seen === undefined || BigInt(seen) !== p.score) fail(`${tag}: ${p.id} scored ${seen} in envio, the rule says ${p.score}`);
      }
      const expected = spell(settle(scored));
      const actual = spell(d.edges.map((e) => ({ debtor: e.debtor, creditor: e.creditor, qty: BigInt(e.qty) })));
      if (expected !== actual) fail(`${tag}: minted edges are not the edges the scoring rule produces\n  rule:   ${expected}\n  minted: ${actual}`);
    } else if (d.edges.length > 0) {
      fail(`${tag}: a market that is ${d.status} minted ${d.edges.length} edges`);
    }
  }
  console.log(`[verify-envio] ${parsed.data.Dare.length} markets (${numeric} of them number markets, ${pickOne} pick-one) and ${edgesChecked} minted edges checked against the chain and against the scoring rule; ${bad} mismatches`);
  return bad;
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
