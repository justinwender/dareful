/**
 * What a share card may say about a cover (docs/decisions.md, "What a share card says"). These links land in
 * group chats where everyone sees the preview, and a preview is fetched by a bot with no session and cached.
 * So: the first name of the person who covered, and that there is something to look at. Never an amount, a
 * unit, a memo, or the other person's name. Anything that is not a live cover between two account-holders
 * gets the plain card, identical for an unknown id, a malformed one, and a closed one.
 */
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { pendingForClaim, readClaimLink } from "@/lib/ledger/claims";
import { clip, plainCard, type ShareCard } from "@/lib/ui/share-card";
import { clockOf, firstName } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { inkOf } from "@/lib/ui/ink";
import type { Tile } from "@/lib/ui/tiles";
import { memoriesOnMarkets } from "@/lib/media";
import { pictureMarkById } from "@/lib/media/marks";
import { getObject } from "@/lib/media/storage";
import { ruler, unitPhrase, withSeparators } from "./number-axis";

/** What a share route shows a visitor with no session: the card, and the text metadata beside it. */
export type ProposalShare = {
  card: ShareCard;
  title: string;
  description: string;
  sender: string | null;
};

const PLAIN: ProposalShare = {
  card: plainCard,
  title: "Dareful",
  description: plainCard.footer,
  sender: null,
};
const DESCRIPTION = "Have a look. Nothing counts until you say so.";

export async function proposalShareCard(rawId: string): Promise<ProposalShare> {
  const id = z.string().uuid().safeParse(rawId);
  if (!id.success) return PLAIN;
  const rows = await db
    .select({
      status: schema.obligationProposals.status,
      creditor: schema.users.displayName,
    })
    .from(schema.obligationProposals)
    .innerJoin(
      schema.users,
      eq(schema.users.id, schema.obligationProposals.toUser),
    )
    .where(eq(schema.obligationProposals.id, id.data))
    .limit(1)
    .catch(() => []);
  const row = rows[0];
  if (!row || row.status !== "pending") return PLAIN;
  const who = clip(firstName(row.creditor), 18);
  if (!who) return PLAIN;
  const title = `${who} got this one`;
  return {
    card: { kicker: "Dareful", headline: `${title}.`, footer: DESCRIPTION },
    title,
    description: DESCRIPTION,
    sender: who,
  };
}

/** A claim link: the sender's first name and whether it is one thing or several. A dead link gets the plain card. */
export async function claimShareCard(token: string): Promise<ProposalShare> {
  const link = await readClaimLink(token).catch(() => null);
  if (!link || link.claim.claimedBy) return PLAIN;
  const who = clip(firstName(link.creatorName), 18);
  if (!who) return PLAIN;
  const n = (await pendingForClaim(link.claim.id)).length;
  const title = `${who} got this one`;
  return {
    card: {
      kicker: "Dareful",
      headline: n > 1 ? `${who} got these.` : `${title}.`,
      footer: DESCRIPTION,
    },
    title,
    description: DESCRIPTION,
    sender: who,
  };
}

/**
 * A question someone asked their group. The card carries the question, because the question is the invitation
 * (PLANNING.md 8b: the terms are on the card before anyone enters), and how many are in. Never a number anyone
 * gave, never what is on it, never a name. A draft, or an id that matches nothing, gets the plain card.
 */
export async function marketShare(
  rawId: string,
): Promise<ProposalShare & { question: string | null }> {
  const id = z.string().uuid().safeParse(rawId);
  if (!id.success) return { ...PLAIN, question: null };
  const rows = await db
    .select({
      title: schema.dares.title,
      opened: schema.dares.creatorSignature,
      resolvedAt: schema.dares.resolvedAt,
      criterion: schema.dares.criterion,
      stalemate: schema.dares.stalemate,
      pace: schema.dares.pace,
    })
    .from(schema.dares)
    .where(eq(schema.dares.id, id.data))
    .limit(1)
    .catch(() => []);
  const row = rows[0];
  if (!row || !row.opened) return { ...PLAIN, question: null };
  const question = clip(row.title, 110);
  // The criterion and the tiebreaker are on the card before anyone is in (PLANNING.md 8b, 8d): entering is
  // accepting both, which is what lets the fast path work with no negotiation step. Still never a number, what
  // is riding, or a name.
  const description = row.resolvedAt
    ? "See how everyone did."
    : shareTermsLine({
        criterion: row.criterion,
        stalemate: row.stalemate,
        argument: row.pace === "argument",
      });
  return {
    card: { kicker: "Dareful", headline: question, footer: description },
    title: question,
    description,
    sender: null,
    question,
  };
}

