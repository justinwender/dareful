import { Avatar } from "@/components/ledger/avatar";
import { hueFor } from "@/lib/ui/hue";

export type Pin = { id: string; name: string; percent: number };

/**
 * docs/design.md 3.5. The axis from No to Yes with everyone's avatar on it. Hidden while people are still
 * entering a blind market; full pins once everyone is in; and when it has resolved, the true half takes the
 * wash and the true end a solid cream cap. Pins closer than 6 points cluster once there are more than six.
 */
export function CallLine({ pins, state, outcome, size = "card", surface = "var(--surface)" }: { pins: Pin[]; state: "hidden" | "in" | "resolved"; outcome?: 0 | 1; size?: "card" | "screen"; surface?: string }) {
  const pin = size === "card" ? 24 : 32;
  const track = size === "card" ? 6 : 8;
  if (state === "hidden") {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex h-[10px] items-center justify-center rounded-pill" style={{ background: "repeating-linear-gradient(90deg, var(--surface-2) 0 10px, var(--surface) 10px 20px)" }} />
        <p className="self-center rounded-pill border border-line-strong px-3 py-1 text-caption text-ink-2">Numbers show when everyone’s in.</p>
      </div>
    );
  }
  const clusters = cluster(pins);
  return (
    <div className="flex flex-col gap-2">
      <div className="relative mx-3" style={{ height: pin + 8 }}>
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 overflow-hidden rounded-pill bg-surface-2" style={{ height: track }}>
          {state === "resolved" ? <span className="absolute inset-y-0" style={{ background: "var(--market-wash)", left: outcome === 1 ? "50%" : 0, right: outcome === 1 ? 0 : "50%" }} /> : null}
        </div>
        <span aria-hidden="true" className="absolute top-1/2 left-1/2 w-px -translate-y-1/2 bg-line-strong" style={{ height: size === "card" ? 16 : 24 }} />
        {state === "resolved" ? (
          <span aria-hidden="true" className="absolute top-1/2 -translate-y-1/2 rounded-pill bg-chalk" style={{ width: size === "card" ? 4 : 6, height: pin, [outcome === 1 ? "right" : "left"]: -2 }} />
        ) : (
          <>
            <span aria-hidden="true" className="absolute top-1/2 left-0 h-3 w-0.5 -translate-y-1/2 bg-line-strong" />
            <span aria-hidden="true" className="absolute top-1/2 right-0 h-3 w-0.5 -translate-y-1/2 bg-line-strong" />
          </>
        )}
        {clusters.map((c, i) => (
          <span key={i} className="absolute top-1/2 flex -translate-y-1/2" style={{ left: `calc(${c.percent}% - ${pin / 2}px)`, zIndex: i + 1 }} title={c.members.map((m) => `${m.name} ${m.percent}%`).join(", ")}>
            {c.members.length === 1 || pins.length <= 6 ? (
              <Avatar name={(c.members[0] as Pin).name} hue={hueFor((c.members[0] as Pin).id)} size={pin} ring={surface} />
            ) : (
              <span className="inline-flex items-center justify-center rounded-pill bg-ink text-label text-ground" style={{ width: pin, height: pin, boxShadow: `0 0 0 2px ${surface}` }}>
                {c.members.length}
              </span>
            )}
          </span>
        ))}
      </div>
      <div className="flex justify-between text-caption text-ink-3">
        <span>{state === "resolved" && outcome === 0 ? <b className="font-semibold text-ink">No</b> : state === "resolved" ? "Said no" : "No"}</span>
        <span>even</span>
        <span>{state === "resolved" && outcome === 1 ? <b className="font-semibold text-ink">Yes</b> : state === "resolved" ? "Said yes" : "Yes"}</span>
      </div>
    </div>
  );
}

/** Beyond six people, pins within six points of each other share one stacked marker; the line never grows a second row. */
function cluster(pins: Pin[]): Array<{ percent: number; members: Pin[] }> {
  const sorted = [...pins].sort((a, b) => a.percent - b.percent);
  if (sorted.length <= 6) return sorted.map((p) => ({ percent: p.percent, members: [p] }));
  const out: Array<{ percent: number; members: Pin[] }> = [];
  for (const p of sorted) {
    const last = out.at(-1);
    if (last && p.percent - (last.members[0] as Pin).percent <= 6) last.members.push(p);
    else out.push({ percent: p.percent, members: [p] });
  }
  return out.map((c) => ({ percent: Math.round(c.members.reduce((a, m) => a + m.percent, 0) / c.members.length), members: c.members }));
}
