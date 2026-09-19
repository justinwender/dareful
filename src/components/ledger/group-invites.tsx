"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { InviteShare } from "@/components/ledger/invite-share";
import { When } from "@/components/ledger/when";
import { Button } from "@/components/ui/button";
import { createInviteAction, revokeInviteAction } from "@/lib/actions/groups";
import { ProblemSummary } from "@/components/ledger/problem";

export type InviteSummary = {
  id: string;
  /** ISO timestamps; formatted in the viewer's zone. */
  createdAt: string;
  expiresAt: string;
  joined: number;
  /** The link, for a member to send again. Null for a link made before links could be shown twice. */
  url: string | null;
};

/**
 * Links into the group. A member can send a live link again as often as they like, so there is no reason to
 * make a second one: the first real session ended with three live links in one group because the only way to
 * re-send was to mint another (docs/testing.md, session 2). Rows are labeled by when the link was made, since
 * labeling by maker made one person's own links read as if they came from different people. Anyone in the
 * group can turn a link off: joining a group is a standing seat in everything the group decides later.
 */
export function GroupInvites({ groupId, groupName, invites, clock }: { groupId: string; groupName: string; invites: InviteSummary[]; clock: { zone: string; now: number } }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const text = `Join ${groupName} on Dareful:`;
  const newest = invites.find((i) => i.url !== null) ?? null;

  function make() {
    setError(null);
    startTransition(async () => {
      const r = await createInviteAction(groupId);
      if ("error" in r) return setError(r.error);
      router.refresh();
    });
  }

  function turnOff(id: string) {
    setError(null);
    startTransition(async () => {
      const r = await revokeInviteAction(groupId, id);
      if ("error" in r) return setError(r.error);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-card border border-dashed border-line-strong p-4">
      <p className="text-body-sm text-ink-2">Anyone with the link joins the group. Send it from your own messages, as many times as you like.</p>
      {newest?.url ? (
        <InviteShare url={newest.url} text={text} />
      ) : (
        <div>
          <Button variant="secondary" onClick={make} loading={pending}>
            Make a link
          </Button>
        </div>
      )}
      {error ? (
        <ProblemSummary messages={[error]} />
      ) : null}
      {invites.length > 0 ? (
        <ul className="flex flex-col border-t border-line pt-1">
          {invites.map((i) => (
            <li key={i.id} className="flex flex-col gap-1 border-b border-line py-3 last:border-b-0">
              <span className="text-body-sm text-ink-2">
                Made <When iso={i.createdAt} zone={clock.zone} serverNow={clock.now} style="day" />, good until <When iso={i.expiresAt} zone={clock.zone} serverNow={clock.now} style="day" />. {i.joined === 0 ? "Nobody has used it yet." : i.joined === 1 ? "1 person joined with it." : `${i.joined} people joined with it.`}
              </span>
              <div className="flex flex-wrap items-center gap-1">
                {i.url ? <InviteShare url={i.url} text={text} compact /> : <span className="pr-2 text-caption text-ink-3">An older link: it still works, but can’t be shown again.</span>}
                <Button variant="tertiary" onClick={() => turnOff(i.id)} disabled={pending}>
                  Turn off
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {newest ? (
        <button type="button" onClick={make} disabled={pending} className="h-11 self-start text-[15px] font-semibold text-ink-3">
          Make a separate link
        </button>
      ) : null}
    </div>
  );
}
