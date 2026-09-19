/**
 * Phase 0 seed: two groups, onchain and offchain, one always-square and one let-it-ride, each with months
 * of plausible obligations, closes, and nets, written through the relayer so Envio indexes them.
 *
 *   npm run seed
 *
 * Seed users derive from SEED_MNEMONIC so re-runs reproduce the same wallets. A re-run first removes the
 * previous seed's Postgres rows (only rows owned by seed users) and registers fresh onchain groups; the old
 * onchain groups stay on the testnet as orphans, which is harmless.
 *
 * Every ledger action is signed by the acting seed wallet with the same EIP-712 types the app will use,
 * and submitted by the relayer with explicit gas. At the end the script recomputes every open edge from
 * its own event log and checks it against the chain, so a mismatch fails the seed loudly.
 */
import { randomUUID } from "node:crypto";
import { encodeAbiParameters, keccak256, stringToHex, type Address, type Hex } from "viem";
import { mnemonicToAccount, type HDAccount } from "viem/accounts";
import { and, inArray, like, ne, or } from "drizzle-orm";
import { db, schema } from "../src/db";
import { contracts } from "../src/lib/chain/contracts";
import { gasFor } from "../src/lib/chain/gas";
import { relayer, submit } from "../src/lib/chain/relayer";
import { CloseReason, ledgerDomain, ledgerTypes } from "../src/lib/chain/typed-data";
import { cents, units, type Cents, type Units } from "../src/lib/money";

// ------------------------------------------------------------------------------------------------------
// Cast
// ------------------------------------------------------------------------------------------------------

type Person = { key: string; name: string; ledger: HDAccount; governance: HDAccount };

const mnemonic = process.env.SEED_MNEMONIC;
if (!mnemonic) throw new Error("SEED_MNEMONIC is not set (generate one with `cast wallet new-mnemonic`)");

const CAST: ReadonlyArray<readonly [string, string]> = [
  ["alex", "Alex"],
  ["sam", "Sam"],
  ["jordan", "Jordan"],
  ["riley", "Riley"],
  ["casey", "Casey"],
  ["morgan", "Morgan"],
  ["taylor", "Taylor"],
];

const people = new Map<string, Person>();
CAST.forEach(([key, name], i) => {
  people.set(key, {
    key,
    name,
    ledger: mnemonicToAccount(mnemonic, { accountIndex: 0, addressIndex: i }),
    governance: mnemonicToAccount(mnemonic, { accountIndex: 1, addressIndex: i }),
  });
});

function person(key: string): Person {
  const p = people.get(key);
  if (!p) throw new Error(`unknown seed person ${key}`);
  return p;
}

// ------------------------------------------------------------------------------------------------------
// Groups and denominations
// ------------------------------------------------------------------------------------------------------

type DenomSpec = {
  key: string;
  template: "usd" | "beer" | "next_time" | null;
  label: string;
  plural: string;
  quantifiable: boolean;
  monetary: boolean;
  emoji: string | null;
};

type GroupSpec = { key: string; name: string; members: string[]; denoms: DenomSpec[]; createdBy: string };

const USD: DenomSpec = { key: "usd", template: "usd", label: "dollar", plural: "dollars", quantifiable: true, monetary: true, emoji: null };
const BEER: DenomSpec = { key: "beer", template: "beer", label: "beer", plural: "beers", quantifiable: true, monetary: false, emoji: "🍺" };
const NEXT: DenomSpec = { key: "next_time", template: "next_time", label: "a next time", plural: "next times", quantifiable: false, monetary: false, emoji: null };

/** Always-square: everyone settles, the scarce good is the privilege of paying. */
const DINNER: GroupSpec = {
  key: "dinner",
  name: "Thursday Dinner Club",
  members: ["alex", "sam", "jordan", "riley", "casey"],
  denoms: [USD],
  createdBy: "alex",
};

/** Let-it-ride: obligations deliberately left unquantified; settling would close the account. */
const FENCE: GroupSpec = {
  key: "fence",
  name: "Fence Jumpers",
  members: ["sam", "jordan", "morgan", "taylor"],
  denoms: [BEER, NEXT, USD],
  createdBy: "sam",
};

// ------------------------------------------------------------------------------------------------------
// Event log (the story), in chronological order
// ------------------------------------------------------------------------------------------------------

