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

/**
 * Directly above the submit button: every field problem once more, in field order, or a server or network
 * failure with its way out inside the block. Announced once when it appears. Never a toast.
 */
export function ProblemSummary({ messages, children }: { messages: ReadonlyArray<string | null | undefined>; children?: ReactNode }) {
  const list = messages.filter((m): m is string => Boolean(m));
  if (list.length === 0) return null;
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-button border border-line-strong bg-surface-2 px-[14px] py-3">
      {list.map((m) => (
        <p key={m} className="flex gap-2 text-body-sm text-ink">
          <AlertGlyph />
          <span>{m}</span>
        </p>
      ))}
      {children}
    </div>
  );
}
