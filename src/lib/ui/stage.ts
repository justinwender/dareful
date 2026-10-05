/**
 * The market stage's one rule about its sheet (docs/design.md 3.24, 3.13 as amended 2026-09-29): the entry sheet
 * stands only while entering is this person's move, which is before they are in and while they are changing
 * their entry. `reading` is the value the entry line reads, so the sheet goes in the render the entry line
 * arrives in: the two are never on screen together at rest. Pure, so a test can hold it.
 */
export function sheetPresent(reading: boolean, changing: boolean): boolean {
  return !reading || changing;
}

/**
 * Whether an answer that has just arrived still belongs on the screen (docs/decisions.md 2026-09-29): only when
 * the person is where they asked it and what they typed is what was sent. A model's answer takes seconds; by
 * then they may have tapped again, gone on, or changed the line, and a late answer used to pull them back to a
 * step they had left, with a different claim on it. Pure.
 */
export function answerLands(asked: { step: string; line: string }, now: { step: string; line: string }): boolean {
  return asked.step === now.step && asked.line === now.line;
}

/**
 * Whether the AI market setup stands (the first-contact round, 2026-10-04, superseding the field round's 2.6): on every type of a
 * dare, as a section of its own, since Help define the terms now asks its questions for a number and a pick-one question too. An
 * argument has its own check and never sees it.
 */
export function paceRowShows(pace: "dare" | "argument", kind: "binary" | "numeric" | "categorical"): boolean {
  void kind;
  return pace === "dare";
}
