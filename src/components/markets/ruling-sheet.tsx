"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Avatar } from "@/components/ledger/avatar";
import { FIELD_PROBLEM_CLASS, Problem, ProblemSummary } from "@/components/ledger/problem";
import { Button } from "@/components/ui/button";
import { PinnedSheet } from "@/components/ui/pinned-sheet";
import { RefreshWhile } from "@/components/ui/refresh-while";
import { Sheet } from "@/components/ui/sheet";
import { TallyWait } from "@/components/ui/tally-loader";
import { agreeWithRulingAction, disputeRulingAction, sayWhatHappenedAction } from "@/lib/actions/markets";
import { attempt } from "@/lib/ui/attempt";
import { agreedWords } from "@/lib/ui/calls-words";
import { shrinkPhoto } from "@/lib/ui/shrink-photo";
import type { Hue } from "@/lib/ui/hue";
import type { RulingStage } from "@/lib/ledger/rulings";
import { AttachRow, type Shot } from "./call-sheet";

type Person = { name: string; hue: Hue | null; me: boolean };

export type RulingSheetProps = {
  dareId: string;
  stage: RulingStage;
  /** The ruling, once shown: its verdict in the question's own words ("Baseball", "Yes"), the lean, and its reasons. */
  ruling: { line: string; rationale: string } | null;
  /** Who has agreed with it, as it stands. */
  agreed: Person[];
  /** Who sees it differently, and what they say it got wrong: everyone in it sees these (3.24 as amended 2026-10-08). */
  disputes: Array<Person & { said: string }>;
  /** Whether this person agrees already, and whether they disputed it. */
  mine: { agreed: boolean; disputed: boolean };
  /** A photo or a screenshot needs an account; a guest says it in words. */
  canAttach: boolean;
  /** An argument that needs what its people saw, before anyone has said: they can say it here (an account's to give). */
  canSay: boolean;
  /** A ruling made at the ask: what to hash to check it against the seal in the terms everyone signed. */
  seal: { seal: string; salt: string; text: string } | null;
};

/**
 * The sheet on a closed argument (docs/design.md 3.24 as amended 2026-10-08): the app's ruling, with one main button,
 * "Agree", and under it a quiet text button, "I see it differently", the way the join step offers "I already have an
 * account". Seeing it differently asks what the ruling got wrong (required) and offers a photo or a screenshot, and
 * sends both, with the ruling, to the tiebreaker. While anything is being weighed (the ruling, or the tiebreaker's), the
 * sheet is the loader and nothing to pick. Agreeing binds nobody who has not: everyone in agreed at entry, in the terms
 * they signed, that the app's ruling stands unless someone sees it differently.
 */
export function RulingSheet(props: RulingSheetProps) {
  const router = useRouter();
  const [agreeing, startAgree] = useTransition();
  const [problem, setProblem] = useState<string | null>(null);
  const [disputing, setDisputing] = useState(false);

  if (props.stage === "asking") return <SayWhatHappened dareId={props.dareId} canSay={props.canSay} />;
  if (props.stage === "weighing" || props.stage === "tiebreaker") {
    return (
      <PinnedSheet
        label={props.stage === "tiebreaker" ? "With the tiebreaker" : "Being weighed"}
        low={
          <div className="flex flex-col gap-3">
            {props.disputes.map((d) => (
              <DisputeLine key={`${d.name}-${d.said}`} person={d} />
            ))}
            <TallyWait />
            <RefreshWhile everyMs={4000} forMs={180_000} />
          </div>
        }
      />
    );
  }

  const agree = () =>
    startAgree(async () => {
      setProblem(null);
      const r = await attempt(() => agreeWithRulingAction(props.dareId));
      if ("error" in r) return setProblem(r.error);
      router.refresh();
    });
  // Named once: while you agree, "You agree." says it, and the line names only the others.
  const agreedLine = agreedWords(props.mine.agreed ? props.agreed.filter((p) => !p.me) : props.agreed);
  return (
    <>
      <PinnedSheet
        label="The app's ruling"
        header={<p className="text-body-strong text-ink">{props.ruling?.line}</p>}
        low={
          <div className="flex flex-col gap-3">
            {props.ruling ? <p className="text-body-sm text-ink-2" data-ruling-reasons="">{props.ruling.rationale}</p> : null}
            {agreedLine ? (
              <p className="flex items-center gap-2 text-caption text-ink-3" data-agreed="">
                {props.agreed.slice(0, 3).map((p) => (p.hue ? <Avatar key={p.name} name={p.name} hue={p.hue} size={20} /> : null))}
                <span>{agreedLine}</span>
              </p>
            ) : null}
            <ProblemSummary messages={[problem]} />
            {props.mine.agreed ? (
              <p className="text-body-strong text-ink" data-you-agree="">
                You agree.
              </p>
            ) : (
              <>
                <Button variant="primary" onClick={agree} loading={agreeing} data-agree="">
                  Agree
                </Button>
                <button type="button" onClick={() => setDisputing(true)} className="self-center px-2 py-2 text-body-sm font-semibold text-ink-2 underline-offset-2 press-line" data-press="line" data-see-differently="">
                  I see it differently
                </button>
              </>
            )}
            {props.seal ? <HowToCheck seal={props.seal} /> : null}
          </div>
        }
      />
      <DisputeSheet dareId={props.dareId} open={disputing} onClose={() => setDisputing(false)} canAttach={props.canAttach} />
    </>
  );
}

