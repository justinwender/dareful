# Marks and memories

A section for PLANNING.md. It covers two things the design session settled: what people
bring themselves (marks), and what a resolved market leaves behind (memories). Both change
the data model, so they belong in the plan before the build starts rather than in a later
polish pass.

## The philosophy, stated once

A camera roll holds four thousand pictures and no reason for any of them. The clip of Theo
clearing the fence is buried between a screenshot of a parking sign and a photo of a menu.
In Dareful the same clip sits inside the question Gabe asked, the numbers six people put in,
the night it happened and the two beers it cost. That context is what turns a file into a
memory, and it is the reason someone opens the app in November when nobody owes anybody
anything.

So media is not a feature bolted onto markets. A resolved market that people photographed is
the main artifact the app produces, and the ledger is what it happens to carry. Every
decision below follows from that ordering.

## Marks: the one thing the app does not draw

The icon set is closed at eight (market, argument, covered, coming up, beer, round, coffee,
next time). It covers the app's own furniture and nothing else, because no hand-drawn set
keeps up with a group inventing bets every weekend. Anything a group invents can carry a
**mark** instead.

- A mark is an emoji or a picture the creator picks. Nothing is generated, suggested from
  the words, or defaulted.
- Two things can carry one: a **market** (Priya's sleep market gets a moon) and a
  **denomination** (the dumpling run gets a dumpling).
- Blank is the default and stays blank. An empty stamp never gets a placeholder.
- A mark never carries meaning alone. The question, the unit's words and the alt text say
  everything; switch every mark off and the app still reads.
- Marks stay out of nav, buttons, status and the eight structural icons.

### Where a market's mark appears

Entry tiles (the ten nights fill with it, and fall back to numerals when there is no mark),
the timeline kicker, the story header, the leaderboard, the share card, and the push that
says the market resolved.

### Schema

```sql
-- on markets and on denominations
mark_kind   text check (mark_kind in ('emoji','image')) ,  -- null = no mark
mark_value  text                                            -- the emoji, or a media_id
```

Sizes are fixed by the container, not by the asset: 20px in a token, 28px in a row, 44px in
a header, 64px on an entry tile. Radii 6 / 8 / 12 / 16.

### Pipeline notes

- A picture mark is cropped square and stored at 256px. Same object store and signed-URL
  path as story media.
- Share images render server-side. Emoji will not render unless the renderer has an emoji
  font loaded (Noto Color Emoji with Satori, or the equivalent), and a picture mark needs the
  256px derivative fetchable by the renderer. Both are easy to forget and both fail silently
  as a blank box in a group chat, which is the worst place to find out.

## Memories: media on events

### Two weights, decided by what the event is

| Event | Treatment |
| --- | --- |
| Covered tab, argument with no media | 84px thumbnail beside the line, or nothing at all |
| Market or argument with media | Full-width frame: 180px in the timeline, 240px opened, 260px on the memory screen |

A market with nothing to show stays text and gets no empty frame. That case is normal, not a
degraded state.

### Frame rules

- Always a credit chip (avatar plus name, plus duration for video) and a counter (`1 / 7`).
- Video plays inline on tap, muted, never autoplays with sound, and shows its length before
  anyone commits to watching.
- Under the frame, a strip of 60px squares for the rest, clips marked with a play glyph, then
  `+N`.
- Media belongs to the story, not to whoever posted first.

### Adding later is the point

Anyone who was in the market can add to it, weeks later included. The affordance sits on the
resolved market, the memory screen and the leaderboard ("Add yours from that night"). This is
what pulls a second visit out of a settled bet.

### Coming back

One "A year ago tonight" card at the top of a timeline, only when that day holds media,
always dismissible. No badge, no count, no streak. The no-nagging rule covers memories too: an
invitation asks once.

### Schema

```sql
create table media (
  id            uuid primary key,
  event_id      uuid not null references events(id),   -- market, argument or cover
  kind          text not null check (kind in ('photo','video')),
  storage_key   text not null,
  poster_key    text,            -- video first frame
  width         int not null,
  height        int not null,
  duration_ms   int,             -- video only
  author_id     uuid not null references users(id),
  captured_at   timestamptz,     -- from EXIF when present
  created_at    timestamptz not null default now()
);
create index on media (event_id, created_at);
```

Derivatives: 1080px long edge for the frame, 256px square for thumbs and marks, poster frame
for video. Visibility follows the event: participants and the group it was asked in. Deleting
media never deletes the event or the obligations it produced.

Media stays off-chain. If provenance is ever wanted, store a content hash alongside the
obligation rather than putting bytes anywhere near the chain.

## Phasing

**In the hackathon build.** Marks on markets and denominations (emoji first, picture if time
allows). Photos on resolved markets with the full-width frame, credit and counter. "Add yours"
on a resolved market. Marks and the frame in the share card, with the emoji font loaded in the
server renderer.

**After.** Video with inline playback, the "a year ago tonight" card, night-level grouping
("the rest of that night" on the memory screen), and per-group memory browsing.

**Not building.** Camera roll sync, auto-albums, face grouping, any notification that counts
photos, and any surface that shows media outside the story it belongs to.

## Acceptance checks

1. A market with no mark and no media renders correctly and looks deliberate, not empty.
2. Turning every mark off leaves every screen readable, including screen readers.
3. A share card for a market with an emoji mark and a video renders server-side with the
   emoji visible and the poster frame in place.
4. A photo added three weeks after resolution appears in the story, in the strip and in the
   counter, credited to whoever added it.
5. Nothing anywhere counts how many photos a person has or has not added.
