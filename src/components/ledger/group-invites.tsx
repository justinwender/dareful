"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InviteShare } from "@/components/ledger/invite-share";
import { When } from "@/components/ledger/when";
import { Button } from "@/components/ui/button";
import { createInviteAction, revokeInviteAction } from "@/lib/actions/groups";

export type InviteSummary = {
  id: string;
  madeBy: string;
  /** ISO timestamp; formatted here so it reads in the viewer's zone, not the server's. */
  expiresAt: string;
  joined: number;
};

/**
 * Links into the group. A link is made on request and shown once, because only its hash is kept. Anyone in
 * the group can turn a link off: joining a group is a standing seat in everything the group decides later.
 */
export function GroupInvites({ groupId, groupName, invites, clock }: { groupId: string; groupName: string; invites: InviteSummary[]; clock: { zone: string; now: number } }) {
  const router = useRouter();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function make() {
    setError(null);
    startTransition(async () => {
      const r = await createInviteAction(groupId);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setUrl(r.url);
      router.refresh();
    });
  }

  function turnOff(id: string) {
    setError(null);
    startTransition(async () => {
      const r = await revokeInviteAction(groupId, id);
      if ("error" in r) {
        setError(r.error);
        return;
      }
      setUrl(null);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong p-4">
      {url ? (
        <>
          <p className="text-body-sm text-ink-2">Anyone with this link joins the group. Send it from your own messages. It shows here once.</p>
          <InviteShare url={url} text={`Join ${groupName} on Dareful:`} />
        </>
      ) : (
        <>
          <p className="text-body-sm text-ink-2">Anyone with a link joins the group. Send it from your own messages.</p>
          <div>
            <Button variant="secondary" onClick={make} disabled={pending}>
              Make a link
            </Button>
          </div>
        </>
      )}
      {error ? (
        <p role="alert" className="text-body-sm text-ink-2">
          {error}
        </p>
      ) : null}
      {invites.length > 0 ? (
        <ul className="flex flex-col gap-1.5 border-t border-line pt-3">
          {invites.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3">
              <span className="text-caption text-ink-3">
                {i.madeBy}, good until <When iso={i.expiresAt} zone={clock.zone} serverNow={clock.now} style="day" />, {i.joined === 1 ? "1 joined" : `${i.joined} joined`}
              </span>
              <Button variant="tertiary" onClick={() => turnOff(i.id)} disabled={pending}>
                Turn off
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
