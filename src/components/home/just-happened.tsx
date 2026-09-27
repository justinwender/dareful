import Link from "next/link";
import { Avatar } from "@/components/ledger/avatar";
import { MarkRefStamp } from "@/components/ledger/mark-stamp";
import { StateMark } from "@/components/ledger/state-mark";
import { TeamPair } from "@/components/ledger/team-stamp";
import { When } from "@/components/ledger/when";
import { LinkPending } from "@/components/ui/link-pending";
import type { HomeData } from "@/lib/ledger/home";
import { unitPhrase } from "@/lib/ledger/number-axis";
import { coveredSentence, gotSentence } from "@/lib/ui/copy";
import { hueFor } from "@/lib/ui/hue";
import { markRefOf } from "@/lib/ui/mark";
import { outcomeLine } from "@/lib/ui/outcome-words";
import { calledItLine } from "@/lib/ledger/pick-one";

/**
 * Just happened (docs/design.md 4.7, 3.15): what the group did, each as one row and never a story card. A resolved
 * market: its 40px stamp on its ink's field, the question in `serif-m`, and a meta line with the state mark, the
 * outcome in the market's words and who called it ("He got carded · Maya called it"), with a 44px thumbnail on
 * the right when there is media. A cover that landed or an obligation that closed: the owner's 40px avatar, the
 * subject in `body` 600, and the mark with when. Tapping a row opens the market's own screen or the person view.
 * Three sizes on the root: 13, 17 and serif 17.
 */
export function JustHappened({ rows, viewerId, clock }: { rows: HomeData["happened"]; viewerId: string; clock: { zone: string; now: number } }) {
  if (rows.length === 0) return null;
  return (
    <section className="flex flex-col gap-[10px]">
      <h2 className="text-label text-ink-2">Just happened</h2>
      <div className="overflow-hidden rounded-card border border-line bg-surface">
        {rows.map((e, i) => {
          const divider = i > 0 ? "border-t border-line" : "";
          if (e.kind === "market") {
            const m = e.market;
            const d = m.dare;
            const mark = markRefOf(d);
            const outcome =
              m.state === "resolved"
                ? m.pickOne && m.pickOne.outcome !== null
                  ? `${m.pickOne.answers[m.pickOne.outcome]?.text ?? "Decided"}.`
                  : m.unit && m.answer !== null
                    ? `${unitPhrase(BigInt(m.answer), m.unit)}.`
                    : m.outcome !== null
                      ? outcomeLine(d, m.outcome === 1)
                      : null
                : m.state === "voided"
                  ? "Nobody could tell."
                  : m.state === "expired"
                    ? "Never settled."
                    : null;
            // Who called it: on a pick-one question, whoever picked the answer that happened (3.25); otherwise the first to say.
            const called = m.pickOne ? (m.pickOne.callers.length > 0 ? calledItLine(m.pickOne.callers, m.pickOne.callers.includes("You")).replace(" Nobody else did.", "").replace(/\.$/, "") : null) : m.calledBy ? `${m.calledBy} called it` : null;
            const meta = [outcome?.replace(/\.$/, ""), called].filter(Boolean).join(" · ");
            const thumb = m.media[0];
            return (
              <Link prefetch={false} key={d.id} href={`/m/${d.id}`} className={`relative grid items-center gap-3 px-4 py-[14px] ${mark ? "grid-cols-[40px_minmax(0,1fr)_auto]" : "grid-cols-[minmax(0,1fr)_auto]"} ${divider}`}>
                <LinkPending />
                {mark ? <MarkRefStamp mark={mark} size={40} ink={m.ink} /> : null}
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-serif-m text-ink">{d.title}</span>
                  <span className="flex items-center gap-2 text-caption text-ink-3">
                    <StateMark state={m.state} />
                    <span className="truncate">{meta || <When iso={e.at.toISOString()} zone={clock.zone} serverNow={clock.now} />}</span>
                  </span>
                </span>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element -- behind the door, a signed URL that expires
                  <img src={`/api/media/${thumb.id}?size=thumb`} alt="" width={44} height={44} loading="lazy" className="h-11 w-11 shrink-0 rounded-button bg-surface-2 object-cover" />
                ) : (
                  <span />
                )}
              </Link>
            );
          }
          if (e.kind === "game") {
            return (
              <Link prefetch={false} key={`g-${e.href}`} href={e.href} data-game-happened="" className={`relative grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-[14px] ${divider}`}>
                <LinkPending />
                <TeamPair away={e.away} home={e.home} size={28} overlap />
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="text-body-strong text-ink">{e.name}</span>
                  <span className="flex items-center gap-2 text-caption text-ink-3">
                    <StateMark state={e.state} />
                    <span className="truncate">{e.meta}</span>
                  </span>
                </span>
                <span />
              </Link>
            );
          }
          const owner = e.from;
          const subject = e.obligation.memo ?? (e.kind === "cover" ? coveredSentence(e.to, viewerId) : gotSentence(owner, e.to, viewerId));
          const state = e.kind === "closed" ? e.state : "owed";
          const photo = e.kind === "closed" && e.obligation.mediaId ? `/api/media/${e.obligation.mediaId}?size=thumb` : null;
          return (
            <Link prefetch={false} key={`${e.kind}-${e.obligation.id}`} href={`/p/${owner.id === viewerId ? e.to.id : owner.id}`} className={`relative grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-[14px] ${divider}`}>
              <LinkPending />
              <Avatar name={owner.displayName} hue={hueFor(owner.id)} size={40} />
              <span className="flex min-w-0 flex-col gap-1">
                <span className="text-body-strong text-ink">{subject}</span>
                <span className="flex items-center gap-2 text-caption text-ink-3">
                  <StateMark state={state} hue={state === "owed" ? hueFor(owner.id) : undefined} />
                  <span className="truncate">
                    {e.kind === "cover" ? gotSentence(owner, e.to, viewerId) : e.state === "settled" ? "Settled" : "Called it even"}
                    {" · "}
                    <When iso={e.at.toISOString()} zone={clock.zone} serverNow={clock.now} />
                  </span>
                </span>
              </span>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photo} alt="" width={44} height={44} loading="lazy" className="h-11 w-11 shrink-0 rounded-button bg-surface-2 object-cover" />
              ) : (
                <span />
              )}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
