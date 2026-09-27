"use client";

import { useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LinkPending } from "@/components/ui/link-pending";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { FIELD_PROBLEM_CLASS, Problem, ProblemSummary } from "@/components/ledger/problem";
import { joinByCodeAction, joinByLinkAction } from "@/lib/actions/join";
import { CODE_LENGTH, readCode, tidyCode } from "@/lib/ledger/room-code";
import { cn } from "@/lib/utils";

/**
 * The code boxes (docs/design.md 3.16): one real input underneath, so typing advances, backspace retreats, paste
 * fills all six, and a screen reader hears one field; six drawn boxes over it, the active one carrying the focus
 * outline (5.1). No placeholder: six empty boxes are the shape of a code, and an example inside them reads as a
 * code someone already typed (4.9). Never `type="number"`.
 */
function CodeBoxes({ id, value, onChange, field, describedBy, height, gap, autoFocus = false, inputRef }: { id: string; value: string; onChange: (v: string) => void; field: string | null; describedBy?: string; height: 48 | 60; gap: 6 | 8; autoFocus?: boolean; inputRef: React.RefObject<HTMLInputElement | null> }) {
  const [focused, setFocused] = useState(false);
  return (
    <div className="relative min-w-0 flex-1" onClick={() => inputRef.current?.focus()}>
      <input
        ref={inputRef}
        id={id}
        value={value}
        onChange={(e) => onChange(tidyCode(e.target.value).slice(0, CODE_LENGTH))}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoFocus={autoFocus}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="one-time-code"
        spellCheck={false}
        aria-invalid={field ? true : undefined}
        aria-describedby={describedBy}
        className="absolute inset-0 h-full w-full cursor-text opacity-0"
      />
      <div aria-hidden="true" className={cn("grid", height === 60 ? "grid-cols-[repeat(6,minmax(0,1fr))]" : "grid-cols-6")} style={{ gap }}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const active = focused && i === Math.min(value.length, CODE_LENGTH - 1);
          return (
            <span key={i} data-type-exempt="" className={cn("flex items-center justify-center rounded-button border border-line bg-surface text-numeral text-ink", height === 60 ? "h-[60px]" : "h-12", field && FIELD_PROBLEM_CLASS, active && "outline outline-2 outline-ink outline-offset-2")}>
              {value[i] ?? (active ? <span className="h-6 w-px animate-pulse bg-ink-2" /> : null)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * docs/design.md 3.16, the compact form: on an empty Now, the six boxes at 48px with a 6px gap, sharing the row
 * with a 48px secondary Join. A signed-in person who cannot join from inside the app has to leave the app
 * (docs/testing.md, session 3). Validated on submit and never on a keystroke; what was typed is always kept.
 */
export function CodeJoinCompact({ label = "Someone read you a code?" }: { label?: string }) {
  const id = useId();
  const [value, setValue] = useState("");
  const [field, setField] = useState<string | null>(null);
  const [form, setForm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function submit() {
    setForm(null);
    const read = readCode(value);
    if ("problem" in read) {
      setField(read.problem);
      input.current?.focus();
      return;
    }
    setField(null);
    start(async () => {
      const r = await joinByCodeAction(read.code);
      if (r.at === "field") setField(r.error);
      else setForm(r.error);
    });
  }

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      data-code-join="compact"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-label text-ink-2">
          {label}
        </label>
        <Link prefetch href="/join" className="relative -my-3 inline-flex h-11 items-center text-label text-ink-2">
          <LinkPending />
          Got a link?
        </Link>
      </div>
      <div className="flex items-start gap-2">
        <CodeBoxes id={id} value={value} onChange={setValue} field={field} describedBy={field ? `${id}-problem` : undefined} height={48} gap={6} inputRef={input} />
        <Button type="submit" variant="secondary" loading={pending}>
          Join
        </Button>
      </div>
      <Problem id={`${id}-problem`} message={field} />
      <ProblemSummary messages={[form]} />
    </form>
  );
}

/**
 * The focused form, on the joining screen ("Got a code?", 3.16, 3.38): six boxes at 60px, the active one carrying
 * the focus outline, one caption naming the letters no code uses, and Join in the sheet, disabled until six are in.
 */
export function CodeJoinFocused({ initial = "" }: { initial?: string }) {
  const id = useId();
  const [value, setValue] = useState(tidyCode(initial).slice(0, CODE_LENGTH));
  const [field, setField] = useState<string | null>(null);
  const [form, setForm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  const full = value.length === CODE_LENGTH;

  function submit() {
    setForm(null);
    const read = readCode(value);
    if ("problem" in read) {
      setField(read.problem);
      input.current?.focus();
      return;
    }
    setField(null);
    start(async () => {
      const r = await joinByCodeAction(read.code);
      if (r.at === "field") setField(r.error);
      else setForm(r.error);
    });
  }

  return (
    <form
      id={`${id}-form`}
      className="flex flex-col gap-4"
      noValidate
      data-code-join="focused"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="sr-only">
        The code
      </label>
      <CodeBoxes id={id} value={value} onChange={setValue} field={field} describedBy={`${id}-help${field ? ` ${id}-problem` : ""}`} height={60} gap={8} autoFocus inputRef={input} />
      <Problem id={`${id}-problem`} message={field} />
      <p id={`${id}-help`} className="text-caption text-ink-3">
        There’s no O, I, Z, zero or one in any code.
      </p>
      {/* The move, in the sheet (3.24), with the form-level problem above it when there is one. */}
      <PinnedSheet
        label="Join"
        low={
          <>
            <ProblemSummary messages={[form]} />
            <Button type="submit" form={`${id}-form`} variant="primary" disabled={!full} loading={pending}>
              Join
            </Button>
          </>
        }
      />
    </form>
  );
}

/**
 * "Got a link instead?" (3.38): tap it in the chat, or paste it here, as a 44px row action that reads the
 * clipboard and opens that market's screen. A clipboard with no market link on it gets the form-level block. Where
 * the clipboard cannot be read (a browser that refuses, or asks and is told no), a field takes the paste instead.
 * A link is read only if it is one of this app's own, and never fetched.
 */
export function LinkJoin() {
  const id = useId();
  const [value, setValue] = useState("");
  const [typing, setTyping] = useState(false);
  const [field, setField] = useState<string | null>(null);
  const [form, setForm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  function go(text: string) {
    setField(null);
    setForm(null);
    start(async () => {
      const r = await joinByLinkAction(text);
      if (r.at === "field") setForm("There’s no market link on your clipboard.");
      else setForm(r.error);
    });
  }
  async function paste() {
    setField(null);
    setForm(null);
    let text = "";
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      setTyping(true);
      return;
    }
    if (!text) return setForm("There’s no market link on your clipboard.");
    go(text);
  }
  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      data-link-join=""
      onSubmit={(e) => {
        e.preventDefault();
        if (!value.trim()) return setField("Paste the link they sent you.");
        go(value.trim());
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <label htmlFor={id} className="text-body-strong text-ink">
            Got a link instead?
          </label>
          <span className="text-caption text-ink-3">Tap it in the chat, or paste it here.</span>
        </div>
        {!typing ? (
          <Button type="button" variant="row" onClick={() => void paste()} loading={pending}>
            Paste a link
          </Button>
        ) : null}
      </div>
      {typing ? (
        <div className="flex gap-2">
          <input
            id={id}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            aria-invalid={field ? true : undefined}
            aria-describedby={field ? `${id}-problem` : undefined}
            className={cn("h-12 min-w-0 flex-1 rounded-button border border-line bg-surface px-4 text-body-sm text-ink", field && FIELD_PROBLEM_CLASS)}
          />
          <Button type="submit" variant="secondary" loading={pending}>
            Go
          </Button>
        </div>
      ) : null}
      <Problem id={`${id}-problem`} message={field} />
      <ProblemSummary messages={[form]} />
    </form>
  );
}
