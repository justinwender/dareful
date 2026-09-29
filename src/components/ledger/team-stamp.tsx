import { stampFill, stampGlyph, stampInk, stampRadius, type TeamFace } from "@/lib/ui/team";

/**
 * A team stamp (docs/design.md 1.7): the feed's abbreviation on the team's colour, Hanken 700 at 0.42 of the
 * stamp for two letters and 0.36 for three, in whichever of graphite and cream has more contrast, with a 1px
 * inset ring so a navy or maroon team keeps its edge on the dark ground, and a radius of a quarter of the size.
 * A stamp is a mark, outside the type floor and the budget (its size is literal here and nowhere else), which
 * is why its smallest size never appears without the name beside it. No logo, ever. A team's colour appears only
 * inside its stamp (4.5).
 */
export function TeamStamp({ team, size = 28, className, travels }: { team: TeamFace; size?: number; className?: string; /** A game page's header stamp (9.7): the name a game row's stamp travels to. */ travels?: string }) {
  return (
    <span
      role="img"
      aria-label={team.name}
      data-team-stamp={team.abbr}
      className={`inline-flex shrink-0 items-center justify-center font-bold uppercase ${className ?? ""}`}
      style={{ width: size, height: size, borderRadius: stampRadius(size), background: stampFill(team.color), color: stampInk(team.color), fontSize: stampGlyph(size, team.abbr), lineHeight: 1, letterSpacing: "0.02em", boxShadow: "inset 0 0 0 1px var(--stamp-edge)", viewTransitionName: travels }}
    >
      {team.abbr}
    </span>
  );
}

/** The two stamps side by side with a 4px gap, the away side first as in "Chiefs at Bills" (3.32); `overlap` draws the Now row's pair, 28px overlapping by 16px in the 40px slot (4.7). */
export function TeamPair({ away, home, size = 28, overlap = false }: { away: TeamFace; home: TeamFace; size?: number; overlap?: boolean }) {
  if (overlap) {
    return (
      <span className="relative inline-flex h-10 w-10 shrink-0 items-center" aria-hidden="true">
        <TeamStamp team={away} size={size} className="absolute left-0" />
        <TeamStamp team={home} size={size} className="absolute left-3" />
      </span>
    );
  }
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <TeamStamp team={away} size={size} />
      <TeamStamp team={home} size={size} />
    </span>
  );
}
