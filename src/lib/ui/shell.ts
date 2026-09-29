/**
 * Shells (docs/design.md 9.4, 9.7): a tap that goes somewhere leaves at once for its destination's shell, the
 * destination's real parts drawn from what the tapped thing already knew, before anything is fetched. Every row,
 * card and tile that opens a market already draws its mark, its ink, its question and its state, so the row
 * carries the shell's data on its link (`data-shell`), and the client draws the market's header, band and sheet
 * from it in the frame after the tap. A market's ground, surfaces and line come with the ink; the entry line,
 * the picture, the who's-in row, the details and the photos fade in when they arrive. Pure: the shape, its
 * serialiser and its parser, so a row's data and the shell's reading of it have tests.
 */
import type { MarketMark } from "@/components/ledger/state-mark";
import type { InkName } from "./ink";
import { isInkName } from "./ink";
import type { MarkRef } from "./mark";

export type MarketShell = {
  kind: "market";
  id: string;
  ink: InkName;
  mark: MarkRef | null;
  /** The band's state mark. */
  state: MarketMark;
  /** The clock's words in the band ("Closes Fri at 10:40pm", "Resolving tonight", "Settled Sat at 12:14am"), or none. */
  clock: string | null;
  question: string;
  /** "Priya asked the Friday crew": the asker line, with the asker's first name and hue; held empty when the row did not know it. */
  asker: { name: string; hue: string; line: string } | null;
  /** The sheet at the resting height of the state the row showed, with its first line; none when the state has no sheet. */
  sheet: { label: string; line: string } | null;
};

export type GameShell = {
  kind: "game";
  id: string;
  /** The game page's address, with its set of people. */
  href: string;
  name: string;
  /** "Sun 4:25pm", as the row drew it. */
  start: string;
  away: { abbr: string; name: string; color: string | null };
  home: { abbr: string; name: string; color: string | null };
};

export type Shell = MarketShell | GameShell;

const MARKS: ReadonlySet<string> = new Set(["open", "in", "locked", "voting", "deadlocked", "resolved", "voided", "expired", "draft"]);

/** The shell's first line in the sheet, by the state the row showed (9.4, 3.24's table). */
export function shellSheet(state: MarketMark, mine: boolean, kind: "binary" | "numeric" | "categorical" = "binary"): MarketShell["sheet"] {
  if (state === "open" && !mine) return { label: "Your number", line: kind === "numeric" ? "What's the number?" : kind === "categorical" ? "Pick one" : "What are the odds?" };
  if (state === "draft") return { label: "Your number", line: "What are the odds?" };
  if (state === "locked" || state === "voting" || state === "deadlocked") return { label: "Say what happened", line: "When it's clear, say what happened." };
  return null;
}

export function serialiseShell(shell: Shell): string {
  return JSON.stringify(shell);
}

/** The shell on a tapped link, or null when it carries none or its data is not a shell's. */
export function parseShell(raw: string | null | undefined): Shell | null {
  if (!raw) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (o["kind"] === "game") {
    if (typeof o["id"] !== "string" || typeof o["href"] !== "string" || typeof o["name"] !== "string" || typeof o["start"] !== "string") return null;
    const team = (t: unknown) => (t && typeof t === "object" && typeof (t as { abbr?: unknown }).abbr === "string" && typeof (t as { name?: unknown }).name === "string" ? { abbr: (t as { abbr: string }).abbr, name: (t as { name: string }).name, color: typeof (t as { color?: unknown }).color === "string" ? ((t as { color: string }).color as string) : null } : null);
    const away = team(o["away"]);
    const home = team(o["home"]);
    if (!away || !home) return null;
    return { kind: "game", id: o["id"], href: o["href"], name: o["name"], start: o["start"], away, home };
  }
  if (o["kind"] !== "market") return null;
  if (typeof o["id"] !== "string" || !isInkName(o["ink"]) || typeof o["question"] !== "string" || typeof o["state"] !== "string" || !MARKS.has(o["state"])) return null;
  const mark = o["mark"];
  const markRef: MarkRef | null = mark && typeof mark === "object" && (mark as { kind?: unknown }).kind === "emoji" && typeof (mark as { value?: unknown }).value === "string" ? { kind: "emoji", value: (mark as { value: string }).value } : mark && typeof mark === "object" && (mark as { kind?: unknown }).kind === "sticker" && typeof (mark as { id?: unknown }).id === "string" ? { kind: "sticker", id: (mark as { id: string }).id } : null;
  const asker = o["asker"];
  const askerRef = asker && typeof asker === "object" && typeof (asker as { name?: unknown }).name === "string" && typeof (asker as { hue?: unknown }).hue === "string" && typeof (asker as { line?: unknown }).line === "string" ? { name: (asker as { name: string }).name, hue: (asker as { hue: string }).hue, line: (asker as { line: string }).line } : null;
  const sheet = o["sheet"];
  const sheetRef = sheet && typeof sheet === "object" && typeof (sheet as { label?: unknown }).label === "string" && typeof (sheet as { line?: unknown }).line === "string" ? { label: (sheet as { label: string }).label, line: (sheet as { line: string }).line } : null;
  return { kind: "market", id: o["id"], ink: o["ink"], mark: markRef, state: o["state"] as MarketMark, clock: typeof o["clock"] === "string" ? o["clock"] : null, question: o["question"], asker: askerRef, sheet: sheetRef };
}

/** The market a link opens, from its address: `/m/<id>`, with or without a query. */
export function marketIdOf(href: string): string | null {
  const m = /^\/m\/([0-9a-f-]{36})(?:[?#]|$)/i.exec(href);
  return m ? (m[1] as string).toLowerCase() : null;
}
