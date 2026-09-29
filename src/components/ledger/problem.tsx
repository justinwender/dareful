import type { ReactNode } from "react";

/**
 * docs/design.md 5.1. There is no red, so colour cannot carry an error. Ink carries it instead, on four channels: position (at the field, and once more above the button), weight, a glyph, and the words.
 * Always a statement of what is wrong and what to do, never a question: a question under a form reads as one
 * more thing to fill in (docs/testing.md, session 2).
 */
export function AlertGlyph() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" className="mt-[2px] shrink-0 text-ink">
      <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.75v3.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="11" r="0.9" fill="currentColor" />
    </svg>
  );
}

/** The border a field takes when it has a problem: 1px line becomes 1.5px ink. Focus is a 2px ink outline 2px outside the control, so the two never look alike. */
export const FIELD_PROBLEM_CLASS = "border-[1.5px] border-ink";

/** Under the field it is about. The field points at it with `aria-describedby` and carries `aria-invalid`. */
export function Problem({ message, id }: { message?: string | null; id?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="flex gap-2 text-body-sm text-ink">
      <AlertGlyph />
      <span>{message}</span>
    </p>
  );
}

/** Whether a message is a failure the same tap could put right: a send or a save that did not go through, never a refusal at a field. */
export function isRetryable(message: string): boolean {
  return /didn[’']t go through|didn[’']t send|didn[’']t come back|didn[’']t come through|couldn[’']t save|couldn[’']t load|stopped partway|try again/i.test(message);
}

/** The words the ten-second step shows under a control that has not come back (5.2). */
export const NOTHING_CAME_BACK = "That didn’t come back.";

/** A 44px "Try again" inside the block (5.1): the row action's own utility, so this file owes the button nothing and the type budget sees no literal. */
export function TryAgain({ onClick }: { onClick: () => void }) {
  return (
    <div>
      <button type="button" onClick={onClick} data-try-again="" className="link-row transition-opacity duration-(--motion-quick) ease-fade active:opacity-[0.88]">
        Try again
      </button>
    </div>
  );
}

/**
 * Directly above the submit button: every field problem once more, in field order, or a server or network
 * failure with its way out inside the block (a 44px "Try again", 5.1, when `retry` is given and the failure is one
 * the same tap could put right). Announced once when it appears. Never a toast.
 */
export function ProblemSummary({ messages, children, retry }: { messages: ReadonlyArray<string | null | undefined>; children?: ReactNode; /** Runs the same submit again; drawn only for a failure that a retry could put right. */ retry?: () => void }) {
  const list = messages.filter((m): m is string => Boolean(m));
  if (list.length === 0) return null;
  const retryable = retry && list.some(isRetryable);
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-button border border-line-strong bg-surface-2 px-[14px] py-3">
      {list.map((m) => (
        <p key={m} className="flex gap-2 text-body-sm text-ink">
          <AlertGlyph />
          <span>{m}</span>
        </p>
      ))}
      {retryable ? <TryAgain onClick={retry} /> : null}
      {children}
    </div>
  );
}
