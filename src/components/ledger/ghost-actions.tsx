"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Chip } from "@/components/ledger/chip";
import { InviteShare } from "@/components/ledger/invite-share";
import { Button } from "@/components/ui/button";
import { createClaimLinkAction, dismissGhostAction, mergeGhostAction } from "@/lib/actions/claims";

export type MergeOption = { kind: "user"; userId: string; displayName: string } | { kind: "claim"; claimId: string; displayName: string };

/**
 * What only the person who added a ghost can do. Send them a link through your own messages (Dareful never
 * sends anything), say who they really are ("this Gabe is that Gabe"), or let them go.
 */
export function GhostActions({ claimId, name, mergeOptions }: { claimId: string; name: string; mergeOptions: MergeOption[] }) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [panel, setPanel] = useState<"none" | "merge" | "dismiss">("none");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<void>) => {
    setError(null);
    start(fn);
  };

  const makeLink = () =>
    run(async () => {
      const r = await createClaimLinkAction(claimId);
      if ("error" in r) setError(r.error);
      else setUrl(r.url);
    });

  const merge = (o: MergeOption) =>
    run(async () => {
      const r = await mergeGhostAction(claimId, o.kind === "user" ? { kind: "user", userId: o.userId } : { kind: "claim", claimId: o.claimId });
      if ("error" in r) {
        setError(r.error);
        return;
      }
      router.replace(r.to);
      router.refresh();
    });

  const dismiss = () =>
    run(async () => {
      const r = await dismissGhostAction(claimId);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      router.replace("/");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong p-4">
      {url ? (
        <>
          <p className="text-body-sm text-ink-2">Send this to {name} from your own messages. It shows here once.</p>
          {/* Sent from the creator's own number, so it is in their voice. */}
          <InviteShare url={url} text="I got this one. Have a look:" />
        </>
      ) : (
        <>
          <p className="text-body-sm text-ink-2">{name} hasn’t joined yet. Everything here waits until they say it’s right.</p>
          <div>
            <Button variant="secondary" onClick={makeLink} loading={pending}>
              Make a link for {name}
            </Button>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2 border-t border-line pt-3">
        {mergeOptions.length > 0 ? (
          <Button variant="tertiary" onClick={() => setPanel(panel === "merge" ? "none" : "merge")} disabled={pending}>
            This is someone I already have
          </Button>
        ) : null}
        <Button variant="tertiary" onClick={() => setPanel(panel === "dismiss" ? "none" : "dismiss")} disabled={pending}>
          Let them go
        </Button>
      </div>

      {panel === "merge" ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-sm text-ink-2">Who is {name}, really? Everything here moves over to them.</p>
          <div className="flex flex-wrap gap-2">
            {mergeOptions.map((o) => (
              <button key={o.kind === "user" ? o.userId : o.claimId} type="button" onClick={() => merge(o)} disabled={pending} className="rounded-pill">
                <Chip size={36}>{o.displayName}</Chip>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {panel === "dismiss" ? (
        <div className="flex flex-col gap-2">
          <p className="text-body-sm text-ink-2">Anything waiting on {name} closes, and their link stops working. Nothing that already happened changes.</p>
          <div>
            <Button variant="secondary" onClick={dismiss} loading={pending}>
              Yes, let {name} go
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="border-l-2 border-marigold pl-3 text-body-sm text-ink">
          {error}
        </p>
      ) : null}
    </div>
  );
}
