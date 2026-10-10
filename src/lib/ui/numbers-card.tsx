/**
 * The public numbers as a picture (the submission round, section 2): the image the README shows, drawn by the app as
 * it runs, like the link tiles. People first (accounts and guests apart), then the questions played with how they stand,
 * then the groups that came back for a second question (the ops round, section 6), then what real use put on Monad, and
 * when the numbers were read. Aggregates only: nothing on it names anyone.
 *
 * Rendered server-side by Satori, which cannot read CSS custom properties: the values are the dark theme's tokens
 * written out, as the tiles and the share card write them (src/app/globals.css).
 */
import { ImageResponse } from "next/og";
import { LOCKUP } from "./logo";
import type { TileFonts } from "./tiles";
import type { PublicNumbers } from "@/lib/usage/public-numbers";

export const numbersCardSize = { width: 1200, height: 600 };
const T = { ground: "#121110", surface: "#1C1A17", line: "#383430", ink: "#F2EDE3", ink2: "#C4BCAE", ink3: "#9A9385" };
const ZONE = "America/New_York";

/** A count with its noun, singular for one. Pure. */
export function counted(n: number, one: string, many: string): { n: string; noun: string } {
  return { n: n.toLocaleString("en-US"), noun: n === 1 ? one : many };
}

/** "9:41am ET, October 9, 2026": when the numbers were read, in the zone /stats counts days in. Pure. */
export function readAt(iso: string): string {
  const at = new Date(iso);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", minute: "2-digit", hour12: true, month: "long", day: "numeric", year: "numeric" }).formatToParts(at).map((x) => [x.type, x.value]));
  return `${p.hour}:${p.minute}${(p.dayPeriod ?? "").toLowerCase()} ET, ${p.month} ${p.day}, ${p.year}`;
}

/** What the picture says, line by line: the words are here and tested, the drawing below only places them. Pure. */
export function numbersCardLines(n: PublicNumbers | null): { groups: Array<{ title: string; items: Array<{ n: string; noun: string }>; detail?: string }>; chain: string; footer: string } {
  if (!n) return { groups: [], chain: "", footer: "The numbers couldn’t be read just now." };
  const how = [`${n.played_settled.toLocaleString("en-US")} settled`, `${n.played_open.toLocaleString("en-US")} still open`, n.played_undecided === 0 ? "none ended undecided" : `${n.played_undecided.toLocaleString("en-US")} ended undecided`].join(" · ");
  return {
    groups: [
      { title: "People", items: [counted(n.accounts, "with an account", "with accounts"), counted(n.guests, "guest", "guests")] },
      { title: "Questions played", items: [counted(n.questions_two_in, "played", "played")], detail: how },
      { title: "Groups", items: [counted(n.sets_two_questions, "came back", "came back")], detail: "for a second question" },
    ],
    chain: n.chain
      ? `On Monad, from real use: ${[counted(n.chain.obligations, "obligation", "obligations"), counted(n.chain.questions, "question", "questions"), counted(n.chain.people, "person", "people"), counted(n.chain.sets, "set", "sets")].map((c) => `${c.n} ${c.noun}`).join(" · ")}`
      : "On Monad: the indexer couldn’t be read just now.",
    footer: `Counted ${readAt(n.at)}`,
  };
}

const LOCKUP_HEIGHT = 36;

export function renderNumbersCard(n: PublicNumbers | null, fonts: TileFonts, headers: Record<string, string>): ImageResponse {
  const lines = numbersCardLines(n);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: T.ground, padding: "56px 64px", fontFamily: "Hanken Grotesk", color: T.ink }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <svg viewBox={LOCKUP.viewBox} width={Math.round((LOCKUP.width * LOCKUP_HEIGHT) / LOCKUP.height)} height={LOCKUP_HEIGHT}>
            {LOCKUP.paths.map((p, i) => (
              <path key={i} d={p.d} transform={p.transform ?? undefined} fill={T.ink} />
            ))}
          </svg>
          <div style={{ display: "flex", fontSize: 26, color: T.ink3 }}>dareful.app, as it runs</div>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          {lines.groups.map((g) => (
            <div key={g.title} style={{ display: "flex", flexDirection: "column", flex: 1, gap: 12, padding: "24px 28px", borderRadius: 20, background: T.surface, border: `2px solid ${T.line}` }}>
              <div style={{ display: "flex", fontSize: 26, color: T.ink3 }}>{g.title}</div>
              {g.items.map((it) => (
                <div key={it.noun} style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
                  <div style={{ display: "flex", fontFamily: "Young Serif", fontSize: 72, lineHeight: 1 }}>{it.n}</div>
                  <div style={{ display: "flex", fontSize: 30, color: T.ink2 }}>{it.noun}</div>
                </div>
              ))}
              {g.detail ? <div style={{ display: "flex", fontSize: 24, color: T.ink3 }}>{g.detail}</div> : null}
            </div>
          ))}
          {lines.groups.length === 0 ? <div style={{ display: "flex", fontSize: 34, color: T.ink2 }}>{lines.footer}</div> : null}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {lines.chain ? <div style={{ display: "flex", fontSize: 28, color: T.ink2 }}>{lines.chain}</div> : null}
          {lines.groups.length > 0 ? <div style={{ display: "flex", fontSize: 24, color: T.ink3 }}>{lines.footer}</div> : null}
        </div>
      </div>
    ),
    {
      ...numbersCardSize,
      fonts: [
        { name: "Young Serif", data: fonts.serif, weight: 400, style: "normal" },
        { name: "Hanken Grotesk", data: fonts.sans, weight: 600, style: "normal" },
      ],
      headers,
    },
  );
}
