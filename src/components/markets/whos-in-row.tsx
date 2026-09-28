"use client";

import { useEffect, useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Avatar, AvatarStack } from "@/components/ledger/avatar";
import { Button } from "@/components/ui/button";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { ProblemSummary } from "@/components/ledger/problem";
import { Sheet } from "@/components/ui/sheet";
import { roomCodeAction } from "@/lib/actions/join";
import { handOverExplainedAction } from "@/lib/actions/hand-over";
import { nudgeAction, removeGhostEntryAction } from "@/lib/actions/markets";
import type { Hue } from "@/lib/ui/hue";
import type { MarkRef } from "@/lib/ui/mark";
import { cn } from "@/lib/utils";

export type WhosInPerson = { name: string; hue: Hue; ghost?: boolean; /** "Asked it", in the who's-in list. */ asked?: boolean; /** A ghost's claim, for the asker's Remove before the lock. */ claimId?: string };
/** Someone the market was sent to who is not in yet (3.42, holdouts): a dashed avatar after the stack, never named as late. */
export type Holdout = { name: string; hue: Hue };
/** Someone still out, in who's in (3.42, amended 2026-09-27): asked and not in while it is open, or in the quorum and not voted once it is locked, with a nudge beside them for anyone who is in. */
export type StillOut = { id: string; name: string; hue: Hue };
/** The who's-in sheet behind the stack: who is in, the asker's Remove on a ghost's row before the lock, and the people still out with a nudge beside each. */
export type WhosInList = { dareId: string; canRemove: boolean; out?: StillOut[]; stage?: "enter" | "vote"; /** Whether this viewer is in, so may nudge (Principle 1: a person acting, from inside). */ canNudge?: boolean; /** The relay for someone no device reaches: the person's own composer, with these words and the link. */ relay?: { url: string; text: string } };

