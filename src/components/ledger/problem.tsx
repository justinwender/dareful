/**
 * Something did not happen, and what to do about it. One look everywhere, so a refusal is never mistaken for a
 * prompt or for nothing: ink text behind a marigold rule, the color the focus ring already uses. There is no red
 * in the product (docs/design.md 3.4, "Never a red state"). Always a statement, never a question: a question
 * under a form reads as one more thing to fill in (docs/testing.md, session 2).
 */
export const PROBLEM_CLASS = "border-l-2 border-marigold pl-3 text-body-sm text-ink";

export function Problem({ message, id }: { message?: string | null; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} role="alert" className={PROBLEM_CLASS}>
      {message}
    </p>
  );
}