/**
 * The link tile for a question (docs/design.md 3.27): the asking tile while it runs, the result tile once it is
 * settled. Never a count of who is in, never a relative time, never a number anyone picked while it runs; once
 * settled, the call line is the picture and who was closest is the line. A draft, or an id that matches nothing,
 * gets nothing (the plain card).
 */
export async function marketTile(rawId: string): Promise<Tile | null> {
  const id = z.string().uuid().safeParse(rawId);
  if (!id.success) return null;
  const rows = await db
    .select({
      id: schema.dares.id,
      ink: schema.dares.ink,
      opened: schema.dares.creatorSignature,
      creatorId: schema.dares.creatorId,
      pace: schema.dares.pace,
      kind: schema.dares.kind,
      resolvesBy: schema.dares.resolvesBy,
      zone: schema.dares.zone,
      resolvedAt: schema.dares.resolvedAt,
      resolvedOutcome: schema.dares.resolvedOutcome,
      resolvedBy: schema.dares.resolvedBy,
      markKind: schema.dares.markKind,
      markValue: schema.dares.markValue,
      outcomeLabels: schema.dares.outcomeLabels,
    })
    .from(schema.dares)
    .where(eq(schema.dares.id, id.data))
    .limit(1)
    .catch(() => []);
  const d = rows[0];
  if (!d || !d.opened) return null;
  const mark = d.markKind === "emoji" ? d.markValue : null;
  // A sticker mark rides the tile as its derivative (3.27, 3.28): read from the bucket by the server, never by a preview bot.
  const markImage = d.markKind === "sticker" && d.markValue ? await stickerDataUrl(d.markValue) : null;
  const ink = inkOf(d);
  const unit = d.kind === "numeric" ? { singular: d.outcomeLabels[0] ?? "", plural: d.outcomeLabels[1] ?? d.outcomeLabels[0] ?? "" } : null;
  const answered = d.resolvedAt && d.resolvedOutcome !== null && d.resolvedOutcome >= 0n;
  const outcome =
    answered && !unit
      ? d.resolvedOutcome === 1n
        ? (1 as const)
        : (0 as const)
      : null;
  if (!answered) {
    const [creator] = await db
      .select({ displayName: schema.users.displayName })
      .from(schema.users)
      .where(eq(schema.users.id, d.creatorId))
      .limit(1);
    return {
      kind: "ask",
      asker: {
        name: clip(firstName(creator?.displayName ?? "A friend"), 18),
        hue: hueFor(d.creatorId),
      },
      frame:
        d.pace === "argument"
          ? "Take the other side."
          : d.kind === "numeric"
            ? "Name a number."
            : "What are the odds?",
      mark,
      markImage,
      ink,
      closes:
        d.resolvesBy && !d.resolvedAt
          ? closesAbsolute(d.resolvesBy, d.zone)
          : null,
      unit: unit ? unit.plural : null,
    };
  }
  const positions = await db
    .select({
      userId: schema.darePositions.userId,
      value: schema.darePositions.value,
      score: schema.darePositions.score,
      name: schema.users.displayName,
    })
    .from(schema.darePositions)
    .innerJoin(schema.users, eq(schema.users.id, schema.darePositions.userId))
    .where(eq(schema.darePositions.dareId, d.id));
  const best = positions.reduce<(typeof positions)[number] | null>(
    (m, p) =>
      p.score !== null && (m === null || (m.score ?? -1) < p.score) ? p : m,
    null,
  );
  // Whether there are photos: the tile says so as a reason to tap through, and never carries one (docs/decisions.md, the media phase).
  const photos = (await memoriesOnMarkets([d.id])).get(d.id)?.length ? true : false;
  if (unit && d.resolvedOutcome !== null) {
    // The number tile (3.27): the answer as the outcome, the ruler with the cream tick, whoever was closest ringed. The scale is not on it.
    const answer = d.resolvedOutcome;
    const r = ruler(positions.map((p) => ({ id: p.userId ?? "", value: p.value })), answer, unit);
    const miss = best ? (best.value > answer ? best.value - answer : answer - best.value) : null;
    const who = best ? `${clip(firstName(best.name), 18)} ${d.resolvedBy === "arbitration" ? "was closest" : "called it"}, ${miss === 0n ? "dead on" : `off by ${withSeparators(miss ?? 0n)}`}.` : "";
    return {
      kind: "number",
      mark,
      markImage,
      ink,
      photos,
      outcomeLine: `${unitPhrase(answer, unit)}.`,
      ruler: {
        leftLabel: r?.leftLabel ?? "",
        rightLabel: r?.rightLabel ?? "",
        answerPermille: r?.answer?.xPermille ?? 500,
        pins: positions.map((p) => ({ name: p.name, hue: hueFor(p.userId ?? ""), xPermille: r?.pins.find((x) => x.id === (p.userId ?? ""))?.xPermille ?? 500, closest: best !== null && p.userId === best.userId })),
      },
      line: d.resolvedBy === "arbitration" ? `Settled by the tiebreaker everyone agreed to. ${who}`.trim() : who,
    };
  }
  const closest = best
    ? `${clip(firstName(best.name), 18)} ${d.resolvedBy === "arbitration" ? "was closest" : "called it"} at ${Number(best.value) / 100}%.`
    : "";
  return {
    kind: "called",
    mark,
    markImage,
    ink,
    photos,
    outcome: outcome ?? 0,
    outcomeLine: outcome === 1 ? "Yes." : "No.",
    pins: positions.map((p) => ({
      name: p.name,
      hue: hueFor(p.userId ?? ""),
      percent: Number(p.value) / 100,
      caller: best !== null && p.userId === best.userId,
    })),
    // The tiebreaker was everyone's agreement going in, so the card credits the agreement, never the app.
    line:
      d.resolvedBy === "arbitration"
        ? `Settled by the tiebreaker everyone agreed to. ${closest}`.trim()
        : closest,
  };
}

