import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { LinkPending } from "./link-pending";

/**
 * docs/design.md 3.12. Five kinds, fixed heights, no shadows, no red. Pressed is opacity 0.88 over 120ms;
 * disabled is ink-3 text with a line border and no fill; loading keeps the size and swaps the label.
 * At most one primary button per viewport.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap select-none transition-[opacity,background-color] duration-[120ms] ease-out active:opacity-[0.88] disabled:pointer-events-none disabled:text-ink-3 disabled:border disabled:border-line disabled:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marigold/60",
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

export function Button({ className, variant = "secondary", size, loading, disabled, children, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size: sizeFor(variant, size) }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span aria-hidden="true">…</span> : children}
    </button>
  );
}

export type ButtonLinkProps = React.ComponentProps<typeof Link> & Variants;

export function ButtonLink({ className, variant = "secondary", size, children, ...props }: ButtonLinkProps) {
  return (
    <Link className={cn(buttonVariants({ variant, size: sizeFor(variant, size) }), "relative overflow-hidden", className)} {...props}>
      {children}
      <LinkPending />
    </Link>
  );
}

export { buttonVariants };