function DisputeLine({ person }: { person: Person & { said: string } }) {
  return (
    <p className="flex items-start gap-2 text-body-sm text-ink-2" data-dispute="">
      {person.hue ? <Avatar name={person.name} hue={person.hue} size={22} /> : null}
      <span>
        <span className="text-ink">{person.me ? "You see it differently:" : `${person.name} sees it differently:`}</span> {person.said}
      </span>
    </p>
  );
}

/** What the ruling got wrong, required, with a photo or a screenshot for an account; sent with the ruling to the tiebreaker. */
function DisputeSheet({ dareId, open, onClose, canAttach }: { dareId: string; open: boolean; onClose: () => void; canAttach: boolean }) {
  const router = useRouter();
  const titleId = useId();
  const fieldId = useId();
  const problemId = useId();
  const [text, setText] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [fieldProblem, setFieldProblem] = useState<string | null>(null);
  const [sending, start] = useTransition();
  const send = () => {
    setProblem(null);
    if (text.trim().length < 2) return setFieldProblem("Say what it got wrong.");
    setFieldProblem(null);
    start(async () => {
      const form = new FormData();
      form.set("dareId", dareId);
      form.set("text", text);
      for (const s of shots) form.append("attachment", await shrinkPhoto(s.file), "attachment.jpg");
      const r = await attempt(() => disputeRulingAction(form));
      if ("error" in r) return setProblem(r.error);
      setShots([]);
      onClose();
      router.refresh();
    });
  };
  return (
    <Sheet open={open} onClose={onClose} labelledBy={titleId}>
      <h2 id={titleId} className="text-body-strong text-ink">
        What did it get wrong?
      </h2>
      <div className="flex flex-col gap-3" data-dispute-sheet="">
        <textarea
          id={fieldId}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={400}
          rows={3}
          aria-invalid={fieldProblem ? true : undefined}
          aria-describedby={fieldProblem ? problemId : undefined}
          aria-labelledby={titleId}
          className={`min-h-24 rounded-button border border-line bg-ground px-4 py-3 text-body text-ink${fieldProblem ? ` ${FIELD_PROBLEM_CLASS}` : ""}`}
        />
        <Problem id={problemId} message={fieldProblem} />
        {canAttach ? <AttachRow shots={shots} disabled={sending} onChange={setShots} /> : null}
        <ProblemSummary messages={[problem]} retry={send} />
        <Button variant="primary" onClick={send} loading={sending}>
          Send it
        </Button>
      </div>
    </Sheet>
  );
}

/** How to check a ruling made at the ask against the terms everyone signed: the seal, the salt and the text, verbatim. */
export function HowToCheck({ seal }: { seal: { seal: string; salt: string; text: string } }) {
  return (
    <details className="rounded-card border border-line bg-surface px-3 py-2 text-caption text-ink-3" data-how-to-check="">
      <summary className="cursor-pointer py-1 text-body-sm font-semibold text-ink-2">How to check it</summary>
      <div className="flex flex-col gap-2 pt-2">
        <p>This ruling was made when the question was asked and sealed in the terms everyone signed. Hash the salt followed by the text with keccak-256, and you get the seal in the terms.</p>
        <p className="break-all">Seal {seal.seal}</p>
        <p className="break-all">Salt {seal.salt}</p>
        <p className="whitespace-pre-wrap break-words" data-sealed-text="">{seal.text}</p>
      </div>
    </details>
  );
}

/** An argument that needs what its people saw, before anyone has said it: say it, with a photo or a screenshot; the app then rules from it. */
function SayWhatHappened({ dareId, canSay }: { dareId: string; canSay: boolean }) {
  const router = useRouter();
  const [line, setLine] = useState("");
  const [shots, setShots] = useState<Shot[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, start] = useTransition();
  const send = () =>
    start(async () => {
      setProblem(null);
      const form = new FormData();
      form.set("dareId", dareId);
      form.set("text", line);
      for (const s of shots) form.append("attachment", await shrinkPhoto(s.file), "attachment.jpg");
      const r = await attempt(() => sayWhatHappenedAction(form));
      if ("error" in r) return setProblem(r.error);
      setShots([]);
      setLine("");
      router.refresh();
    });
  return (
    <PinnedSheet
      label="Say what happened"
      header={<p className="text-body-strong text-ink">When it’s clear, say what happened.</p>}
      low={
        canSay ? (
          <div className="flex flex-col gap-3">
            <label htmlFor="argument-happened" className="sr-only">
              What happened?
            </label>
            <input id="argument-happened" value={line} onChange={(e) => setLine(e.target.value)} maxLength={280} className="h-12 rounded-button border border-line bg-ground px-4 text-body text-ink placeholder:text-ink-3" />
            <AttachRow shots={shots} disabled={sending} onChange={setShots} />
            <ProblemSummary messages={[problem]} retry={send} />
            <Button variant="primary" onClick={send} loading={sending} disabled={line.trim().length < 2 && shots.length === 0}>
              Send it
            </Button>
          </div>
        ) : (
          <RefreshWhile />
        )
      }
    />
  );
}
