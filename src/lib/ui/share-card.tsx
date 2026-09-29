/**
 * The Open Graph card a pasted link becomes in a group chat (PLANNING.md section 10, "Share cards"). One
 * renderer for every share route, so the cards read as one product.
 *
 * A card is fetched by a messaging app's preview bot with no session, and then cached by it. So a card says
 * only what the sender's own message already implies: who sent it and what it is about. Never an amount,
 * never a memo, never a phone. A link that is dead or unknown gets the plain card, exactly the same for both.
 *
 * The values below are the dark tokens from src/app/globals.css written out, because the image renderer
 * cannot read CSS custom properties. The brand serif is not used here yet: the renderer needs a font file on
 * disk, and that arrives with the Phase 2 share renderer and its emoji font.
 */
import { ImageResponse } from "next/og";
import { LOCKUP } from "./logo";

export const shareCardSize = { width: 1200, height: 630 };
export const shareCardContentType = "image/png";

const T = { ground: "#121110", surface: "#1C1A17", lineStrong: "#4A453F", ink: "#F2EDE3", ink2: "#C4BCAE", ink3: "#9A9385", chalk: "#F2EDE3" };

/** `kicker` names the brand row, which the renderer draws as the logo. */
export type ShareCard = { kicker: string; headline: string; footer: string };

const LOCKUP_HEIGHT = 40;

export const plainCard: ShareCard = { kicker: "Dareful", headline: "Who’s got the next one?", footer: "The dares, the rounds, and the “I got this one” between friends." };

/** Keeps a long group or first name from pushing the headline off the card. */
export function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

export function renderShareCard(card: ShareCard): ImageResponse {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: T.ground, padding: 72 }}>
        {/* The brand row is the logo itself (docs/design/reference/LOGO.md): the mark and the word together, in the chalk on the dark ground, 40px tall, which is over the 120px wide it may never go under. */}
        <div style={{ display: "flex", alignItems: "center" }}>
          <svg viewBox={LOCKUP.viewBox} width={Math.round((LOCKUP.width * LOCKUP_HEIGHT) / LOCKUP.height)} height={LOCKUP_HEIGHT}>
            {LOCKUP.paths.map((p, i) => (
              <path key={i} d={p.d} transform={p.transform ?? undefined} fill={T.chalk} />
            ))}
          </svg>
        </div>
        <div style={{ display: "flex", fontSize: card.headline.length > 34 ? 72 : 88, lineHeight: 1.08, color: T.ink, fontWeight: 700, letterSpacing: -1.5 }}>{card.headline}</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `2px dashed ${T.lineStrong}`, paddingTop: 28 }}>
          <div style={{ display: "flex", fontSize: 30, color: T.ink2, maxWidth: 880 }}>{card.footer}</div>
          <div style={{ fontSize: 30, color: T.ink3 }}>dareful.app</div>
        </div>
      </div>
    ),
    shareCardSize,
  );
}
