import { StateMark } from "@/components/ledger/state-mark";
import { askedCaption, askedHeadline, type AskedRecord } from "@/lib/ledger/you";

/**
 * Questions you asked (docs/design.md 3.34): the clean-resolution rate, in counts and never a percentage, with
 * one 16px state mark per counted question in the order they ended (the resolved disc in ink, the voided mark in
 * ink-3) and a caption naming what went wrong, because a void is fixable next time by wording. Expiry counts
 * against nobody and is named, not counted. There is no floor: this means something from the first question.
 */
export function AskedSection({ record }: { record: AskedRecord }) {
  if (record.counted.length === 0) return null;
  const caption = askedCaption(record.counted, record.expired);
  return (
    <section className="flex flex-col gap-3" data-you-asked={record.counted.length}>
      <h2 className="text-label text-ink-3">Questions you asked</h2>
      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4">
        <p className="text-body-strong text-ink">{askedHeadline(record.counted.length, record.clean)}</p>
        <ul className="flex flex-wrap gap-2" aria-label="Each question you asked, in the order they ended">
          {record.counted.map((q) => (
            <li key={q.dareId} title={q.title}>
              <StateMark state={q.clean ? "resolved" : "voided"} />
            </li>
          ))}
        </ul>
        {caption ? <p className="text-caption text-ink-3">{caption}</p> : null}
      </div>
    </section>
  );
}
