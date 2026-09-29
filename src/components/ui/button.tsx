"use client";

import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { LinkPending } from "./link-pending";
import { NOTHING_CAME_BACK, ProblemSummary } from "@/components/ledger/problem";

/**
 * docs/design.md 3.12. Six kinds, fixed heights, radius 10, no shadows, no red. Pressed is opacity 0.88 over
 * 120ms; disabled is ink-3 text with a line border and no fill. Pending is 5.2: past 300ms the label stays
 * exactly where it was, the control holds its size at 0.88, and a 2px line runs along its bottom edge; at three
 * seconds a line under it says "Still going."; at ten it becomes the 5.1 summary block with "Try again", which
 * fires the same tap again, and the control takes taps again too. A tap is never silently dropped, and nothing
 * else on the screen locks. Focus is the global 2px ink outline (5.1). At most one chalk-filled control per viewport.
 *
 * Button labels belong to this component and do not count toward a screen's type budget (1.2), which is why
 * their sizes are literal here and nowhere else.
 */
const buttonVariants = cva(
  "relative overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap select-none transition-[opacity,background-color] duration-[120ms] ease-out active:opacity-[0.88] disabled:pointer-events-none disabled:text-ink-3 disabled:border disabled:border-line disabled:bg-transparent aria-busy:pointer-events-none aria-busy:opacity-[0.88]",
  {
    variants: {
      variant: {
        primary: "bg-chalk text-on-chalk font-bold",
        secondary: "bg-transparent border border-line-strong text-ink-2 font-semibold",
        row: "bg-surface-2 border border-line-strong text-ink font-semibold",
        tertiary: "bg-transparent text-ink-2 font-semibold",
        icon: "bg-transparent text-ink",
      },
      size: {
        primary: "h-14 rounded-button px-6 text-[17px] leading-[22px]",
        inline: "h-11 rounded-button px-4 text-[15px] leading-[20px]",
        secondary: "h-12 rounded-button px-5 text-[17px] leading-[22px]",
        row: "h-11 rounded-button px-4 text-[15px] leading-[20px]",
        tertiary: "h-11 rounded-none px-2 text-[15px] leading-[20px]",
        icon: "h-12 w-12 rounded-pill",
      },
    },
    defaultVariants: { variant: "secondary", size: "secondary" },
  },
);

type Variants = VariantProps<typeof buttonVariants>;

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  Variants & { loading?: boolean };

/** Picks the size that matches a variant when only the variant is given. */
function sizeFor(variant: Variants["variant"], size: Variants["size"]): Variants["size"] {
  if (size) return size;
  if (variant === "primary") return "primary";
  if (variant === "row") return "row";
  if (variant === "tertiary") return "tertiary";
  if (variant === "icon") return "icon";
  return "secondary";
}

/** The wait's stages (5.2), pure: nothing under 300ms, the runner, "Still going." at three seconds, the block at ten. */
export type WaitStage = "none" | "pending" | "still" | "block";
export const STILL_GOING_MS = 3_000;
export const TRY_AGAIN_MS = 10_000;
export function waitStage(loading: boolean, heldMs: number): WaitStage {
  if (!loading) return "none";
  if (heldMs >= TRY_AGAIN_MS) return "block";
  if (heldMs >= STILL_GOING_MS) return "still";
  if (heldMs >= 300) return "pending";
  return "none";
}

/** True once `on` has been true for `ms`. Under 300ms a wait shows nothing: a spinner that lives 180ms reads as a glitch. */
function useHeldFor(on: boolean, ms: number): boolean {
  const [held, setHeld] = React.useState(false);
  React.useEffect(() => {
    if (!on) return;
    const t = setTimeout(() => setHeld(true), ms);
    return () => {
      clearTimeout(t);
      setHeld(false);
    };
  }, [on, ms]);
  return on && held;
}

export function Button({ className, variant = "secondary", size, loading, disabled, children, onClick, type, ...props }: ButtonProps) {
  const held = useHeldFor(Boolean(loading), 300);
  const still = useHeldFor(Boolean(loading), STILL_GOING_MS);
  const block = useHeldFor(Boolean(loading), TRY_AGAIN_MS);
  const stage: WaitStage = block ? "block" : still ? "still" : held ? "pending" : "none";
  const pending = stage === "pending" || stage === "still";
  const long = stage === "still";
  // Past ten seconds the control takes taps again, and the block under it offers the same tap as "Try again".
  const busy = Boolean(loading) && stage !== "block";
  const lastClick = React.useRef<React.MouseEvent<HTMLButtonElement> | null>(null);
  return (
    <>
      <button
        className={cn(buttonVariants({ variant, size: sizeFor(variant, size) }), className)}
        disabled={disabled}
        aria-busy={busy || undefined}
        onClick={
          busy
            ? undefined
            : (e) => {
                lastClick.current = e;
                onClick?.(e);
              }
        }
        type={busy && type === "submit" ? "button" : type}
        {...props}
      >
        {children}
        {pending ? (
          <span aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden", variant === "primary" ? "bg-[rgba(18,17,16,0.25)]" : "bg-surface-2")}>
            <span className={cn("absolute inset-y-0 w-1/3 animate-[button-runner_1.2s_linear_infinite]", variant === "primary" ? "bg-on-chalk" : "bg-ink")} />
          </span>
        ) : null}
      </button>
      {long ? <span className="text-center text-caption text-ink-3">Still going.</span> : null}
      {stage === "block" ? <ProblemSummary messages={[NOTHING_CAME_BACK]} retry={() => (lastClick.current ? onClick?.(lastClick.current) : undefined)} /> : null}
    </>
  );
}

export type ButtonLinkProps = React.ComponentProps<typeof Link> & Variants;

/**
 * Prefetch is off unless a caller asks for it. Every screen here is rendered per person per request, so a
 * prefetch is a full server render, and a person or market page also costs a query against an indexer capped at a
 * hundred a minute. Home used to fire a dozen of them on every load (docs/decisions.md 2026-09-20).
 */
export function ButtonLink({ className, variant = "secondary", size, children, prefetch = false, ...props }: ButtonLinkProps) {
  return (
    <Link prefetch={prefetch} className={cn(buttonVariants({ variant, size: sizeFor(variant, size) }), "relative overflow-hidden", className)} {...props}>
      {children}
      <LinkPending />
    </Link>
  );
}

export { buttonVariants };
