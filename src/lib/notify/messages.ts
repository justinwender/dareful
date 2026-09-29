/**
 * What a notification says and who gets which one (PLANNING.md 8d). Pure, so the rules have tests:
 * every message names a person and what they just did (Principle 1); someone who has voted is never asked
 * again; and once it is decided, everyone who had not voted gets the result instead of a request.
 */
/** What a channel sends: the title, one body, the address it opens; and, for the two backstop notices, the email's own subject and footer (docs/design.md 4.10). */
export type Notice = { title: string; body: string; url: string; email?: { subject: string; footer: string } };

const short = (title: string) => {
  const t = title.trim().replace(/\?+$/, "");
  return t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t;
};

/**
 * "Yes", "No", "Nobody could tell", or, for a number question or a pick-one question, "Decided": a notice never
 * carries a number (the rule for notices and relay text), and an answer somebody listed is theirs to read on the
 * screen; the answer waits on the screen the notice opens.
 */
const LABEL = { yes: "Yes", no: "No", void: "Nobody could tell", number: "Decided", answer: "Decided" } as const;
export type OutcomeWord = keyof typeof LABEL;

/**
 * "Gabe voted on the fence bet, 2 of 5, yours would not resolve it yet" or "3 of 5 have voted, yours resolves
 * it." `leading` is how many agree on the most-picked answer; one more reaching `threshold` is what "yours
 * decides it" means, and it is only true if they agree, so the line says "could".
 */
export function voteRequest(input: { voterName: string; title: string; cast: number; quorum: number; threshold: number; leading: number; marketId: string; appUrl: string }): Notice {
  const decides = input.leading + 1 >= input.threshold;
  return {
    title: `${input.voterName} called “${short(input.title)}”`,
    body: `${input.cast} of ${input.quorum} have, and ${decides ? "yours could decide it" : "yours wouldn't decide it yet"}.`,
    url: `${input.appUrl}/m/${input.marketId}#ballot`,
  };
}

/** For everyone who had not voted when it was decided: the result, not a request. The ballot is closed. */
export function resultNotice(input: { deciderName: string; title: string; outcome: OutcomeWord; marketId: string; appUrl: string }): Notice {
  return {
    title: `“${short(input.title)}” is decided`,
    body: `${LABEL[input.outcome]}. ${input.deciderName}'s call settled it. Have a look at who was closest.`,
    url: `${input.appUrl}/m/${input.marketId}`,
  };
}

/** What the voter's own composer opens with: their words, from their number, into whatever chat they choose. The relay is how someone who signed up by phone and never installed the app is reached (Round B, restored). */
export function relayText(input: { title: string; cast: number; quorum: number }): string {
  return `Called “${short(input.title)}”, ${input.cast} of ${input.quorum} so far. Your turn:`;
}

/**
 * Who is told what after a vote. Never the voter, never anyone who has already voted, and never a request
 * once it is decided.
 */
export function recipientsAfterVote(input: { quorumUserIds: string[]; votedUserIds: string[]; voterId: string; resolved: boolean }): { requests: string[]; results: string[] } {
  const voted = new Set(input.votedUserIds);
  const waiting = Array.from(new Set(input.quorumUserIds)).filter((id) => id !== input.voterId && !voted.has(id));
  return input.resolved ? { requests: [], results: waiting } : { requests: waiting, results: [] };
}

/** "Priya asked something": to everyone in the group it was asked in, except Priya. The canonical send-worthy notice (Principle 1). */
export function openedNotice(input: { askerName: string; title: string; marketId: string; appUrl: string }): Notice {
  return { title: `${input.askerName} asked something`, body: `“${short(input.title)}?”`, url: `${input.appUrl}/m/${input.marketId}` };
}

