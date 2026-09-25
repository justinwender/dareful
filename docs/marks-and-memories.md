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

- A mark is an emoji, a picture, or a sticker (a cutout with transparency) the creator picks.
  Nothing is generated, suggested from the words, or defaulted. For now it is emoji only:
  pictures and stickers wait for the upload pipeline.
- Two things can carry one: a **market** (Priya's sleep market gets a moon) and a
  **denomination** (the dumpling run gets a dumpling).
- Blank is the default and stays blank. An empty stamp never gets a placeholder.
- A mark never carries meaning alone. The question, the unit's words and the alt text say
  everything; switch every mark off and the app still reads.
- Marks stay out of nav, buttons, status and the eight structural icons.
- A market's mark decides its ink, one of eight muted colour families (design.md 1.8). The
  creator can override it from the market screen; otherwise the mark's dominant hue snaps to
  the nearest ink, hueless marks fall back to a hash of the market id, and markets open between
  the same people avoid sharing an ink while fewer than eight are open. For emoji the hue is a
  lookup in `src/lib/ui/emoji-inks.json` (below), and balance is applied on the who's-in step, once
  the people are known.
- A unit is not a place, so a denomination's mark never takes an ink. Inside an obligation token
  it is a bare 16px glyph on the token's fill, 4px before the quoted words; anywhere else it sits
  in a 28px stamp on surface-2.

### The picker

The first step of asking is the question step: the question in serif, and above it an optional
mark row ("Add a mark", "Optional. It picks this market's colour."). Tapping it opens a picker
sheet: search over emoji names and tags, a Recent row with a dashed None first, category chips
as words, and an 8-column grid. A tap sets the mark and retints the whole step to the mark's ink
at once, and the sheet stays open to try another, which is how people learn what a mark does
without anyone explaining it. A face or a grey mark gets the market's hashed ink and one line
saying why. The same picker serves a denomination's mark, with no colour preview. Stickers get a
reserved "Your stickers" section above Recent when the upload pipeline exists, and nothing else
about the picker changes then. Full spec: design.md 3.29; boards `MarkPicker` and
`MarkPickerFrames`.

### The emoji ink table

`src/lib/ui/emoji-inks.json` maps every emoji to an ink or to `null` (hash). `scripts/emoji-inks.py`
builds it from Noto Color Emoji, the font the tile renderer loads, so a market's ink never
depends on which phone made it: 👕 is Sea everywhere, even on a phone that draws it blue.
Faces, cat faces and everything in People and Body are `null` (their colour is a template, not a
choice), as are marks with less than a quarter of their pixels in colour. Keys are normalised by
stripping U+FE0F and the skin-tone modifiers U+1F3FB to U+1F3FF, and lookups normalise the same
way, so skin tone never picks an ink. The keys are exactly the emoji the reference font can draw,
and the picker offers only those, so a mark can never become a blank box on a tile. The client
carries the table for the picker's preview; the server recomputes the ink from the same table at
creation and stores it. Regenerate the table whenever the renderer's font changes.

### Where a market's mark appears

The odds line (it rides the thumb, small and grey at 0%, full size and full colour at 100%),
the stamp on every list row (on the market's ink), the question band on the market's own
screen, the timeline kicker, both link tiles (the asking tile and the result tile), and the
push that says the market resolved.

### Schema

```sql
-- on markets and on denominations
mark_kind   text check (mark_kind in ('emoji','image','sticker')),  -- null = no mark
mark_value  text,                                                    -- the emoji, or a media_id
-- on markets only
ink         text not null check (ink in ('clay','ochre','olive','sea','slate','iris','plum','rose')),
ink_source  text not null check (ink_source in ('pick','mark','hash'))
```

Store the derived ink on the row when the market is created (and when the creator overrides
it), so balance can be checked across open markets without re-reading any pixels. Until the
upload pipeline ships, `mark_kind` is only ever `'emoji'`.

Sizes are fixed by the container, not by the asset: 20px in a kicker, 28px in a compact row,
40px in a list row, 44px in the question band, 64px on the question step. A denomination's mark
inside a token has no stamp at all, just the 16px glyph. Radii 6 / 8 / 10 / 12 / 16.

### Pipeline notes

- A picture mark is cropped square and stored at 256px. Same object store and signed-URL
  path as story media.
- A sticker keeps a 512px source with alpha plus a 256px derivative with the cream die-cut
  edge baked in (2px at 40px stamps and up, 1.5px at 28px, none at 20px). Bake it in, rather
  than drawing it with CSS, so the app and the tile renderer agree.
- Link tiles render server-side. Emoji will not render unless the renderer has an emoji
  font loaded (Noto Color Emoji with Satori, or the equivalent), and a picture mark needs the
  256px derivative fetchable by the renderer. Both are easy to forget and both fail silently
  as a blank box in a group chat, which is the worst place to find out.

## Stickers: a memory that becomes a mark

Deferred until the upload pipeline exists. The picker reserves a place for them and nothing more;
the notes below are for when that work starts.

When a market settles with a photo, the settled screen offers "Make a sticker": tap the
subject, the cutout lifts, one tap keeps it. John asleep on the couch becomes the mark on the
next market about John. Only people who could see the photo can see a sticker made from it.

Three ways to build it, cheapest first:

1. **Paste a cutout.** iOS 16 and later let people lift a subject out of a photo and copy it.
   The mark picker accepts a paste (the clipboard `paste` event), keeps the alpha, trims the
   transparent edges, pads to square and scales. No model; realistic for the hackathon.
2. **Tap-to-cut in the app.** MediaPipe's Interactive Segmenter runs in the browser: an image
   plus the tapped point returns a per-pixel confidence mask. Threshold near 0.5, feather 1 to
   2px, apply as alpha, crop to the bounding box, pad square.
3. **Automatic background removal.** IMG.LY's in-browser remover is AGPL-3.0, which is a problem
   for a closed-source app unless their commercial licence is bought.

For the ink, count only pixels with alpha over 0.5 and chroma over 0.04. A sticker usually
picks a truer ink than the photo it came from, because the background no longer votes.

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
resolved market, the memory screen and the settled screen ("Add yours from that night"). This is
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

**In the hackathon build.** Marks on markets and denominations, emoji only, through the picker.
The derived ink on every market, from the emoji table. Photos on resolved markets with
the full-width frame, credit and counter. "Add yours" on a resolved market. The asking tile and
the result tile, with the emoji font loaded in the server renderer.

**After.** Picture marks and stickers once the upload pipeline exists (paste first, then
tap-to-cut), video with inline playback, the "a year ago tonight" card, night-level grouping
("the rest of that night" on the memory screen), and per-group memory browsing.

**Not building.** Camera roll sync, auto-albums, face grouping, any notification that counts
photos, and any surface that shows media outside the story it belongs to.

## Acceptance checks

1. A market with no mark and no media renders correctly and looks deliberate, not empty.
2. Turning every mark off leaves every screen readable, including screen readers.
3. An asking tile for a market with an emoji mark renders server-side with the emoji visible
   at both ends of the empty line, and a result tile with a video shows its poster frame.
4. When stickers ship: a pasted sticker keeps its transparency, gets its die-cut edge, and picks
   an ink from its opaque pixels only.
5. A photo added three weeks after resolution appears in the story, in the strip and in the
   counter, credited to whoever added it.
6. Nothing anywhere counts how many photos a person has or has not added.
7. A market with a picked emoji has the same ink on every phone and on both of its tiles, and the
   picker offers no emoji the tile renderer cannot draw.
8. A denomination's mark inside a token has nothing behind it but the token's own fill.
