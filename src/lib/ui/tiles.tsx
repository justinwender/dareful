/**
 * Link tiles (docs/design.md 3.27). iMessage and WhatsApp build a link preview on the sender's phone and freeze
 * it into the chat, so a tile carries only facts that stay true for as long as the message is visible: who
 * asked, the mechanic, the absolute close time; never a count of who is in, never a relative time, never a
 * number anyone picked. Both tiles are 1200 by 630 with everything essential inside the centre 630 by 630
 * square (from x = 285), because WhatsApp's compact preview crops to it. The link's title is the market's
 * question, so no tile repeats it.
 *
 * Rendered server-side by Satori, which cannot read CSS custom properties: the values here are the tokens
 * written out (src/app/globals.css, src/lib/ui/ink.ts).
 */
import { ImageResponse } from "next/og";
import type { Hue } from "./hue";
import { INKS, type InkName } from "./ink";

export const tileSize = { width: 1200, height: 630 };
const SAFE = { x: 285, w: 630 };
const CREAM = "#F2EDE3";
const CREAM_2 = "#C4BCAE";
const ON_HUE = "#121110";
const PERSON: Record<Hue, string> = {
  lilac: "#B9A5F3",
  aqua: "#7DCFD8",
  orchid: "#ECA6D8",
  sky: "#8DBAF6",
  sand: "#DCC494",
  stone: "#CBBFAE",
};

export type TileFonts = { serif: ArrayBuffer; sans: ArrayBuffer };
export type AskTile = {
  kind: "ask";
  asker: { name: string; hue: Hue };
  frame: string;
  mark: string | null;
  ink: InkName;
  closes: string | null;
  /** A number question: the empty field with the unit in serif stands where the odds line would (3.27). */
  unit: string | null;
};
export type CalledTile = {
  kind: "called";
  mark: string | null;
  ink: InkName;
  outcome: 0 | 1;
  outcomeLine: string;
  pins: Array<{ name: string; hue: Hue; percent: number; caller: boolean }>;
  line: string;
};
/** A number question's result tile (3.27): the answer as its outcome, the ruler with the answer tick, and who was closest. */
export type NumberTile = {
  kind: "number";
  mark: string | null;
  ink: InkName;
  /** "14 shirts." */
  outcomeLine: string;
  ruler: { leftLabel: string; rightLabel: string; answerPermille: number; pins: Array<{ name: string; hue: Hue; xPermille: number; closest: boolean }> };
  line: string;
};
export type Tile = AskTile | CalledTile | NumberTile;

const initial = (name: string) => name.trim().charAt(0).toUpperCase();

function avatar(name: string, hue: Hue, size: number, ring?: string) {
  // The renderer refuses a style key set to undefined, so the ring is added only when there is one.
  const style: Record<string, string | number> = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: size,
    height: size,
    borderRadius: size,
    background: PERSON[hue],
    color: ON_HUE,
    fontSize: Math.round(size * 0.42),
    fontWeight: 700,
  };
  if (ring) style.boxShadow = `0 0 0 4px ${ring}`;
  return <div style={style}>{initial(name)}</div>;
}

/** The ground, the wordmark outside the safe square, and the safe square itself as a centred column. No fragments: the renderer lays out what it is handed as direct children. */
function frame(ink: InkName, rows: React.ReactNode[]) {
  const layers = INKS[ink];
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: layers.field,
        fontFamily: "Hanken Grotesk",
        color: CREAM,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 64,
          bottom: 56,
          display: "flex",
          fontSize: 34,
          fontWeight: 600,
          color: layers.hi,
        }}
      >
        dareful
      </div>
      <div
        style={{
          position: "absolute",
          left: SAFE.x,
          top: 0,
          width: SAFE.w,
          height: tileSize.height,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {rows.map((row, i) => (
          <div key={i} style={{ display: "flex", marginTop: i === 0 ? 0 : 30 }}>
            {row}
          </div>
        ))}
      </div>
    </div>
  );
}

/** The asking tile: the asker, the frame line, the empty answer, and when it closes. */
function ask(t: AskTile) {
  const layers = INKS[t.ink];
  return frame(t.ink, [
    <div key="asker" style={{ display: "flex", alignItems: "center", gap: 20 }}>
      {avatar(t.asker.name, t.asker.hue, 64)}
      <div style={{ display: "flex", fontSize: 48, fontWeight: 600 }}>
        {t.asker.name} asks
      </div>
    </div>,
    <div
      key="frame"
      style={{
        display: "flex",
        fontFamily: "Young Serif",
        fontSize: 52,
        textAlign: "center",
        justifyContent: "center",
        width: SAFE.w,
      }}
    >
      {t.frame}
    </div>,
    <div
      key="line"
      style={{
        display: "flex",
        flexDirection: "column",
        width: SAFE.w,
        gap: 10,
      }}
    >
      {t.unit !== null ? (
        // A number question's empty answer: the 88px mark stamp, an empty 210 by 96 field with a cream caret, and the unit in serif.
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, height: 110 }}>
          {t.mark ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 88, height: 88, borderRadius: 16, background: layers.ground, fontSize: 56, lineHeight: 1 }}>{t.mark}</div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", width: 210, height: 96, borderRadius: 16, background: layers.ground, paddingLeft: 28 }}>
            <div style={{ display: "flex", width: 4, height: 56, background: CREAM, borderRadius: 2 }} />
          </div>
          <div style={{ display: "flex", fontFamily: "Young Serif", fontSize: 44, color: CREAM }}>{t.unit}</div>
        </div>
      ) : (
        <>
      {t.mark ? (
        <div
          style={{
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            height: 110,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 36,
              opacity: 0.35,
              lineHeight: 1,
            }}
          >
            {t.mark}
          </div>
          <div style={{ display: "flex", fontSize: 100, lineHeight: 1 }}>
            {t.mark}
          </div>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 8 }}>
        {Array.from({ length: 10 }, (_, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flex: 1,
              height: 12,
              borderRadius: 6,
              background: layers.ground,
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 28,
          color: layers.hi,
        }}
      >
        <div style={{ display: "flex" }}>0%</div>
        <div style={{ display: "flex" }}>100%</div>
      </div>
        </>
      )}
    </div>,
    ...(t.closes
      ? [
          <div
            key="closes"
            style={{
              display: "flex",
              fontSize: 40,
              fontWeight: 600,
              color: layers.hi,
            }}
          >
            {t.closes}
          </div>,
        ]
      : []),
  ]);
}

