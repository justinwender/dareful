"use client";

import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ledger/avatar";
import { Chip, chipPress } from "@/components/ledger/chip";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { FIELD_PROBLEM_CLASS, Problem, ProblemSummary } from "@/components/ledger/problem";
import { Screen, TopBar } from "@/components/ledger/screen";
import { Button, ButtonLink } from "@/components/ui/button";
import { withViewTransition } from "@/lib/ui/transitions";
import { streamWriteUp } from "@/lib/ui/write-up-stream";
import { MOTION, waitStage } from "@/lib/ui/motion";
import { answerLands } from "@/lib/ui/stage";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { carefulQuestionsAction, draftFromTemplateAction, draftMarketAction, scopeMarketAction, triageAction, type ScopeResult, type TriageResult } from "@/lib/actions/markets";
import { emojiInk } from "@/lib/ui/emoji-ink";
import type { Hue } from "@/lib/ui/hue";
import { inkFor, inkRoomStyleText, type InkName } from "@/lib/ui/ink";
import { cn } from "@/lib/utils";
import { MarkPicker, type Sticker } from "./mark-picker";
import { WhoStep, type Person, type SetOption, type Who } from "./who-step";
import { refOfPicked, type PickedMark } from "@/lib/ui/mark";
import { firstName } from "@/lib/ui/copy";
import { MAX_ANSWER_LENGTH, MAX_ANSWERS, MIN_ANSWERS } from "@/lib/ledger/pick-one";
import { CLOSINGS, closeMoment, nearestClosing, type Closing } from "@/lib/ledger/closings";

type Unit = { kind: "usd" } | { kind: "existing"; id: string } | { kind: "new"; template: "beer" | "round" | "coffee" | "next_time"; label: string };
const PRESETS = [
  { template: "beer", label: "beers" },
  { template: "round", label: "rounds" },
  { template: "next_time", label: "a next time" },
] as const;

/**
 * Asking, in three steps: the question, who's in, the terms (PLANNING.md 8a; docs/design.md 3.20 and section 7).
 * The terms are written up while the person is choosing who's in, so the wait for the write-up is spent on the
 * one decision that needs them anyway. If the write-up is slow or unavailable the line is used as typed, and the
 * screen says so. The last set of people is preselected: the common case is the same people as last time, and
 * it should cost one tap in total.
 */
/** One answer in the editor (3.29): a few words, or a person the asker knows (their id), with the words being their first name. */
type Choice = { text: string; userId: string | null };

/**
 * A public question being asked of one's own friends (docs/design.md 3.33): the question, the terms, the kind
 * and the close are What's on's and read-only; who's in, what's riding and whether it is blind are the asker's.
 */
export type TemplateForAsking = { id: string; title: string; terms: string; kind: "binary" | "numeric" | "categorical"; gameName: string; /** "Sunday at 1pm": when it closes, in the asker's zone. */ closes: string; decidedByScore: boolean; /** "Off by 28 points or more scores nothing.", where the template sets a scale. */ scored: string | null };

