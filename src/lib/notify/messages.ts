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

const LABEL = { yes: "Yes", no: "No", void: "Nobody could tell" } as const;
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
