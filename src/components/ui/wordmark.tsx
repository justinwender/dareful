import { MARK, WORDMARK, WORDMARK_EM, type LogoDrawing } from "@/lib/ui/logo";

/** The drawing's outlines, in the colour of the text around them: chalk on the dark ground, ink on the light one (LOGO.md, "Colour"). */
function Outlines({ drawing }: { drawing: LogoDrawing }) {
  return (
    <>
      {drawing.paths.map((p, i) => (
        <path key={i} d={p.d} transform={p.transform ?? undefined} />
      ))}
    </>
  );
}

/**
 * The wordmark (docs/design.md 3.38; docs/design/reference/LOGO.md): "dareful" in Young Serif, its letters as
 * outlines, standing where back would only when nothing is behind the screen (a signed-out link, the claimant
 * screen, signed out on Now). `size` is the size of its type in px, 20 in a header, which draws it 75px wide,
 * over the 64px it may never go under. One colour, `--ink`, which is the chalk in dark and the ink in light;
 * never a market's ink, the citron or a person's hue, and nothing added to it. It is a logo, outside the type
 * budget (1.2).
 */
export function Wordmark({ size = 20, className }: { size?: number; className?: string }) {
  const scale = size / WORDMARK_EM;
  return (
    <svg role="img" aria-label="dareful" data-wordmark="" viewBox={WORDMARK.viewBox} width={Math.round(WORDMARK.width * scale * 100) / 100} height={Math.round(WORDMARK.height * scale * 100) / 100} fill="currentColor" className={className}>
      <title>dareful</title>
      <Outlines drawing={WORDMARK} />
    </svg>
  );
}

/** The mark alone, cropped close to its strokes: never under 20px tall (LOGO.md, "Clear space and smallest size"). */
export function Mark({ height = 20, className }: { height?: number; className?: string }) {
  const h = Math.max(20, height);
  return (
    <svg role="img" aria-label="dareful" data-mark="" viewBox={MARK.viewBox} width={Math.round(((MARK.width * h) / MARK.height) * 100) / 100} height={h} fill="currentColor" className={className}>
      <title>dareful</title>
      <Outlines drawing={MARK} />
    </svg>
  );
}
