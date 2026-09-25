import type { MarketCardData } from "@/lib/ledger/market-view";
import { closesLabel } from "@/lib/ui/copy";
import { MarketCard, type MarketCardProps } from "./market-card";

/** The view model from `marketCards()` as a timeline card. */
export function MarketCardFrom({ m, viewerId, clock, consequenceStates, close }: { m: MarketCardData; viewerId: string; clock: { zone: string; now: number }; consequenceStates?: MarketCardProps["consequenceStates"]; close?: MarketCardProps["close"] }) {
  return (
    <MarketCard
      consequenceStates={consequenceStates}
      close={close}
      id={m.dare.id}
      title={m.dare.title}
      mark={m.dare.markKind === "emoji" ? m.dare.markValue : null}
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
      denomination={m.denomination}
      consequences={m.consequences}
    />
  );
}
