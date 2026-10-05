/**
 * The usage events, counted for the traction numbers (the field round, 2026-10-02): what exists, which the
 * browser may report, and what each one's properties may say. Shared by the server (`src/lib/usage/index.ts`),
 * the door (`/api/usage`) and the client (`src/lib/usage/client.ts`), so the three cannot disagree.
 *
 * Every property is a word from a fixed set, a boolean or a small count, never text anyone typed: no question,
 * no name, no number, no address, no amount (`usage_events`, src/db/schema.ts).
 */
import { z } from "zod";
import { WORDS } from "@/lib/ui/errors";

const count = z.number().int().min(0).max(1000);
const method = z.enum(["phone", "email", "other", "google"]);

/** How a market is settled, as the counts say it: the quorum's word is a vote, the tiebreaker's a ruling, and the feed settles only as the backstop (its ending is on the market's row). */
export const SETTLED_BY = ["vote", "tiebreaker", "feed", "expired", "removed"] as const;

export function settledWord(by: "quorum" | "arbitration" | "feed"): "vote" | "tiebreaker" | "feed" {
  return by === "quorum" ? "vote" : by === "arbitration" ? "tiebreaker" : "feed";
}

export const EVENTS = {
  /** A page that a person opened from a link: once per person (or device) per link, never a link-preview fetcher. */
  link_opened: z.object({ link: z.enum(["market", "game", "claim", "code"]), signedIn: z.boolean(), installed: z.boolean() }),
  asked: z.object({ kind: z.enum(["binary", "numeric", "categorical"]), pace: z.enum(["dare", "argument"]), source: z.enum(["direct", "whats_on"]), mark: z.enum(["none", "emoji", "image", "sticker"]) }),
  entered: z.object({ as: z.enum(["account", "guest", "pass_the_phone"]) }),
  /** By the icon that sent it (docs/design.md 3.42): the share sheet, copy, the result's share, the chalk while alone, the nudge's relay. */
  share: z.object({ icon: z.enum(["share", "copy", "chalk", "result", "relay"]) }),
  code_shown: z.object({}),
  code_used: z.object({}),
  sticker: z.object({ source: z.enum(["pasted", "cut"]) }),
  photo_added: z.object({ stage: z.enum(["open", "closed", "settled", "settlement"]), role: z.enum(["memory", "evidence"]) }),
  closed: z.object({ by: z.enum(["asker", "time", "both_in"]), game: z.boolean() }),
  voted: z.object({ provisional: z.boolean() }),
  settled: z.object({ by: z.enum(SETTLED_BY), outcome: z.enum(["decided", "void", "none"]) }),
  obligation_closed: z.object({ reason: z.enum(["settled", "forgiven"]) }),
  netted: z.object({}),
  nudge: z.object({ stage: z.enum(["enter", "vote"]), told: count, reached: count }),
  notification_sent: z.object({ kind: z.string().max(40), channel: z.enum(["push", "email", "both", "none"]) }),
  notification_opened: z.object({ channel: z.enum(["push", "email"]) }),
  claim_bound: z.object({ via: z.enum(["phone", "token", "link", "suggestion", "merge"]) }),
  signed_up: z.object({ method }),
  signed_in: z.object({ method }),
  /** Every error a screen showed, by its cause and the screen's shape (never its ids), so the stats can say errors per hundred sessions. */
  /** A drafting answer (Haiku) that failed its shape or ran out of time, asked once more of the ruling model (Sonnet): the first-contact round, 2026-10-04. Server only. */
  model_escalated: z.object({ task: z.enum(["write_up", "careful", "other"]), why: z.enum(["invalid", "timeout"]) }),
  error_shown: z.object({ cause: z.enum(["nothing_came_back", "failed", "offline", "refused", "other", "server", "signed_out", "not_allowed", "changed", "too_many", "screen"]), screen: z.string().regex(/^\/[a-z0-9/[\]-]{0,39}$/) }),
} as const;

export type EventName = keyof typeof EVENTS;
export type EventProps<N extends EventName> = z.infer<(typeof EVENTS)[N]>;

/** What the browser may report; everything else is the server's own to record where it happens. */
export const CLIENT_EVENTS = ["link_opened", "share", "notification_opened", "error_shown"] as const satisfies readonly EventName[];
export type ClientEventName = (typeof CLIENT_EVENTS)[number];

export function isClientEvent(name: string): name is ClientEventName {
  return (CLIENT_EVENTS as readonly string[]).includes(name);
}

/**
 * A link-preview fetcher is never a person: Messages, Slack and the rest fetch a pasted link with a crawler's user
 * agent, and some run no script at all. The browser's report is already a page that ran; this is the second belt.
 */
export function isCrawler(userAgent: string | null): boolean {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|facebot|twitterbot|whatsapp|telegram|discord|slack|skype|linkedin|pinterest|embedly|quora|outbrain|vkshare|w3c_validator|headlesschrome|lighthouse|curl\/|wget\/|python-requests|go-http-client|java\/|okhttp|apache-httpclient/i.test(userAgent);
}

/** A screen's shape for the error count: ids, tokens and codes replaced by `[id]`, nothing a person typed. */
export function screenOf(pathname: string): string {
  const shape = pathname
    .toLowerCase()
    .split("/")
    .map((part) => (part === "" ? part : /^[a-z]+$/.test(part) ? part : "[id]"))
    .join("/")
    .slice(0, 40);
  return shape.startsWith("/") ? shape : "/";
}

/** The cause an error's words say, for the count; the words themselves never leave the screen. */
export function causeOf(message: string, online: boolean): EventProps<"error_shown">["cause"] {
  if (!online) return "offline";
  if (message === WORDS.offline) return "offline";
  if (message === WORDS.server) return "server";
  if (message === WORDS.signedOut) return "signed_out";
  if (message === WORDS.changed) return "changed";
  if (message === WORDS.tooMany) return "too_many";
  if (/^Only \S+ can \S+ this one\.$/.test(message)) return "not_allowed";
  if (message === WORDS.readTimeout || /didn[’']t come back/i.test(message)) return "nothing_came_back";
  if (/didn[’']t go through|didn[’']t send|didn[’']t come through|couldn[’']t save|couldn[’']t load|stopped partway|try again/i.test(message)) return "failed";
  if (message.length > 0) return "refused";
  return "other";
}
