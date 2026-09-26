import type { MarketCardData } from "@/lib/ledger/market-view";
import { ruler, unitPhrase } from "@/lib/ledger/number-axis";
import { closesLabel } from "@/lib/ui/copy";
import { markRefOf } from "@/lib/ui/mark";
import { MarketCard, type MarketCardProps } from "./market-card";
import type { RulerData } from "./call-line";

/** A number question's ruler for a card (3.5): everyone's number and the answer, where numbers may be shown. */
export function rulerFor(m: Pick<MarketCardData, "people" | "unit" | "answer">): RulerData | null {
  if (!m.unit) return null;
  const pins = m.people.filter((p): p is typeof p & { number: string } => p.number !== null);
  if (pins.length === 0 && m.answer === null) return null;
  const r = ruler(pins.map((p) => ({ id: p.id, value: BigInt(p.number) })), m.answer === null ? null : BigInt(m.answer), m.unit);
  if (!r) return null;
  const nameOf = new Map(pins.map((p) => [p.id, p.name]));
  return { leftLabel: r.leftLabel, rightLabel: r.rightLabel, pins: r.pins.map((p) => ({ id: p.id, name: nameOf.get(p.id) ?? "Someone", value: p.value.toLocaleString("en-US"), xPermille: p.xPermille, off: p.off })), answer: r.answer ? { value: r.answer.value.toString(), xPermille: r.answer.xPermille } : null };
}

/** The view model from `marketCards()` as a timeline card. */
export function MarketCardFrom({ m, viewerId, clock, consequenceStates, close }: { m: MarketCardData; viewerId: string; clock: { zone: string; now: number }; consequenceStates?: MarketCardProps["consequenceStates"]; close?: MarketCardProps["close"] }) {
  return (
    <MarketCard
      consequenceStates={consequenceStates}
      close={close}
      id={m.dare.id}
      title={m.dare.title}
      mark={markRefOf(m.dare)}
      media={m.media}
      groupName={m.groupName}
      state={m.state}
      ink={m.ink}
      viewerIn={m.viewerIn}
      votesCast={m.votesCast}
      clockLine={m.state === "open" && m.dare.resolvesBy ? `Closes ${closesLabel(m.dare.resolvesBy, new Date(clock.now), clock.zone)}` : m.state === "locked" && m.dare.resolvesBy && m.votesCast === 0 ? `Resolving ${closesLabel(m.dare.resolvesBy, new Date(clock.now), clock.zone)}` : null}
      argument={m.dare.pace === "argument"}
      at={m.at}
      clock={clock}
      viewerId={viewerId}
      people={m.people}
      groupSize={m.groupSize}
      outcome={m.outcome}
      number={m.unit ? { ruler: rulerFor(m), answerLine: m.answer === null ? null : `${unitPhrase(BigInt(m.answer), m.unit)}.` } : null}
      denomination={m.denomination}
      consequences={m.consequences}
    />
  );
}