/** A sticker's 256px derivative as a data URL for the renderer, or null when it cannot be read: the tile then draws no mark rather than a broken one. */
async function stickerDataUrl(id: string): Promise<string | null> {
  try {
    const mark = await pictureMarkById(id);
    if (!mark) return null;
    return `data:image/png;base64,${(await getObject(mark.stampKey)).toString("base64")}`;
  } catch (err) {
    console.error("the tile could not read a sticker", { id, err: err instanceof Error ? err.message : err });
    return null;
  }
}

/** "Closes Fri, Sep 25, 10:40pm" in the asker's zone; a row from before zones were kept says the time in UTC and says so. */
export function closesAbsolute(at: Date, zone: string | null): string {
  const timeZone = zone ?? "UTC";
  const day = at.toLocaleDateString("en-US", {
    timeZone,
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  return `Closes ${day}, ${clockOf(at, timeZone)}${zone ? "" : " UTC"}`;
}

/** What someone is told, before they are in, about how it gets decided. Pure, so the card's promise has a test. */
export function shareTermsLine(input: {
  criterion: string | null;
  stalemate: string;
  argument: boolean;
}): string {
  const decided = input.criterion
    ? `Decided ${clip(input.criterion, 70)}. `
    : "";
  const tiebreak =
    input.stalemate === "void"
      ? "If nobody can agree, it goes unsettled."
      : "If nobody can agree, the app hears both sides and calls it.";
  return `${decided}${input.argument ? "Take the other side." : "Put your number on it."} ${tiebreak}`;
}