type ConfirmEvent = {
  kind: "confirm";
  id: string; // offchain uuid; becomes obligationId (bytes16)
  group: GroupSpec;
  denom: DenomSpec;
  from: string;
  to: string;
  qty: Units | null; // null iff unquantifiable
  amountCents: Cents | null; // magnitude, may be shadow
  settleExpected: boolean;
  memo: string;
  at: Date;
};
type CloseEvent = { kind: "close"; obligation: ConfirmEvent; qty: Units; reason: "Settled" | "Forgiven"; at: Date };
type NetEvent = { kind: "net"; group: GroupSpec; denom: DenomSpec; a: string; b: string; at: Date };
type SeedEvent = ConfirmEvent | CloseEvent | NetEvent;

const DAY = 86_400_000;
const NOW = Date.now();
const daysAgo = (d: number) => new Date(NOW - d * DAY);

/** Deterministic pseudo-random so the story is the same on every run. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1_664_525 + 1_013_904_223) >>> 0;
    return s / 0x1_0000_0000;
  };
}

function buildStory(): SeedEvent[] {
  const events: SeedEvent[] = [];
  const rand = rng(20260916);

  // --- Thursday Dinner Club: ten Thursdays over ten weeks, a rotating payer, shares settled within days.
  const restaurants = ["Lucky Dragon", "the taqueria", "Sal's", "the wine bar", "that ramen place", "Giorgio's", "the pub", "Nan's", "the sushi counter", "Blue Plate"];
  const dinnerMembers = DINNER.members;
  const openDinnerShares: ConfirmEvent[] = [];
  for (let week = 0; week < 10; week++) {
    const at = daysAgo(70 - week * 7);
    const payer = dinnerMembers[week % dinnerMembers.length] ?? "alex";
    const others = dinnerMembers.filter((m) => m !== payer);
    const present = others.filter(() => rand() > 0.25);
    const restaurant = restaurants[week] ?? "dinner";
    for (const debtor of present) {
      const share = cents(1800 + Math.floor(rand() * 48) * 100);
      const ev: ConfirmEvent = {
        kind: "confirm",
        id: randomUUID(),
        group: DINNER,
        denom: USD,
        from: debtor,
        to: payer,
        qty: units(share),
        amountCents: share,
        settleExpected: true,
        memo: `Dinner at ${restaurant}`,
        at,
      };
      events.push(ev);
      // Most shares settle within ten days; the last two weeks mostly stay open.
      const settles = week < 8 ? rand() > 0.12 : rand() > 0.7;
      if (settles) {
        events.push({ kind: "close", obligation: ev, qty: units(share), reason: "Settled", at: new Date(at.getTime() + (1 + Math.floor(rand() * 9)) * DAY) });
      } else {
        openDinnerShares.push(ev);
      }
    }
  }
  // Two reciprocal tangles that get netted: alex covered sam's cab, sam covered alex's tickets.
  const cab: ConfirmEvent = { kind: "confirm", id: randomUUID(), group: DINNER, denom: USD, from: "sam", to: "alex", qty: units(2400), amountCents: cents(2400), settleExpected: true, memo: "Cab home", at: daysAgo(31) };
  const tickets: ConfirmEvent = { kind: "confirm", id: randomUUID(), group: DINNER, denom: USD, from: "alex", to: "sam", qty: units(5500), amountCents: cents(5500), settleExpected: true, memo: "Game tickets", at: daysAgo(29) };
  events.push(cab, tickets);
  events.push({ kind: "net", group: DINNER, denom: USD, a: "alex", b: "sam", at: daysAgo(27) });
  const coffee: ConfirmEvent = { kind: "confirm", id: randomUUID(), group: DINNER, denom: USD, from: "riley", to: "jordan", qty: units(1250), amountCents: cents(1250), settleExpected: true, memo: "Coffees", at: daysAgo(12) };
  const parking: ConfirmEvent = { kind: "confirm", id: randomUUID(), group: DINNER, denom: USD, from: "jordan", to: "riley", qty: units(1250), amountCents: cents(1250), settleExpected: true, memo: "Parking", at: daysAgo(11) };
  events.push(coffee, parking);
  events.push({ kind: "net", group: DINNER, denom: USD, a: "jordan", b: "riley", at: daysAgo(10) });

  // --- Fence Jumpers: four months of "I got this one", lost bets in beers, a couple of forgivenesses.
  const covers = [
    ["sam", "morgan", 3400, "Sam got this one", 118],
    ["taylor", "sam", 2200, "Taylor got the round", 111],
    ["jordan", "morgan", 6100, "Jordan covered the tab", 103],
    ["morgan", "taylor", 1500, "Morgan got coffees", 96],
    ["sam", "jordan", 4700, "Sam got this one", 88],
    ["taylor", "morgan", 2900, "Taylor got lunch", 74],
    ["jordan", "sam", 3800, "Jordan got this one", 61],
    ["morgan", "sam", 5200, "Morgan covered dinner", 47],
    ["taylor", "jordan", 1900, "Taylor got the pitcher", 33],
    ["sam", "taylor", 4100, "Sam got this one", 19],
    ["jordan", "morgan", 2600, "Jordan got brunch", 6],
  ] as const;
  const nextTimes: ConfirmEvent[] = [];
  for (const [creditor, debtor, magnitude, memo, ago] of covers) {
    const ev: ConfirmEvent = {
      kind: "confirm",
      id: randomUUID(),
      group: FENCE,
      denom: NEXT,
      from: debtor,
      to: creditor,
      qty: null,
      amountCents: cents(magnitude),
      settleExpected: false,
      memo,
      at: daysAgo(ago),
    };
    events.push(ev);
    nextTimes.push(ev);
  }
  // Two of the oldest next-times get forgiven: "call it even" is a status move.
  const forgiven = [nextTimes[0], nextTimes[2]];
  for (const ev of forgiven) {
    if (ev) events.push({ kind: "close", obligation: ev, qty: units(1), reason: "Forgiven", at: new Date(ev.at.getTime() + 40 * DAY) });
  }
  // Beers lost on bets, some both ways, netted once.
  const beers = [
    ["morgan", "sam", 2, "Lost the fence bet", 115],
    ["sam", "morgan", 1, "Lost the movie bet", 90],
    ["taylor", "jordan", 3, "Lost the shirts bet", 80],
    ["jordan", "taylor", 1, "Lost the trivia bet", 66],
    ["morgan", "jordan", 2, "Lost the karaoke bet", 52],
    ["sam", "taylor", 1, "Lost the parking bet", 40],
    ["taylor", "sam", 2, "Lost the free-throw bet", 24],
    ["jordan", "morgan", 1, "Lost the fence bet, again", 9],
  ] as const;
  for (const [debtor, creditor, n, memo, ago] of beers) {
    events.push({ kind: "confirm", id: randomUUID(), group: FENCE, denom: BEER, from: debtor, to: creditor, qty: units(n), amountCents: null, settleExpected: false, memo, at: daysAgo(ago) });
  }
  events.push({ kind: "net", group: FENCE, denom: BEER, a: "sam", b: "morgan", at: daysAgo(85) });
  events.push({ kind: "net", group: FENCE, denom: BEER, a: "jordan", b: "taylor", at: daysAgo(60) });
  // One beer actually gets drunk and settled, photo moment.
  const settledBeer = events.find((e): e is ConfirmEvent => e.kind === "confirm" && e.group === FENCE && e.denom === BEER && e.from === "morgan" && e.to === "jordan");
  if (settledBeer) events.push({ kind: "close", obligation: settledBeer, qty: units(1), reason: "Settled", at: daysAgo(30) });
  // A rare monetary one in a let-it-ride group, marked as expected to settle.
  events.push({ kind: "confirm", id: randomUUID(), group: FENCE, denom: USD, from: "morgan", to: "taylor", qty: units(12000), amountCents: cents(12000), settleExpected: true, memo: "Concert tickets", at: daysAgo(14) });

  // Unused variable guard for readers: openDinnerShares documents which shares are still open.
  void openDinnerShares;
  events.sort((x, y) => x.at.getTime() - y.at.getTime());
  return events;
}

// ------------------------------------------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------------------------------------------

const uuidToBytes16 = (u: string): Hex => `0x${u.replace(/-/g, "")}` as Hex;
const hexToBuffer = (h: Hex): Buffer => Buffer.from(h.slice(2), "hex");
const lower = (a: Address): string => a.toLowerCase();

function fungibleId(groupId: Hex, denomId: Hex, debtor: Address): bigint {
  return BigInt(keccak256(encodeAbiParameters([{ type: "bytes32" }, { type: "bytes32" }, { type: "address" }], [groupId, denomId, debtor])));
}

type Registered = {
  group: GroupSpec;
  uuid: string;
  onchainId: Hex;
  denoms: Map<string, { uuid: string; onchainId: Hex; spec: DenomSpec }>;
};

// ------------------------------------------------------------------------------------------------------
// Main
// ------------------------------------------------------------------------------------------------------

async function main(): Promise<void> {
  const { ledger, chainId } = contracts();
  const { publicClient } = relayer();
  const domain = ledgerDomain(chainId, ledger.address);
  const log = (msg: string) => console.log(`[seed] ${msg}`);

  // 1. Remove the previous seed's rows (only rows owned by seed users).
  await db.transaction(async (tx) => {
    const seedUsers = await tx.select({ id: schema.users.id }).from(schema.users).where(like(schema.users.dynamicUserId, "seed:%"));
    const ids = seedUsers.map((u) => u.id);
    if (ids.length === 0) return;
    const seedGroups = await tx.select({ id: schema.groups.id }).from(schema.groups).where(inArray(schema.groups.createdBy, ids));
    const gids = seedGroups.map((g) => g.id);
    if (gids.length > 0) {
      await tx.delete(schema.obligations).where(inArray(schema.obligations.groupId, gids));
      await tx.delete(schema.obligationProposals).where(inArray(schema.obligationProposals.groupId, gids));
      await tx.delete(schema.groupMembers).where(inArray(schema.groupMembers.groupId, gids));
      await tx.delete(schema.groupInvites).where(inArray(schema.groupInvites.groupId, gids));
      await tx.delete(schema.denominations).where(inArray(schema.denominations.groupId, gids));
      await tx.delete(schema.groups).where(inArray(schema.groups.id, gids));
    }
    // A seed user may have made a link in a group the seed does not own.
    await tx.delete(schema.groupInvites).where(inArray(schema.groupInvites.createdBy, ids));
    // Ghosts a seed user added while someone was developing as them. None of this is ledger history: nothing
    // mints for a ghost, so these are pending rows and the links and seats that pointed at them.
    const ghosts = await tx
      .select({ id: schema.participantClaims.id })
      .from(schema.participantClaims)
      .where(or(inArray(schema.participantClaims.createdBy, ids), inArray(schema.participantClaims.claimedBy, ids)));
    const cids = ghosts.map((g) => g.id);
    if (cids.length > 0) {
      await tx
        .delete(schema.obligationProposals)
        .where(
          and(
            ne(schema.obligationProposals.status, "confirmed"),
            or(
              inArray(schema.obligationProposals.fromClaim, cids),
              inArray(schema.obligationProposals.toClaim, cids),
              inArray(schema.obligationProposals.fromBoundClaim, cids),
              inArray(schema.obligationProposals.toBoundClaim, cids),
            ),
          ),
        );
      await tx.delete(schema.claimTokens).where(inArray(schema.claimTokens.claimId, cids));
      await tx.delete(schema.claimLinks).where(inArray(schema.claimLinks.claimId, cids));
      await tx.delete(schema.groupMembers).where(inArray(schema.groupMembers.claimId, cids));
      await tx.update(schema.participantClaims).set({ mergedInto: null }).where(inArray(schema.participantClaims.mergedInto, cids));
      await tx.delete(schema.participantClaims).where(inArray(schema.participantClaims.id, cids));
    }
    await tx.delete(schema.users).where(inArray(schema.users.id, ids));
    log(`removed previous seed: ${ids.length} users, ${gids.length} groups`);
  });

  // 2. Users.
  const userIds = new Map<string, string>();
  for (const p of people.values()) {
    const [row] = await db
      .insert(schema.users)
      .values({
        dynamicUserId: `seed:${p.key}`,
        ledgerWallet: lower(p.ledger.address),
        governanceWallet: lower(p.governance.address),
        displayName: p.name,
        createdAt: daysAgo(130),
      })
      .returning({ id: schema.users.id });
    if (!row) throw new Error(`failed to insert user ${p.key}`);
    userIds.set(p.key, row.id);
  }
  const userId = (key: string): string => {
    const id = userIds.get(key);
    if (!id) throw new Error(`no user id for ${key}`);
    return id;
  };
  log(`inserted ${userIds.size} users`);

  // 3. Groups and denominations, onchain then offchain.
  const registered = new Map<string, Registered>();
  for (const g of [DINNER, FENCE]) {
    const uuid = randomUUID();
    const onchainId = keccak256(stringToHex(`dareful:group:${uuid}`));
    const members = g.members.map((k) => ({ ledger: person(k).ledger.address, governance: person(k).governance.address }));
    const { hash } = await submit({
      label: `createGroup ${g.name}`,
      address: ledger.address,
      abi: ledger.abi,
      functionName: "createGroup",
      args: [onchainId, members],
      gas: gasFor.createGroup(members.length),
    });
    log(`group ${g.name} registered onchain (${hash})`);
    await db.insert(schema.groups).values({ id: uuid, onchainId: hexToBuffer(onchainId), name: g.name, isDyad: false, createdBy: userId(g.createdBy), createdAt: daysAgo(125) });
    await db.insert(schema.groupMembers).values(g.members.map((k) => ({ groupId: uuid, userId: userId(k), joinedAt: daysAgo(125) })));

    const denoms = new Map<string, { uuid: string; onchainId: Hex; spec: DenomSpec }>();
    for (const d of g.denoms) {
      const duuid = randomUUID();
      const donchain = keccak256(stringToHex(`dareful:denom:${duuid}`));
      await submit({
        label: `createDenom ${g.name}/${d.label}`,
        address: ledger.address,
        abi: ledger.abi,
        functionName: "createDenom",
        args: [onchainId, donchain, d.quantifiable],
        gas: gasFor.createDenom(),
      });
      await db.insert(schema.denominations).values({
        id: duuid,
        groupId: uuid,
        onchainId: hexToBuffer(donchain),
        template: d.template,
        label: d.label,
        pluralLabel: d.plural,
        quantifiable: d.quantifiable,
        monetary: d.monetary,
        emoji: d.emoji,
        createdBy: userId(g.createdBy),
      });
      denoms.set(d.key, { uuid: duuid, onchainId: donchain, spec: d });
    }
    registered.set(g.key, { group: g, uuid, onchainId, denoms });
    log(`group ${g.name}: ${denoms.size} denominations registered`);
  }
  const reg = (g: GroupSpec): Registered => {
    const r = registered.get(g.key);
    if (!r) throw new Error(`group ${g.key} not registered`);
    return r;
  };
  const denomOf = (g: GroupSpec, d: DenomSpec) => {
    const r = reg(g).denoms.get(d.key);
    if (!r) throw new Error(`denomination ${d.key} not registered in ${g.key}`);
    return r;
  };

  // 4. Replay the story.
  const expected = new Map<string, bigint>(); // `${group}|${denom}|${debtor}|${creditor}` -> open units
  const edgeKey = (g: Hex, d: Hex, debtor: Address, creditor: Address) => `${g}|${d}|${lower(debtor)}|${lower(creditor)}`;
  const bump = (k: string, delta: bigint) => expected.set(k, (expected.get(k) ?? 0n) + delta);

  const story = buildStory();
  let confirms = 0;
  let closes = 0;
  let nets = 0;
  for (const ev of story) {
    if (ev.kind === "confirm") {
      const r = reg(ev.group);
      const d = denomOf(ev.group, ev.denom);
      const debtor = person(ev.from);
      const creditor = person(ev.to);
      const obligationId = uuidToBytes16(ev.id);
      const qty = ev.qty ?? units(1); // unquantifiable mints exactly one unit
      const sig = await debtor.ledger.signTypedData({
        domain,
        types: ledgerTypes,
        primaryType: "Confirm",
        message: { groupId: r.onchainId, denomId: d.onchainId, creditor: creditor.ledger.address, qty, obligationId, unique: false },
      });
      const { hash } = await submit({
        label: `confirm ${ev.from} -> ${ev.to} ${qty} ${ev.denom.label}`,
        address: ledger.address,
        abi: ledger.abi,
        functionName: "confirm",
        args: [r.onchainId, d.onchainId, creditor.ledger.address, qty, obligationId, false, sig],
        gas: gasFor.confirm(),
      });
      await db.insert(schema.obligations).values({
        id: ev.id,
        tokenId: fungibleId(r.onchainId, d.onchainId, debtor.ledger.address),
        groupId: r.uuid,
        fromUser: userId(ev.from),
        toUser: userId(ev.to),
        denomId: d.uuid,
        quantity: ev.qty,
        uniqueObligation: false,
        amountCents: ev.amountCents,
        origin: "manual",
        settleExpected: ev.settleExpected,
        memo: ev.memo,
        confirmTx: hexToBuffer(hash),
        createdAt: ev.at,
      });
      bump(edgeKey(r.onchainId, d.onchainId, debtor.ledger.address, creditor.ledger.address), qty);
      confirms++;
    } else if (ev.kind === "close") {
      const ob = ev.obligation;
      const r = reg(ob.group);
      const d = denomOf(ob.group, ob.denom);
      const creditor = person(ob.to);
      const obligationId = uuidToBytes16(ob.id);
      const onchain = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "obligationOf", args: [obligationId] });
      const reason = CloseReason[ev.reason];
      const sig = await creditor.ledger.signTypedData({
        domain,
        types: ledgerTypes,
        primaryType: "Close",
        message: { id: onchain.tokenId, qty: ev.qty, reason, obligationId, nonce: onchain.closes },
      });
      await submit({
        label: `close ${ev.reason} ${ob.from} -> ${ob.to} ${ev.qty} ${ob.denom.label}`,
        address: ledger.address,
        abi: ledger.abi,
        functionName: "close",
        args: [onchain.tokenId, ev.qty, reason, obligationId, sig],
        gas: gasFor.close(),
      });
      bump(edgeKey(r.onchainId, d.onchainId, person(ob.from).ledger.address, creditor.ledger.address), -ev.qty);
      closes++;
    } else {
      const r = reg(ev.group);
      const d = denomOf(ev.group, ev.denom);
      const a = person(ev.a);
      const b = person(ev.b);
      const nonce = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "netNonceOf", args: [r.onchainId, d.onchainId, a.ledger.address, b.ledger.address] });
      const sig = await a.ledger.signTypedData({
        domain,
        types: ledgerTypes,
        primaryType: "Net",
        message: { groupId: r.onchainId, denomId: d.onchainId, a: a.ledger.address, b: b.ledger.address, nonce },
      });
      await submit({
        label: `net ${ev.a} <-> ${ev.b} ${ev.denom.label}`,
        address: ledger.address,
        abi: ledger.abi,
        functionName: "net",
        args: [r.onchainId, d.onchainId, a.ledger.address, b.ledger.address, sig],
        gas: gasFor.net(),
      });
      const kAB = edgeKey(r.onchainId, d.onchainId, a.ledger.address, b.ledger.address);
      const kBA = edgeKey(r.onchainId, d.onchainId, b.ledger.address, a.ledger.address);
      const x = expected.get(kAB) ?? 0n;
      const y = expected.get(kBA) ?? 0n;
      const q = x < y ? x : y;
      if (q === 0n) throw new Error(`seed story error: nothing to net between ${ev.a} and ${ev.b}`);
      bump(kAB, -q);
      bump(kBA, -q);
      nets++;
    }
  }
  log(`replayed ${confirms} confirms, ${closes} closes, ${nets} nets`);

  // 5. Verify every open edge against the chain.
  let mismatches = 0;
  const rows: Array<{ group: string; denom: string; debtor: string; creditor: string; expected: string; chain: string }> = [];
  for (const [key, want] of expected) {
    const [g, d, debtor, creditor] = key.split("|") as [Hex, Hex, Address, Address];
    const got = await publicClient.readContract({ address: ledger.address, abi: ledger.abi, functionName: "balanceOf", args: [creditor, fungibleId(g, d, debtor)] });
    const r = [...registered.values()].find((x) => x.onchainId === g);
    const dn = r ? [...r.denoms.values()].find((x) => x.onchainId === d) : undefined;
    const name = (addr: string) => [...people.values()].find((p) => lower(p.ledger.address) === addr)?.name ?? addr;
    if (want !== 0n || got !== 0n) {
      rows.push({ group: r?.group.name ?? g, denom: dn?.spec.label ?? d, debtor: name(debtor), creditor: name(creditor), expected: want.toString(), chain: got.toString() });
    }
    if (want !== got) mismatches++;
  }
  console.table(rows.sort((x, y) => x.group.localeCompare(y.group) || x.denom.localeCompare(y.denom) || x.debtor.localeCompare(y.debtor)));
  if (mismatches > 0) throw new Error(`${mismatches} open edges disagree with the chain`);
  log(`chain matches the seed's expectation on ${expected.size} edges (${rows.length} open)`);

  for (const r of registered.values()) {
    log(`${r.group.name}: offchain ${r.uuid}, onchain ${r.onchainId}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  });
