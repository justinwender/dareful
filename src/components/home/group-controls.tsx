"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ButtonLink } from "@/components/ui/button";
import { FIELD_PROBLEM_CLASS, Problem } from "@/components/ledger/problem";
import { archiveGroupAction, nameGroupAction } from "@/lib/actions/join";
import { cn } from "@/lib/utils";

/**
 * What can be done to a group, under its selected chip. Naming is offered, never demanded: a group that came
 * out of one question may never recur, and one that has is worth a name. Hiding is this person's view only.
 */
export function GroupControls({ groupId, named, worthNaming, archived }: { groupId: string; named: boolean; worthNaming: boolean; archived: boolean }) {
  const router = useRouter();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (naming) {
    return (
      <form
        className="flex flex-col gap-2"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim().length < 2) return setProblem("A name needs at least two characters.");
          start(async () => {
            const r = await nameGroupAction(groupId, name);
            if ("error" in r) return setProblem(r.error);
            setNaming(false);
            router.refresh();
          });
        }}
      >
        <label htmlFor="group-name" className="text-caption text-ink-3">
          What do you all call this?
        </label>
        <div className="flex gap-2">
          <input id="group-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Friday crew" aria-invalid={problem ? true : undefined} aria-describedby={problem ? "group-name-problem" : undefined} className={cn("h-12 min-w-0 flex-1 rounded-[14px] border border-line bg-ground px-4 text-[17px] text-ink placeholder:text-ink-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-marigold", problem && FIELD_PROBLEM_CLASS)} />
          <Button type="submit" variant="secondary" loading={pending}>
            Save
          </Button>
        </div>
        <Problem id="group-name-problem" message={problem} />
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {worthNaming ? <p className="text-body-sm text-ink-2">You’ve asked this lot something more than once. Worth a name.</p> : null}
      <div className="flex flex-wrap items-center gap-x-1">
        <Button variant="tertiary" onClick={() => setNaming(true)}>
          {named ? "Rename" : "Name it"}
        </Button>
        <ButtonLink href={`/g/${groupId}`} variant="tertiary">
          People and links
        </ButtonLink>
        <Button
          variant="tertiary"
          loading={pending}
          onClick={() =>
            start(async () => {
              await archiveGroupAction(groupId, !archived);
              router.replace("/");
              router.refresh();
            })
          }
        >
          {archived ? "Show it again" : "Hide it for me"}
        </Button>
      </div>
    </div>
  );
}
