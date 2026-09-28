import type { MarketCardData } from "@/lib/ledger/market-view";
import { ruler, unitPhrase } from "@/lib/ledger/number-axis";
import { closesLabel } from "@/lib/ui/copy";
import { markRefOf } from "@/lib/ui/mark";
import { outcomeLine } from "@/lib/ui/outcome-words";
import { answerLine } from "@/lib/ledger/pick-one";
import { hueFor } from "@/lib/ui/hue";
import { MarketCard, type MarketCardProps } from "./market-card";
import type { RulerData } from "./call-line";
import type { PickOneAnswer } from "./pick-one-bars";

/** A number question's ruler for a card (3.5): everyone's number and the answer, where numbers may be shown. */
export function rulerFor(m: Pick<MarketCardData, "people" | "unit" | "answer">): RulerData | null {
  if (!m.unit) return null;
  const pins = m.people.filter((p): p is typeof p & { number: string } => p.number !== null);
  if (pins.length === 0 && m.answer === null) return null;
  const r = ruler(pins.map((p) => ({ id: p.id, value: BigInt(p.number) })), m.answer === null ? null : BigInt(m.answer), m.unit);
  if (!r) return null;
  const nameOf = new Map(pins.map((p) => [p.id, p.name]));
  const ghostOf = new Map(pins.map((p) => [p.id, p.ghost]));
  return { leftLabel: r.leftLabel, rightLabel: r.rightLabel, midLabel: r.midLabel ?? null, answerLabel: r.answer && m.unit.margin ? unitPhrase(r.answer.value, m.unit) : null, pins: r.pins.map((p) => ({ id: p.id, name: nameOf.get(p.id) ?? "Someone", ghost: ghostOf.get(p.id) === true, value: m.unit?.margin ? unitPhrase(p.value, m.unit) : p.value.toLocaleString("en-US"), xPermille: p.xPermille, off: p.off })), answer: r.answer ? { value: r.answer.value.toString(), xPermille: r.answer.xPermille } : null };
}

/** A pick-one question's rows for a card (3.25): the answers with whoever picked each, where picks may be shown; the viewer reads as "You". */
export function pickOneFor(m: Pick<MarketCardData, "people" | "pickOne">, viewerId: string): MarketCardProps["pickOne"] {
  if (!m.pickOne) return null;
  // The words say "You" for the viewer; every avatar keeps the person's own initial.
  const answers: PickOneAnswer[] = m.pickOne.answers.map((a) => ({ index: a.index, text: a.userId === viewerId ? "You" : a.text, person: a.userId ? { name: a.text, hue: hueFor(a.userId) } : null }));
  const shown = m.people.filter((p) => p.pick !== null);
  const pickers = m.pickOne.answers.map((a) => shown.filter((p) => p.pick === a.index).map((p) => ({ name: p.name, hue: hueFor(p.id), ghost: p.ghost })));
  return { answers, pickers, shares: m.pickOne.shares, outcome: m.pickOne.outcome, answerLine: m.pickOne.outcome === null ? null : answerLine(m.pickOne.answers[m.pickOne.outcome]?.text ?? "Decided", null), showRows: shown.length > 0 };
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
      outcomeLine={m.outcome === null ? null : outcomeLine(m.dare, m.outcome === 1)}
      number={m.unit ? { ruler: rulerFor(m), answerLine: m.answer === null ? null : `${unitPhrase(BigInt(m.answer), m.unit)}.` } : null}
      pickOne={pickOneFor(m, viewerId)}
      denomination={m.denomination}
      consequences={m.consequences}
    />
  );
}