export function AskForm({ sets, people, initialLine = "", initialPace = "dare", me, screenTitle, gotCode = true, layer = false, stickers = [], canPaste = false, template = null, initialMark = null }: { sets: SetOption[]; people: Person[]; initialLine?: string; initialPace?: "dare" | "argument"; me: { id: string; name: string; hue: Hue }; /** The screen's name in its header; the form owns the screen so a picked mark can retint all of it (3.29). */ screenTitle: string; /** "Got a code?" beside the information icon on the question step (3.29, 10.3). */ gotCode?: boolean; /** Rendered in the ask layer (9.5), where the sheet sits in flow and Close sinks the layer. */ layer?: boolean; /** This person's stickers for the picker (3.28), and whether a cutout can be pasted at all. */ stickers?: Sticker[]; canPaste?: boolean; /** A public question (3.33): the flow starts at who's in, with the wording locked. */ template?: TemplateForAsking | null; /** A sticker just made from a photo (3.28): the question step opens with it as the mark. */ initialMark?: PickedMark | null }) {
  const router = useRouter();
  type Step = "question" | "declined" | "criterion" | "subject" | "careful" | "who" | "terms";
  const [step, setStepRaw] = useState<Step>(template ? "who" : "question");
  /** Where the person is and what they typed, as of now, for an answer that arrives late (`answerLands`). */
  const here = useRef<{ step: Step; line: string }>({ step: template ? "who" : "question", line: initialLine.slice(0, 280) });
  /** Advancing moves the step's content 24px left under a band that holds still; back mirrors it (9.8). */
  const setStep = (next: Step, back = false) => withViewTransition(() => setStepRaw(next), { back });
  const previous: Record<Step, Step | null> = { question: null, declined: "question", criterion: "question", subject: "question", careful: "question", who: template ? null : "question", terms: "who" };
  const stepBack = () => {
    const to = previous[step];
    if (to) setStep(to, true);
  };
  const infoKey = step === "question" ? "ask-question" : step === "who" ? "ask-who" : step === "terms" ? "ask-terms" : "ask-careful";
  /** A named subject the model could not place (a person, a pet, a thing): asked in one tap before the three questions. */
  const [subjectAsk, setSubjectAsk] = useState<string | null>(null);
  /** What the name turned out to be (3.44), shown collapsed on the careful step with Change. */
  const [subjectKind, setSubjectKind] = useState<"person" | "pet" | "thing" | null>(null);
  // Two paces, one object (PLANNING.md 8a): something that will happen, or a claim to settle now.
  const [pace, setPace] = useState<"dare" | "argument">(initialPace);
  // Yes or no, a number, or pick one (docs/design.md 3.26, 3.29). Chosen before the write-up, since the terms say how the answer is counted.
  const [kind, setKind] = useState<"binary" | "numeric" | "categorical">("binary");
  // The answers (3.29): two to six, in the asker's order; a person answer is anyone the asker knows here, or the asker.
  const [choices, setChoices] = useState<Choice[]>([{ text: "", userId: null }, { text: "", userId: null }]);
  // The mark (3.29), and the id the market will have, made here so the ink previewed is the ink stored.
  const [mark, setMark] = useState<PickedMark | null>(initialMark);
  const markName = mark ? (mark.kind === "emoji" ? (mark.name ? mark.name.charAt(0).toUpperCase() + mark.name.slice(1) : "Your mark") : "Your sticker") : null;
  const [pickingMark, setPickingMark] = useState(false);
  const [draftId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null));
  const [unitWords, setUnitWords] = useState({ singular: "", plural: "" });
  const [scale, setScale] = useState("");
  const [modeChosen, setMode] = useState<"quick" | "careful">("quick");
  const [verdict, setVerdict] = useState<TriageResult | null>(null);
  const [criterion, setCriterion] = useState<string | null>(null);
  const [side, setSide] = useState<"yes" | "no">("yes");
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, boolean>>({});
  /** How many answers there were the moment one was added, so the new row alone takes focus. */
  const [addedAt, setAddedAt] = useState(0);
  const [stalemate, setStalemate] = useState<"arbitrate" | "void">("arbitrate");
  const [thinking, startThinking] = useTransition();
  const [line, setLine] = useState(initialLine.slice(0, 280));
  useEffect(() => {
    here.current = { step, line };
  });
  const [who, setWho] = useState<Who>(sets[0] ? { kind: "set", groupId: sets[0].groupId } : { kind: "link" });
  const [scope, setScope] = useState<ScopeResult | null>(null);
  const scoping = useRef<Promise<void> | null>(null);
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("");
  const [closing, setClosing] = useState<Closing>("tomorrow");
  const [unit, setUnit] = useState<Unit>({ kind: "usd" });
  const [blind, setBlind] = useState(false);
  const [fieldProblem, setFieldProblem] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [waiting, startWait] = useTransition();
  /** The terms being written (9.8): the words so far, when the last arrived, and whether it finished or failed. */
  const [written, setWritten] = useState<{ title: string; terms: string; done: boolean; failed: boolean; /** When the last words arrived, or the start once the clock has read it; null until then. */ lastAt: number | null } | null>(null);
  const lastWriteUp = useRef<{ chosen?: string; source?: string } | null>(null);
  const writing = written !== null && !written.done && !written.failed;
  // A clock for the stall rules (9.8: "Still writing." at three seconds without new words, the block at ten), ticking only while writing.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!writing) return;
    const timer = setInterval(() => {
      const now = Date.now();
      setTick(now);
      setWritten((w) => (w && w.lastAt === null ? { ...w, lastAt: now } : w));
    }, 500);
    return () => clearInterval(timer);
  }, [writing]);
  const [saving, startSave] = useTransition();
  /** The draft is saved and its screen is on its way: "Send it" holds until the address has moved on, so one question is sent once. */
  const [sent, setSent] = useState(false);
  const selectedSet = who.kind === "set" ? sets.find((s) => s.groupId === who.groupId) : undefined;
  const numeric = pace === "dare" && kind === "numeric";
  const pickOne = pace === "dare" && kind === "categorical";
  // Careful mode is yes-or-no's alone (its three questions are written for one, and only that write-up reads the answers): a mode chosen before the kind changed cannot send a number or a pick-one question down the careful path.
  const mode: "quick" | "careful" = numeric || pickOne ? "quick" : modeChosen;
  const filledChoices = choices.filter((c) => c.text.trim().length > 0);
  // The ink this market would get (1.8, 3.29): the mark's from the table, or a hash of the id for a hueless mark, balanced on the
  // who's-in step against the questions still open between the same people. The server computes it again the same way and stores that.
  const previewInk = useMemo<InkName | null>(() => {
    if (!mark || !draftId) return null;
    return inkFor({ markInk: mark.kind === "emoji" ? emojiInk(mark.value) : mark.ink, id: draftId, takenInGroup: step === "question" ? [] : (selectedSet?.takenInks ?? []) }).ink;
  }, [mark, draftId, step, selectedSet]);

  /**
   * The write-up starts when the question step's Next is tapped and streams into the terms step as it is written
   * (9.8); if the question is edited it starts again. Where the stream cannot be read, the caret waits and the
   * terms arrive whole from the action, the same result either way.
   */
  function writeUp(chosen?: string, source?: string) {
    lastWriteUp.current = { chosen, source };
    setWritten({ title: "", terms: "", done: false, failed: false, lastAt: null });
    setScope(null);
    const asked = questions.map((question, i) => ({ question, yes: answers[i] ?? false })).filter((_, i) => i in answers);
    const body = { line: source ?? line, criterion: chosen, answers: mode === "careful" && pace === "dare" ? asked : undefined, kind: (pickOne ? "categorical" : numeric ? "numeric" : "binary") as "binary" | "numeric" | "categorical", choices: pickOne ? filledChoices.map((c) => c.text.trim()) : undefined };
    scoping.current = (async () => {
      let r: ScopeResult | { error: string };
      try {
        r = await streamWriteUp<ScopeResult | { error: string }>(body, (p) => setWritten((w) => (w ? { ...w, title: p.title ?? w.title, terms: p.terms ?? w.terms, lastAt: Date.now() } : w)));
      } catch {
        r = await scopeMarketAction(body.line, body.criterion, body.answers, body.kind, body.choices);
      }
      if ("error" in r) {
        setProblem(r.error);
        setWritten((w) => (w ? { ...w, failed: true } : w));
        return;
      }
      setScope(r);
      setTitle(r.title);
      setTerms(r.terms);
      if (r.number) setUnitWords(r.number.unit);
      setClosing(nearestClosing(r.resolvesInHours));
      setWritten((w) => (w ? { ...w, title: r.title, terms: r.terms, done: true, lastAt: Date.now() } : w));
    })();
  }

  function toWho() {
    setFieldProblem(null);
    setProblem(null);
    if (line.trim().length < 3) return setFieldProblem(pace === "argument" ? "Say what you two disagree about, in a line." : numeric ? "Ask it in a line, like “How many shirts can Gabe wear at once.”" : pickOne ? "Ask it in a line, like “Who falls asleep first.”" : "Ask it in a line, like “John falls asleep during the movie.”");
    if (pickOne) {
      if (filledChoices.length < MIN_ANSWERS) return setProblem("It takes at least two answers.");
      if (filledChoices.some((c) => c.text.trim().length > MAX_ANSWER_LENGTH)) return setProblem("Each answer is a few words.");
      if (new Set(filledChoices.map((c) => c.text.trim().toLowerCase())).size !== filledChoices.length) return setProblem("Two answers say the same thing.");
    }
    setScope(null);
    if (pace === "argument") {
      // The triage comes before anything else, and it matters more than the ruling: some things are not the app's to call.
      return startThinking(async () => {
        const asked = { step: "question", line };
        const t = await triageAction(line);
        // A second tap, or a slow first one: only the answer to what is on screen, where it was asked, moves anything.
        if (!answerLands(asked, here.current)) return;
        if ("error" in t) return setFieldProblem(t.error);
        setVerdict(t);
        if (t.kind === "unavailable") return setProblem("The app can’t weigh this one right now, and it won’t guess. Try again in a minute.");
        if (t.kind === "declined") return setStep("declined");
        if (t.tier === "contestable") return setStep("criterion");
        setCriterion(null);
        writeUp(undefined, t.claim);
        setStep("who");
      });
    }
    if (mode === "careful") {
      return startThinking(async () => {
        const asked = { step: "question", line };
        const q = await carefulQuestionsAction(line);
        if (!answerLands(asked, here.current)) return;
        if ("error" in q) {
          setProblem(q.error);
          writeUp();
          return setStep("who");
        }
        if ("ask" in q) {
          // What the name is comes first, in one tap; the questions are written with the answer (docs/decisions.md 2026-09-27).
          setSubjectAsk(q.ask.subject);
          return setStep("subject");
        }
        setQuestions(q.questions);
        setAnswers({});
        setStep("careful");
      });
    }
    writeUp();
    setStep("who");
  }

  function toTerms() {
    setProblem(null);
    if (who.kind === "people" && who.userIds.length === 0) return setProblem("Pick someone, or just send the link around.");
    // The terms step opens at once and the write-up streams into it (9.8); What's on wrote a public question's wording (3.33).
    setUnit({ kind: "usd" });
    setStep("terms");
  }

  /** Sends a public question to one's own friends (3.33): the template's wording, the asker's people, stake and reveal. */
  function saveFromTemplate() {
    if (!template) return;
    setProblem(null);
    startSave(async () => {
      const r = await draftFromTemplateAction({ templateId: template.id, who, unit, blind, id: draftId ?? undefined });
      if ("error" in r) return setProblem(r.error);
      setSent(true);
      // The new question replaces the ask flow in history: back from it never returns to the flow (docs/decisions.md 2026-09-27).
      router.replace(`/m/${r.id}`);
    });
  }

  function save() {
    setProblem(null);
    if (!scope) return;
    if (title.trim().length < 3) return setProblem("The question needs a few words.");
    if (terms.trim().length < 3) return setProblem("Say how you’ll know, in a sentence.");
    if (numeric && unitWords.singular.trim().length < 1) return setProblem("Say what the number counts, like shirts.");
    // The scale is the asker's when typed; otherwise the model's, if it passed the check; otherwise it has to be typed (3.26).
    if (numeric && !scale.trim() && !scope?.number?.model?.range) return setProblem("Say how far off scores nothing, like 20.");
    if (numeric && scale.trim() && !/^\s*[\d,]{1,11}\s*$/.test(scale)) return setProblem("The scale is a whole number, like 20.");
    startSave(async () => {
      const arguing = pace === "argument" && verdict?.kind === "ok";
      // The criterion has to be inside the terms: the terms are what is hashed, and what entering accepts.
      const finalTerms = arguing && criterion && !terms.includes(criterion) ? `${terms.trim()} Decided ${criterion}.` : terms;
      const r = await draftMarketAction({
        id: draftId ?? undefined,
        who,
        unit,
        title,
        terms: finalTerms,
        mark: mark ? (mark.kind === "emoji" ? { kind: "emoji", value: mark.value } : { kind: "sticker", id: mark.id }) : undefined,
        outcomeWords: !numeric && !pickOne && !arguing && scope?.outcomes ? scope.outcomes : undefined,
        answers: pickOne ? filledChoices.map((c) => ({ text: c.text.trim(), userId: c.userId })) : undefined,
        number: numeric ? { unit: { singular: unitWords.singular.trim().toLowerCase(), plural: unitWords.plural.trim().toLowerCase() || unitWords.singular.trim().toLowerCase() }, scale: scale.trim(), model: scope?.number?.model ?? null } : undefined,
        resolvesBy: arguing ? null : closeMoment(closing, new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone).toISOString(),
        blind: arguing ? false : blind,
        stalemate,
        mode,
        argument: arguing && verdict?.kind === "ok" ? { tier: verdict.tier, criterion } : undefined,
      });
      if ("error" in r) return setProblem(r.error);
      setSent(true);
      router.replace(arguing ? `/m/${r.id}?side=${side}` : `/m/${r.id}`);
    });
  }

  const wrap = (children: ReactNode) => (
    <div data-ink-room={previewInk ?? undefined} className={cn("flex flex-1 flex-col", previewInk && "grain retint")}>
      {/* The room's ink in both themes (3.29, 8.4): one style element, as the market's own screen carries its ink, never inline values from one theme's table. */}
      {previewInk ? <style dangerouslySetInnerHTML={{ __html: inkRoomStyleText(previewInk) }} /> : null}
      <Screen layer={layer ? "ask" : undefined}>
        {previous[step] === null ? (
          <TopBar close title={screenTitle} right={gotCode ? <ButtonLink href="/join" variant="tertiary" data-got-a-code="">Got a code?</ButtonLink> : undefined} info={infoKey} />
        ) : (
          <TopBar onBack={stepBack} title={screenTitle} info={infoKey} />
        )}
        {/* In the ask layer the step fills the column, so its action bar, in flow, stands at the layer's foot (9.5) and not wherever the step's content happens to end. */}
        <div className={layer ? "flex flex-1 flex-col pt-2 [&>*]:flex-1" : "py-2"} style={{ viewTransitionName: "ask-step" } as CSSProperties}>
          {children}
        </div>
      </Screen>
    </div>
  );

  if (step === "question") {
    return wrap(
      <form
        id="ask-question"
        className="flex flex-col gap-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          toWho();
        }}
      >
        {/* The question band (3.29): on the market's field, neutral until a mark is picked. The mark row opens the picker; "Optional" is said once. */}
        <section className="-mx-2 flex flex-col gap-4 rounded-card bg-field p-4 pb-5" style={{ viewTransitionName: "ask-band" } as CSSProperties}>
          <button type="button" aria-haspopup="dialog" aria-expanded={pickingMark} onClick={() => setPickingMark(true)} data-press="row" className="flex items-center gap-4 rounded-button text-left press-row">
            {mark ? (
              <MarkRefStamp mark={refOfPicked(mark)} size={64} onGround />
            ) : (
              <span aria-hidden="true" className="flex h-16 w-16 shrink-0 items-center justify-center rounded-panel border-[1.5px] border-dashed border-line-strong text-ink-2">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </span>
            )}
            <span className="flex min-w-0 flex-col">
              <span className="text-body-strong text-ink">{mark ? "Mark" : "Add a mark"}</span>
              <span className="text-caption text-ink-2">{mark ? `${markName} · tap to change` : "Optional"}</span>
            </span>
          </button>
          <div className="flex flex-col gap-2">
            <label htmlFor="ask-line" className="text-label text-ink-2">
              {pace === "argument" ? "What are you two arguing about?" : "Your question"}
            </label>
            <textarea id="ask-line" rows={3} value={line} onChange={(e) => setLine(e.target.value)} maxLength={280} aria-invalid={fieldProblem ? true : undefined} aria-describedby={fieldProblem ? "ask-line-problem" : undefined} className={cn("field-sizing-content resize-none rounded-button bg-transparent text-serif-l text-ink", fieldProblem && "px-2 " + FIELD_PROBLEM_CLASS)} />
            <Problem id="ask-line-problem" message={fieldProblem} />
          </div>
        </section>
        <MarkPicker
          open={pickingMark}
          onClose={() => setPickingMark(false)}
          value={mark}
          hue={me.hue}
          stickers={stickers}
          canPaste={canPaste}
          onPick={setMark}
        />
        <div role="group" aria-label="What kind of thing" className="flex flex-wrap gap-2">
          <button type="button" aria-pressed={pace === "dare"} onClick={() => setPace("dare")} {...chipPress(pace === "dare")}>
            <Chip size={36} selected={pace === "dare"} choice>
              Something that’ll happen
            </Chip>
          </button>
          <button type="button" aria-pressed={pace === "argument"} onClick={() => setPace("argument")} {...chipPress(pace === "argument")}>
            <Chip size={36} selected={pace === "argument"} choice>
              Settle an argument
            </Chip>
          </button>
        </div>
        {pace === "dare" ? (
          <div className="flex flex-col gap-2">
            <h2 className="text-label text-ink-3">How people answer</h2>
            <div role="radiogroup" aria-label="How people answer" className="flex flex-wrap gap-2">
              <button type="button" role="radio" aria-checked={kind === "binary"} onClick={() => setKind("binary")} {...chipPress(kind === "binary")}>
                <Chip size={36} selected={kind === "binary"} choice>
                  Yes or no
                </Chip>
              </button>
              <button type="button" role="radio" aria-checked={kind === "numeric"} onClick={() => setKind("numeric")} {...chipPress(kind === "numeric")}>
                <Chip size={36} selected={kind === "numeric"} choice>
                  A number
                </Chip>
              </button>
              <button type="button" role="radio" aria-checked={kind === "categorical"} onClick={() => setKind("categorical")} {...chipPress(kind === "categorical")}>
                <Chip size={36} selected={kind === "categorical"} choice>
                  Pick one
                </Chip>
              </button>
            </div>
          </div>
        ) : null}
        {pickOne ? (
          // The answers editor (3.29): one 44px row per answer, a dashed row to add one while there are fewer than six, and the people the
          // asker knows as a row of avatars, one tap each. "If none of them might happen, add that too." is the one piece of advice the step gives.
          <div className="flex flex-col gap-3" data-answers-editor="">
            <h2 className="text-label text-ink-3">The answers</h2>
            <ul className="flex flex-col gap-2">
              {choices.map((c, i) => (
                // The answer's field is the drawn row (5.1): focus outlines the row, 2px outside it, and the bare input inside carries none of its own.
                <li key={i} className="flex h-11 items-center gap-2 rounded-button border border-line bg-surface pl-2 has-[input:focus-visible]:outline-2 has-[input:focus-visible]:outline-offset-2 has-[input:focus-visible]:outline-ink" data-answer-row="">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center">{c.userId ? <Avatar name={c.userId === me.id ? me.name : c.text} hue={c.userId === me.id ? me.hue : (people.find((p) => p.id === c.userId)?.hue ?? "stone")} size={28} /> : null}</span>
                  <input
                    value={c.text}
                    // A row added by the dashed button takes focus as it appears, inside the same tap, so the keyboard stays up.
                    autoFocus={i === choices.length - 1 && addedAt === choices.length}
                    readOnly={c.userId !== null}
                    maxLength={MAX_ANSWER_LENGTH}
                    aria-label={`Answer ${i + 1}`}
                    onChange={(e) => setChoices((cs) => cs.map((x, k) => (k === i ? { text: e.target.value, userId: null } : x)))}
                    className="h-full min-w-0 flex-1 rounded-button bg-transparent text-body-strong text-ink focus-visible:outline-none"
                  />
                  <button type="button" aria-label={`Remove answer ${i + 1}`} disabled={choices.length <= MIN_ANSWERS} onClick={() => setChoices((cs) => cs.filter((_, k) => k !== i))} data-press="line" className="flex h-11 w-11 shrink-0 items-center justify-center text-ink-2 press-line disabled:text-ink-3">
                    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </li>
              ))}
              {choices.length < MAX_ANSWERS ? (
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      setAddedAt(choices.length + 1);
                      setChoices((cs) => [...cs, { text: "", userId: null }]);
                    }}
                    data-press="line"
                    className="flex h-11 w-full items-center gap-3 rounded-button border border-dashed border-line-strong px-3 text-body-sm font-semibold text-ink-2 press-line"
                  >
                    <span aria-hidden="true" className="flex h-7 w-7 items-center justify-center">+</span>
                    Add an answer
                  </button>
                </li>
              ) : null}
            </ul>
            {choices.length < MAX_ANSWERS ? (
              <div className="flex flex-col gap-2">
                <p className="text-caption text-ink-3">Add a person</p>
                <ul className="flex flex-wrap gap-1" aria-label="People you know here">
                  {[...people, { id: me.id, name: me.name, hue: me.hue }].map((p) => {
                    const added = choices.some((c) => c.userId === p.id);
                    const label = p.id === me.id ? "You" : firstName(p.name);
                    return (
                      <li key={p.id}>
                        <button
                          type="button"
                          aria-label={added ? `${label}, already an answer` : `Add ${label} as an answer`}
                          aria-pressed={added}
                          disabled={added}
                          onClick={() => setChoices((cs) => {
                            const empty = cs.findIndex((c) => c.text.trim().length === 0 && c.userId === null);
                            const next = { text: label, userId: p.id };
                            return empty >= 0 ? cs.map((c, k) => (k === empty ? next : c)) : cs.length < MAX_ANSWERS ? [...cs, next] : cs;
                          })}
                          data-press="line"
                          className="flex h-11 w-11 items-center justify-center rounded-pill press-line"
                          style={added ? { opacity: 0.35 } : undefined}
                        >
                          <Avatar name={p.id === me.id ? me.name : p.name} hue={p.hue} size={32} />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}
            <p className="text-caption text-ink-3">If none of them might happen, add that too.</p>
          </div>
        ) : null}
        {/* Careful mode is offered with Yes or no alone (the QA round): its three questions are written for a yes-or-no question, and only that write-up reads the answers. */}
        {pace !== "dare" ? (
          <p className="text-caption text-ink-3">Dareful checks whether facts can settle it before anyone picks a side, and it won’t rule on an argument about someone in the group.</p>
        ) : numeric || pickOne ? null : (
          <div className="flex flex-col gap-2">
            {/* The pace of the write-up, under its own label like "How people answer" (the field round, 2.6): offered with Yes or no alone, so it sits under that choice. */}
            <h2 className="text-label text-ink-3">How the rules get written</h2>
            <div role="group" aria-label="How the rules get written" className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={mode === "quick"} onClick={() => setMode("quick")} {...chipPress(mode === "quick")}>
                <Chip size={36} selected={mode === "quick"} choice>
                  Just write it up
                </Chip>
              </button>
              <button type="button" aria-pressed={mode === "careful"} onClick={() => setMode("careful")} {...chipPress(mode === "careful")}>
                <Chip size={36} selected={mode === "careful"} choice>
                  Ask me three things first
                </Chip>
              </button>
            </div>
            <p className="text-caption text-ink-3">{mode === "careful" ? "Three quick questions first, about fifteen seconds. For when a lot is riding on it, or it runs for weeks." : "One line in, terms out. Right for anything you’ll know tonight."}</p>
          </div>
        )}
        {/* The step's one move, in the sheet (3.24), with the form-level problem above it when there is one. */}
        <PinnedSheet
          label="Next"
          low={
            <>
              <ProblemSummary messages={[fieldProblem, problem]} />
              <Button type="submit" form="ask-question" variant="primary" loading={thinking} disabled={pickOne && filledChoices.length < MIN_ANSWERS}>
                {pace === "argument" ? "Check it." : mode === "careful" ? "Ask me" : "Next: who’s in"}
              </Button>
            </>
          }
        />
      </form>,
    );
  }

  if (step === "declined" && verdict?.kind === "declined") {
    const instead = verdict.dareInstead;
    return wrap(
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="text-serif-l text-ink">That one isn’t the app’s to call.</h1>
          <p className="text-body text-ink-2">{verdict.reason}</p>
          <p className="text-body-sm text-ink-2">The app settles claims about the world: what happened, which is longer, who holds the record. It doesn’t rule on people.</p>
        </div>
        {instead ? (
          <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong px-4 py-3">
            <p className="text-caption text-ink-3">It could be a dare instead</p>
            <p className="text-body-strong text-ink">{instead}</p>
          </div>
        ) : null}
        <Button variant="tertiary" className="self-start" onClick={() => setStep("question", true)}>
          Say it another way
        </Button>
        <PinnedSheet
          label="Instead"
          low={
            <Button
              variant="primary"
              onClick={() => {
                setPace("dare");
                setLine(instead ?? "");
                setVerdict(null);
                setStep("question");
              }}
            >
              Make it a dare instead
            </Button>
          }
        />
      </div>,
    );
  }

  if (step === "criterion" && verdict?.kind === "ok") {
    return wrap(
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="text-caption text-ink-3">Your claim</p>
          <h1 className="text-serif-l text-ink">{verdict.claim}</h1>
          <p className="text-body-sm text-ink-2">That’s a few different questions wearing one sentence, and each has a different answer. Pick what it means here. Whoever takes the other side sees this before they’re in.</p>
        </div>
        <div role="group" aria-label="How it's decided" className="flex flex-col gap-2">
          {verdict.criteria.map((c) => (
            <Button
              key={c}
              variant="secondary"
              className="h-auto min-h-12 whitespace-normal py-3 text-left"
              onClick={() => {
                setCriterion(c);
                writeUp(c, verdict.claim);
                setStep("who");
              }}
            >
              {c}
            </Button>
          ))}
        </div>
        <Button variant="tertiary" onClick={() => setStep("question", true)}>
          Say it another way
        </Button>
      </div>,
    );
  }

  if (step === "subject" && subjectAsk) {
    const name = subjectAsk;
    const answer = (kind: "person" | "pet" | "thing") =>
      startThinking(async () => {
        const q = await carefulQuestionsAction(line, { name, kind });
        if ("error" in q || "ask" in q) {
          setProblem("error" in q ? q.error : "The questions didn’t come through. You can write the terms yourself on the next screen.");
          writeUp();
          return setStep("who");
        }
        setSubjectKind(kind);
        // Changing the answer rewrites the questions; answers to questions that survive the rewrite are kept (3.44).
        setAnswers((prev) => Object.fromEntries(q.questions.flatMap((text, i) => ((was) => (was >= 0 && was in prev ? [[i, prev[was] as boolean]] : []))(questions.indexOf(text)))));
        setQuestions(q.questions);
        setStep("careful");
      });
    // The named subject (3.44, frame 2): one question in the step's own card, "Nova is" over three rows; the tap answers, and nothing explains the step.
    return wrap(
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-3" data-subject-ask="">
          <p id="subject-ask" className="text-body-strong text-ink">
            {name} is
          </p>
          <div role="group" aria-labelledby="subject-ask" className="flex flex-col">
            {([
              ["person", "a person"],
              ["pet", "a pet"],
              ["thing", "something else"],
            ] as const).map(([kind, label]) => (
              <button key={kind} type="button" disabled={thinking} onClick={() => answer(kind)} data-press="row" className="flex h-12 items-center border-t border-line text-left text-body text-ink press-row first:border-t-0 disabled:text-ink-3">
                {label}
              </button>
            ))}
          </div>
        </div>
        <ProblemSummary messages={[problem]} />
      </div>,
    );
  }

  if (step === "careful") {
    const done = questions.every((_, i) => i in answers);
    return wrap(
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-body-strong text-ink">Three quick ones</h1>
          <p className="text-body-sm text-ink-2">Only you see these. Everyone else just sees the terms they turn into.</p>
        </div>
        {subjectAsk && subjectKind ? (
          // The named subject, answered (3.44): one line with the answer after it, and Change to reopen the three rows.
          <div className="flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-4 py-2" data-subject-answered="">
            <p className="text-body-sm text-ink">
              {subjectAsk} is <span className="text-ink-2">{subjectKind === "person" ? "a person" : subjectKind === "pet" ? "a pet" : "something else"}</span>
            </p>
            <Button variant="tertiary" onClick={() => setStep("subject", true)}>
              Change
            </Button>
          </div>
        ) : null}
        <ol className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <li key={i} className="flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-3 motion-fade-in" style={{ animationDelay: `${i * MOTION.stagger}ms`, animationDuration: `${MOTION.quick}ms` }}>
              <p id={`careful-${i}`} className="text-body-sm text-ink">
                {q}
              </p>
              <div role="group" aria-labelledby={`careful-${i}`} className="flex gap-2">
                {([true, false] as const).map((v) => (
                  <button key={String(v)} type="button" aria-pressed={answers[i] === v} onClick={() => setAnswers((a) => ({ ...a, [i]: v }))} {...chipPress(answers[i] === v)}>
                    <Chip size={36} selected={answers[i] === v} choice>
                      {v ? "Yes" : "No"}
                    </Chip>
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ol>
        <PinnedSheet
          label="Next"
          low={
            <Button
              variant="primary"
              disabled={!done}
              onClick={() => {
                writeUp();
                setStep("who");
              }}
            >
              Next: who’s in
            </Button>
          }
        />
      </div>,
    );
  }

  const question = template ? (
    // The band shows the template's question, with "From What's on" where Edit would be (3.33).
    <div className="flex items-start justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3" data-from-whats-on="" style={{ viewTransitionName: "ask-band" } as CSSProperties}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-caption text-ink-3">From What’s on · {template.gameName}</span>
        <span className="text-serif-l text-ink">{template.title}</span>
      </div>
    </div>
  ) : (
    <div className="flex items-start justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3" style={{ viewTransitionName: "ask-band" } as CSSProperties}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-caption text-ink-3">Your question</span>
        {step === "terms" && scope ? (
          <textarea id="ask-title" rows={2} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} aria-label="The question" className="field-sizing-content -mx-1 resize-none rounded-button bg-transparent px-1 text-serif-l text-ink" />
        ) : (
          <span className="text-serif-l text-ink">{step === "terms" && written?.title ? written.title : verdict?.kind === "ok" && pace === "argument" ? verdict.claim : line}</span>
        )}
        {criterion && pace === "argument" ? <span className="text-caption text-ink-3">Decided {criterion}</span> : null}
      </div>
      <Button variant="tertiary" onClick={() => setStep("question", true)}>
        Edit
      </Button>
    </div>
  );

  if (step === "who") {
    return wrap(
      <div className="flex flex-col gap-6">
        {question}
        <WhoStep sets={sets} people={people} who={who} onWho={setWho} argument={pace === "argument"} hue={me.hue} />
        <PinnedSheet
          label="Next"
          low={
            <>
              <ProblemSummary messages={[problem]} />
              <Button variant="primary" onClick={toTerms}>
                Set the terms
              </Button>
            </>
          }
        />
      </div>,
    );
  }

  if (template) {
    const units = selectedSet?.units ?? [];
    const unitChip = (u: Unit, label: string, key: string) => {
      const selected = u.kind === unit.kind && (u.kind === "usd" || (u.kind === "existing" && unit.kind === "existing" && u.id === unit.id) || (u.kind === "new" && unit.kind === "new" && u.template === unit.template));
      return (
        <button key={key} type="button" onClick={() => setUnit(u)} {...chipPress(selected)}>
          <Chip size={36} selected={selected} choice>
            {label}
          </Chip>
        </button>
      );
    };
    return wrap(
      <div className="flex flex-col gap-6">
        {question}
        {/* The written rows (3.33): in --ink-2 and not tappable. Everyone who reads them reads the same terms. */}
        <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-card border border-line bg-surface px-4 py-[14px]" data-template-terms="">
          <dt className="text-label text-ink-3">Counts if</dt>
          <dd className="text-body text-ink-2">{template.terms}</dd>
          <dt className="text-label text-ink-3">Decided</dt>
          <dd className="text-body text-ink-2">{template.decidedByScore ? "By the final score, once the game is over" : "By the people in it, once the game is over"}</dd>
          {template.scored ? (
            <>
              <dt className="text-label text-ink-3">Scored on</dt>
              <dd className="text-body text-ink-2">{template.scored}</dd>
            </>
          ) : null}
          <dt className="text-label text-ink-3">Closes</dt>
          <dd className="text-body text-ink-2">When the game starts, {template.closes}</dd>
          <dt className="text-label text-ink-3">If it’s unclear</dt>
          <dd className="text-body text-ink-2">{template.decidedByScore ? "If nobody votes, the final score decides." : "Everyone says their piece and the tiebreaker everyone agreed to calls it."}</dd>
        </dl>
        <p className="text-caption text-ink-3">What’s on wrote the wording, so everyone reads the same terms.</p>
        <div className="flex flex-col gap-3">
          <h2 className="text-label text-ink-3">What’s riding on it</h2>
          <div className="flex flex-wrap gap-2">
            {unitChip({ kind: "usd" }, "Dollars", "usd")}
            {units.map((u) => unitChip({ kind: "existing", id: u.id }, u.template === "next_time" ? "a next time" : u.template ? `${u.label}s` : `“${u.label}”`, u.id))}
            {PRESETS.filter((p) => !units.some((u) => u.template === p.template)).map((p) => unitChip({ kind: "new", template: p.template, label: p.template }, p.label, p.template))}
          </div>
          <p className="text-caption text-ink-3">One kind of thing for everyone, fixed now. Dollars and beers can’t be weighed against each other.</p>
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-label text-ink-3">Where everyone landed</h2>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={!blind} onClick={() => setBlind(false)} {...chipPress(!blind)}>
              <Chip size={36} selected={!blind} choice>
                Shows once you’ve picked
              </Chip>
            </button>
            <button type="button" aria-pressed={blind} onClick={() => setBlind(true)} {...chipPress(blind)}>
              <Chip size={36} selected={blind} choice>
                Hidden until it’s locked
              </Chip>
            </button>
          </div>
        </div>
        <PinnedSheet
          label="Finish"
          low={
            <>
              <ProblemSummary messages={[problem]} />
              <Button variant="primary" onClick={saveFromTemplate} loading={saving || sent}>
                Send it
              </Button>
            </>
          }
        />
      </div>,
    );
  }
  if (scope?.ambiguous && scope.criteria.length > 0) {
    return wrap(
      <div className="flex flex-col gap-6">
        {question}
        <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong p-4">
          <p className="text-body-strong text-ink">That could be decided a few ways. Pick one, so nobody argues about it later.</p>
          {scope.criteria.map((c) => (
            <Button
              key={c}
              variant="secondary"
              disabled={waiting}
              onClick={() => {
                writeUp(c);
                startWait(async () => {
                  await scoping.current;
                });
              }}
            >
              {c}
            </Button>
          ))}
        </div>
      </div>,
    );
  }

  const units = selectedSet?.units ?? [];
  const unitChip = (u: Unit, label: string, key: string) => {
    const selected = u.kind === unit.kind && (u.kind === "usd" || (u.kind === "existing" && unit.kind === "existing" && u.id === unit.id) || (u.kind === "new" && unit.kind === "new" && u.template === unit.template));
    return (
      <button key={key} type="button" onClick={() => setUnit(u)} {...chipPress(selected)}>
        <Chip size={36} selected={selected} choice>
          {label}
        </Chip>
      </button>
    );
  };
  // The stall rules read the same stages as a working button (9.8, 5.2): "Still writing." at three seconds without new words, the block at ten.
  const stage = writing && written && written.lastAt !== null && tick > 0 ? waitStage(true, tick - written.lastAt) : "none";
  const row = (label: string, body: ReactNode) => (
    <div key={label} className="flex flex-col gap-2 border-t border-line py-3 first:border-t-0" data-terms-row={label}>
      <dt className="text-label text-ink-3">{label}</dt>
      <dd className="flex flex-col gap-2">{body}</dd>
    </div>
  );

  return wrap(
    <div className="flex flex-col gap-6">
      {question}
      <p aria-live="polite" className="sr-only">
        {scope ? "The terms are written" : "Writing the terms"}
      </p>
      {/* The details card, all four labels drawn in the first frame; the written values arrive at the pace they arrive, and become editable once written and not before (9.8). */}
      <dl className="flex flex-col rounded-card border border-line bg-surface px-4" data-terms-card={scope ? "written" : "writing"}>
        {row(
          "Counts if",
          scope ? (
            <>
              <textarea id="ask-terms" rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={800} aria-label="Counts if" className="field-sizing-content -mx-1 resize-none rounded-button bg-transparent px-1 text-body text-ink" />
              <p className="text-caption text-ink-3">{scope.plain ? "The write-up didn’t come through, so this is your line as you typed it. Change it however you like." : "Written up from your line. Change anything; everyone sees exactly this before they’re in."}</p>
            </>
          ) : (
            <p className="min-h-6 text-body text-ink" data-terms-writing="">
              {written?.terms ?? ""}
              <Caret />
            </p>
          ),
        )}
        {numeric
          ? row(
              "What the number counts",
              <>
                <div className="grid grid-cols-2 gap-2">
                  <input id="ask-unit-one" value={unitWords.singular} onChange={(e) => setUnitWords((u) => ({ ...u, singular: e.target.value }))} maxLength={24} aria-label="One of them" disabled={!scope} className="h-12 min-w-0 rounded-button border border-line bg-ground px-4 text-body text-ink disabled:text-ink-3" />
                  <input id="ask-unit-many" value={unitWords.plural} onChange={(e) => setUnitWords((u) => ({ ...u, plural: e.target.value }))} maxLength={24} aria-label="More than one" disabled={!scope} className="h-12 min-w-0 rounded-button border border-line bg-ground px-4 text-body text-ink disabled:text-ink-3" />
                </div>
                <p className="text-caption text-ink-3">One shirt, two shirts. Whole numbers only: a question that needs halves asks in a smaller unit.</p>
              </>,
            )
          : null}
        {numeric
          ? row(
              "Scored on",
              <>
                <div className="flex items-center gap-3">
                  <input id="ask-scale" inputMode="numeric" pattern="[0-9]*" value={scale} onChange={(e) => setScale(e.target.value)} maxLength={11} aria-describedby="ask-scale-help" disabled={!scope} className="h-12 w-32 rounded-button border border-line bg-ground px-4 text-body text-ink disabled:text-ink-3" />
                  <span className="text-body text-ink-2">{unitWords.plural.trim() || unitWords.singular.trim() || "of them"} off scores nothing</span>
                </div>
                <p id="ask-scale-help" className="text-caption text-ink-3">{scope?.number?.model?.range ? "How far off scores nothing. Leave it blank and it’s set for you; type one and everyone sees it in the details." : "How far off scores nothing. Everyone sees it in the details."}</p>
              </>,
            )
          : null}
        {pace === "argument"
          ? row(
              "Your side",
              <>
                <div role="group" aria-label="Your side" className="flex flex-wrap gap-2">
                  {(["yes", "no"] as const).map((v) => (
                    <button key={v} type="button" aria-pressed={side === v} onClick={() => setSide(v)} {...chipPress(side === v)}>
                      <Chip size={36} selected={side === v} choice>
                        {v === "yes" ? "I say yes" : "I say no"}
                      </Chip>
                    </button>
                  ))}
                </div>
                <p className="text-caption text-ink-3">All the way, by default, so whoever’s wrong is out the whole thing. You can soften your number on the next screen.</p>
              </>,
            )
          : row(
              "Decided",
              <div className="flex flex-wrap gap-2">
                {CLOSINGS.map((w) => (
                  <button key={w.key} type="button" onClick={() => setClosing(w.key)} {...chipPress(closing === w.key)}>
                    <Chip size={36} selected={closing === w.key} choice>
                      {w.label}
                    </Chip>
                  </button>
                ))}
              </div>,
            )}
        {row(
          "Stakes",
          <>
            <div className="flex flex-wrap gap-2">
              {unitChip({ kind: "usd" }, "Dollars", "usd")}
              {units.map((u) => unitChip({ kind: "existing", id: u.id }, u.template === "next_time" ? "a next time" : u.template ? `${u.label}s` : `“${u.label}”`, u.id))}
              {PRESETS.filter((p) => !units.some((u) => u.template === p.template)).map((p) => unitChip({ kind: "new", template: p.template, label: p.template }, p.label, p.template))}
            </div>
            <p className="text-caption text-ink-3">One kind of thing for everyone, fixed now. Dollars and beers can’t be weighed against each other.</p>
          </>,
        )}
        {pace === "dare"
          ? row(
              "Where everyone landed",
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={!blind} onClick={() => setBlind(false)} {...chipPress(!blind)}>
                  <Chip size={36} selected={!blind} choice>
                    Shows once you’ve picked
                  </Chip>
                </button>
                <button type="button" aria-pressed={blind} onClick={() => setBlind(true)} {...chipPress(blind)}>
                  <Chip size={36} selected={blind} choice>
                    Hidden until it’s locked
                  </Chip>
                </button>
              </div>,
            )
          : null}
        {row(
          "If it’s unclear",
          <>
            <div role="group" aria-label="If you can't agree" className="flex flex-wrap gap-2">
              <button type="button" aria-pressed={stalemate === "arbitrate"} onClick={() => setStalemate("arbitrate")} {...chipPress(stalemate === "arbitrate")}>
                <Chip size={36} selected={stalemate === "arbitrate"} choice>
                  A tiebreaker hears both sides and calls it
                </Chip>
              </button>
              <button type="button" aria-pressed={stalemate === "void"} onClick={() => setStalemate("void")} {...chipPress(stalemate === "void")}>
                <Chip size={36} selected={stalemate === "void"} choice>
                  It just goes unsettled
                </Chip>
              </button>
            </div>
            <p className="text-caption text-ink-3">Everyone sees this before they’re in, and being in means they’re fine with it.</p>
          </>,
        )}
      </dl>
      {stage === "still" ? (
        <p className="text-caption text-ink-3" data-still-writing="">
          Still writing.
        </p>
      ) : null}
      <PinnedSheet
        label="Finish"
        low={
          <>
            {stage === "block" || written?.failed ? <ProblemSummary messages={[TERMS_STOPPED]} retry={() => writeUp(lastWriteUp.current?.chosen, lastWriteUp.current?.source)} /> : null}
            <ProblemSummary messages={[problem]} />
            <Button variant="primary" onClick={save} loading={saving || sent} disabled={!scope}>
              Send it
            </Button>
          </>
        }
      />
    </div>,
  );
}

/** The words being written have a caret at their end (9.8): 2 by 20px in `--ink-2`, blinking on the loop, steady with Reduce Motion. */
function Caret() {
  return <span aria-hidden="true" data-caret="" className="ml-0.5 inline-block h-5 w-[2px] rounded-[1px] bg-ink-2 align-text-bottom motion-loop-caret" />;
}

/** The block when the words stop (9.8): in the sheet above "Send it", with "Try again", which writes them again. */
export const TERMS_STOPPED = "The terms stopped partway.";
