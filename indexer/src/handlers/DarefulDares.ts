import { indexer } from "envio";
import { eventId, lc } from "./shared";

indexer.onEvent({ contract: "DarefulDares", event: "DareCreated" }, async ({ event, context }) => {
  const dareId = lc(event.params.dareId);
  const groupId = lc(event.params.groupId);
  context.Dare.set({
    id: dareId,
    group_id: groupId,
    groupId,
    kind: Number(event.params.kind),
    pace: Number(event.params.pace),
    creator: lc(event.params.creator),
    termsHash: lc(event.params.termsHash),
    denomId: lc(event.params.denomId),
    range: event.params.range,
    options: Number(event.params.options),
    stalemate: Number(event.params.stalemate),
    resolvesBy: event.params.resolvesBy,
    status: "LOCKED",
    outcome: undefined,
    votes: undefined,
    voided: false,
    rulingHash: undefined,
    createdAt: event.block.timestamp,
    createTx: event.transaction.hash,
    resolvedAt: undefined,
    resolveTx: undefined,
  });
  context.DareCreatedEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    dareId,
    groupId,
    kind: Number(event.params.kind),
    pace: Number(event.params.pace),
    creator: lc(event.params.creator),
    termsHash: lc(event.params.termsHash),
    denomId: lc(event.params.denomId),
    range: event.params.range,
    options: Number(event.params.options),
    stalemate: Number(event.params.stalemate),
    resolvesBy: event.params.resolvesBy,
  });
});

indexer.onEvent({ contract: "DarefulDares", event: "Entered" }, async ({ event, context }) => {
  const dareId = lc(event.params.dareId);
  const participant = lc(event.params.participant);
  context.Position.set({
    id: `${dareId}-${participant}`,
    dare_id: dareId,
    participant,
    stake: event.params.stake,
    value: event.params.value,
    confidenceBps: Number(event.params.confidenceBps),
    score: undefined,
  });
  context.EnteredEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    dareId,
    participant,
    stake: event.params.stake,
    value: event.params.value,
    confidenceBps: Number(event.params.confidenceBps),
  });
});

indexer.onEvent({ contract: "DarefulDares", event: "DareResolved" }, async ({ event, context }) => {
  const dareId = lc(event.params.dareId);
  const dare = await context.Dare.get(dareId);
  if (!dare) throw new Error(`DareResolved for unknown dare ${dareId}`);
  context.Dare.set({
    ...dare,
    status: "RESOLVED",
    outcome: event.params.outcome,
    votes: Number(event.params.votes),
    resolvedAt: event.block.timestamp,
    resolveTx: event.transaction.hash,
  });
  context.SettlementTx.set({ id: event.transaction.hash, dare_id: dareId });
  context.DareResolvedEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    dareId,
    outcome: event.params.outcome,
    votes: Number(event.params.votes),
  });
});

indexer.onEvent({ contract: "DarefulDares", event: "DareVoided" }, async ({ event, context }) => {
  const dareId = lc(event.params.dareId);
  const dare = await context.Dare.get(dareId);
  if (!dare) throw new Error(`DareVoided for unknown dare ${dareId}`);
  context.Dare.set({
    ...dare,
    status: "VOIDED",
    voided: true,
    votes: Number(event.params.votes),
    resolvedAt: event.block.timestamp,
    resolveTx: event.transaction.hash,
  });
  context.DareVoidedEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    dareId,
    votes: Number(event.params.votes),
  });
});

indexer.onEvent({ contract: "DarefulDares", event: "DareArbitrated" }, async ({ event, context }) => {
  const dareId = lc(event.params.dareId);
  const dare = await context.Dare.get(dareId);
  if (!dare) throw new Error(`DareArbitrated for unknown dare ${dareId}`);
  const voided = event.params.voided;
  context.Dare.set({
    ...dare,
    status: voided ? "VOIDED" : "RESOLVED",
    voided,
    outcome: voided ? undefined : event.params.outcome,
    rulingHash: lc(event.params.rulingHash),
    resolvedAt: event.block.timestamp,
    resolveTx: event.transaction.hash,
  });
  if (!voided) context.SettlementTx.set({ id: event.transaction.hash, dare_id: dareId });
  context.DareArbitratedEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    dareId,
    outcome: event.params.outcome,
    voided,
    rulingHash: lc(event.params.rulingHash),
  });
});

indexer.onEvent({ contract: "DarefulDares", event: "DareExpired" }, async ({ event, context }) => {
  const dareId = lc(event.params.dareId);
  const dare = await context.Dare.get(dareId);
  if (!dare) throw new Error(`DareExpired for unknown dare ${dareId}`);
  context.Dare.set({ ...dare, status: "EXPIRED", resolvedAt: event.block.timestamp, resolveTx: event.transaction.hash });
  context.DareExpiredEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    dareId,
  });
});

indexer.onEvent({ contract: "DarefulDares", event: "Scored" }, async ({ event, context }) => {
  const dareId = lc(event.params.dareId);
  const participant = lc(event.params.participant);
  const position = await context.Position.get(`${dareId}-${participant}`);
  if (!position) throw new Error(`Scored for unknown position ${dareId}-${participant}`);
  context.Position.set({ ...position, score: Number(event.params.score) });
  context.ScoredEvent.set({
    id: eventId(event),
    tx: event.transaction.hash,
    block: event.block.number,
    timestamp: event.block.timestamp,
    dareId,
    participant,
    score: Number(event.params.score),
  });
});
