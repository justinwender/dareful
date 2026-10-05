import Link from "next/link";
import { redirect } from "next/navigation";
import { Screen, SectionLabel, TopBar } from "@/components/ledger/screen";
import { LinkPending } from "@/components/ui/link-pending";
import { currentUser } from "@/lib/auth/session";
import { IDEA_GROUPS, IDEAS, blankOf, ideaKindWords } from "@/lib/ideas";

/**
 * The ideas page (docs/design.md 3.47): laid out as What's on's list, one section per group, each a card of rows. A
 * row is the question, its kind and a chevron, and opens the question step with the question and its kind chosen.
 * No counts, no popularity, nothing anyone picked. An idea with a blank reads "someone" in a dashed slot.
 */
export default async function IdeasPage() {
  if (!(await currentUser())) redirect("/");
  return (
    <Screen>
      <TopBar back />
      <h1 className="text-label text-ink-3">Ideas</h1>
      <div className="flex flex-col gap-7 py-4">
        {IDEA_GROUPS.map((group) => (
          <section key={group} className="flex flex-col gap-[10px]" data-idea-group={group}>
            <SectionLabel>{group}</SectionLabel>
            <ul className="overflow-hidden rounded-card border border-line bg-surface">
              {IDEAS.filter((i) => i.group === group).map((idea) => {
                const blank = blankOf(idea.text);
                return (
                  <li key={idea.id} className="border-t border-line first:border-t-0">
                    <Link prefetch={false} href={`/m/new?idea=${idea.id}`} data-press="row" data-idea={idea.id} className="press-row relative grid grid-cols-[minmax(0,1fr)_18px] items-center gap-3 px-4 py-3">
                      <LinkPending />
                      <span className="flex min-w-0 flex-col gap-0.5">
                        <span className="text-body-strong text-ink">
                          {blank ? (
                            <>
                              {blank.before}
                              <span className="border-b-[1.5px] border-dashed border-line-strong text-ink-3">someone</span>
                              {blank.after}
                            </>
                          ) : (
                            idea.text
                          )}
                        </span>
                        <span className="text-caption text-ink-3">{ideaKindWords(idea.kind)}</span>
                      </span>
                      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink-3">
                        <path d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </Screen>
  );
}
