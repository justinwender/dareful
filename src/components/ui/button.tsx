"use client";

import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { LinkPending } from "./link-pending";
import { NOTHING_CAME_BACK, ProblemSummary } from "@/components/ledger/problem";
import { RUNNER_MS, STILL_GOING_MS, TRY_AGAIN_MS, waitStage, type WaitStage } from "@/lib/ui/motion";

export { STILL_GOING_MS, TRY_AGAIN_MS, waitStage, type WaitStage };

/**
 * docs/design.md 3.12. Six kinds, fixed heights, radius 10, no shadows, no red. Pressed is set from `pointerdown`
 * (9.4): 0.88 on a control with a fill, 0.5 on one drawn only in lines and words, released over quick. Pending is
 * 5.2: past 300ms the label stays exactly where it was, the control holds its size at 0.88, and a 2px line runs
 * along its bottom edge on the loop; at three seconds a line under it says "Still going."; at ten it becomes the
 * 5.1 summary block with "Try again", which fires the same tap again, and the control takes taps again too. The
 * stages are `waitStage`, the one set of rules a tap that goes somewhere reads as well (9.4). A tap is never
 * silently dropped, and nothing else on the screen locks. Focus is the global 2px ink outline (5.1). At most one
 * chalk-filled control per viewport.
 *
 * Button labels belong to this component and do not count toward a screen's type budget (1.2), which is why
 * their sizes are literal here and nowhere else.
 */
const buttonVariants = cva(
  "relative overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap select-none disabled:pointer-events-none disabled:text-ink-3 disabled:border disabled:border-line disabled:bg-transparent aria-busy:pointer-events-none aria-busy:opacity-[0.88]",
  {
    variants: {
      variant: {
        primary: "bg-chalk text-on-chalk font-bold press-fill",
        secondary: "bg-transparent border border-line-strong text-ink-2 font-semibold press-line",
        row: "bg-surface-2 border border-line-strong text-ink font-semibold press-fill",
        tertiary: "bg-transparent text-ink-2 font-semibold press-line",
        icon: "bg-transparent text-ink press-line",
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

/** The press kind a variant belongs to (9.4): a fill dims to 0.88, lines and words to 0.5. */
const PRESS: Record<NonNullable<Variants["variant"]>, "fill" | "line"> = { primary: "fill", row: "fill", secondary: "line", tertiary: "line", icon: "line" };

/** True once `on` has been true for `ms`. Under 300ms a wait shows nothing: a spinner that lives 180ms reads as a glitch. */
export function useHeldFor(on: boolean, ms: number): boolean {
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

/** The wait's stage for something that has been going on, from the three timers (5.2, 9.4): one reading for buttons and shells. */
export function useWaitStage(waiting: boolean): WaitStage {
  const held = useHeldFor(waiting, RUNNER_MS);
  const still = useHeldFor(waiting, STILL_GOING_MS);
  const block = useHeldFor(waiting, TRY_AGAIN_MS);
  return block ? waitStage(true, TRY_AGAIN_MS) : still ? waitStage(true, STILL_GOING_MS) : held ? waitStage(true, RUNNER_MS) : "none";
}

/** The form a control submits: the one named on it, else the one it sits in. */
function formOf(props: { form?: string }, last: React.MouseEvent<HTMLButtonElement> | null): HTMLFormElement | null {
  if (typeof document === "undefined") return null;
  const named = props.form ? document.getElementById(props.form) : null;
  if (named instanceof HTMLFormElement) return named;
  const el = last?.currentTarget;
  return el instanceof HTMLButtonElement ? el.form : null;
}

/**
 * What "Try again" does under a control that has not come back (5.2): the same tap again. A control with its own
 * handler runs it; a control that submits a form has no handler of its own, so its form is submitted again. Pure
 * but for the two calls it makes, so a test can hold which one it picks.
 */
export function retryOf(control: { type?: string; form: Pick<HTMLFormElement, "requestSubmit"> | null; click: (() => void) | null }): void {
  if (control.click) return control.click();
  if (control.type === "submit" && control.form) control.form.requestSubmit();
}

export function Button({ className, variant = "secondary", size, loading, disabled, children, onClick, type, ...props }: ButtonProps) {
  const stage = useWaitStage(Boolean(loading));
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
        data-press={PRESS[variant ?? "secondary"]}
        onClick={
          busy
            ? undefined
            : (e) => {
                // Kept for "Try again": React reuses nothing of the event, and only its target is read later.
                e.persist?.();
                lastClick.current = e;
                onClick?.(e);
              }
        }
        type={busy && type === "submit" ? "button" : type}
        {...props}
      >
        {children}
        {pending ? (
          <span aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden", variant === "primary" ? "bg-runner-track" : "bg-surface-2")}>
            <span className={cn("absolute inset-y-0 w-1/3 motion-loop-runner", variant === "primary" ? "bg-on-chalk" : "bg-ink")} />
          </span>
        ) : null}
      </button>
      {long ? <span className="text-center text-caption text-ink-3">Still going.</span> : null}
      {stage === "block" ? <ProblemSummary messages={[NOTHING_CAME_BACK]} retry={() => retryOf({ type, form: formOf(props, lastClick.current), click: lastClick.current && onClick ? () => onClick(lastClick.current as React.MouseEvent<HTMLButtonElement>) : null })} /> : null}
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
    <Link prefetch={prefetch} data-press={PRESS[variant ?? "secondary"]} className={cn(buttonVariants({ variant, size: sizeFor(variant, size) }), "relative overflow-hidden", className)} {...props}>
      {children}
      <LinkPending look="control" />
    </Link>
  );
}

export { buttonVariants };
