"use client";

import { useEffect, useEffectEvent, useMemo, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
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
import { answerLands, paceRowShows } from "@/lib/ui/stage";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import type { CarefulQuestion } from "@/lib/ai/settler";
import { carefulQuestionsAction, draftFromTemplateAction, draftMarketAction, gameNamedAction, openWithoutEntryAction, scopeMarketAction, triageAction, type ScopeResult, type ToSign, type TriageResult } from "@/lib/actions/markets";
import { useSigner } from "@/components/ledger/use-signer";
import { createMessage, daresTypes } from "@/lib/chain/typed-data";
import type { TypedDataDomain } from "viem";
import { emojiInk } from "@/lib/ui/emoji-ink";
import type { Hue } from "@/lib/ui/hue";
import { inkFor, inkRoomStyleText, type InkName } from "@/lib/ui/ink";
import { cn } from "@/lib/utils";
import { MarkPicker, type Sticker } from "./mark-picker";
import type { Person, SetOption } from "./who";
import { refOfPicked, type PickedMark } from "@/lib/ui/mark";
import { firstName } from "@/lib/ui/copy";
import { MAX_ANSWER_LENGTH, MAX_ANSWERS, MIN_ANSWERS } from "@/lib/ledger/pick-one";
import { DECIDE_BY_SPANS, latestDate, datePhrase, deadlineMismatch, decideByDate, decideByMoment, fromProposal, localDate, longDateWords, shortDateWords, swapDateWords, type DecideBy } from "@/lib/ledger/decide-by";
import { kindForQuestion } from "@/lib/ui/question-shape";
import { attempt } from "@/lib/ui/attempt";
import { useFitsContent } from "@/lib/ui/fit-content";
import { blankOf, type Idea } from "@/lib/ideas";
import { useTapGuard } from "@/components/ui/tap-guard";
import { TallyLoader } from "@/components/ui/tally-loader";

type Unit = { kind: "usd" } | { kind: "existing"; id: string } | { kind: "new"; template: "beer" | "round" | "coffee" | "next_time" | null; label: string };
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

export function AskForm({ signing, people, initialLine = "", initialPace = "dare", me, screenTitle, gotCode = true, layer = false, stickers = [], canPaste = false, template = null, initialMark = null, idea = null, ownUnits = [] }: { /** Stake units the asker added on You (the touch-ups round), offered as quoted words beside the others. */ ownUnits?: string[]; /** What the asker signs with as the question is sent (the games-and-the-reveal round). */ signing: { domain: TypedDataDomain; ledgerWallet: string }; people: Person[]; initialLine?: string; initialPace?: "dare" | "argument"; me: { id: string; name: string; hue: Hue }; /** The screen's name in its header; the form owns the screen so a picked mark can retint all of it (3.29). */ screenTitle: string; /** "Got a code?" beside the information icon on the question step (3.29, 10.3). */ gotCode?: boolean; /** Rendered in the ask layer (9.5), where the sheet sits in flow and Close sinks the layer. */ layer?: boolean; /** This person's stickers for the picker (3.28), and whether a cutout can be pasted at all. */ stickers?: Sticker[]; canPaste?: boolean; /** A public question (3.33): the flow starts at who's in, with the wording locked. */ template?: TemplateForAsking | null; /** A sticker just made from a photo (3.28): the question step opens with it as the mark. */ initialMark?: PickedMark | null; /** An idea (3.47): its question, its kind and a number's unit; a blank leaves a name for the asker. */ idea?: Idea | null }) {
  const router = useRouter();
  const sign = useSigner();
  // Asking skips "Who's in" (the games-and-the-reveal round, 2026-10-07, the owner's call): every question goes to whoever the asker sends it to.
  type Step = "question" | "declined" | "criterion" | "subject" | "careful" | "terms";
  const [step, setStepRaw] = useState<Step>(template ? "terms" : "question");
  /** Where the person is and what they typed, as of now, for an answer that arrives late (`answerLands`). */
  const here = useRef<{ step: Step; line: string }>({ step: template ? "terms" : "question", line: initialLine.slice(0, 280) });
  /** Advancing moves the step's content 24px left under a band that holds still; back mirrors it (9.8). */
  const setStep = (next: Step, back = false) => withViewTransition(() => setStepRaw(next), { back });
  const previous: Record<Step, Step | null> = { question: null, declined: "question", criterion: "question", subject: "question", careful: "question", terms: template ? null : "question" };
  const stepBack = () => {
    const to = previous[step];
    if (to) setStep(to, true);
  };
  const infoKey = step === "question" ? "ask-question" : step === "terms" ? "ask-terms" : "ask-careful";
  /** A named subject the model could not place (a person, a pet, a thing): asked in one tap before the three questions. */
  const [subjectAsk, setSubjectAsk] = useState<string | null>(null);
  /** What the name turned out to be (3.44), shown collapsed on the careful step with Change. */
  const [subjectKind, setSubjectKind] = useState<"person" | "pet" | "thing" | null>(null);
  // Two paces, one object (PLANNING.md 8a): something that will happen, or a claim to settle now.
  const [pace, setPace] = useState<"dare" | "argument">(initialPace);
  // Yes or no, a number, or pick one (docs/design.md 3.26, 3.29). Chosen before the write-up, since the terms say how the answer is counted.
  const [kind, setKind] = useState<"binary" | "numeric" | "categorical">(idea?.kind ?? "binary");
  /** An idea's blank (3.47): the words around it, until a person is tapped or a name is typed; then the sentence is the ordinary question. */
  const [blank, setBlank] = useState(idea ? blankOf(idea.text) : null);
  const [slotName, setSlotName] = useState("");
  // The answers (3.29): two to six, in the asker's order; a person answer is anyone the asker knows here, or the asker.
  const [choices, setChoices] = useState<Choice[]>([{ text: "", userId: null }, { text: "", userId: null }]);
  // The mark (3.29), and the id the market will have, made here so the ink previewed is the ink stored.
  const [mark, setMark] = useState<PickedMark | null>(initialMark);
  const markName = mark ? (mark.kind === "emoji" ? (mark.name ? mark.name.charAt(0).toUpperCase() + mark.name.slice(1) : "Your mark") : "Your sticker") : null;
  const [pickingMark, setPickingMark] = useState(false);
  const [draftId] = useState(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : null));
  const [unitWords, setUnitWords] = useState(idea?.unit ?? { singular: "", plural: "" });
  const [scale, setScale] = useState("");
  const [modeChosen, setMode] = useState<"quick" | "careful">("quick");
  const [verdict, setVerdict] = useState<TriageResult | null>(null);
  const [criterion, setCriterion] = useState<string | null>(null);
  const [side, setSide] = useState<"yes" | "no">("yes");
  /** A pick-one argument's side: the asker's own answer, by its place in the list. */
  const [myAnswer, setMyAnswer] = useState(0);
  /** Help define the terms' questions (the touch-ups round): each answered yes or no, or by one of its own two answers. */
  const [questions, setQuestions] = useState<CarefulQuestion[]>([]);
  /** The answer picked for each question: 0 for yes or its first answer, 1 for no or its second. */
  const [answers, setAnswers] = useState<Record<number, 0 | 1>>({});
  /** How many answers there were the moment one was added, so the new row alone takes focus. */
  const [addedAt, setAddedAt] = useState(0);
  const [stalemate, setStalemate] = useState<"arbitrate" | "void">("arbitrate");
  const [thinking, startThinking] = useTransition();
  const [line, setLine] = useState(initialLine.slice(0, 280));
  useEffect(() => {
    here.current = { step, line };
  });
  // Whoever the asker sends it to (the games-and-the-reveal round): a set of one that grows as people join.
  const who = { kind: "link" } as const;
  const [scope, setScope] = useState<ScopeResult | null>(null);
  const scoping = useRef<Promise<void> | null>(null);
  const [title, setTitle] = useState("");
  const [terms, setTerms] = useState("");
  // The three fields grow with what they hold where the browser will not (Safari 26.0 has no `field-sizing`).
  const lineField = useFitsContent(line);
  const titleField = useFitsContent(title);
  const termsField = useFitsContent(terms);
  // When it's decided (3.20 as amended 2026-10-04): Tonight, This week, This month or a date, starting from the date the write-up proposes.
  const [decide, setDecide] = useState<DecideBy>({ key: "week" });
  // A chip takes a tap only where the finger went down (`useTapGuard`): the page grows as the terms arrive.
  const chipTaps = useTapGuard();
  /** The write-up's own date, for the date chip, and the date the terms name now, so a change of chip changes the terms with it. */
  const [proposedDate, setProposedDate] = useState<string | null>(null);
  /**
   * A question that cannot be known before the furthest a question can run (the second-pass round, 2026-10-06): no
   * date is picked for it, one plain line says so at Decided with the nearer version under it, and nothing is sent
   * until the asker takes that version or picks a date themselves. The date is never moved without them.
   */
  const [tooFar, setTooFar] = useState<ScopeResult["tooFar"]>(null);
  const termsDate = useRef<string | null>(null);
  /** A game the question names (section 6), asked about once as the terms step opens, and the asker's "Keep it as it is". */
  const [namedGame, setNamedGame] = useState<{ gameId: string; name: string; when: string; templateId: string } | null>(null);
  const [gameDismissed, setGameDismissed] = useState(false);
  const gameAsked = useRef(false);
  /** The type the question's shape last chose (`kindForQuestion`): it follows the shape when the shape changes, and the asker's own pick otherwise. */
  const shapeKind = useRef<"binary" | "numeric" | "categorical" | null>(idea?.kind ?? null);
  const [unit, setUnit] = useState<Unit>({ kind: "usd" });
  const [blind, setBlind] = useState(false);
  const [fieldProblem, setFieldProblem] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [waiting, startWait] = useTransition();
  /** The terms being written (9.8): the words so far, when the last arrived, and whether it finished or failed. */
  const [written, setWritten] = useState<{ title: string; terms: string; done: boolean; failed: boolean; /** When the last words arrived, or the start once the clock has read it; null until then. */ lastAt: number | null } | null>(null);
  const lastWriteUp = useRef<{ chosen?: string; source?: string } | null>(null);
  /** Which write-up is the current one, the request it can stop, and what it was asked, so Next can take one started while the question was still on screen. */
  const writeUpSeq = useRef(0);
  const writeUpAbort = useRef<AbortController | null>(null);
  const writeUpFor = useRef<string | null>(null);
  useEffect(() => () => writeUpAbort.current?.abort(), []);
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
  // Once the terms step opens on a question asked here (not What's on's, not an argument), ask once whether it names a game being played or starting before it is decided (section 6).
  useEffect(() => {
    if (step !== "terms" || template || pace === "argument" || gameAsked.current) return;
    gameAsked.current = true;
    const until = decideByMoment(decide, new Date(), askerZone()).toISOString();
    void gameNamedAction(line, until, kind)
      .then((g) => setNamedGame(g))
      .catch(() => undefined);
  }, [step, template, pace, decide, line, kind]);
  const [saving, startSave] = useTransition();
  /** The draft is saved and its screen is on its way: "Send it" holds until the address has moved on, so one question is sent once. */
  const [sent, setSent] = useState(false);
  // A new question's set is its own (whoever it is sent to), so no saved set's units or open inks apply to it.
  const noUnits: SetOption["units"] = [];
  const numeric = pace === "dare" && kind === "numeric";
  // An argument can be pick one, with each person's answer as an answer (the first-contact round); a number stays a dare's.
  const pickOne = kind === "categorical";
  // The setup applies to every type (the first-contact round): Help define the terms writes its three questions for the type chosen.
  const mode: "quick" | "careful" = modeChosen;
  const filledChoices = choices.filter((c) => c.text.trim().length > 0);
  // The ink this market would get (1.8, 3.29): the mark's from the table, or a hash of the id for a hueless mark, balanced on the
  // who's-in step against the questions still open between the same people. The server computes it again the same way and stores that.
  const previewInk = useMemo<InkName | null>(() => {
    if (!mark || !draftId) return null;
    return inkFor({ markInk: mark.kind === "emoji" ? emojiInk(mark.value) : mark.ink, id: draftId, takenInGroup: [] }).ink;
  }, [mark, draftId]);

  /**
   * The write-up starts when the question step's Next is tapped and streams into the terms step as it is written
   * (9.8); if the question is edited it starts again. Where the stream cannot be read, the caret waits and the
   * terms arrive whole from the action, the same result either way.
   */
  /** What a write-up is asked: the line, the reading picked, Help define's answers, the type and a pick-one's answers. */
  function bodyFor(chosen?: string, source?: string) {
    const asked = questions.map((q, i) => ({ question: q.question, yes: answers[i] === 0, ...(q.answers && answers[i] !== undefined ? { answer: q.answers[answers[i] as 0 | 1] } : {}) })).filter((_, i) => i in answers);
    return { line: source ?? line, criterion: chosen, answers: mode === "careful" && pace === "dare" ? asked : undefined, kind: (pickOne ? "categorical" : numeric ? "numeric" : "binary") as "binary" | "numeric" | "categorical", choices: pickOne ? filledChoices.map((c) => c.text.trim()) : undefined };
  }

  function writeUp(chosen?: string, source?: string) {
    // Only the newest write-up lands (the touch-ups round): one asked for an older wording is stopped, and anything it still answers is dropped.
    const seq = ++writeUpSeq.current;
    writeUpAbort.current?.abort();
    const abort = new AbortController();
    writeUpAbort.current = abort;
    const current = () => seq === writeUpSeq.current;
    lastWriteUp.current = { chosen, source };
    setWritten({ title: "", terms: "", done: false, failed: false, lastAt: null });
    setScope(null);
    setTooFar(null);
    const body = bodyFor(chosen, source);
    writeUpFor.current = JSON.stringify(body);
    scoping.current = (async () => {
      let r: ScopeResult | { error: string };
      try {
        r = await streamWriteUp<ScopeResult | { error: string }>(body, (p) => (current() ? setWritten((w) => (w ? { ...w, title: p.title ?? w.title, terms: p.terms ?? w.terms, lastAt: Date.now() } : w)) : undefined), abort.signal);
      } catch {
        if (!current()) return;
        r = await scopeMarketAction(body.line, body.criterion, body.answers, body.kind, body.choices);
      }
      if (!current()) return;
      if ("error" in r) {
        setProblem(r.error);
        setWritten((w) => (w ? { ...w, failed: true } : w));
        return;
      }
      setScope(r);
      setTitle(r.title);
      setTerms(r.terms);
      // A number idea carries its own unit to the terms (3.47); otherwise the write-up's.
      if (r.number && !idea?.unit) setUnitWords(r.number.unit);
      const at = new Date();
      const start = fromProposal(r.decideBy, at, askerZone());
      setProposedDate(r.decideBy);
      termsDate.current = r.decideBy;
      setDecide(start);
      setTooFar(r.tooFar);
      setWritten((w) => (w ? { ...w, title: r.title, terms: r.terms, done: true, lastAt: Date.now() } : w));
    })();
  }

  // Quick setup's write-up starts while the question is still on screen (the touch-ups round, section 4): once the line
  // has rested a moment, so the terms are already being written when Next is tapped. A pick-one question waits for its
  // answers, Help define the terms for its three questions, and an argument for its check.
  const startEarly = useEffectEvent(() => {
    if (writeUpFor.current !== JSON.stringify(bodyFor())) writeUp();
  });
  useEffect(() => {
    if (step !== "question" || pace !== "dare" || mode !== "quick" || pickOne || template || blank || line.trim().length < EARLY_LINE) return;
    const timer = setTimeout(startEarly, EARLY_WRITE_UP_MS);
    return () => clearTimeout(timer);
  }, [step, pace, mode, pickOne, template, blank, line, kind]);

  function toWho() {
    setFieldProblem(null);
    setProblem(null);
    // An idea's blank, filled by a typed name: from here the sentence is the ordinary question (3.47).
    if (blank) {
      if (!slotName.trim()) return;
      setBlank(null);
    }
    if (line.trim().length < 3) return setFieldProblem(pace === "argument" ? "Say what you two disagree about, in a line." : numeric ? "Ask it in a line, like “How many shirts can Gabe wear at once.”" : pickOne ? "Ask it in a line, like “Who falls asleep first.”" : "Ask it in a line, like “John falls asleep during the movie.”");
    if (pickOne) {
      if (filledChoices.length < MIN_ANSWERS) return setProblem("It takes at least two answers.");
      if (filledChoices.some((c) => c.text.trim().length > MAX_ANSWER_LENGTH)) return setProblem("Each answer is a few words.");
      if (new Set(filledChoices.map((c) => c.text.trim().toLowerCase())).size !== filledChoices.length) return setProblem("Two answers say the same thing.");
    }
    // A write-up already under way for exactly this question, started while it rested on screen, is the one (the
    // touch-ups round); anything written for another wording, or for an argument or Help define's answers, is dropped.
    const reuse = pace === "dare" && mode === "quick" && writeUpFor.current === JSON.stringify(bodyFor()) && !written?.failed && !scope?.plain;
    if (!reuse) {
      writeUpSeq.current += 1;
      writeUpAbort.current?.abort();
      writeUpFor.current = null;
      setScope(null);
    }
    if (pace === "argument") {
      // The triage comes before anything else, and it matters more than the ruling: some things are not the app's to call.
      return startThinking(async () => {
        const asked = { step: "question", line };
        const t = await attempt(() => triageAction(line));
        // A second tap, or a slow first one: only the answer to what is on screen, where it was asked, moves anything.
        if (!answerLands(asked, here.current)) return;
        if ("error" in t) return setFieldProblem(t.error);
        setVerdict(t);
        if (t.kind === "unavailable") return setProblem("The app can’t weigh this one right now, and it won’t guess. Try again in a minute.");
        if (t.kind === "declined") return setStep("declined");
        if (t.tier === "contestable") return setStep("criterion");
        setCriterion(null);
        writeUp(undefined, t.claim);
        toTerms();
      });
    }
    if (mode === "careful") {
      return startThinking(async () => {
        const asked = { step: "question", line };
        const q = await carefulQuestionsAction(line, undefined, numeric ? "numeric" : pickOne ? "categorical" : "binary", pickOne ? filledChoices.map((c) => c.text.trim()) : undefined);
        if (!answerLands(asked, here.current)) return;
        if ("error" in q) {
          setProblem(q.error);
          writeUp();
          return toTerms();
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
    if (!reuse) writeUp();
    toTerms();
  }

  function toTerms() {
    // The terms step opens at once and the write-up streams into it (9.8).
    setUnit({ kind: "usd" });
    setStep("terms");
  }

  /** A decide-by chip: the date the terms name changes with it, so the two never disagree (the first-contact round). */
  function pickDecide(next: DecideBy) {
    const zone = askerZone();
    const to = decideByDate(next, new Date(), zone);
    const from = termsDate.current;
    if (from && from !== to) setTerms((t) => swapDateWords(t, from, to));
    termsDate.current = to;
    setDecide(next);
    // A date the asker picked themselves: theirs, so the too-far line has done its work.
    setTooFar(null);
  }

  /** The nearer version, taken whole: its question, its terms and its date, which fits. */
  function askNearer() {
    const n = tooFar?.nearer;
    if (!n) return;
    setTitle(n.title);
    setTerms(n.terms);
    setProposedDate(n.decideBy);
    termsDate.current = n.decideBy;
    setDecide(fromProposal(n.decideBy, new Date(), askerZone()));
    setTooFar(null);
  }

  /** Sends a public question to one's own friends (3.33): the template's wording, the asker's people, stake and reveal. */
  function saveFromTemplate() {
    if (!template) return;
    setProblem(null);
    startSave(async () => {
      const r = await attempt(() => draftFromTemplateAction({ templateId: template.id, who, unit, blind, id: draftId ?? undefined }));
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
    // Nothing goes out on a date too far off to decide, and nothing picks one for the asker (the second-pass round).
    if (tooFar && pace !== "argument") return setProblem("Pick when it’s decided.");
    const zone = askerZone();
    const now = new Date();
    const decidedOn = decideByDate(decide, now, zone);
    // The terms and the decide-by never disagree (the first-contact round): a deadline in the terms is the decide-by date.
    const off = pace === "argument" ? null : deadlineMismatch(terms, decidedOn, now, zone);
    if (off) return setProblem(`The terms say ${off}, and it’s decided ${datePhrase(decidedOn, now, zone)}. Make them match.`);
    startSave(async () => {
      const arguing = pace === "argument" && verdict?.kind === "ok";
      // The criterion has to be inside the terms: the terms are what is hashed, and what entering accepts.
      const finalTerms = arguing && criterion && !terms.includes(criterion) ? `${terms.trim()} Decided ${criterion}.` : terms;
      const r = await attempt(() => draftMarketAction({
        id: draftId ?? undefined,
        who,
        unit,
        title,
        terms: finalTerms,
        mark: mark ? (mark.kind === "emoji" ? { kind: "emoji", value: mark.value } : { kind: "sticker", id: mark.id }) : undefined,
        outcomeWords: !numeric && !pickOne && !arguing && scope?.outcomes ? scope.outcomes : undefined,
        answers: pickOne ? filledChoices.map((c) => ({ text: c.text.trim(), userId: c.userId })) : undefined,
        number: numeric ? { unit: { singular: unitWords.singular.trim().toLowerCase(), plural: unitWords.plural.trim().toLowerCase() || unitWords.singular.trim().toLowerCase() }, scale: scale.trim(), model: scope?.number?.model ?? null } : undefined,
        resolvesBy: arguing ? null : decideByMoment(decide, now, zone).toISOString(),
        blind: arguing ? false : blind,
        stalemate,
        mode,
        argument: arguing && verdict?.kind === "ok" ? { tier: verdict.tier, criterion, settledBy: verdict.settledBy } : undefined,
      }));
      if ("error" in r) return setProblem(r.error);
      // It opens as it is sent (the games-and-the-reveal round): the asker's Create, signed here, and the question's own screen with share, copy and the code in view. A signature that does not come leaves it a draft, whose screen offers "Share it first".
      if (r.create) await openAsSent(r.id, r.create);
      setSent(true);
      router.replace(arguing ? (pickOne ? `/m/${r.id}?pick=${myAnswer}` : `/m/${r.id}?side=${side}`) : `/m/${r.id}`);
    });
  }

  /** The question asked on the game it names (section 6): the game's own question, opened as it is sent, on the game page. */
  function attachToGame() {
    const g = namedGame;
    if (!g) return;
    setProblem(null);
    startSave(async () => {
      const r = await attempt(() => draftFromTemplateAction({ templateId: g.templateId, who, unit, blind, id: draftId ?? undefined }));
      if ("error" in r) return setProblem(r.error);
      if (r.create) await openAsSent(r.id, r.create);
      setSent(true);
      router.replace(`/on/${g.gameId}?q=${r.id}`);
    });
  }

  /** Signs the asker's Create and opens the question; false leaves it a draft. */
  async function openAsSent(id: string, create: ToSign): Promise<boolean> {
    try {
      const signature = await sign(signing.ledgerWallet, { domain: signing.domain, types: daresTypes, primaryType: "Create", message: createMessage(create.dareOnchainId, create.fields, create.stalemate) }, "approve terms", { action: "create", dareId: id });
      const opened = await attempt(() => openWithoutEntryAction(id, signature));
      return !("error" in opened);
    } catch {
      return false;
    }
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
          <button type="button" aria-haspopup="dialog" aria-expanded={pickingMark} onClick={() => setPickingMark(true)} data-press="row" data-add-mark="" className="flex items-center gap-4 rounded-button text-left press-row">
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
          {blank ? (
            // An idea with a blank (3.47): the sentence with its slot, in the question's serif; a tap on the slot opens the keyboard on the name field below.
            <div className="flex flex-col gap-2" data-idea-blank="">
              <span className="text-label text-ink-2">Your question</span>
              <p className="text-serif-l text-ink">
                {blank.before}
                <button type="button" onClick={() => document.getElementById("ask-slot-name")?.focus()} data-press="line" className="border-b-[1.5px] border-dashed border-line-strong text-ink-3 press-line">
                  {slotName.trim() || "someone"}
                </button>
                {blank.after}
              </p>
            </div>
          ) : (
          <div className="flex flex-col gap-2">
            <label htmlFor="ask-line" className="text-label text-ink-2">
              {pace === "argument" ? "What are you two arguing about?" : "Your question"}
            </label>
            <textarea
              id="ask-line"
              rows={3}
              value={line}
              onChange={(e) => {
                const next = e.target.value;
                setLine(next);
                // The type follows the question's shape when the shape changes, and the asker's own pick otherwise (the first-contact round).
                const shaped = kindForQuestion(next);
                if (shaped && shaped !== shapeKind.current) {
                  shapeKind.current = shaped;
                  setKind(pace === "argument" && shaped === "numeric" ? "binary" : shaped);
                }
              }}
              ref={lineField} maxLength={280} aria-invalid={fieldProblem ? true : undefined} aria-describedby={fieldProblem ? "ask-line-problem" : undefined} className={cn("field-sizing-content resize-none rounded-button border border-line bg-surface px-3 py-2 text-serif-l text-ink", fieldProblem && FIELD_PROBLEM_CLASS)} />
            <Problem id="ask-line-problem" message={fieldProblem} />
          </div>
          )}
        </section>
        {blank ? (
          // Who? (3.47): the people the asker has shared questions with, a tap each, then a field for anyone or anything else.
          <div className="flex flex-col gap-2" data-idea-who="">
            <h2 className="text-label text-ink-3">Who?</h2>
            <ul className="flex flex-wrap gap-1" aria-label="People you know here">
              {people.slice(0, 8).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setLine(`${blank.before}${firstName(p.name)}${blank.after}`);
                      setBlank(null);
                      setSlotName("");
                    }}
                    data-press="line"
                    className="flex w-14 flex-col items-center gap-1 rounded-button py-1 press-line"
                    aria-label={`Ask it about ${firstName(p.name)}`}
                  >
                    <span className="flex h-11 w-11 items-center justify-center">
                      <Avatar name={p.name} hue={p.hue} size={32} />
                    </span>
                    <span className="max-w-full truncate text-caption text-ink-2">{firstName(p.name)}</span>
                  </button>
                </li>
              ))}
            </ul>
            <input
              id="ask-slot-name"
              value={slotName}
              onChange={(e) => {
                setSlotName(e.target.value);
                setLine(`${blank.before}${e.target.value.trim()}${blank.after}`);
              }}
              maxLength={40}
              placeholder="Or type a name"
              aria-label="Or type a name"
              className="h-11 rounded-button border border-line bg-ground px-4 text-body text-ink"
            />
          </div>
        ) : null}
        <MarkPicker
          open={pickingMark}
          onClose={() => setPickingMark(false)}
          value={mark}
          hue={me.hue}
          stickers={stickers}
          canPaste={canPaste}
          onPick={setMark}
        />
        <div role="group" aria-label="What kind of thing" className="flex flex-wrap gap-2" data-pace-choice="">
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
        <div className="flex flex-col gap-2" data-market-type="">
          <h2 className="text-label text-ink-3">Market type</h2>
          <div role="radiogroup" aria-label="Market type" className="flex flex-wrap gap-2">
            <button type="button" role="radio" aria-checked={kind === "binary"} onClick={() => setKind("binary")} {...chipPress(kind === "binary")}>
              <Chip size={36} selected={kind === "binary"} choice>
                Yes or no
              </Chip>
            </button>
            {/* An argument is yes or no or pick one, each person's answer an answer (the first-contact round); a number is a dare's. */}
            {pace === "dare" ? (
              <button type="button" role="radio" aria-checked={kind === "numeric"} onClick={() => setKind("numeric")} {...chipPress(kind === "numeric")}>
                <Chip size={36} selected={kind === "numeric"} choice>
                  Pick a number
                </Chip>
              </button>
            ) : null}
            <button type="button" role="radio" aria-checked={kind === "categorical"} onClick={() => setKind("categorical")} {...chipPress(kind === "categorical")}>
              <Chip size={36} selected={kind === "categorical"} choice>
                Pick one
              </Chip>
            </button>
          </div>
        </div>
        {/* AI market setup (the first-contact round, the owner's labels): its own section with room above it, for every type, each choice keeping its line. */}
        {paceRowShows(pace, kind) ? (
          <div data-pace-row="" className="mt-2 flex flex-col gap-2">
            <h2 className="text-label text-ink-3">AI market setup</h2>
            <div role="group" aria-label="AI market setup" className="flex flex-wrap gap-2" data-ai-setup="">
              <button type="button" aria-pressed={mode === "quick"} onClick={() => setMode("quick")} {...chipPress(mode === "quick")}>
                <Chip size={36} selected={mode === "quick"} choice>
                  Quick setup
                </Chip>
              </button>
              <button type="button" aria-pressed={mode === "careful"} onClick={() => setMode("careful")} {...chipPress(mode === "careful")}>
                <Chip size={36} selected={mode === "careful"} choice>
                  Help define the terms
                </Chip>
              </button>
            </div>
            <p className="text-caption text-ink-3">{mode === "careful" ? "Three quick questions first, about fifteen seconds. For when a lot is riding on it, or it runs for weeks." : "One line in, terms out. Right for anything you’ll know tonight."}</p>
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
        {pace !== "dare" ? (
          <p className="text-caption text-ink-3">Dareful checks whether facts can settle it before anyone picks a side, and it won’t rule on an argument about someone in the group.</p>
        ) : null}
        {/* The step's one move, in the sheet (3.24), with the form-level problem above it when there is one. */}
        <PinnedSheet
          label="Next"
          low={
            <>
              <ProblemSummary messages={[fieldProblem, problem]} />
              <Button type="submit" form="ask-question" variant="primary" loading={thinking} disabled={(pickOne && filledChoices.length < MIN_ANSWERS) || (blank !== null && !slotName.trim())}>
                {pace === "argument" ? "Check it." : mode === "careful" ? "Ask me" : "Set the terms"}
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
                toTerms();
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
        const q = await carefulQuestionsAction(line, { name, kind }, numeric ? "numeric" : pickOne ? "categorical" : "binary", pickOne ? filledChoices.map((c) => c.text.trim()) : undefined);
        if ("error" in q || "ask" in q) {
          setProblem("error" in q ? q.error : "The questions didn’t come through. You can write the terms yourself on the next screen.");
          writeUp();
          return toTerms();
        }
        setSubjectKind(kind);
        // Changing the answer rewrites the questions; answers to questions that survive the rewrite are kept (3.44).
        setAnswers((prev) => Object.fromEntries(q.questions.flatMap((next, i) => ((was) => (was >= 0 && was in prev ? [[i, prev[was] as 0 | 1]] : []))(questions.findIndex((old) => old.question === next.question)))));
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
                {q.question}
              </p>
              {/* Yes and No, or the question's own two answers, which wrap rather than cut (the touch-ups round). */}
              <div role="group" aria-labelledby={`careful-${i}`} className="flex flex-wrap gap-2">
                {([0, 1] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={answers[i] === v} onClick={() => setAnswers((a) => ({ ...a, [i]: v }))} {...chipPress(answers[i] === v)}>
                    <Chip size={36} selected={answers[i] === v} choice>
                      {q.answers ? q.answers[v] : v === 0 ? "Yes" : "No"}
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
                toTerms();
              }}
            >
              Set the terms
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
          <textarea id="ask-title" ref={titleField} rows={2} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} aria-label="The question" className="field-sizing-content resize-none rounded-button border border-line bg-surface px-3 py-2 text-serif-l text-ink" />
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

  if (template) {
    const units = noUnits;
    const unitChip = (u: Unit, label: string, key: string) => {
      const selected = u.kind === unit.kind && (u.kind === "usd" || (u.kind === "existing" && unit.kind === "existing" && u.id === unit.id) || (u.kind === "new" && unit.kind === "new" && u.template === unit.template && (u.template !== null || u.label === unit.label)));
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
            {/* The asker's own units, added on You (the touch-ups round), as quoted words beside the others. */}
            {ownUnits.filter((o) => !units.some((u) => !u.template && u.label.toLowerCase() === o)).map((o) => unitChip({ kind: "new", template: null, label: o }, `“${o}”`, `own-${o}`))}
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
            // A reading is a sentence: it wraps inside its button rather than being cut at both ends (the second-pass round, iOS 26).
            <Button
              key={c}
              variant="secondary"
              className="h-auto min-h-12 whitespace-normal py-3 text-left"
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

  const units = noUnits;
  const unitChip = (u: Unit, label: string, key: string) => {
    const selected = u.kind === unit.kind && (u.kind === "usd" || (u.kind === "existing" && unit.kind === "existing" && u.id === unit.id) || (u.kind === "new" && unit.kind === "new" && u.template === unit.template && (u.template !== null || u.label === unit.label)));
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
      {namedGame && !gameDismissed ? (
        // A question about a game (section 6): offered once, while it is being asked, so the final score settles it.
        <section className="flex flex-col gap-3 rounded-card border border-line bg-surface px-4 py-3" data-attach-game={namedGame.gameId}>
          <p className="text-body-sm text-ink">{`${namedGame.name}, ${namedGame.when}.`}</p>
          <Button variant="secondary" loading={saving} onClick={attachToGame}>
            Let the final score settle it
          </Button>
          <Button variant="tertiary" className="self-start" disabled={saving} onClick={() => setGameDismissed(true)}>
            Keep it as it is
          </Button>
        </section>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {scope ? "The terms are written" : "Writing the terms"}
      </p>
      {/* The details card, all four labels drawn in the first frame; the written values arrive at the pace they arrive, and become editable once written and not before (9.8). */}
      <dl className="flex flex-col rounded-card border border-line bg-surface px-4" data-terms-card={scope ? "written" : "writing"}>
        {row(
          "Counts if",
          scope ? (
            <>
              <textarea id="ask-terms" ref={termsField} rows={3} value={terms} onChange={(e) => setTerms(e.target.value)} maxLength={800} aria-label="Counts if" className="field-sizing-content -mx-1 resize-none rounded-button bg-transparent px-1 text-body text-ink" />
              <p className="text-caption text-ink-3">{scope.plain ? "The write-up didn’t come through, so this is your line as you typed it. Change it however you like." : "Written up from your line. Change anything; everyone sees exactly this before they’re in."}</p>
            </>
          ) : written?.terms ? (
            <p className="min-h-6 text-body text-ink" data-terms-writing="">
              {written.terms}
              <Caret />
            </p>
          ) : (
            // Before the first words, the loader and what it is doing, never an empty line with a caret that reads as a place to type (the touch-ups round).
            <p className="flex min-h-6 items-center gap-2 text-body text-ink-2" data-terms-writing="" data-terms-loader="">
              <TallyLoader size={20} className="text-ink" />
              Writing the terms…
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
        {pace === "argument" && pickOne
          ? row(
              "Your side",
              <>
                {/* A pick-one argument (the first-contact round): each person's answer is an answer, and the asker's is theirs from the start. */}
                <div role="group" aria-label="Your side" className="flex flex-wrap gap-2" data-argument-answers="">
                  {filledChoices.map((c, i) => (
                    <button key={i} type="button" aria-pressed={myAnswer === i} onClick={() => setMyAnswer(i)} {...chipPress(myAnswer === i)}>
                      <Chip size={36} selected={myAnswer === i} choice>
                        {c.text.trim()}
                      </Chip>
                    </button>
                  ))}
                </div>
                <p className="text-caption text-ink-3">All the way, by default, so whoever’s wrong is out the whole thing.</p>
              </>,
            )
          : pace === "argument"
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
              <>
              <div className="flex flex-wrap gap-2" data-decide-by={tooFar ? "none" : decide.key} onClickCapture={chipTaps}>
                {DECIDE_BY_SPANS.map((w) => (
                  <button key={w.key} type="button" onClick={() => pickDecide({ key: w.key })} {...chipPress(!tooFar && decide.key === w.key)}>
                    <Chip size={36} selected={!tooFar && decide.key === w.key} choice>
                      {w.label}
                    </Chip>
                  </button>
                ))}
                {/* A date (3.20 as amended): the write-up's date until another is picked, the phone's own date picker under the chip. */}
                <label data-press={chipPress(!tooFar && decide.key === "date")["data-press"]} className={cn("relative", chipPress(!tooFar && decide.key === "date").className)} data-decide-date="">
                  <Chip size={36} selected={!tooFar && decide.key === "date"} choice>
                    {tooFar ? "A date" : decide.key === "date" ? shortDateWords(decide.date) : proposedDate ? shortDateWords(proposedDate) : "A date"}
                  </Chip>
                  <input
                    type="date"
                    aria-label="Decided on a date"
                    min={localDate(new Date(), askerZone())}
                    max={latestDate(new Date(), askerZone())}
                    value={decide.key === "date" ? decide.date : (proposedDate ?? "")}
                    onChange={(e) => (e.target.value ? pickDecide({ key: "date", date: e.target.value }) : undefined)}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  />
                </label>
              </div>
              {tooFar ? (
                // Too far off to decide (the second-pass round): said in plain words, with one nearer version that can be.
                <div className="flex flex-col gap-3" data-too-far="">
                  <Problem id="decided-too-far" message={`That can’t be known until ${longDateWords(tooFar.knownBy)}, and the furthest a question can run is ${longDateWords(tooFar.latest)}.`} />
                  {tooFar.nearer ? (
                    <div className="flex flex-col gap-2 rounded-card border border-line px-[14px] py-3" data-nearer="">
                      <p className="text-body-strong text-ink">{tooFar.nearer.title}</p>
                      <p className="text-body-sm text-ink-2">{tooFar.nearer.terms}</p>
                      <Button variant="secondary" size="inline" className="self-start" onClick={askNearer} data-ask-nearer="">
                        Ask this instead
                      </Button>
                    </div>
                  ) : null}
                </div>
              ) : null}
              </>,
            )}
        {row(
          "Stakes",
          <>
            <div className="flex flex-wrap gap-2">
              {unitChip({ kind: "usd" }, "Dollars", "usd")}
              {units.map((u) => unitChip({ kind: "existing", id: u.id }, u.template === "next_time" ? "a next time" : u.template ? `${u.label}s` : `“${u.label}”`, u.id))}
              {PRESETS.filter((p) => !units.some((u) => u.template === p.template)).map((p) => unitChip({ kind: "new", template: p.template, label: p.template }, p.label, p.template))}
            {/* The asker's own units, added on You (the touch-ups round), as quoted words beside the others. */}
            {ownUnits.filter((o) => !units.some((u) => !u.template && u.label.toLowerCase() === o)).map((o) => unitChip({ kind: "new", template: null, label: o }, `“${o}”`, `own-${o}`))}
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
        {/* An argument always goes to the tiebreaker when someone sees the app's ruling differently (the touch-ups round), so the choice is a dare's alone. */}
        {pace === "dare" && row(
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

/** The asker's zone, as the browser has it: what a decide-by is measured in, here and when it is sent. */
function askerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** The words being written have a caret at their end (9.8): 2 by 20px in `--ink-2`, blinking on the loop, steady with Reduce Motion. */
function Caret() {
  return <span aria-hidden="true" data-caret="" className="ml-0.5 inline-block h-5 w-[2px] rounded-[1px] bg-ink-2 align-text-bottom motion-loop-caret" />;
}

/** The block when the words stop (9.8): in the sheet above "Send it", with "Try again", which writes them again. */
/** How long a typed question rests before its write-up starts on the question step, and how long it must be (the touch-ups round). */
export const EARLY_WRITE_UP_MS = 1200;
export const EARLY_LINE = 8;
export const TERMS_STOPPED = "The terms stopped partway.";