/** "Asked, not in yet" (3.1): no fill, a 1px dashed ring and the initial in ink-3, set apart from the stack. */
export function HoldoutAvatar({ name, size = 28 }: { name: string; size?: 28 | 36 }) {
  return (
    <span aria-label={name} role="img" className="inline-flex shrink-0 items-center justify-center rounded-pill font-bold text-ink-3 outline-dashed outline-1 outline-line-strong" style={{ width: size, height: size, fontSize: Math.round(size * 0.42), lineHeight: 1 }} data-holdout="">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/**
 * The who's-in row (docs/design.md 3.42): who is in, and the one place a market is shared from. On the left the
 * 28px avatar stack with the count under it; at the right end the icon buttons, 44px and 2px apart, their 22px
 * glyphs in ink: share (the phone's share sheet, with the market's link and its question), copy (the glyph turns
 * to a check for 1.5s and the name becomes "Link copied" through a live region; no toast) and the code to scan
 * (a modal sheet: the question, a 216px code on a chalk plate with the market's mark at its centre, and the six
 * characters as read-only boxes for reading aloud across a table). The last button hangs 11px into the gutter.
 * It replaces "They're right here: show a code", "Send the link", "Copy" and "Send how it ended", which were four
 * sentences and buttons in three places for one act. While you're the only one in, share is the screen's chalk.
 * Pass the phone (3.45) is the fourth icon on the phone owner's screen, once they're in and while the market is
 * open: the first tap explains it once, remembered on the account, and after that it goes straight to the
 * friend's entry.
 */
export function WhosInRow({ people, holdouts = [], count, share, code, chalk = false, list = null, pass = null, className }: { people: WhosInPerson[]; /** The people asked who are not in yet (3.42): dashed avatars after the stack, at most two drawn, then a dashed "+N". */ holdouts?: Holdout[]; count: string; /** The link and the question as its title; null where there is nothing to send (a void, an expiry). */ share: { url: string; title: string } | null; /** The code to scan: only while the market is open, and only for someone the code can be made for. */ code: { dareId: string; question: string; mark: MarkRef | null } | null; /** Share as the screen's chalk: a 44px chalk circle, while you're the only one in. */ chalk?: boolean; /** The who's-in sheet behind the stack (3.42): who is in, with the asker's Remove on a ghost's row before the lock. Null where the stack is not a button (the link page). */ list?: WhosInList | null; /** Pass the phone (3.45): the fourth icon, on the phone owner's screen once they're in and while the market is open; `explained` says whether the one-time explainer has been seen. */ pass?: { dareId: string; explained: boolean } | null; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [saidCopied, setSaidCopied] = useState(false);
  /** The clipboard refused (a browser that needs the page focused, or asks and is told no): the link itself, to copy by hand. A tap is never silently dropped (5.2). */
  const [byHand, setByHand] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [passOpen, setPassOpen] = useState(false);
  const router = useRouter();
  const passId = useId();
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  async function copy() {
    if (!share) return;
    try {
      await navigator.clipboard.writeText(share.url);
    } catch {
      setByHand(true);
      return;
    }
    setByHand(false);
    setCopied(true);
    setSaidCopied(true);
  }
  async function send() {
    if (!share) return;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        // The question rides as the text too, so a chat shows it above the link (docs/decisions.md 2026-09-27).
        await navigator.share({ title: share.title, text: share.title, url: share.url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // No share sheet here: copy instead, and say so as copy does.
      }
    }
    await copy();
  }

  return (
    <section className={cn("flex flex-wrap items-start justify-between gap-3", className)} data-whos-in="" aria-label="Who's in">
      {(() => {
        const shownHoldouts = holdouts.slice(0, holdouts.length > 2 ? 1 : 2);
        const stack = (
          <>
            <span className="flex items-center">
              {people.length > 0 ? <AvatarStack people={people} size={28} ring="var(--ground)" /> : null}
              {shownHoldouts.length > 0 ? (
                <span className="ml-1 flex items-center gap-1" data-holdouts={holdouts.length}>
                  {shownHoldouts.map((h, i) => (
                    <HoldoutAvatar key={i} name={h.name} />
                  ))}
                  {holdouts.length > shownHoldouts.length ? (
                    <span aria-label={`and ${holdouts.length - shownHoldouts.length} more not in yet`} role="img" className="inline-flex h-7 w-7 items-center justify-center rounded-pill text-label text-ink-3 outline-dashed outline-1 outline-line-strong">
                      +{holdouts.length - shownHoldouts.length}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </span>
            <p className="text-caption text-ink-2" data-whos-in-count="">
              {count}
            </p>
          </>
        );
        return list ? (
          <button type="button" onClick={() => setListOpen(true)} aria-haspopup="dialog" aria-expanded={listOpen} aria-label={`Who’s in: ${count}`} data-whos-in-list="" data-still-out={list.out?.length ?? 0} className="flex min-w-0 flex-col items-start gap-1 rounded-button text-left">
            {stack}
          </button>
        ) : (
          <div className="flex min-w-0 flex-col gap-1">{stack}</div>
        );
      })()}
      {share ? (
        <div className="-mr-[11px] flex shrink-0 items-center gap-[2px]" role="group" aria-label="Share it">
          <button type="button" aria-label="Share" data-share="" onClick={send} className={cn("flex h-11 w-11 items-center justify-center rounded-pill transition-opacity duration-[120ms] active:opacity-[0.88]", chalk ? "bg-chalk text-on-chalk" : "text-ink")}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" />
              <path d="M5 13v5.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V13" />
            </svg>
          </button>
          <button type="button" aria-label={copied ? "Link copied" : "Copy the link"} data-copy={copied ? "copied" : ""} onClick={copy} className="flex h-11 w-11 items-center justify-center rounded-pill text-ink transition-opacity duration-[120ms] active:opacity-[0.88]">
            {copied ? (
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            ) : (
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="8" y="8" width="12" height="12" rx="2" />
                <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
              </svg>
            )}
          </button>
          {code ? (
            <button type="button" aria-label="Show a code to scan" aria-haspopup="dialog" aria-expanded={codeOpen} data-code="" onClick={() => setCodeOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-pill text-ink transition-opacity duration-[120ms] active:opacity-[0.88]">
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="4" y="4" width="6" height="6" rx="1" />
                <rect x="14" y="4" width="6" height="6" rx="1" />
                <rect x="4" y="14" width="6" height="6" rx="1" />
                <path d="M14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2" />
              </svg>
            </button>
          ) : null}
          {pass ? (
            // Pass the phone (3.45): the fourth icon, a phone with an arrow each way; the first tap explains it once, then it goes straight to the friend's entry.
            <button type="button" aria-label="Pass the phone" aria-haspopup={pass.explained ? undefined : "dialog"} data-pass-phone="" onClick={() => (pass.explained ? router.replace(`/m/${pass.dareId}/pass`) : setPassOpen(true))} className="flex h-11 w-11 items-center justify-center rounded-pill text-ink transition-opacity duration-[120ms] active:opacity-[0.88]">
              <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="7" y="2.5" width="10" height="19" rx="2" />
                <path d="M11 18h2" />
                <path d="M1.5 9.5h4M4 7.5l1.5 2-1.5 2" />
                <path d="M22.5 14.5h-4M20 12.5l-1.5 2 1.5 2" />
              </svg>
            </button>
          ) : null}
          <span role="status" aria-live="polite" className="sr-only">
            {saidCopied && copied ? "Link copied" : ""}
          </span>
        </div>
      ) : null}
      {pass ? (
        <Sheet open={passOpen} onClose={() => setPassOpen(false)} labelledBy={passId}>
          <div className="flex items-center gap-3">
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-ink">
              <rect x="7" y="2.5" width="10" height="19" rx="2" />
              <path d="M11 18h2" />
              <path d="M1.5 9.5h4M4 7.5l1.5 2-1.5 2" />
              <path d="M22.5 14.5h-4M20 12.5l-1.5 2 1.5 2" />
            </svg>
            <h2 id={passId} className="text-body-strong text-ink">
              Pass the phone
            </h2>
          </div>
          <p className="text-body-sm text-ink-2" data-pass-explainer="">
            A friend who set this up on their own phone gets in here with their PIN. Nothing of theirs stays on yours.
          </p>
          <div className="flex flex-col gap-1">
            <Button
              variant="primary"
              data-autofocus
              onClick={() => {
                void handOverExplainedAction();
                router.replace(`/m/${pass.dareId}/pass`);
              }}
            >
              Hand it over
            </Button>
            <Button variant="secondary" onClick={() => setPassOpen(false)}>
              Not now
            </Button>
          </div>
        </Sheet>
      ) : null}
      {code && share ? <CodeSheet open={codeOpen} onClose={() => setCodeOpen(false)} dareId={code.dareId} url={share.url} question={code.question} mark={code.mark} /> : null}
      {list ? <WhosInSheet open={listOpen} onClose={() => setListOpen(false)} people={people} list={list} /> : null}
      {byHand && share ? (
        <input readOnly value={share.url} aria-label="The link, to copy by hand" data-copy-by-hand="" onFocus={(e) => e.currentTarget.select()} className="mt-2 h-11 w-full basis-full rounded-button border border-line bg-surface px-3 text-body-sm text-ink" />
      ) : null}
    </section>
  );
}

/**
 * The code to scan (3.42): opaque, on the current place's surface, with the grabber and the close. The question
 * as its title, a 216px code on a chalk plate with the market's mark in a 44px stamp at its centre (error
 * correction high enough to carry it), and under it the market's six characters as read-only boxes (3.16's, at
 * 48px). No instructions: a phone camera knows what to do with it. Scanning opens the link page (3.17).
 */
export function CodeSheet({ open, onClose, dareId, url, question, mark }: { open: boolean; onClose: () => void; dareId: string; url: string; question: string; mark: MarkRef | null }) {
  const titleId = useId();
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => {
    if (!open) return;
    let alive = true;
    // The mark sits over the middle of the code, so the code is drawn at the level that survives a covered centre.
    QRCode.toString(url, { type: "svg", margin: 0, errorCorrectionLevel: "H", color: { dark: "#121110", light: "#F2EDE3" } })
      .then((svg) => alive && setQr(svg))
      .catch(() => alive && setQr(null));
    if (code === null) {
      start(async () => {
        const r = await roomCodeAction(dareId);
        if (!alive) return;
        if ("error" in r) setProblem(r.error);
        else setCode(r.code);
      });
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the sheet opens; the code is fetched once
  }, [open]);
  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="text-body-strong text-ink">
        {question}
      </h2>
      <div className="flex flex-col items-center gap-4" data-code-sheet="">
        <div className="relative h-[216px] w-[216px] rounded-card bg-chalk p-3" role="img" aria-label="A code to scan that opens this question">
          {qr ? <div className="h-full w-full [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} /> : null}
          {mark ? (
            <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-card bg-chalk p-[3px]">
              <MarkRefStamp mark={mark} size={44} />
            </span>
          ) : null}
        </div>
        {code ? (
          <p aria-label={`The code is ${code.split("").join(" ")}`} className="flex gap-[6px]" data-room-code={code}>
            {code.split("").map((c, i) => (
              <span key={i} aria-hidden="true" data-type-exempt="" className="flex h-12 w-10 items-center justify-center rounded-button border border-line bg-surface text-numeral text-ink">
                {c}
              </span>
            ))}
          </p>
        ) : pending ? (
          <p aria-busy="true" className="flex gap-[6px]">
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} aria-hidden="true" className="h-12 w-10 rounded-button border border-line bg-surface" />
            ))}
          </p>
        ) : null}
        <ProblemSummary messages={[problem]} />
      </div>
    </Sheet>
  );
}

/**
 * Who's in (3.42): one 56px row per person in, the 36px avatar, the name and a caption only where it says something
 * ("Asked it"; "From the link, no account", whose avatar is stone with the dashed ring). No numbers: where people
 * landed is the weight line's job. For the asker, until the lock, a row from someone without an account carries
 * Remove, for a forwarded link that brought in a stranger, since a typed name counts as soon as it is entered
 * (3.17). It asks once, inside the same sheet; the entry comes out, the count drops, and nothing is sent to anyone.
 * Under the people in, the people still out (amended 2026-09-27): asked and not in while it is open, in the quorum
 * and not voted once locked, each with a Nudge beside them for anyone who is in; a nudge nobody's device took
 * offers the relay, the person's own composer, in its place.
 */
function WhosInSheet({ open, onClose, people, list }: { open: boolean; onClose: () => void; people: WhosInPerson[]; list: WhosInList }) {
  const { dareId, canRemove } = list;
  const out = list.out ?? [];
  const titleId = useId();
  const router = useRouter();
  const [asking, setAsking] = useState<WhosInPerson | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="text-body-strong text-ink">
        {asking ? `Remove ${first(asking.name)}’s entry?` : "Who’s in"}
      </h2>
      {asking ? (
        <div className="flex flex-col gap-4" data-remove-entry-ask="">
          <p className="text-body-sm text-ink-2">It comes out before anything is decided, and nothing changes hands.</p>
          <ProblemSummary messages={[problem]} />
          <Button
            variant="primary"
            loading={pending}
            onClick={() =>
              start(async () => {
                setProblem(null);
                const r = await removeGhostEntryAction(dareId, asking.claimId as string);
                if ("error" in r) return setProblem(r.error);
                setAsking(null);
                onClose();
                router.refresh();
              })
            }
          >
            Remove it
          </Button>
          <Button variant="secondary" disabled={pending} onClick={() => setAsking(null)}>
            Keep it
          </Button>
        </div>
      ) : (
        <>
          <ul className="flex flex-col" data-whos-in-rows="">
            {people.map((p, i) => (
              <li key={i} className="flex min-h-14 items-center gap-3">
                <Avatar name={p.name} hue={p.hue} size={36} ghost={p.ghost} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body-strong text-ink">{p.name}</span>
                  {p.asked ? <span className="text-caption text-ink-3">Asked it</span> : p.ghost ? <span className="text-caption text-ink-3">From the link, no account</span> : null}
                </span>
                {canRemove && p.ghost && p.claimId ? (
                  <Button variant="row" onClick={() => setAsking(p)}>
                    Remove
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {out.length > 0 ? (
            <div className="flex flex-col gap-1" data-still-out-rows="">
              <p className="text-label text-ink-3">{list.stage === "vote" ? "Still to call it" : "Not in yet"}</p>
              <ul className="flex flex-col">
                {out.map((o) => (
                  <StillOutRow key={o.id} person={o} dareId={dareId} canNudge={list.canNudge === true} relay={list.relay ?? null} />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

/**
 * One person still out (3.42, amended 2026-09-27): the dashed avatar, the name, and for anyone who is in a Nudge
 * beside them, which tells that one person once per window and says what it reached. When no device of theirs
 * takes messages, the row offers the relay instead: the person's own composer, from their own number, which is
 * the only way to reach someone who signed up by phone and never installed the app.
 */
function StillOutRow({ person, dareId, canNudge, relay }: { person: StillOut; dareId: string; canNudge: boolean; relay: { url: string; text: string } | null }) {
  const [said, setSaid] = useState<string | null>(null);
  const [offerRelay, setOfferRelay] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const first = person.name.trim().split(/\s+/)[0] ?? person.name;
  function nudge() {
    setProblem(null);
    start(async () => {
      const r = await nudgeAction(dareId, person.id);
      if ("error" in r) return setProblem(r.error);
      if (r.waitingOn === 0) return setSaid("Nothing left to wait on.");
      if (r.told === 0) {
        setOfferRelay(true);
        return setSaid("Told in the last few hours");
      }
      setOfferRelay(r.reached === 0);
      setSaid(r.reached > 0 ? "Told them" : "No device of theirs takes messages from here");
    });
  }
  async function sayIt() {
    if (!relay) return;
    const text = `${relay.text} ${relay.url}`;
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // fall through to sms:
      }
    }
    window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
  }
  return (
    <li className="flex min-h-14 flex-col justify-center gap-1" data-still-out-row={person.id}>
      <div className="flex items-center gap-3">
        <HoldoutAvatar name={person.name} size={36} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-body-strong text-ink">{person.name}</span>
          {said ? (
            <span role="status" className="text-caption text-ink-3">
              {said}
            </span>
          ) : null}
        </span>
        {canNudge && !said ? (
          <Button variant="row" onClick={nudge} loading={pending} data-nudge-one={person.id}>
            {`Nudge ${first}`}
          </Button>
        ) : offerRelay && relay ? (
          <Button variant="row" onClick={() => void sayIt()} data-relay-one={person.id}>
            Say it yourself
          </Button>
        ) : null}
      </div>
      <ProblemSummary messages={[problem]} />
    </li>
  );
}