/** The result tile without a photo: the mark and the outcome, the call line with the caller ringed, and who called it. */
function called(t: CalledTile) {
  const layers = INKS[t.ink];
  const pin = 52;
  return frame(t.ink, [
    <div
      key="outcome"
      style={{ display: "flex", alignItems: "center", gap: 24 }}
    >
      {t.mark ? (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 88,
            height: 88,
            borderRadius: 16,
            background: layers.ground,
            fontSize: 56,
            lineHeight: 1,
          }}
        >
          {t.mark}
        </div>
      ) : null}
      <div style={{ display: "flex", fontFamily: "Young Serif", fontSize: 76 }}>
        {t.outcomeLine}
      </div>
    </div>,
    <div
      key="line"
      style={{
        display: "flex",
        flexDirection: "column",
        width: SAFE.w,
        gap: 14,
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          height: pin + 16,
          width: SAFE.w,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            top: (pin + 16) / 2 - 6,
            height: 12,
            borderRadius: 6,
            background: layers.ground,
            display: "flex",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: t.outcome === 1 ? "50%" : 0,
              right: t.outcome === 1 ? 0 : "50%",
              background: `rgba(${layers.inkRgb}, 0.4)`,
              display: "flex",
            }}
          />
        </div>
        <div
          style={{
            position: "absolute",
            top: 8,
            bottom: 8,
            left: SAFE.w / 2 - 1,
            width: 2,
            background: layers.line,
            display: "flex",
          }}
        />
        {t.pins.map((p, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              top: 8,
              left: Math.round((p.percent / 100) * (SAFE.w - pin)),
              display: "flex",
            }}
          >
            {avatar(p.name, p.hue, pin, p.caller ? CREAM : layers.field)}
          </div>
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 28,
          color: t.outcome === 0 ? CREAM : CREAM_2,
        }}
      >
        <div
          style={{
            display: "flex",
            color: t.outcome === 0 ? CREAM : layers.hi,
          }}
        >
          No
        </div>
        <div
          style={{
            display: "flex",
            color: t.outcome === 1 ? CREAM : layers.hi,
          }}
        >
          Yes
        </div>
      </div>
    </div>,
    <div
      key="who"
      style={{
        display: "flex",
        fontSize: 34,
        fontWeight: 600,
        textAlign: "center",
        justifyContent: "center",
        width: SAFE.w,
      }}
    >
      {t.line}
    </div>,
  ]);
}

/** A number question's result tile without a photo: the mark and the answer on one line, the ruler with the cream answer tick, and who was closest. */
function numberTile(t: NumberTile) {
  const layers = INKS[t.ink];
  const pin = 52;
  const inset = 24;
  const w = SAFE.w - inset * 2;
  return frame(t.ink, [
    <div key="outcome" style={{ display: "flex", alignItems: "center", gap: 24 }}>
      {t.mark ? (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 88, height: 88, borderRadius: 16, background: layers.ground, fontSize: 56, lineHeight: 1 }}>{t.mark}</div>
      ) : null}
      <div style={{ display: "flex", fontFamily: "Young Serif", fontSize: 72 }}>{t.outcomeLine}</div>
    </div>,
    <div key="ruler" style={{ display: "flex", flexDirection: "column", width: SAFE.w, gap: 14 }}>
      <div style={{ position: "relative", display: "flex", height: pin + 16, width: SAFE.w }}>
        <div style={{ position: "absolute", left: inset, right: inset, top: (pin + 16) / 2 - 6, height: 12, borderRadius: 6, background: layers.ground, display: "flex" }} />
        {t.ruler.pins.map((p, i) => (
          <div key={i} style={{ position: "absolute", top: 8, left: Math.round(inset + (p.xPermille / 1000) * w - pin / 2), display: "flex" }}>
            {avatar(p.name, p.hue, pin, p.closest ? CREAM : layers.field)}
          </div>
        ))}
        <div style={{ position: "absolute", top: 4, left: Math.round(inset + (t.ruler.answerPermille / 1000) * w - 3), width: 6, height: pin + 8, borderRadius: 3, background: CREAM, display: "flex" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 28, color: layers.hi }}>
        <div style={{ display: "flex" }}>{t.ruler.leftLabel}</div>
        <div style={{ display: "flex" }}>{t.ruler.rightLabel}</div>
      </div>
    </div>,
    <div key="who" style={{ display: "flex", fontSize: 34, fontWeight: 600, textAlign: "center", justifyContent: "center", width: SAFE.w }}>
      {t.line}
    </div>,
  ]);
}

export function renderTile(tile: Tile, fonts: TileFonts): ImageResponse {
  return new ImageResponse(tile.kind === "ask" ? ask(tile) : tile.kind === "number" ? numberTile(tile) : called(tile), {
    ...tileSize,
    emoji: "noto",
    fonts: [
      { name: "Young Serif", data: fonts.serif, weight: 400, style: "normal" },
      {
        name: "Hanken Grotesk",
        data: fonts.sans,
        weight: 600,
        style: "normal",
      },
    ],
  });
}
