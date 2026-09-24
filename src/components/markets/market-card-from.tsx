import type { MarketCardData } from "@/lib/ledger/market-view";
import { MarketCard } from "./market-card";

/** The view model from `marketCards()` as a timeline card. */
export function MarketCardFrom({ m, viewerId, clock }: { m: MarketCardData; viewerId: string; clock: { zone: string; now: number } }) {
  return (
    <MarketCard
      id={m.dare.id}
      title={m.dare.title}
      mark={m.dare.markKind === "emoji" ? m.dare.markValue : null}
      groupName={m.groupName}
      state={m.state}
      argument={m.dare.pace === "argument"}
      at={m.at}
      clock={clock}
      viewerId={viewerId}
      people={m.people}
      groupSize={m.groupSize}
      outcome={m.outcome}
      denomination={m.denomination}
      consequences={m.consequences}
      needsYou={m.needsYou}
    />
  );
}
