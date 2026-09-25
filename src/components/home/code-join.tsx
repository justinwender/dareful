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
 * docs/design.md 3.16, the compact form: on home and on first run, directly under the primary action. A signed-in
 * person who cannot join from inside the app has to leave the app (docs/testing.md, session 3). Validated on
 * submit and never on a keystroke; what was typed is always kept.
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
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-caption text-ink-3">
          {label}
        </label>
        <Link prefetch href="/join" className="relative -my-3 inline-flex h-11 items-center text-label text-ink-2">
          <LinkPending />
          Got a link?
        </Link>
      </div>
      <div className="flex gap-2">
        <input
          ref={input}
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={() => {
            if (field) setField(((r) => ("problem" in r ? r.problem : null))(readCode(value)));
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          maxLength={9}
          placeholder="K7QMD3"
          aria-invalid={field ? true : undefined}
          aria-describedby={field ? `${id}-problem` : undefined}
          className={cn("h-12 min-w-0 flex-1 rounded-button border border-line bg-surface px-4 text-body uppercase tracking-[0.08em] text-ink placeholder:text-ink-3 placeholder:normal-case", field && FIELD_PROBLEM_CLASS)}
        />
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
 * The focused form, on the joining screen: six boxes, the active one carrying the focus outline (5.1). It is one real input
 * underneath, so typing advances, backspace retreats, paste fills all six, and a screen reader hears one field.
 */
export function CodeJoinFocused({ initial = "" }: { initial?: string }) {
  const id = useId();
  const [value, setValue] = useState(tidyCode(initial).slice(0, CODE_LENGTH));
  const [focused, setFocused] = useState(false);
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
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label htmlFor={id} className="text-label text-ink-2">
        The code
      </label>
      <div className="relative" onClick={() => input.current?.focus()}>
        <input
          ref={input}
          id={id}
          value={value}
          onChange={(e) => setValue(tidyCode(e.target.value).slice(0, CODE_LENGTH))}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoFocus
          inputMode="text"
          autoCapitalize="characters"
          autoCorrect="off"
          autoComplete="one-time-code"
          spellCheck={false}
          aria-invalid={field ? true : undefined}
          aria-describedby={`${id}-help${field ? ` ${id}-problem` : ""}`}
          className="absolute inset-0 h-full w-full cursor-text opacity-0"
        />
        <div aria-hidden="true" className="flex gap-2">
          {Array.from({ length: CODE_LENGTH }, (_, i) => {
            const active = focused && i === Math.min(value.length, CODE_LENGTH - 1);
            return (
              <span key={i} data-type-exempt="" className={cn("flex h-[60px] w-12 items-center justify-center rounded-button border border-line bg-surface text-numeral text-ink", field && FIELD_PROBLEM_CLASS, active && "outline outline-2 outline-ink outline-offset-2")}>
                {value[i] ?? (active ? <span className="h-6 w-px animate-pulse bg-ink-2" /> : null)}
              </span>
            );
          })}
        </div>
      </div>
      <Problem id={`${id}-problem`} message={field} />
      <p id={`${id}-help`} className="text-caption text-ink-3">
        Six characters. Case doesn’t matter, and there’s no O, I, Z, zero or one in any code. Pasting works.
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

/** "Got a link instead?" Pasted, read only if it is one of this app's own links, and never fetched. */
export function LinkJoin() {
  const id = useId();
  const [value, setValue] = useState("");
  const [field, setField] = useState<string | null>(null);
  const [form, setForm] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setField(null);
        setForm(null);
        if (!value.trim()) return setField("Paste the link they sent you.");
        start(async () => {
          const r = await joinByLinkAction(value);
          if (r.at === "field") setField(r.error);
          else setForm(r.error);
        });
      }}
    >
      <label htmlFor={id} className="text-body-strong text-ink">
        Got a link instead?
      </label>
      <p className="text-body-sm text-ink-2">Tap it in the chat, or paste it here.</p>
      <div className="flex gap-2">
        <input
          id={id}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          inputMode="url"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          placeholder="dareful.app/m/…"
          aria-invalid={field ? true : undefined}
          aria-describedby={field ? `${id}-problem` : undefined}
          className={cn("h-12 min-w-0 flex-1 rounded-button border border-line bg-surface px-4 text-body-sm text-ink placeholder:text-ink-3", field && FIELD_PROBLEM_CLASS)}
        />
        <Button type="submit" variant="secondary" loading={pending}>
          Go
        </Button>
      </div>
      <Problem id={`${id}-problem`} message={field} />
      <ProblemSummary messages={[form]} />
    </form>
  );
}
