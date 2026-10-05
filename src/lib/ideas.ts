/**
 * Ideas (docs/design.md 3.47; built in the first-contact round, 2026-10-04): a short, fixed list of ready questions
 * for the moments friends are together. Fixed in the code, and the owner edits it. What's on's rules apply (3.32):
 * nothing involving minors, nothing about health, injury or anyone's private life, and nothing interpersonal. An
 * idea with a blank leaves a name for the asker: "x" in the text is the slot.
 */
export type IdeaKind = "binary" | "numeric" | "categorical";
export type Idea = { id: string; group: "Tonight" | "Around the house" | "Out and about" | "This season"; text: string; kind: IdeaKind; /** A number idea's unit, singular and plural, carried to the terms. */ unit?: { singular: string; plural: string } };

const MINUTES = { singular: "minute", plural: "minutes" };

export const IDEAS: readonly Idea[] = [
  { id: "pong", group: "Tonight", text: "Will x win the pong game?", kind: "binary" },
  { id: "food", group: "Tonight", text: "How many minutes until the food comes?", kind: "numeric", unit: MINUTES },
  { id: "take", group: "Tonight", text: "How long will x take?", kind: "numeric", unit: MINUTES },
  { id: "last", group: "Tonight", text: "Who's last to arrive?", kind: "categorical" },
  { id: "dinner", group: "Around the house", text: "Will dinner start on time?", kind: "binary" },
  { id: "back", group: "Around the house", text: "How many times will someone say “back in my day”?", kind: "numeric", unit: { singular: "time", plural: "times" } },
  { id: "restaurant", group: "Around the house", text: "Will the group chat agree on a restaurant before 7?", kind: "binary" },
  { id: "train", group: "Out and about", text: "Will the train be late?", kind: "binary" },
  { id: "line", group: "Out and about", text: "How long is the line, in minutes?", kind: "numeric", unit: MINUTES },
  { id: "rain", group: "Out and about", text: "Will it rain before the walk home?", kind: "binary" },
  { id: "costume", group: "This season", text: "Which of us wins the costume contest?", kind: "categorical" },
  { id: "snow", group: "This season", text: "Will it snow before Thanksgiving?", kind: "binary" },
  { id: "turkey", group: "This season", text: "Will the turkey be done on time?", kind: "binary" },
];

export const IDEA_GROUPS = ["Tonight", "Around the house", "Out and about", "This season"] as const;

export function ideaById(id: string | null | undefined): Idea | null {
  return IDEAS.find((i) => i.id === id) ?? null;
}

/** The words around an idea's blank, or null for an idea with none: "Will " and " win the pong game?". */
export function blankOf(text: string): { before: string; after: string } | null {
  const m = /^(.*?)\bx\b(.*)$/.exec(text);
  return m ? { before: m[1] ?? "", after: m[2] ?? "" } : null;
}

/** How an idea's kind reads on its row (3.47). */
export function ideaKindWords(kind: IdeaKind): string {
  return kind === "categorical" ? "Pick one" : kind === "numeric" ? "A number" : "Yes or no";
}

/** The ideas tile stands on Now while fewer than three questions are running for this person, an empty Now included (3.47, 3.14). */
export function ideasOnNow(running: number): boolean {
  return running < 3;
}
