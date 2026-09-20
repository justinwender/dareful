"use client";

import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { LinkPending } from "./link-pending";

/**
 * docs/design.md 3.12. Five kinds, fixed heights, no shadows, no red. Pressed is opacity 0.88 over 120ms;
 * disabled is ink-3 text with a line border and no fill. Pending is 5.2: past 300ms the label stays exactly
 * where it was, the control holds its size at 0.88, and a 2px line runs along its bottom edge; at three seconds
 * a line under it says "Still going." A tap is never silently dropped, and nothing else on the screen locks.
 * At most one primary button per viewport.
 */
const buttonVariants = cva(
  "relative overflow-hidden inline-flex items-center justify-center gap-2 whitespace-nowrap select-none transition-[opacity,background-color] duration-[120ms] ease-out active:opacity-[0.88] disabled:pointer-events-none disabled:text-ink-3 disabled:border disabled:border-line disabled:bg-transparent aria-busy:pointer-events-none aria-busy:opacity-[0.88] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marigold/60",
  {
    variants: {
      variant: {
        primary: "bg-marigold text-on-marigold font-bold",
        secondary: "bg-transparent border border-line text-ink-2 font-semibold",
        tertiary: "bg-transparent text-ink-2 font-semibold",
        icon: "bg-transparent text-ink",
      },
      size: {
        primary: "h-14 rounded-button px-6 text-[17px] leading-[22px]",
        inline: "h-11 rounded-chip-button px-4 text-[15px] leading-[20px]",
        secondary: "h-12 rounded-button px-5 text-[15px] leading-[20px]",
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
  if (variant === "tertiary") return "tertiary";
  if (variant === "icon") return "icon";
  return "secondary";
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
  const pending = useHeldFor(Boolean(loading), 300);
  const long = useHeldFor(Boolean(loading), 3_000);
  return (
    <>
      <button className={cn(buttonVariants({ variant, size: sizeFor(variant, size) }), className)} disabled={disabled} aria-busy={loading || undefined} onClick={loading ? undefined : onClick} type={loading && type === "submit" ? "button" : type} {...props}>
        {children}
        {pending ? (
          <span aria-hidden="true" className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-[2px] overflow-hidden", variant === "primary" ? "bg-[rgba(29,22,8,0.25)]" : "bg-surface-2")}>
            <span className={cn("absolute inset-y-0 w-1/3 animate-[button-runner_1.2s_linear_infinite]", variant === "primary" ? "bg-on-marigold" : "bg-marigold")} />
          </span>
        ) : null}
      </button>
      {long ? <span className="text-center text-caption text-ink-3">Still going.</span> : null}
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