/** To the person who asked, when someone gets in. Who, and how many are in now; never their number. */
export function joinedNotice(input: { joinerName: string; title: string; inCount: number; marketId: string; appUrl: string }): Notice {
  return { title: `${input.joinerName} is in`, body: `“${short(input.title)}?” ${input.inCount === 2 ? "That's two of you." : `That's ${input.inCount} in.`}`, url: `${input.appUrl}/m/${input.marketId}` };
}

/** One tap from someone waiting: "we're waiting on you". A person acting, by name, on demand (Round B, restored: the only way someone in a market reaches the people not in or not voted). */
export function nudgeNotice(input: { nudgerName: string; title: string; stage: "enter" | "vote"; marketId: string; appUrl: string }): Notice {
  return {
    title: `${input.nudgerName} is waiting on you`,
    body: input.stage === "enter" ? `“${short(input.title)}?” Everyone else has a number in.` : `“${short(input.title)}?” It needs your call on how it came out.`,
    url: `${input.appUrl}/m/${input.marketId}${input.stage === "vote" ? "#ballot" : ""}`,
  };
}

/**
 * The PIN for a friend's phone was locked by wrong tries (3.45; docs/decisions.md 2026-09-28): someone acting
 * on a named phone, so a notice may exist. Names whose phone, never the PIN or how close the tries came.
 */
export function pinLockedNotice(input: { hostName: string; appUrl: string }): Notice {
  return { title: "Your PIN is locked for an hour", body: `Five wrong tries on ${input.hostName}’s phone. Nothing got in. If that wasn’t you, turn pass the phone off and on again with a new PIN.`, url: `${input.appUrl}/you` };
}

/** Someone entered a question from a friend's phone (3.45, frame 7): the question as the title, and whose phone. */
export function enteredFromNotice(input: { hostName: string; title: string; marketId: string; appUrl: string }): Notice {
  return { title: input.title, body: `You entered this from ${input.hostName}’s phone.`, url: `${input.appUrl}/m/${input.marketId}` };
}

export const NUDGE_WINDOW_MS = 6 * 3_600_000;

/**
 * Who a nudge goes to: while numbers are open, whoever in the group has not put one in; once locked, whoever in
 * the quorum has not called it. Never the person nudging, and only someone who is in the question may nudge, so
 * it is always "we're waiting on you" from somebody who is themselves in. `only` narrows it to one person, for the
 * nudge beside a name in who's in (3.42, amended 2026-09-27): still never the nudger, and never someone who is done.
 */
export function nudgeTargets(input: { stage: "enter" | "vote"; nudgerId: string; nudgerIsIn: boolean; memberIds: string[]; enteredIds: string[]; quorumIds: string[]; votedIds: string[]; only?: string | null }): string[] {
  if (!input.nudgerIsIn) return [];
  const done = new Set(input.stage === "enter" ? input.enteredIds : input.votedIds);
  const pool = input.stage === "enter" ? input.memberIds : input.quorumIds;
  const all = Array.from(new Set(pool)).filter((id) => id !== input.nudgerId && !done.has(id));
  return input.only ? all.filter((id) => id === input.only) : all;
}

/** The same person is nudged about the same question at most once per window, whoever is asking; a netting shares the window (index.ts). */
export function nudgeSeq(at: Date): number {
  return Math.floor(at.getTime() / NUDGE_WINDOW_MS);
}

/** To the asker, once, when the time they set has come: the consequence of their own act, never a reminder. */
export function deadlineNotice(input: { title: string; marketId: string; appUrl: string }): Notice {
  return { title: "Time’s up on yours", body: `“${short(input.title)}?” How did it come out?`, url: `${input.appUrl}/m/${input.marketId}#ballot` };
}

/** To everyone in it, when the tiebreaker has been asked to call it and has. The ruling is credited to the agreement, never to the app (4.6, 4.10): the answer, whose call it was, and that the reasoning is there to read. */
export function rulingNotice(input: { title: string; outcome: OutcomeWord; marketId: string; appUrl: string }): Notice {
  return {
    title: `“${short(input.title)}” has been called`,
    body: input.outcome === "void" ? "Void. The tiebreaker everyone agreed to found the terms don’t decide it, so nothing changes hands." : `${LABEL[input.outcome]}. Decided by the tiebreaker everyone agreed to. The reasoning is there to read.`,
    url: `${input.appUrl}/m/${input.marketId}`,
  };
}

/**
 * The person who was owed closed it (PLANNING.md Principle 1: "Gabe settled up" is a person acting). To the person
 * who had it: who, and which one by its memo when it has one; never the unit, never an amount.
 */
export function closedNotice(input: { name: string; reason: "settled" | "forgiven"; memo: string | null; personId: string; appUrl: string }): Notice {
  const url = `${input.appUrl}/p/${input.personId}`;
  const which = input.memo ? `“${short(input.memo)}”` : null;
  return input.reason === "forgiven"
    ? { title: `${input.name} called it even`, body: which ? `Nothing more on ${which}.` : "Nothing more on that one.", url }
    : { title: `${input.name} settled up`, body: which ? `${which} is done.` : "It's done.", url };
}

/** The other person cancelled out what went both ways. Who, and that only the difference is left; never the unit. */
export function nettedNotice(input: { name: string; personId: string; appUrl: string }): Notice {
  return { title: `${input.name} cancelled out what went both ways`, body: "Only the difference is left between you.", url: `${input.appUrl}/p/${input.personId}` };
}

/**
 * A clock for a notice (docs/design.md 4.10, 3.23): "at 7:45pm" today, "tomorrow at 7:45pm", "Monday at 7:45pm"
 * within the week, "Oct 2 at 7:45pm" after that, in the person's zone. It says when the agreement acts, which is
 * allowed; it never counts down.
 */
export function clockWithDay(at: Date, now: Date, zone: string): string {
  const day = (d: Date) => d.toLocaleDateString("en-US", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric" });
  const clock = at.toLocaleTimeString("en-US", { timeZone: zone, hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
  if (day(at) === day(now)) return `at ${clock}`;
  if (day(at) === day(new Date(now.getTime() + 86_400_000))) return `tomorrow at ${clock}`;
  const days = Math.round((Date.parse(day(at)) - Date.parse(day(now))) / 86_400_000);
  if (days > 1 && days < 7) return `${at.toLocaleDateString("en-US", { timeZone: zone, weekday: "long" })} at ${clock}`;
  return `${at.toLocaleDateString("en-US", { timeZone: zone, month: "short", day: "numeric" })} at ${clock}`;
}

/** The wall clock of an instant in a zone. */
function wallClock(at: Date, zone: string): { y: number; m: number; d: number; h: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" }).formatToParts(at);
  const n = (type: string) => Number(parts.find((x) => x.type === type)?.value ?? "0");
  return { y: n("year"), m: n("month"), d: n("day"), h: n("hour") };
}
/** The instant at a wall-clock hour on a calendar day in a zone, found by correcting a UTC guess by the zone's offset there. */
function atWallClock(y: number, m: number, d: number, h: number, zone: string): Date {
  let guess = new Date(Date.UTC(y, m - 1, d, h));
  for (let i = 0; i < 2; i++) {
    const w = wallClock(guess, zone);
    const asUtc = Date.UTC(w.y, w.m - 1, w.d, w.h);
    guess = new Date(guess.getTime() - (asUtc - Date.UTC(y, m - 1, d, h)));
  }
  return guess;
}

/** The hours a warning never lands in, in the person's zone (docs/design.md 4.10): eleven at night to eight in the morning. */
export const NIGHT_FROM = 23;
export const NIGHT_UNTIL = 8;
export const EVENING_HOUR = 20;
export const WARN_BEFORE_MS = 6 * 3_600_000;

/**
 * When the one warning goes (docs/design.md 4.10): six hours before the backstop acts, and never at night. A
 * warning that would land between 11pm and 8am in the person's zone goes at 8pm the evening before instead.
 */
export function warningSendTime(actsAt: Date, zone: string): Date {
  const at = new Date(actsAt.getTime() - WARN_BEFORE_MS);
  const w = wallClock(at, zone);
  if (w.h >= NIGHT_FROM) return atWallClock(w.y, w.m, w.d, EVENING_HOUR, zone);
  if (w.h < NIGHT_UNTIL) {
    const previous = wallClock(new Date(at.getTime() - 86_400_000), zone);
    return atWallClock(previous.y, previous.m, previous.d, EVENING_HOUR, zone);
  }
  return at;
}

/** Which backstop a warning is about (docs/design.md 4.10): the final score, the two results disagreeing, the play-by-play, the tiebreaker, or closing for good. */
export type WarningFlavour = "score" | "score_conflict" | "drive" | "tiebreaker" | "void";

/**
 * The one warning before a backstop acts (docs/design.md 4.10), to everyone who could still vote and hasn't: it
 * names the backstop everyone agreed to and says it is about to act for them. Never that time is running out.
 * The question is the title and one sentence the body; a clock time is allowed, since it says when the agreement
 * acts. The email's subject is the sentence; its body the question, the sentence, "Open it", and the one line.
 */
export function backstopWarningNotice(input: { title: string; flavour: WarningFlavour; actsAt: Date; now: Date; zone: string; marketId: string; appUrl: string }): Notice {
  const when = clockWithDay(input.actsAt, input.now, input.zone);
  const capital = when.charAt(0).toUpperCase() + when.slice(1);
  const body =
    input.flavour === "score"
      ? `Nobody has voted. The final score you all agreed to settles it ${when}.`
      : input.flavour === "score_conflict"
        ? `Nobody has voted, and the two results we check disagree. ${capital} it becomes void, as the terms said.`
        : input.flavour === "drive"
          ? `Nobody has voted. The play-by-play you all agreed to settles it ${when}.`
          : input.flavour === "void"
            ? `It hasn’t been decided. ${capital} it closes for good, as everyone agreed, and nothing changes hands.`
            : `It hasn’t been decided. ${capital} the tiebreaker everyone agreed to makes the call.`;
  return { title: input.title, body, url: `${input.appUrl}/m/${input.marketId}#ballot`, email: { subject: body, footer: BACKSTOP_FOOTER } };
}
const BACKSTOP_FOOTER = "You get this because you’re in this question. It’s the only one before it settles.";

/** How a backstop ended it (docs/design.md 4.10): the feed's endings, the tiebreaker's two, and closing for good. */
export type BackstopHow = "agreed" | "alone" | "conflict" | "tie" | "drive" | "drive_unknown" | "tiebreaker" | "tiebreaker_void" | "expired";

/**
 * The one notice after a backstop has acted (docs/design.md 4.10), to everyone in the market, in place of the
 * ordinary result notice. The question is the title and one sentence the body: never a number, never a score.
 * The tiebreaker's void counts against the asker and its notice does not say so; the feed's void counts against
 * nobody and its notice says so, because the asker would otherwise reasonably wonder.
 */
export function backstopResultNotice(input: { title: string; how: BackstopHow; marketId: string; appUrl: string }): Notice {
  const body: Record<BackstopHow, string> = {
    agreed: "Decided by the final score, as everyone agreed.",
    alone: "Decided by the final score, as everyone agreed. It held for three days.",
    conflict: "Void. The two results we check disagreed, so nothing changes hands, and it counts against nobody.",
    tie: "Void. The game ended in a tie, which the terms make void, so nothing changes hands, and it counts against nobody.",
    drive: "Decided by the play-by-play, as everyone agreed. It held for three days.",
    drive_unknown: "Void. The play-by-play couldn’t say how the first drive ended, so nothing changes hands, and it counts against nobody.",
    tiebreaker: "Decided by the tiebreaker everyone agreed to.",
    tiebreaker_void: "Void. The tiebreaker everyone agreed to found the terms don’t decide it, so nothing changes hands.",
    expired: "Closed for good. Nobody said what happened, so nothing changes hands.",
  };
  return { title: input.title, body: body[input.how], url: `${input.appUrl}/m/${input.marketId}`, email: { subject: body[input.how], footer: BACKSTOP_FOOTER } };
}

/**
 * Push, else email, never both (docs/design.md 4.10): the two backstop notices go by push where the person
 * allowed it, and by email only where push took nothing. Pure over the two senders, so the rule has a test.
 */
export async function pushElseEmail(push: () => Promise<boolean>, email: () => Promise<boolean>): Promise<{ push: boolean; email: boolean }> {
  const p = await push().catch(() => false);
  if (p) return { push: true, email: false };
  return { push: false, email: await email().catch(() => false) };
}
