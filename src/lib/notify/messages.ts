/**
 * What a notification says and who gets which one (PLANNING.md 8d). Pure, so the rules have tests:
 * every message names a person and what they just did (Principle 1); someone who has voted is never asked
 * again; and once it is decided, everyone who had not voted gets the result instead of a request.
 */
export type Notice = { title: string; body: string; url: string };

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

/** What the voter's own composer opens with: their words, from their number, into whatever chat they choose. */
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
  return { title: `${input.askerName} asked something`, body: `“${short(input.title)}?” Put your number on it.`, url: `${input.appUrl}/m/${input.marketId}` };
}

/** To the person who asked, when someone gets in. Who, and how many are in now; never their number. */
export function joinedNotice(input: { joinerName: string; title: string; inCount: number; marketId: string; appUrl: string }): Notice {
  return { title: `${input.joinerName} is in`, body: `“${short(input.title)}?” ${input.inCount === 2 ? "That's two of you." : `That's ${input.inCount} in.`}`, url: `${input.appUrl}/m/${input.marketId}` };
}

/** One tap from someone waiting: "we're waiting on you". A person acting, by name, on demand. */
export function nudgeNotice(input: { nudgerName: string; title: string; stage: "enter" | "vote"; marketId: string; appUrl: string }): Notice {
  return {
    title: `${input.nudgerName} is waiting on you`,
    body: input.stage === "enter" ? `“${short(input.title)}?” Everyone else has a number in.` : `“${short(input.title)}?” It needs your call on how it came out.`,
    url: `${input.appUrl}/m/${input.marketId}${input.stage === "vote" ? "#ballot" : ""}`,
  };
}

export const NUDGE_WINDOW_MS = 6 * 3_600_000;

/**
 * Who a nudge goes to: while numbers are open, whoever in the group has not put one in; once locked, whoever in
 * the quorum has not called it. Never the person nudging, and only someone who is in the question may nudge, so
 * it is always "we're waiting on you" from somebody who is themselves in.
 */
export function nudgeTargets(input: { stage: "enter" | "vote"; nudgerId: string; nudgerIsIn: boolean; memberIds: string[]; enteredIds: string[]; quorumIds: string[]; votedIds: string[] }): string[] {
  if (!input.nudgerIsIn) return [];
  const done = new Set(input.stage === "enter" ? input.enteredIds : input.votedIds);
  const pool = input.stage === "enter" ? input.memberIds : input.quorumIds;
  return Array.from(new Set(pool)).filter((id) => id !== input.nudgerId && !done.has(id));
}

/** The same person is nudged about the same question at most once per window, whoever is asking. */
export function nudgeSeq(at: Date): number {
  return Math.floor(at.getTime() / NUDGE_WINDOW_MS);
}

/** To the asker, once, when the time they set has come: the consequence of their own act, never a reminder. */
export function deadlineNotice(input: { title: string; marketId: string; appUrl: string }): Notice {
  return { title: "Time’s up on yours", body: `“${short(input.title)}?” How did it come out?`, url: `${input.appUrl}/m/${input.marketId}#ballot` };
}

/** To everyone in it, when the app has been asked to call it and has. Says the answer and that the reasoning is there to read. */
export function rulingNotice(input: { askerName: string | null; title: string; outcome: OutcomeWord; marketId: string; appUrl: string }): Notice {
  return {
    title: `“${short(input.title)}” has been called`,
    body: `${LABEL[input.outcome]}. ${input.askerName ? `${input.askerName} asked the app to hear it` : "Nobody could agree, so the app heard it"}, the way everyone agreed going in. The reasoning is there to read.`,
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
    : { title: `${input.name} settled one with you`, body: which ? `${which} is done.` : "It's done.", url };
}

/** The other person cancelled out what went both ways. Who, and that only the difference is left; never the unit. */
export function nettedNotice(input: { name: string; personId: string; appUrl: string }): Notice {
  return { title: `${input.name} cancelled out what went both ways`, body: "Only the difference is left between you.", url: `${input.appUrl}/p/${input.personId}` };
}

/**
 * The one warning before a backstop acts (docs/decisions.md, public markets): the tiebreaker everyone agreed
 * to, the final score, or the void rule, about to settle a question nobody has called. Provisional copy, flagged
 * for the design session's pass. Never a second reminder: the person-triggered nudge covers everything else.
 */
export function backstopWarningNotice(input: { title: string; flavour: "tiebreaker" | "score" | "void"; marketId: string; appUrl: string }): Notice {
  const body =
    input.flavour === "score"
      ? "In about six hours the final score settles it, the way everyone agreed going in, unless someone calls it first."
      : input.flavour === "void"
        ? "In about six hours it goes unsettled and nothing changes hands, unless someone calls it first."
        : "In about six hours the tiebreaker everyone agreed to calls it, unless someone says how it came out first.";
  return { title: `Nobody’s called “${short(input.title)}” yet`, body, url: `${input.appUrl}/m/${input.marketId}#ballot` };
}

/**
 * The notice after a backstop has acted: the final score settled it, or could not, or the void rule let it go
 * unsettled. Provisional copy, flagged for the design session's pass. The tiebreaker's own notice is the ruling
 * notice above. Never a number, never a score: the screen has them.
 */
export function backstopResultNotice(input: { title: string; how: "feed" | "feed_void" | "expired"; marketId: string; appUrl: string }): Notice {
  const url = `${input.appUrl}/m/${input.marketId}`;
  if (input.how === "feed") return { title: `“${short(input.title)}” is decided`, body: "Decided by the final score, as the terms said. Nobody called it in time. Have a look at who was closest.", url };
  if (input.how === "feed_void") return { title: `“${short(input.title)}” went unsettled`, body: "The final score couldn’t settle it, so nothing changes hands. The reason is on the screen.", url };
  return { title: `“${short(input.title)}” went unsettled`, body: "Nobody said how it came out in time, so it goes unsettled and nothing changes hands, as everyone agreed going in.", url };
}
