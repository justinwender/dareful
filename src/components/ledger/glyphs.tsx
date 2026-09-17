import type { SVGProps } from "react";
import type { GlyphKey } from "@/lib/ui/units";

type Props = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number) =>
  ({
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  }) as const;

/** The eight structural icons are a closed set, drawn at 2px stroke on a 24px grid (docs/design.md 2.2). */
export function BeerGlyph({ size = 24, ...p }: Props) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M6 5h9v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5Z" />
      <path d="M15 9h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <path d="M6 5c0-1.5 1-2.5 2.5-2.5S11 3.5 11 5" />
      <path d="M9 9v7M12 9v7" />
    </svg>
  );
}

export function CoffeeGlyph({ size = 24, ...p }: Props) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z" />
      <path d="M16 11h1.5a2 2 0 0 1 0 4H16" />
      <path d="M8 3.5c0 1.2 1 1.3 1 2.5M11.5 3.5c0 1.2 1 1.3 1 2.5" />
      <path d="M4 21h14" />
    </svg>
  );
}

export function RoundGlyph({ size = 24, ...p }: Props) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M4 7h4v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7Z" />
      <path d="M10 5h4v13a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V5Z" />
      <path d="M16 8h4v10a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V8Z" />
    </svg>
  );
}

export function NextTimeGlyph({ size = 24, ...p }: Props) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v4h-4" />
      <path d="M12 8v4l2.5 2" />
    </svg>
  );
}

export function CoveredGlyph({ size = 24, ...p }: Props) {
  return (
    <svg {...base(size)} {...p}>
      <path d="M5 8h14l-1.5 11h-11L5 8Z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </svg>
  );
}

export function ComingUpGlyph({ size = 24, ...p }: Props) {
  return (
    <svg {...base(size)} {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2" />
      <path d="M4 10h16M8 3v4M16 3v4" />
    </svg>
  );
}

export function UnitGlyph({ unit, size = 24, ...p }: Props & { unit: GlyphKey }) {
  switch (unit) {
    case "beer":
      return <BeerGlyph size={size} {...p} />;
    case "coffee":
      return <CoffeeGlyph size={size} {...p} />;
    case "round":
      return <RoundGlyph size={size} {...p} />;
    case "next_time":
      return <NextTimeGlyph size={size} {...p} />;
  }
}
