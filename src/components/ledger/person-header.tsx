import type { HeaderLine } from "@/lib/ledger/person";
import { hueFor } from "@/lib/ui/hue";
import { possessive } from "@/lib/ui/copy";
import { MixedToken, ObligationToken, splitMixed } from "./obligation-token";

type Person = { id: string; displayName: string };

/** docs/design.md 3.10. Two columns: theirs on the left, yours on the right. Never a zero. */
export function PersonHeader({ me, them, theirs, yours }: { me: Person; them: Person; theirs: HeaderLine[]; yours: HeaderLine[] }) {
  if (theirs.length === 0 && yours.length === 0) {
    return <p className="text-body-sm text-ink-2">Nothing open between you.</p>;
  }
  const column = (lines: HeaderLine[], caption: string, owner: Person, other: Person) => (
    <div className="flex min-w-0 flex-col gap-2 px-4 py-3.5">
      <span className="text-caption text-ink-3">{caption}</span>
      {lines.length === 0 ? (
        <span className="text-body-sm text-ink-3">nothing</span>
      ) : lines.length === 1 ? (
        <ObligationToken owner={{ id: owner.id, displayName: owner.displayName, hue: hueFor(owner.id) }} other={other} viewerId={me.id} denomination={(lines[0] as HeaderLine).denomination} quantity={(lines[0] as HeaderLine).quantity} height={40} />
      ) : (
        // Many units (3.2, 3.10): one Mixed token, glyphs then words then dollars; past what fits, a second token under the first, dollars always in the last.
        splitMixed(lines).map((part, i) => (
          <MixedToken key={i} owner={{ id: owner.id, displayName: owner.displayName, hue: hueFor(owner.id) }} other={other} viewerId={me.id} lines={part} height={40} />
        ))
      )}
    </div>
  );
  return (
    <div className="grid grid-cols-2 rounded-card border border-line bg-surface" data-person-header="">
      {column(theirs, `${possessive(them.displayName)} got you`, them, me)}
      <div className="border-l border-line">{column(yours, `You've got ${them.displayName}`, me, them)}</div>
    </div>
  );
}
