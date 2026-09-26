import Link from "next/link";
import { Screen } from "@/components/ledger/screen";
import { CodeJoinCompact } from "@/components/home/code-join";
import { ButtonLink } from "@/components/ui/button";
import { LinkPending } from "@/components/ui/link-pending";
import { TabBar } from "@/components/ui/tab-bar";

const STARTERS = ["Does John fall asleep during the movie?", "Does anyone actually show up on time Friday?", "Who gets to the bar first?"];

/**
 * Now, before anything (docs/design.md 3.14): the date, the serif-xl headline, one body line, the chalk "Ask
 * something", the compact code field, and three starters as rows. Start stays hidden, because asking is already
 * the chalk. One state of the root, in its own file so the type budget counts it on its own (4.8): its serif 40
 * never sits beside the live screen's serif 17.
 */
export function FirstRun({ today }: { today: string }) {
  return (
    <Screen>
      <h2 className="pt-5 text-label text-ink-3">{today}</h2>
      <div className="flex flex-1 flex-col gap-7 py-6">
        <div className="flex flex-col gap-3">
          <h1 className="text-serif-xl text-ink">Nothing happens here until somebody else is in it.</h1>
          <p className="text-body text-ink-2">Ask your group chat something, or join something one of them already asked.</p>
        </div>
        <div className="flex flex-col gap-3">
          <ButtonLink prefetch href="/m/new" variant="primary">
            Ask something
          </ButtonLink>
          <CodeJoinCompact label="Someone sent you a code?" />
        </div>
        <section className="flex flex-col gap-[10px]">
          <h2 className="text-label text-ink-2">Or start from one of these</h2>
          <ul className="flex flex-col gap-1.5">
            {STARTERS.map((line) => (
              <li key={line}>
                <Link prefetch={false} href={`/m/new?line=${encodeURIComponent(line)}`} className="relative flex min-h-14 items-center rounded-button bg-surface px-4 py-3 text-body-strong text-ink">
                  <LinkPending />
                  {line}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>
      <TabBar active="/" live={false} start={false} />
    </Screen>
  );
}
