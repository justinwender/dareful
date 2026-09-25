import { hueVar, type Hue } from "@/lib/ui/hue";

/**
 * The state mark (docs/design.md 3.23): a 16px stroke mark on a 16 by 16 grid that replaces the sentence a screen
 * used to spend on saying what something is doing. It sits at the head of a row or a kicker, before the text, and
 * the only words beside it are a clock. Every mark carries an aria-label with the state's name, because a screen
 * reader cannot see a dashed ring. The citron dot is separate (3.23): the mark belongs to the thing, the dot to you.
 *
 * Market states: open (ring), you're in (ring, lower half filled, in that person's hue), locked (ring with a bar),
 * in voting (broken ring), deadlocked (ring with two bars), resolved (disc), voided (ring with a slash), expired
 * (dotted ring). A draft, on a needs-you row, is the dotted ring too (3.15). Obligations: proposed (broken ring),
 * open (ring in the owner's hue), settled (disc), forgiven (ring with a centre dot).
 */
export type MarketMark = "open" | "in" | "locked" | "voting" | "deadlocked" | "resolved" | "voided" | "expired" | "draft";
export type ObligationMark = "proposed" | "owed" | "settled" | "forgiven";
export type MarkState = MarketMark | ObligationMark;

const LABEL: Record<MarkState, string> = {
  open: "Open",
  in: "You’re in",
  locked: "Locked",
  voting: "In voting",
  deadlocked: "Deadlocked",
  resolved: "Resolved",
  voided: "Voided",
  expired: "Expired",
  draft: "Draft",
  proposed: "Proposed",
  owed: "Open",
  settled: "Settled",
  forgiven: "Forgiven",
};

const QUIET: ReadonlySet<MarkState> = new Set<MarkState>(["open", "voided", "expired", "draft", "proposed", "settled"]);

/**
 * `hue`: the person's hue for "you're in" and for an open obligation's owner. `ink`: on a market's own screen its
 * open and resolved marks take the market's ink (3.25). Otherwise the mark is ink, or ink-3 for the quiet states.
 */
export function StateMark({ state, hue, ink, size = 16, className }: { state: MarkState; hue?: Hue; ink?: string; size?: number; className?: string }) {
  const color = state === "in" || state === "owed" ? (hue ? hueVar(hue) : "var(--ink)") : ink && (state === "open" || state === "resolved") ? ink : QUIET.has(state) ? "var(--ink-3)" : "var(--ink)";
  return (
    <svg role="img" aria-label={LABEL[state]} width={size} height={size} viewBox="0 0 16 16" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" className={className} style={{ color, flexShrink: 0 }}>
      {state === "resolved" || state === "settled" ? (
        <circle cx="8" cy="8" r="6.4" fill={color} stroke="none" />
      ) : state === "voting" || state === "proposed" ? (
        <circle cx="8" cy="8" r="6.4" strokeDasharray="3.2 2.4" />
      ) : state === "expired" || state === "draft" ? (
        <circle cx="8" cy="8" r="6.4" strokeDasharray="1 2.6" />
      ) : (
        <circle cx="8" cy="8" r="6.4" />
      )}
      {state === "in" || state === "owed" ? state === "in" ? <path d="M1.6 8a6.4 6.4 0 0 0 12.8 0Z" fill={color} stroke="none" /> : null : null}
      {state === "locked" ? <path d="M4.6 8h6.8" /> : null}
      {state === "deadlocked" ? <path d="M6.3 5.2v5.6M9.7 5.2v5.6" /> : null}
      {state === "voided" ? <path d="M3.9 12.1 12.1 3.9" /> : null}
      {state === "forgiven" ? <circle cx="8" cy="8" r="0.8" fill={color} stroke="none" /> : null}
    </svg>
  );
}

/** The citron dot (3.23, 6.4): this one is waiting on you and has a clock. Never a number. */
export function LiveDot({ className }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 shrink-0 rounded-pill bg-live ${className ?? ""}`} />;
}
