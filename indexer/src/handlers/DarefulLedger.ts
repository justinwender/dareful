import { indexer } from "envio";
import { drain, eventId, lc, openEdge } from "./shared";

indexer.onEvent({ contract: "DarefulLedger", event: "GroupCreated" }, async ({ event, context }) => {
  const groupId = lc(event.params.groupId);
  const ledgers = event.params.ledgers.map(lc);
  const governances = event.params.governances.map(lc);
  context.Group.set({ id: groupId, createdAt: event.block.timestamp, createdTx: event.transaction.hash });
  ledgers.forEach((ledger, i) => {
    const governance = governances[i];
    if (governance === undefined) throw new Error(`GroupCreated ${groupId}: ledgers and governances differ in length`);
    context.Member.set({ id: `${groupId}-${ledger}`, group_id: groupId, ledger, governance, addedAt: event.block.timestamp });
  });
  context.GroupCreatedEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    groupId,
    ledgers,
    governances,
  });
});

indexer.onEvent({ contract: "DarefulLedger", event: "MemberAdded" }, async ({ event, context }) => {
  const groupId = lc(event.params.groupId);
  const ledger = lc(event.params.ledger);
  const governance = lc(event.params.governance);
  context.Member.set({ id: `${groupId}-${ledger}`, group_id: groupId, ledger, governance, addedAt: event.block.timestamp });
  context.MemberAddedEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    groupId,
    ledger,
    governance,
  });
});

indexer.onEvent({ contract: "DarefulLedger", event: "DenomCreated" }, async ({ event, context }) => {
  const groupId = lc(event.params.groupId);
  const denomId = lc(event.params.denomId);
  context.Denom.set({
    id: `${groupId}-${denomId}`,
    group_id: groupId,
    denomId,
    quantifiable: event.params.quantifiable,
    createdAt: event.block.timestamp,
  });
  context.DenomCreatedEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    groupId,
    denomId,
    quantifiable: event.params.quantifiable,
  });
});

indexer.onEvent({ contract: "DarefulLedger", event: "Confirmed" }, async ({ event, context }) => {
  const obligationId = lc(event.params.obligationId);
  const groupId = lc(event.params.groupId);
  const denomId = lc(event.params.denomId);
  const debtor = lc(event.params.debtor);
  const creditor = lc(event.params.creditor);

  const existing = await context.Obligation.get(obligationId);
  if (existing) throw new Error(`Confirmed twice for obligation ${obligationId}`);

  // A mint inside a settlement transaction belongs to the market that resolved in that transaction.
  const settlement = await context.SettlementTx.get(event.transaction.hash);

  context.Obligation.set({
    id: obligationId,
    tokenId: event.params.id,
    group_id: groupId,
    groupId,
    denomId,
    debtor,
    creditor,
    qty: event.params.qty,
    remaining: event.params.qty,
    settled: 0n,
    forgiven: 0n,
    netted: 0n,
    unique: event.params.unique,
    dare_id: settlement?.dare_id,
    confirmedAt: event.block.timestamp,
    confirmTx: event.transaction.hash,
    lastClosedAt: undefined,
  });
  context.ConfirmedEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    groupId,
    denomId,
    debtor,
    creditor,
    tokenId: event.params.id,
    qty: event.params.qty,
    obligationId,
    unique: event.params.unique,
  });
});

indexer.onEvent({ contract: "DarefulLedger", event: "Closed" }, async ({ event, context }) => {
  const obligationId = lc(event.params.obligationId);
  const creditor = lc(event.params.creditor);
  const qty = event.params.qty;
  const reason = Number(event.params.reason) === 0 ? "SETTLED" : "FORGIVEN";
  const counter = reason === "SETTLED" ? "settled" : "forgiven";

  const ob = await context.Obligation.get(obligationId);
  if (!ob) throw new Error(`Closed for unknown obligation ${obligationId}`);
  if (ob.tokenId !== event.params.id) throw new Error(`Closed ${obligationId}: token id mismatch`);

  // The named obligation first; any excess (possible after a net was attributed elsewhere) drains the
  // same edge's other open obligations oldest-first.
  const own = ob.remaining < qty ? ob.remaining : qty;
  if (own > 0n) {
    context.Obligation.set({ ...ob, remaining: ob.remaining - own, [counter]: ob[counter] + own, lastClosedAt: event.block.timestamp });
  }
  const excess = qty - own;
  if (excess > 0n) {
    const others = (await openEdge(context.Obligation, ob.groupId, ob.denomId, ob.debtor, ob.creditor)).filter((o) => o.id !== ob.id);
    drain(others, excess, counter, event.block.timestamp, context.Obligation, `Closed ${obligationId}`);
  }

  context.ClosedEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    tokenId: event.params.id,
    creditor,
    qty,
    reason,
    obligationId,
  });
});

indexer.onEvent({ contract: "DarefulLedger", event: "Netted" }, async ({ event, context }) => {
  const groupId = lc(event.params.groupId);
  const denomId = lc(event.params.denomId);
  const a = lc(event.params.a);
  const b = lc(event.params.b);
  const qty = event.params.qty;

  const ab = await openEdge(context.Obligation, groupId, denomId, a, b);
  drain(ab, qty, "netted", event.block.timestamp, context.Obligation, `Netted ${a}->${b}`);
  const ba = await openEdge(context.Obligation, groupId, denomId, b, a);
  drain(ba, qty, "netted", event.block.timestamp, context.Obligation, `Netted ${b}->${a}`);

  context.NettedEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    groupId,
    denomId,
    a,
    b,
    qty,
  });
});
