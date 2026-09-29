# Dareful design specification

The build reference for the Dareful client. Every value here is literal. Where a screen you need
is not in the canvas, the reasoning sections and the decision rules are what you build from, so
read those before improvising.

Canvas: the Design artifact "Dareful". Every board on it is now drawn in the current system, so
the canvas and this file agree; where they ever disagree, this file wins. Board names referenced
below match the artboards:

- System row: `Tokens`, `System2` (state, copy and the style budget), `Language`, `Marks`,
  `WeightSpec` (the odds line and the weight line), `Errors`, `Nav`.
- Screens row, in flow order: `Now`, `FirstRun`, `Main` (person view), `Story`, `MarkPicker`
  (the question step, interactive), `MarkPickerFrames` (the picker in four moments), `Ask`
  (who's in), `JoinLink`, `Join`, `Claim`, `MarketDock` (the interactive market screen),
  `BlindSlow`, `Voting`, `Split`, `Leaderboard` (settled), `Memory` (the memory it leaves), and
  to their right `SettledPhotos` (after it ends: adding photos) and `FarOff` (a number past the
  limit), then `OpenPhoto` (a photo while the market is open).
- `DockStates` (the sheet through a market's life), the link tiles (`TileAsk`, `TileAskRange`,
  `TilePhoto`, `TileCalled`, `TileInChat`), and the ink boards (`Inks`, `InkCompare`).
- New rows under the inks: pick-one markets (`PickOneMarket`, interactive; `PickOneEntry`;
  `PickOneResolve`), What's on (`WhatsOn`, as games; `GamePage`; `WhoWins`; `Margin`; `Endings`;
  `Notices`; `WhatsOnStates`; `FeedBallot`; and `WhatsOnFlow`, starting a game with one
  question), You (`You`; `YouEarly`), two rows for the eleventh session (`OneTap`, `ShareIcons`,
  `AddPhotos`, `Explainers`, `CutList`, `GotThisOne` and `CallOff`; then `Holdouts`,
  `PickOneSheet`, `NamedSubject`, `StickerFromPhoto`, `OnItsWay` and `WhosIn`), two rows for the
  twelfth session, motion (`MotionSet`, `Shells`, `TabsInstant`, `Presses`, `SheetMotion`,
  `ReducedMotion` and `MotionLayers`; then `OpenMarket`, interactive, `OpenMarketFrames`,
  `OpenFrom`, `AskSteps`, interactive, and `AskStepsFrames`), a row for the thirteenth session,
  the information sheets and the opening (`InfoCorner`, `InfoSheet`, `InfoRules`, `Opening` and
  `OpeningSpec`), a row for pass the phone (`PassThePhone`, built in Round B, part 3), a row for
  the contract redeploy only (`SpreadRedeploy`), which must not be built before it, and a last
  row for the light theme (`LightScreens`, `LightRules`, built in Round D).

Market colours on boards other than `Inks` and `MarkPicker` are illustrative and were drawn
before the emoji ink table existed (1.8). Where a board and `src/lib/ui/emoji-inks.json`
disagree, the table wins.

The developer builds from this text, and a board export has come out blank before, so every
screen that matters is specified here in words: the market screen and its sheet (3.24, 3.25),
what happens after a market ends and the memory it leaves (3.37), and the rest of the screens
(3.38). Where a board is older than its text, 3.38 says so, and the text wins.

Target: mobile web, installable as a PWA, 390px reference width. Tailwind plus shadcn/ui. Dark
is the default theme, and the light theme specified in section 8 ships beside it (built 2026-09-28,
Round D), following the phone's setting, with an Appearance row on You.

### What changed in this revision

(Merged 2026-09-28, Round D: the twelfth and thirteenth sessions worked from the copy that
preceded Round A, and their combined file was merged three ways onto the repository's copy, which
carries every dated amendment since; the seams and how each was resolved are in
docs/decisions.md, "Round D". Where a session's words and a later ruling disagreed, the ruling
stands, dated in place.)

This revision covers the thirteenth design session, the information sheets and the opening,
only. It builds on the twelfth session's copy, the one with section 9 on motion, and the
developer applies both onto the repository's file together. Everything not listed here is
unchanged from that copy. Almost all of it is the new sections 10 and 11; other sections change
only where these need them to, and each is named below. Each item says what it asks of existing
code.

1. An information icon on every screen (new 10.1 to 10.3; 3.17, 3.29, 3.38, 6.3, 6.4). For the
   hackathon, every full screen a person can look around carries a 22px circled-i at its top
   right, in `--ink-2`, named "What you can do here"; modal sheets, pass the phone's PIN steps,
   the opening, the camera and system prompts don't. The icon owns the corner on every screen,
   and whatever sat there moves one place left, into the same header row: More on a market, a
   person view, a game page and the signed-in link page; "Got a code?" on Now and on the
   question step. The full-screen photo's close moves to the top left and its counter to the
   centre. The four roots gain a 56px header row for the hackathon. 10.3's table says where each
   returns once the icon goes. Built code: the icon in every screen's header, the moved
   controls, and the roots' header row.
2. The rules for the sheets, and the worked example (new 10.4 to 10.8; 4.9, 9.11, 9.13). The
   sheet is a modal sheet on the current place's surface that opens to 88% of the screen at
   most, with a pinned header (the screen's name and a close), then the fixed line, then up to
   four groups in a fixed order: Gestures, Icons, Rules and timing, Everything else. An entry is
   a term of five words at most and one sentence of 90 characters at most, with an optional
   qualifier; a sheet holds sixteen entries at most. Gestures and icons are named by fixed
   words; a label the screen already shows is never narrated. The fixed line, word for word:
   "This sheet is here only for the hackathon, so every feature on every screen can be seen." It
   moves as a modal sheet (9.9) and follows the light theme by the token swap. 10.8 writes the
   sheet for a market while it's open, fifteen entries, with the swaps for number and pick-one
   markets. 4.9 now says the sheets sit outside its rule, since nobody meets one without asking.
   Built code: the sheet component, one sheet per screen and state written from the code, and
   the lint over them.
3. The opening (new 11; 8.1, 9.11, 9.13). The launch image, the app's first frame and the
   handoff to Now are one picture: the flat ground with the logo at the centre, then a fade into
   Now. The logo is a 120 by 120 CSS px placeholder, centred on the full screen, which the real
   logo replaces without anything else moving. iOS needs a launch image per iPhone size, in a
   dark and a light set, or it shows white; the first frame is inline HTML and style that
   repeats it exactly, in the phone's own scheme; once Now's shell has painted, the logo fades
   over quick and the ground over base. Nothing travels, nothing waits for data, and the logo is
   never held for show. Built code: the startup images and their link tags, the inline head
   style and `#opening` element, the viewport meta, and the handoff.
4. Canvas. A row under the motion rows: `InfoCorner` (the header row of every screen during and
   after the hackathon), `InfoSheet` (the worked example in six frames, four dark and two
   light), `InfoRules` (the sheet's anatomy, its words, and the example unrolled in dark and
   light), `Opening` (the sequence in dark and in light) and `OpeningSpec` (the placeholder's
   size and place, the timeline and the head). Existing boards are not redrawn with the icon,
   which is added by rule (10.3); 4.8 gains rows for the new boards. The export at
   `docs/design/reference/design.html` is regenerated, and it was opened in a browser to check
   that every board draws.

---

## 1. Tokens

### 1.1 Color

Root is 16px. All colors are opaque hex unless an alpha form is given.

The Light column ships (Round D, 2026-09-28). It is the value half of the light theme; section
8 gives the rules that are not a value swap, and they win where the two differ.

| Token | Dark | Light | Used for |
| --- | --- | --- | --- |
| `--ground` | `#121110` | `#F5EFE4` | App background, the only full-bleed surface, carries the grain |
| `--surface` | `#1C1A17` | `#FFFBF4` | Cards, sheets, the tab bar |
| `--surface-2` | `#26231E` | `#EDE4D4` | Tokens, tracks, chips |
| `--line` | `#383430` | `#DBCFBB` | 1px hairlines and dividers |
| `--line-strong` | `#4A453F` | `#C7B79C` | Dashed edges, tick marks, secondary outlines |
| `--ink` / `--chalk` | `#F2EDE3` | `#1B1815` | Primary text, and the fill of every primary button |
| `--on-chalk` | `#121110` | `#F5EFE4` | Text on a chalk fill |
| `--ink-2` | `#C4BCAE` | `#544A3D` | Secondary text |
| `--ink-3` | `#9A9385` | `#6C6153` | Captions, metadata, quiet marks, the 13px floor |
| `--live` | `#E4E34A` | `#E4E34A`, with its edge (8.5) | Citron. Only a 6px dot or a 2px rule, only for "needs you, with a clock" |
| `--live-edge` | `transparent` | `#1B1815` | A 1px edge outside the citron dot and a keyline either side of the citron rule, light only (8.5) |
| `--remove` | `#E5534B` | `#D93F37` | Behind the remove glyph in Now's swipe action, and nowhere else (3.15) |
| `--archive` | `#F4B73E` | `#E8A623` | Behind the archive glyph in Now's swipe action, and nowhere else (3.15) |
| `--scrim` | `rgba(18,17,16,0.78)` | `rgba(18,17,16,0.78)` | Chips sitting on media |
| `--scrim-play` | `rgba(18,17,16,0.70)` | `rgba(18,17,16,0.70)` | Play button plate on media |

Marigold (`#F4B73E`) is retired. Its three jobs split: the primary action became a chalk fill,
what happened became ink carried by form (a filled disc, a cream cap on the call line, a
hairline rule for today), and "needs you, with a deadline" became `--live` at 6px. One colour in
the product carries urgency, it never exceeds a dot or a 2px rule, and it never carries a
number. If you find `#F4B73E`, `#1D1608` or any `rgba(244,183,62,…)` in the build, it is a
leftover.

Migration from the first palette, as a find and replace: `#17140F` → `#121110`, `#211D17` →
`#1C1A17`, `#2B261F` → `#26231E`, `#3A3329` → `#383430`, `#4A4236` → `#4A453F`, `#F5EDE0` →
`#F2EDE3`, `#C7BBA8` → `#C4BCAE`, `#9D9181` → `#9A9385`.

Grain: the shell renders one fixed, pointer-events-none layer over `--ground` with a 120px noise
tile at 3% opacity. On a market's own screen it sits over that market's ground.

Person hues. Assigned per person at account creation, stable across every group. Avatar initials
are always `#121110`, in both themes.

| Token | Fill | Text-on-light variant |
| --- | --- | --- |
| `--person-lilac` | `#B9A5F3` | `#6A55B5` |
| `--person-aqua` | `#7DCFD8` | `#2F7F88` |
| `--person-orchid` | `#ECA6D8` | `#A24F8B` |
| `--person-sky` | `#8DBAF6` | `#3A6FB5` |
| `--person-sand` | `#DCC494` | `#86703F` |
| `--person-stone` | `#CBBFAE` | `#75695A` |

Derived alphas, used literally:

- Token border in a person's hue: `rgba(<hue>, 0.55)`, e.g. aqua `rgba(125,207,216,0.55)`.
- Leaderboard gap bar fill: `rgba(<hue>, 0.40)`.
- Selection ring on a row or tile: `inset 0 0 0 1px rgba(<hue>, 0.50)`.
- The true half of a resolved call line: `rgba(242,237,227,0.16)` on neutral surfaces; on the
  market's own screen, its ink at 0.40 (Ochre `rgba(180,155,104,0.40)`).

There is no red token and no green token for a state, a value or an error. The two swipe colours
above are the one exception, and they belong to a gesture rather than to anything on the screen:
red behind the remove glyph and amber behind the archive glyph on Now (3.15), never as text,
never on a market, and never beside a number. The amber is the retired marigold, kept well
warmer than the citron so the needs-you dot keeps its meaning. Hues between 345° and 25° and
between 75° and 165° are unused by person hues on purpose, so nothing in the product can read as
loss or gain. `destructive` in shadcn maps to `--ink` with a confirmation step, not to a color.

shadcn mapping:

```
--background: var(--ground)        --card / --popover: var(--surface)
--muted / --secondary / --accent: var(--surface-2)
--border / --input: var(--line)    --foreground: var(--ink)
--muted-foreground: var(--ink-3)   --primary: var(--chalk)
--primary-foreground: var(--on-chalk)   --ring: var(--ink)
--destructive: var(--ink)
```

On a market's own screen, the four structural tokens are swapped for that market's ink layers
(1.8): `--ground`, `--surface`, `--line`, and the question band on `field`. Everything else
stays.

### 1.2 Type

Two families, loaded from Google Fonts with `display=swap`:

```
Young Serif       400 only          fallback: Georgia, 'Times New Roman', serif
Hanken Grotesk    400 500 600 700   fallback: 'Helvetica Neue', Helvetica, sans-serif
```

Numerals that sit in a column, a table, a bar or a readout use `font-variant-numeric:
tabular-nums`.

| Token | Family / weight | px | rem | line-height | Where |
| --- | --- | --- | --- | --- | --- |
| `serif-xl` | Young Serif 400 | 40 | 2.5 | 44px | One per screen at most: claimant, first run |
| `serif-l` | Young Serif 400 | 26 | 1.625 | 32px | The question on a screen or a story card, and an outcome line |
| `serif-m` | Young Serif 400 | 17 | 1.0625 | 22px | A question inside a row or a list (was 20/26) |
| `numeral-hero` | Young Serif 400 tabular | 60 | 3.75 | 60px | The number-entry field, and nowhere else (3.26). A settled number is a `serif-l` sentence |
| `numeral` | Hanken 600 tabular | 15 / 20 | 0.9375 / 1.25 | 20px / 24px | 15 for figures in rows, tokens and tables; 20 only inside a control (the riding percent at 700, the code boxes) |
| `body` | Hanken 400, 600 | 17 | 1.0625 | 24px / 22px | Running prose at 400, the subject of a row at 600 |
| `body-sm` | Hanken 400 | 15 | 0.9375 | 20px | Supporting lines, token sentences |
| `label` | Hanken 600 | 13 | 0.8125 | 16px | Section labels and kickers |
| `caption` | Hanken 400 | 13 | 0.8125 | 18px | Metadata, clocks, helper text |

The cap counts sizes, not tokens. A size is a family at a pixel size: Hanken 13, Hanken 15,
Hanken 17, Young Serif 26, and so on. Weight is free inside a size, the way `body` has always
carried both 400 and 600, so `label` and `caption` are one size, and `body-sm` and `numeral` 15
are one size. A screen may use at most four sizes, and at most one of them may be serif. The
same serif size may appear twice (a screen's question and its outcome are both `serif-l`). At
any one size, use at most two weights, 400 and 600.

Not counted: text inside a control (buttons, chips, inputs and textareas other than the ask
flow's question, the odds line's riding percent, the code boxes, the number field), text inside
an obligation token (its quoted serif words and its dollars included), and the wordmark, which
is a logo. Controls and tokens carry fixed type of their own and read as objects on the page
rather than as more of its text. This is also why `numeral-hero` no longer needs an exception:
it lives inside the number field. Counting is mechanical, so it is a lint rule (4.8).

A consequence worth knowing: a screen whose headline is `serif-xl` (the claimant screen, first
run) sets any questions it lists in `body` 600 rather than `serif-m`.

13px is the floor. Nothing in the product is smaller, including legal and timestamps.

Uppercase with `letter-spacing: 0.04em` to `0.06em` appears only on spec-sheet eyebrows and the
two in-app section labels on the split-ruling screen ("THE CALL", "WHAT IT MOVES"). A 13px 600
sentence-case label is the in-app default.

Never bold inside a sentence. Weight distinguishes a line's role, not a word inside a line.

### 1.3 Spacing

4px base. Named steps, all used literally:

```
space-1  4px      space-2  8px      space-3  12px     space-4  16px
space-5  20px     space-6  24px     space-7  28px     space-8  32px
space-10 40px     space-14 56px
```

Fixed applications:

- Screen gutter: 20px left and right, every screen. The question band and the cards directly
  under it on a market screen sit at 12px, so the band reads as the market's own surface.
- Card padding: 14px vertical, 16px horizontal. Cards that contain a media frame use 0 padding
  and pad their text blocks instead, so the frame goes edge to edge.
- Gap between cards in a timeline: 12px. Gap between a date header and its card: 12px, with 8px
  extra top padding on the header itself.
- Gap between labelled sections on a screen: 28px.
- Gap between lines inside a card: 6px to 10px; 8px is the default.
- The sheet: 16px top (8px when it has a grabber), 16px sides, 24px bottom, 10px between its
  rows.
- Media frame to the text under it: 12px. Media strip under a frame: 6px gap, 60px squares.

### 1.4 Radii

Soft 16 to 18px corners everywhere are part of what reads as generated; 10 and 12 read as
printed cards.

```
6px    mark stamp at 20px, odds-line segment at rest (3px on a 6px bar)
8px    mark stamp at 28px, distribution column
10px   button, chip button, list row, picker row, mark stamp at 40px, media thumbnail
12px   card, question band, sheet (top corners only), mark stamp at 44px, media frame
16px   mark stamp at 64px, large panel
999px  token, chip, avatar, bar track, pill, the Start button
```

### 1.5 Elevation and borders

No shadows for elevation, the sheet included. Depth is surface steps plus 1px `--line`: the
sheet is `--surface` (or the market's surface) with a 1px line along its top edge, over content
on `--ground`. Three sanctioned uses of `box-shadow`:

1. Avatar ring where pins or stacks overlap: `0 0 0 2px <the surface behind it>` at 28px and
   under, `0 0 0 3px` at 32px and above.
2. Selection ring: `inset 0 0 0 1px rgba(<person hue>, 0.5)`. Your riding percent on the odds
   line uses the same idea at 1.5px.
3. The claimant screen's photo prints: `0 10px 24px rgba(0,0,0,0.45)`, because they are meant to
   read as physical objects. Nothing else in the app uses a drop shadow.
4. In the light theme only, the citron's edge: `0 0 0 1px var(--live-edge)` on the dot, and a
   1px keyline above and below the rule (8.5).

Border conventions: solid 1px `--line` is a normal boundary. Dashed 1px `--line-strong` means
the thing has not happened yet (an upcoming plan, an unset mark, "nothing changes hands", the
naming prompt, a draft's band edge, and someone asked who isn't in yet, 3.1). The add tile and
the empty slot take it at 1.5px, because each is a control for something that hasn't happened
(3.8). Never use dashed for errors.

**No glass, in either theme.** No frosted or translucent surfaces: no `backdrop-filter`, no
blurred bars, no see-through sheets. Three reasons. A web app can only approximate a native
material with a blur, and an approximation reads as a web page dressed as a native app. The CSS
that produces the blur makes an element the containing block of every fixed element inside it,
which is the class of bug that still stops the tab bar and the pinned sheet from staying put in
the installed app. And the look v2 built, opaque surfaces on a grained ground with ink carrying
place, is what answered the tester who said the app looked AI-made. The tab bar, the pinned
sheet and every modal sheet are opaque surfaces with a 1px line. Scrims on photos are the only
translucency, and they carry no blur.

### 1.6 Targets and motion

- Minimum hit target 48px. Primary action 56px. Inline secondary action 44px.
- An icon-only control may be drawn at 28px, but its tappable box is 44px via padding.
- Motion: section 9. Three durations (quick 120ms, base 200ms, travel 320ms), three curves
  (move, leave, fade), a 40ms stagger and a 1.2s loop; nothing moves on any other timing (9.1).
- The sheet moving between its two heights: 320ms `cubic-bezier(0.2, 0.8, 0.2, 1)` (travel on
  the move curve), and none while a finger is dragging it (9.9).
- The odds line growing into the weight line on entry: each segment over 320ms on the same
  curve, 40ms after the one to its left (3.13, 9.10).
- The mark riding the odds line follows the finger with no transition, so it never lags; a tap
  that places the value moves it over 120ms (9.10).
- No parallax, no confetti, no celebratory animation on a resolution. The settled screen is not
  a win screen.
- Respect `prefers-reduced-motion`: drop the travel, keep the state changes; 9.11 gives each
  transition's quieter version.

### 1.7 Marks

A mark is user-supplied: an emoji, a square picture, or a sticker (a cutout with transparency).
It always sits in a stamp:

| Context | Stamp | Radius | Glyph size | Background |
| --- | --- | --- | --- | --- |
| Inside a token, a kicker | 20px | 6px | 13px | The market's `field` |
| A compact row | 28px | 8px | 16px | The market's `field` |
| A list row (Now, starters) | 40px | 10px | 22px | The market's `field` |
| The question band | 44px | 12px | 24px | The market's `ground` |
| The question step (3.29) | 64px | 16px | 34px | The market's `ground`, since the stamp sits in the band on `field` |
| A unit's mark inside a token | none | none | 16px | None. The glyph sits on the token's fill, 4px before the quoted words |
| A unit's mark anywhere else (unit lists, the unit editor, You) | 28px | 8px | 16px | `--surface-2`, never an ink |

A picture mark fills the stamp, cropped square, served at 256px. A sticker is fit to 80% of the
stamp with its transparency kept, and carries a cream (`#F2EDE3`) die-cut edge baked into its
256px derivative (dilate the alpha, fill it cream, composite the sticker over it), so the app
and the tile renderer draw one edge and no CSS shadow is involved. One derivative can't be 2px
at every size, so the edge is sized for the 40px stamp, where it is 2px; the same derivative
reads 1.4px at 28px and 3.2px on the 64px question step, and the 20px stamp draws the bare 512px
source with no edge. Stickers are rows in their own table, `picture_marks` (3.28). No mark
renders nothing in app surfaces; the dashed empty stamp exists only on the question step and as
the picker's None cell (3.29).

A market's mark also decides its ink (1.8), and it rides the odds line (3.13).

A unit is not a place, so a unit's mark never takes an ink. A market's stamp is inked because it
is a small window into that market's screen; a unit has no screen, and an inked stamp inside a
token would put one market's colour on an obligation that outlives the market. Inside a token
there is no stamp at all: a filled square inside a 32px capsule is a box in a box, and the glyph
reads on its own. Emoji only for now, and not yet reachable: no screen makes a unit with a label
of its own, so the picker has nowhere to open from for a unit (3.29). Picture and sticker marks
for units use the same two rows once that screen exists.

**Team stamps.** On What's on, a team appears as a stamp: the abbreviation the feed supplies
("BUF", "KC") on the team's colour, which the feed also supplies. The abbreviation is Hanken 700
at 0.42 of the stamp for two letters and 0.36 for three, in whichever of `#121110` and `#F2EDE3`
has more contrast with the colour, and the stamp carries a 1px inset ring at
`rgba(242,237,227,0.16)`, so a navy or maroon team keeps its edge on the dark ground. The radius
is a quarter of the size. Sizes: 20px only beside the team's name in words, 28px in a list row,
44px in a game's header, and 18 to 60px on a slider (3.40). A stamp is a mark, outside the type
floor and the budget, which is why its smallest size never appears without the name beside it.
No team logos anywhere: they are trademarks the leagues police, and a logo that grows and
shrinks is exactly the kind of use that draws attention. Abbreviations and names, used to say
who is playing, are fine. A team's colour appears only inside its stamp (4.5).

### 1.8 Market inks

Every market is its own place. Eight inks at matched OKLCH lightness and chroma, so no market
can shout louder than another. Each has six layers:

| Ink | Hue | ground | surface | field | line | ink | ink-hi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Clay | 45 | `#18110E` | `#221916` | `#3C281F` | `#3F322C` | `#C69078` | `#E4BAA7` |
| Ochre | 85 | `#15120C` | `#1F1B13` | `#362D19` | `#3B3529` | `#B49B68` | `#D5C29C` |
| Olive | 112 | `#13130D` | `#1C1D14` | `#2E301B` | `#35372A` | `#9FA36D` | `#C4C8A0` |
| Sea | 192 | `#0C1514` | `#131E1E` | `#173332` | `#283938` | `#63AEAA` | `#9BD0CD` |
| Slate | 248 | `#0E1318` | `#161D23` | `#202F3E` | `#2D3740` | `#79A3CB` | `#A9C8E7` |
| Iris | 288 | `#121218` | `#1B1B23` | `#2D2B3E` | `#353440` | `#9C97CB` | `#C2BFE7` |
| Plum | 330 | `#161115` | `#20191F` | `#382836` | `#3C313B` | `#BA8EB5` | `#D9B8D5` |
| Rose | 8 | `#181012` | `#23191A` | `#3D272A` | `#403133` | `#C88B95` | `#E5B6BD` |

Layer levels in OKLCH: ground L 0.185 C 0.013; surface 0.225, 0.016; field 0.30, 0.034; line
0.33, 0.022; ink 0.70, 0.075; ink-hi 0.82, 0.055. Cream text on every field is 11.6 to 11.9:1,
and ink on its own ground 6.8 to 7.2:1.

Where it goes:

- On the market's own screen (and the ask flow once a mark is picked): ground, card and sheet
  surfaces, hairlines, and the question band on field. The full ink colours the stake columns,
  the market's state mark and the resolved call line's wash.
- Everywhere else: only the stamp behind the mark, on field. A list stays one calm surface with
  small windows in it.
- On link tiles: field is the tile's ground, ink-hi carries the type that is not cream.
- Never tinted: the tab bar, the back control, type colours, the chalk button, the citron dot,
  person hues.

How a mark picks its ink, in order:

1. The creator's pick, if they made one: one tap from the market screen, never a step in
   creating it.
2. Otherwise the mark's dominant hue. For emoji this is a lookup in
   `src/lib/ui/emoji-inks.json`, computed once by `scripts/emoji-inks.py` from Noto Color Emoji,
   the font the tile renderer loads, so a market's ink never depends on which phone made it. The
   measurement: render at 109px, keep pixels with alpha over 0.5, ignore pixels under OKLCH
   chroma 0.04, build a 10° hue histogram weighted by chroma, and take the chroma-weighted
   circular mean within 15° of the heaviest bin. That hue snaps to the nearest of the eight, and
   the mark's own lightness and chroma are thrown away. The folds: hues from 345° round to 20°
   go to Rose, as do hues from 20° to 40° when their mean chroma is 0.14 or more (the
   lower-chroma browns in that band go to Clay), and greens from 120° to 165° go to Olive. A
   sticker gets the same measurement on its own pixels when it is pasted (`nearestInk` mirrors
   the three folds), which is why a cutout picks a truer ink than the photo it came from: the
   background no longer votes. A square picture mark, when there is one, is measured the same
   way.
3. Hueless marks fall through to a hash of the market id. The table stores them as `null`. Two
   kinds: marks where fewer than a quarter of the opaque pixels carry colour (🍸 🏁 ⚽ ☕ 🐺), and
   marks whose colour is a template rather than a choice, which is every smiley and cat face and
   everything in People and Body. Skin tone never picks an ink.
4. Balance last, on the who's-in step, once the people are known: among markets open between the
   same people, no two share an ink while fewer than eight are open. A collision moves the
   newcomer to the nearest free ink by hue, which retints the who's-in step over 200ms. This is
   what stops beer turning every Friday market Ochre.

The table, in practice: 1,907 emoji, 1,210 with an ink and 697 `null` (506 templates, 191
greys). It leans on Rose (358) and Slate (294) and is thin on Iris (16) and Plum (27), because
emoji are mostly red, orange and blue; balance is what spreads a group's markets back out.
Worked examples: 🌙 🍺 🎂 🍕 Ochre, 🏀 Clay, 🐸 Olive, 👕 Sea (teal in the reference font, even where a
phone draws it blue), 🌊 🚆 Slate, 🔮 Iris, 🍷 ❤️ Rose, and 😂 👍 🏃 🍸 hashed.

Looking it up: keys are normalised by stripping U+FE0F and the skin-tone modifiers U+1F3FB to
U+1F3FF, and a mark is normalised the same way before the lookup. The table's keys are exactly
the emoji the reference font can draw (Noto Color Emoji 2.047, emojibase 17); seven newer ones
it cannot draw are left out, and the picker does not offer them, because the asking tile would
show a blank box. Regenerate the table whenever the renderer's font changes.

Where it runs: the client carries the table so the picker can preview the ink as the mark is
picked (3.29). The server computes the ink again from the same table when the market is created,
and that answer is the one stored, as `ink` plus `ink_source` (`pick`, `mark` or `hash`) on the
market row, so balance can be checked without re-reading any pixels.

Arguments get an ink the same way, which usually means a hash, because most arguments have no
mark.

The light theme's layers for all eight inks are in 8.4, built in Round D.

---

## 2. The two decisions that propagate

Everything in section 3 is an instance of these. If you are building a screen that does not
exist yet, this is the section that tells you what to do.

### 2.1 Obligation direction without profit and loss

**The problem.** Every obligation has a direction, and both directions appear in the same
list. "Gabe owes you three beers" and "you owe Gabe three beers" are opposite facts on one
screen.

**Why the obvious encoding is wrong.** Green and red, or plus and minus, is an accounting
encoding. It says one direction is a gain and the other is a loss. That is false here: being
owed a beer by a friend is not income, and owing one is not a liability. The whole thesis of
the product is that these obligations are a reason to see each other again. An encoding that
scores them destroys the thing it is displaying, and it drags in the rest of the accounting
vocabulary with it, which is where the aging badges and the red counters come from.

**The encoding.** An obligation belongs to the person who picks up next. It is drawn as their
next move. Four channels carry it, none of which is valence:

1. **Side.** Their obligations sit on the left, yours on the right. This is the convention a
   text thread already taught every user, and it costs no color and no symbol.
2. **Hue.** An obligation wears its owner's person hue, as the avatar inside its token and as
   the token's border at `rgba(hue, 0.55)`. Both sides are drawn at identical size and weight.
   Hue identifies a person; it never rates an outcome.
3. **Grammar.** "Gabe's got you." "You've got him." "John's got Theo." This is the same verb
   as "I got this one," so a lost bet and a covered dinner speak one language, and the
   sentence is forward-looking rather than a statement of debt. Banned in copy: owes, debt,
   balance, owed, outstanding, overdue, up, down, net, settle up as a noun.
4. **Anatomy.** Inside the token, the owner's avatar sits at the owner's end: leading on the
   left for theirs, trailing on the right for yours. A token torn out of its row still says
   who is buying.

**Consequences you must honor in new screens.**

- The same unit between two people nets before display. Beers never appear on both sides of a
  header. Different units do not net: two beers one way and a coffee the other is two tokens.
- A third-party obligation (neither side is the viewer) has no side to sit on. Use sentence
  order with the owner's avatar leading, left aligned, and put the unit glyphs at the right end
  of the row: `[J] John's got Theo ...... 🍺🍺`.
- When a row is too narrow for sides, keep the token anatomy and the sentence. Anatomy is the
  fallback channel; position is the enhancement.
- Never render a zero. Two people square on a unit produce the word "even," not "0."
- Screen readers get the sentence, not the position: every token carries an `aria-label` of
  the form "Gabe's got you two beers." Direction must never be position-only.
- Nothing ages. No "60 days," no count of what someone has owed you over time, no badge that
  accumulates. If a new screen needs to show that a lot of time has passed, it says it once in
  prose without a number.
- Parity that nobody expects to settle is shown as the rally: a sequence of who picked up the
  last twelve unsettled rounds, one row per person, a 12px dot for a pick-up and a 4px
  `--line-strong` dot for a slot they did not, with a sentence under it. No count, no ratio.

### 2.2 The visual language for denominations

**The problem.** Dollars, beers, rounds, coffees, "a next time," and anything a group invents
all appear in the same lists. Emoji is the obvious answer for the open-ended part, but it is a
poor default for the recurring core: emoji render differently on every platform, need a font
loaded in the server-side tile renderer, and turn a list into a sticker sheet in bad
light.

**The resolution: three classes, three treatments, plus an opt-in mark.**

1. **Standing units** get a drawn icon and a tally. Beer, round, coffee, next time. Repeat the
   glyph up to three (🍺🍺🍺), then switch to a numeral and one glyph (`5 ×` plus one). Drawn
   in-house at 2px stroke on a 24px grid so the app and the share renderer agree.
2. **Invented units and one-off favors** stay the words someone typed, in Young Serif, inside
   curly quotes: “dumpling run”, “loser picks the bar”. A count prefixes them as `2 ×`. The
   app never guesses an icon for them and never assigns a default emoji.
3. **Money** is a plain numeral, Hanken 600 tabular, no currency icon, no color, and always
   last in a set, after a 1px `--line-strong` rule inside the token. Whole dollars in lists,
   cents only on a detail sheet.

Ordering inside any mixed set: glyph tallies, then quoted words, then dollars. That ordering
is the display-level expression of "count before amount," which is why a person view says two
beers before it says $40.

**The mark is the escape hatch.** Because the icon set is closed at eight and can never keep
up with what a group invents, the creator of a market or a unit may attach a mark (section 1.7). It rides in front of the words and never replaces them: the words are what the
app relies on, so every screen still reads with marks off. Marks never enter nav, buttons,
status, or the structural icon set.

**The eight structural icons** (closed set): market, argument, covered, coming up, beer,
round, coffee, next time. Anything that feels like it needs a ninth is either a mark or a
word.

---

## 3. Component inventory

Every component with the states that matter. Where a state is not listed, it does not exist
and you should not invent it.

### 3.1 Avatar

Circle, person hue fill, `#121110` initial, Hanken 700. Sizes in use: 20, 22, 24, 26, 28, 32,
36, 44, 52, 56, 76. Font size is roughly 0.42 of the diameter (24px avatar → 11px initial).

States: **normal**; **stacked** (overlap `margin-left: -8px` at 26-28px, `-14px` at 56px,
`-16px` at 76px, ring in the surface behind, maximum four then a `+N` chip); **on media** (add
the ring, scrim chip behind any adjacent text); **unknown or unclaimed person** (hue
`--person-stone`, initial from the name they were invited under, plus a 1px dashed
`--line-strong` ring 2px outside it; this is also how someone who joined from a link without an
account appears, everywhere they appear, until they sign in, 3.17); **no name yet** (no question
mark: use the first character of the phone number's contact label, and if there is none, an
empty stamp-grey circle with an `aria-label` of "unnamed friend"); **asked, not in yet** (no
fill, a 1px dashed `--line-strong` ring and the initial in `--ink-3`, set 4px after the stack
and 4px apart rather than overlapping, so the people still out read apart from the people in;
3.42).

Long names never change the avatar; it is always one character.

### 3.2 Obligation token

Pill, height 32 in rows, 40 in the person-view header, 44 in spec contexts. Background
`--surface-2`, border 1px `rgba(hue, 0.55)`, radius 999. Padding: theirs `0 12px 0 4px`,
yours `0 4px 0 12px`.

Contents in order: owner avatar (theirs) / trailing (yours), glyph tally, mark plus quoted
words, rule, dollars. A unit's mark here is a bare 16px glyph on the token's fill, 4px before
the quoted words, with no stamp behind it (1.7).

States:

- **Single unit**: one glyph.
- **Two or three units**: repeated glyphs, 2px gap.
- **Four or more**: `4 ×` numeral plus one glyph.
- **Fraction** (cut 2026-09-28: no ruling is ever split, 3.38): `½ ×` plus one glyph. Fractions come only from split rulings and only in
  halves.
- **Mixed**: glyphs, then quoted words, then the rule, then dollars. If the pill would exceed
  the row width, drop to two stacked tokens on the owner's side rather than shrinking type.
  (Built 2026-09-28, Round D: one pill while up to three parts fit, the non-money parts beside the
  dollars; past that a second token under the first, dollars always in the last, `splitMixed`.)
- **Custom word too long**: truncate the quoted word at 18 characters with an ellipsis inside
  the closing quote, full text in the `aria-label` and in the detail sheet.
- **Unconfirmed** (claimant has not said yes): border becomes 1px dashed `--line-strong`, hue
  border drops away, and the row gains the confirm control. Never grey the text.
- **Settled**: the token is removed from the header and the row is not struck through. History
  keeps the event; the open header is only open items.
- **Zero**: not rendered. The line reads "Called it even."

### 3.3 Chip

Height 24 (metadata, group label) or 28-36 (interactive). Border 1px `--line-strong`,
transparent background, `--ink-2` text at 13px 500, radius 999. Selected state for a filter
chip: background `--ink`, text `--ground`, border `--ink`. Selected state for a choice among
words (the kind chips under the band, the picker's categories): `--surface-2` fill, a 1px
`--ink-3` border and `--ink` text. Disabled: text `--ink-3`, border `--line`, no fill,
`aria-disabled`.

**Stake chips** are a different control with the same name: three across, 44px, radius 10, 17px
600 `--ink`, a 1px `--line-strong` border, and the selected one filled `--chalk` with
`--on-chalk` text. For dollars they read "$5", "$10", "$20"; for any other unit, one, two and
three of it ("1 beer", "2 beers", "3 beers"). A 44px tertiary "Something else" under them swaps
the row for a whole-number field in the same unit. Chips never offer more than the terms' Stakes
row allows, so a smaller cap drops the chips above it. The smallest is selected when the sheet
raises, never the largest. "Just pride", no stake at all, becomes the first chip after the
contract redeploy: the deployed contract refuses a stake of zero, so until then the smallest
stake is one unit, and boards that draw "Just pride" are showing the redeploy.

### 3.4 Event card

One card per event in a timeline. Background `--surface`, border 1px `--line`, radius 12.

Anatomy: kicker row (a 20px mark stamp for a market, otherwise the 16px structural icon, plus
13px 600 label, context chip right), subject line (`body` 600 for a cover, `serif-l` for a
market or argument question), supporting line (`body-sm`, `--ink-2`), optional media, then a
divider and the consequence rows.

The kicker label names the kind: "Market · asked by Priya", "Argument", "Covered", or "Covered a
round" for a round.

Kinds and states:

- **Covered**: subject line, amount line, one consequence token. Optional 84px thumbnail.
- **Covered, off the tab** (nobody is paying it back): no consequence row, the line "Nobody's
  paying it back," and it feeds the rally instead.
- **Argument, clean**: question, ruling sentence, one consequence.
- **Argument, split** (cut 2026-09-28: no ruling is ever split, 3.38): question, the 60/40 bar, the ruling sentence, and either a consequence or
  "Nothing changes hands. It goes on the rally."
- **Market, resolved**: the story is one link and its consequences sit under it, outside it,
  because a control inside a link is not a control. The link: the kicker, the question, the
  media frame at 180 when there is media (with no controls on it), the outcome line in
  `serif-l`, the call line, ruler or pick-one rows (3.25), and when it happened. Tapping it
  opens the market's own screen (3.37). Under the link: the consequences between the two people
  in view. On a person view, a consequence the viewer is owed that is still open is its own
  move, the settle row (3.10); a closed one carries the settled or forgiven mark (3.23) before
  its sentence. Then a 44px tertiary to the full table ("The whole table, and 7 more between
  others").
- **Market, open**: question, participant stack with "4 of 6 in", the close time. The action
  lives on the market's screen, never on the card.
- **Upcoming**: 1px dashed `--line-strong` border, no fill, calendar icon, and at most one soft
  line tying an open obligation to the plan.
- **Voided**: subject line, "Nobody could tell, so it's void," no consequences, no toll, and no
  explanation of who failed to resolve it. **Expired** reads "Never settled." the same way.
  Either can carry a frame, since an ended market takes photos whatever its ending (3.37).
- **A game** (What's on, more than one question in the same group): one story for the night. The
  link: a kicker with the two 20px team stamps and "What's on · Chiefs at Bills", the final
  score as the subject in `serif-l` ("Bills 24, Chiefs 17."), the frame at 180 with the photos
  from every question of the game, one line per question (the question in `body` 600, then its
  outcome in the market's words and what the two people in view said: "Bills by 7 · you said
  Bills by 3, Gabe said Chiefs by 1"), and when. Tapping it opens the game page (3.33). Under
  the link, the consequences between the two people in view, one row per unit summed across the
  game's questions; settling a summed row closes each obligation in it. A game with one question
  is that question's ordinary story.
- **Loading**: only when the card is loading into a screen that is already on display (5.3); the
  card shape with 8px and 12px `--line`/`--line-strong` bars in place of text, hatched block in
  place of media, no shimmer, minimum 200ms on screen. A navigation never renders this.
- **Error**: the card shape with one `body-sm` line, "Couldn't load this one," and a 44px "Try
  again" text button. Never a red state.

### 3.5 Call line (binary markets)

Horizontal axis from No (0) to Yes (100). Track 6px in a card, 8px on a full screen, radius 999,
`--surface-2` (the market's field on its own screen). Midpoint divider: 1px `--line-strong`,
16px tall in a card, 24px on a screen. Labels under: "Said no" left, "even" centered, the
outcome or "Yes" right.

Pins: avatars at 24px in a card, 32px on a screen, 52px on a result tile, centered on the track
with a ring in the surface behind. Positioned at `calc(<value>% - <half pin>)`, with the
container inset so pins at 0 and 100 stay inside.

States:

- **Hidden** (the viewer is not in yet): no pins, no average, no count of who is ahead. A blind
  market is no different: nothing before you're in, everything after, and what makes it blind is
  that your entry is final (3.22).
- **Everyone in, unresolved**: full pins, no wash, no cap, labels "No / even / Yes."
- **Resolved**: the true half takes the wash (1.1) and the true end a solid cream cap, 4px wide
  in a card and 6px on a screen, 8px taller than the pins. The outcome label turns `--ink` 600:
  "Yes, he did" or "No, he didn't."
- **Collisions**: pins overlap like an avatar stack in entry order. Beyond six participants,
  cluster pins within 6% of each other into a single stacked avatar showing the first two plus
  `+N`, and put the full list in the roll call.
- **A result tile** (3.27): the person who called it wears an extra 2px cream ring outside their
  surface ring.

For number markets the same component becomes a ruler. Its ends are the lowest and highest of
the entries and the answer together, so the answer is always on it, with the padding rule from
3.22 when they sit within two of each other. The ends are labelled with their values, the unit
on the right end only ("12", "26 shirts"). Pins sit at each entry's value. The answer is a cream
tick 8px taller than the pins, 4px wide in a card and 6px on a screen or a tile. The off-axis
rule in 3.22 runs over the entries and the answer together, but the answer is never the one
pushed off: an off-axis entry sits as a pin beyond a 6px break in the track at that end,
labelled with its value and an arrow ("200 →").

### 3.6 Roll call

Grid of participants ordered by closeness, 5 columns, 4px gap, each cell 10px vertical padding,
`--surface-2`, radius 10: avatar 28, name 13px 600, number in 17px 600 tabular (it was `numeral`
20), "off N" caption.

States: **fewer than 5** (cells keep their width, grid left-aligns); **6 to 10** (wrap to a
second row); **more than 10** (first 10 then a "Show all" text button); **your cell** (the
selection ring); **tie** (identical "off" values share a position, prefix both with `=`);
**didn't enter** (not in the roll call at all).

### 3.7 Leaderboard row

Grid `22px minmax(0,1fr)`, 12px column gap, 8px row gap, 10px by 12px padding, radius 10.
Heading above the list: "Closest first".

Rank in 17px 600 tabular, `--ink-3` (it was `numeral` 20; this is the only built property the
revision changes). Avatar 36. Name `body` 600, "said 85%" caption under it. "off by 15" right,
`numeral` 15 `--ink-2`. Under that, the gap bar: 4px track (the market's field), the person's
segment from their value to the outcome end at `rgba(hue,0.40)`, a 14px dot in their hue at
their value, a 3px cream tick at the outcome end, and a 1px `--line-strong` tick at 50%.

States: **you** (background the market's surface plus the selection ring); **annotated** (one
13px `--ink-2` line under the bar, used when a result is counterintuitive, at most one per
screen: "Only 20%, and still closer than Gabe and John."); **tie** (same rank number, `=`
prefix, order alphabetically); **long name** (truncate at one line); **nine rows** (8px vertical
padding, nothing else changes); **number market** ("said 17" under the name and "off by 3" on
the right; the gap bar runs on the ruler's scale (3.5) from their number to a 3px cream tick at
the answer, and there is no 50% tick); **between two teams** (3.40: "said Bills 70%" and "off by
30", with the gap bar running to the winner's end, or to the middle for a tie; for the margin,
"said Bills by 9" and "off by 2" on the axis centred on a tie); **pick one** (no closest-first
list: everyone who called it scores the same, so 3.25 shows who called it instead);
**multi-choice, for the redeploy only** (3.36: "divided it" or "picked Priya" under the name,
and "gave it 30%" or "picked it" on the right; the gap bar runs from what they gave the answer
that happened to a 3px cream tick at 100%, and the 1px tick sits at the even split).

### 3.8 Media frame

Where a market's photos live: its own screen once it has ended, and its story card in a
timeline. Never on a link tile (3.27).

Full card width with no radius when it is edge to edge inside a card; radius 12 when it is inset
on a screen, 12px from the edges. Heights: 180 in a timeline card, 200 on the settled screen,
260 on the memory screen (3.37). The strip under it: 60px squares, radius 10, 6px gap, at most
five across: four photos, or three and a `+N` square, then the add tile for someone who can add
(below).

Always: a credit chip bottom left (`--scrim`, 28px tall, the 20px avatar and the first name of
whoever added it, plus the duration for video) and a counter bottom right (`1 / 7`, `--scrim`,
tabular). The counter counts position, never toward a limit.

**Order.** What the claim carried comes first. The photo or screenshot someone attached while
saying what happened is the resolving clip: it leads, credited to them (4.3). Then memories, in
the order they were added, so photos taken while it was open come first among them. A tap on a
strip square brings it into the frame, and `+N` opens the rest.

**Who adds, and when.** Anyone who was in the market: while it is open, with the camera (3.39),
and from the moment it ends, weeks later included. Ended means settled, voided or expired: a
void is not a night anyone won, and it was still a night. Someone in the group who wasn't in the
market sees the frame and never gets an add. Adding sends nobody anything.

**How.** Once it has ended, the phone's own picker, opened with no `capture` attribute, so the
library comes first: the night has already happened. (While it is open, the camera itself,
3.39.) Several at once. Each new photo lands at the end of the strip as the hatched placeholder
with its credit chip, and the control that started it is pending (5.2) until the last one is
stored. A photo that fails keeps its square in the strip with the camera glyph and the
didn't-go-through mark (3.23), and a tap retries. Forty-eight memories a market is the limit and
no screen counts toward it; at the limit the add tile leaves the strip, and photos picked past
it are left out with one 5.1 block under the strip, "This one's full.", never how full. Whoever
added a memory can remove it from its full-screen view at any time. Evidence stays, since a vote
or a ruling may rest on it.

**Where the files go.** Two derivatives, re-encoded so that nothing of the EXIF survives except
when it was taken: the frame at 1080px on its long edge and a 256px square. The bucket is
private. `/api/media/[id]` answers someone who may see the market with a redirect to a
one-minute signed address, and everyone else with 404, so nothing says whether a photo exists.
Video waits until the pipeline takes it; a clip on a board stands for a photo until then.

States: **photo**; **video** (56px `--scrim-play` circle with the play glyph, duration in the
credit chip, plays inline muted on tap, never autoplays with sound, never loops in a timeline);
**several** (the strip); **loading** (the hatched placeholder, no spinner before 300ms, then a
1.2s opacity pulse between 1 and 0.75); **failed to load** (hatched placeholder, camera glyph,
"Couldn't load," 44px "Try again"); **none, in a timeline card or for someone who can't add**
(the frame is not rendered at all); **none, on the market's own screen for someone who can add**
(the empty slot).

**The empty slot.** Where the frame would be, a 120px `button`, radius 12, a 1.5px dashed
`--line-strong` border and no fill. Centred in it, a 44px circle with a 1.5px `--ink` ring
around a 20px plus, and under it "Add the first photo" in 17px 600. Its accessible name says the
night ("Add the first photo from Friday"). It opens the phone's picker, and once the first photo
lands it becomes the frame, with the add tile ending its strip. It is drawn as the place photos
go, so it never reads as a heading; it is a control, so its words sit outside the type budget.
Board: `SettledPhotos`, frames A and C.

**The add tile.** A 60px square at the end of the strip, radius 10, a 1.5px dashed
`--line-strong` border and no fill, with a 22px plus in `--ink`. Its accessible name says the
night ("Add photos from Friday", from `fromThatNight`, 3.24). It shows for someone who can add,
once the market has ended and has at least one photo, and on a game's night (3.37); it opens the
same picker as the slot. It is never pushed off the row: with four or more photos the strip
shows three and `+N` before it. While the market is open, the same slot, frame and tile sit last
on the screen and open the camera (3.39). Boards: `AddPhotos`, `Leaderboard`, `Memory`,
`GamePage` frame D.

The hatched placeholder on a market's own screen uses its field and surface:
`repeating-linear-gradient(135deg, field 0 10px, surface 10px 20px)`.

### 3.9 Mark stamp

Sizes, radii and backgrounds in 1.7. States: **emoji** (rendered as text at the glyph size,
never as an image); **picture** (256px square derivative, `object-fit: cover`); **sticker**
(512px source with alpha, 256px derivative with the die-cut edge baked in, `object-fit: contain`
at 80%); **none** (nothing renders in app surfaces; layout closes up); **broken image** (falls
back to none, silently); **on the question step** (64px; dashed with a 24px plus when unset, the
mark on the market's ground when set); **in the picker** (3.29: the dashed None cell is the
no-mark option and the default selection; a picked cell takes the market's field and a 1.5px
inset ring in your hue).

### 3.10 Person-view header

Two columns, grid `repeat(2, minmax(0,1fr))`, 14px by 16px padding per column, radius 12, 1px
`--line` border, divider on the right column's left edge. Tokens at 40px. Above it, the identity
row: 56px avatar, name in `body` 600, and one caption ("43 things since March"). The name is not
serif: serif carries questions, outcomes and numbers (4.1).

States: **both sides** (caption plus token each side); **one side only** (that side keeps its
half, the empty half shows its caption and, under it, "nothing" in `--ink-3` 15px, so the layout
does not jump when it fills); **neither** (the header is replaced by a single 15px `--ink-2`
line, "Nothing open between you," and the timeline starts immediately); **many units** (the
token wraps to a second token under the first on the same side, dollars always in the last
token); **large counts** (numerals, never repeated glyphs beyond three).

**Cancelling out.** When the same unit runs both ways between the two of you, a row sits
directly under the header, one per unit: "Cancel out the $10 each way" in `body` 600, what each
has of the other under it in `caption` ("You've got Gabe $25. Gabe's got you $10."), and a 44px
row action "Cancel out". It opens a sheet that asks once, because it can't be undone: the chalk
"Cancel out $10 each way" and a tertiary "Not now". Either person can do it. An obligation the
cancelling empties reads as settled on its card, since 3.23 has no mark for it, and it appears
in nobody's Just happened. "Net" is never the word (2.1).

**Settling and forgiving.** The creditor's own rows are the move; everyone else's are rows.
Tapping one opens a modal sheet: first the photo row ("Add a photo of it", optional, with the
camera glyph and a 44px row action), then two acts at the same size, 56px: the chalk "Settled"
and a secondary "Call it even". Forgiving is a status move and is never hidden behind settling.
Either closes everything still open on that obligation. A photo goes up after the close and
never undoes it: if it fails, the sheet stays with "Try the photo again". The other person hears
it by name ("Gabe settled up", "Gabe called it even"), with the cover's memo when it has one,
and never the unit or an amount. A consequence a market minted closes the same way, from its
story (3.4).

### 3.11 Rally strip

Two rows, grid `24px repeat(12, minmax(0,1fr))`, 4px gap, 24px row height. Avatar 24 in the
first column, then one slot per recent unsettled pick-up: 12px dot in that person's hue when
they picked it up, 4px `--line-strong` dot when they did not.

States: **fewer than 12 events** (left-align, remaining slots are 4px dots); **fewer than 4
events total** (hide the rally entirely; it needs a pattern to show one); **all one side**
(render it, and the sentence carries the nuance).

### 3.12 Buttons

| Kind | Height | Radius | Fill | Text |
| --- | --- | --- | --- | --- |
| Primary | 56 | 10 | `--chalk` | `--on-chalk`, 17px 700 |
| Primary inline | 44 | 10 | `--chalk` | `--on-chalk`, 15px 700 |
| Secondary | 48 | 10 | transparent, 1px `--line-strong` | `--ink-2`, 17px 600 |
| Row action | 44 | 10 | `--surface-2`, 1px `--line-strong` | `--ink`, 15px 600 |
| Tertiary | 44 | 0 | none | `--ink-2`, 13 to 15px 600 |
| Icon only | 48 | 999 | transparent | `--ink`, glyph 22-24px, `aria-label` required |

States: **pressed** (opacity 0.88 on a control with a fill and 0.5 on one drawn only in lines
and words, the secondary, tertiary and icon-only kinds, set from `pointerdown` in the same frame
and released over 120ms, 9.4); **disabled** (`--ink-3` text, 1px `--line` border, no fill,
`aria-disabled`, no opacity trick); **pending** (5.2); **destructive** (secondary styling,
`--ink` text, and a confirmation sheet; no red, apart from the swipe-to-remove square on Now,
3.15).

At most one chalk-filled control per viewport. On a root, the Start button is that control. On a
market that only you are in, the share icon is (3.42).

### 3.13 The odds line

The entry control for a yes-or-no market, and the first state of the weight line (3.22). It
lives in the market screen's sheet (3.24). Drawn on `MarketDock` (interactive), `WeightSpec` and
`JoinLink`.

Header row: "What are the odds?" in `body` 600 on the left; on the right, the word band in
`caption` `--ink-2`, or "Slide to answer" before any touch. Bands: 0 "Not a chance"; 1-15 "Doubt
it"; 16-40 "Probably not"; 41-59 "Coin flip"; 60-84 "Probably"; 85-99 "Almost surely"; 100
"Every single time".

The plot, 120px tall inside the sheet's 16px sides plus 4px:

- **Track**: ten segments, 6px tall, 3px apart, radius 3, in the market's line colour,
  bottom-aligned 9px above the plot's base. Each segment fills from the left in your hue by its
  share of the value, so 70% fills seven. The segments are the ten buckets of the weight line,
  which is why they are ten.
- **Before any touch**: no thumb. The mark sits at both ends as a legend: 18px at 0.35 opacity
  and `saturate(0.1)` on the left, 60px at full colour on the right. Nothing starts at 50%,
  because a thumb parked at 50% anchors everyone on a coin flip.
- **Thumb**: 24px chalk disc, 3px ring in the sheet's surface, travelling from 12px to the width
  minus 12px: `left: calc(12px + (100% - 24px) * v)`.
- **Riding percent**: `numeral` 20 at 700 in a 28px pill, `--ground` fill, a 1.5px inset ring in
  your hue, centred over the thumb at the top of the plot. It sits above the thumb so a finger
  never covers the number being chosen.
- **The riding mark**: centred over the thumb, bottom-anchored 30px above the base, `font-size:
  18 + 42v px`, `opacity: 0.35 + 0.65v`, `filter: saturate(0.1 + 0.9v)` with v from 0 to 1. Low
  odds read small and faded, high odds big and bright, before anyone reads a digit. With no mark
  set, the percent pill does the job alone and nothing else changes.
- **Input**: a native `range`, 0 to 100, step 1, 44px tall, laid over the drawn line at opacity
  0 with `aria-label="What are the odds, in percent"`. Tapping anywhere on the line places the
  value. Arrow keys step by 1.
- **Ends**: "0%" and "100%" in `caption` under the line.

Under the plot, when the sheet is raised: the stake chips (3.3, three across, 44px) and the
primary button, which carries the whole entry: "I'm in at 70%, 2 beers". After the contract
redeploy, a no-stake entry reads "I'm in at 70%, just pride" (3.3). Every number is a whole
percent wherever it appears ("45%", never "4 in 10").

States: **untouched** (the legend, no thumb, the primary disabled and reading "Slide to pick
your odds"); **touched** (thumb, rider, fill; the first touch raises the sheet); **changing**
(reached from Change on the entry line: the sheet opens raised at your current value, a
secondary "Never mind" sits beside the primary, which reads "Save: 60%, 2 beers", and your own
share on the weight line above moves bucket with your finger, while the group's marker stays
where it was until you save, because moving it would need everyone's numbers on your phone
before lock); **locked** (the market closed: the line is gone from the sheet; your entry line
keeps "You're in at 70%" and its caption reads "2 beers · locked at 10:40pm"); **failed to
send** (known within the first second: the sheet stays raised with a 15px line "Your number
didn't send" and a tertiary "Try again"; the number is never silently dropped); **on its way**
(the app has the tap and it is still going through: the moment runs as usual, and the entry
line's caption leads with the on-its-way mark and "On its way" until it is through, 3.23, 5.2);
**didn't go through** (a miss after the moment: the entry line becomes the didn't-go-through
mark, "Didn't go through" and what was tried, "70%, 2 beers", with a 44px "Try again"; the
weight line and the icons leave, since you are not in, 5.2).

**Entering, as a moment.** Confirming lowers the sheet over 320ms, which carries the stake row
away. Then every segment grows from 6px to its column height, each over 320ms and 40ms after the
one to its left (9.10), your share of your column fills in your hue, your avatar rises to sit
above your column, and the group's marker draws last. At about 1.8s the sheet goes, since once
you're in nothing is your move, and the screen gains the entry line, "You're in at 70%", with
the full weight line under it and the icons at the end of the who's-in row (3.42). No toast, no
navigation. With `prefers-reduced-motion`, the resting state renders at once. The growth is the
reveal as well as the receipt: other people's weight is never visible before you are in.

### 3.14 Empty and first-run states

- **Now, before anything** (`FirstRun`): today's date as a label, the `serif-xl` headline
  "Nothing happens here until somebody else is in it.", the chalk "Ask something", the compact
  code field (3.16) under the `label` "Someone sent you a code?", and three games from What's on
  as game rows (3.32), under "Or start from something everyone's watching" and followed by a
  tertiary "See everything on What's on" (3.32). These were fixed starters: the row component is
  unchanged and only its label and source are new. The three are the most asked, or the next to
  close while there is too little to rank on (3.32). If nothing is curated, the old starters
  return. This is a bonus on the empty state; What's on itself lives on its tab. The Start
  button is hidden on this screen, because "Ask something" is already the chalk.
- **A person with no shared history**: identity block, "Nothing between you two yet," and a
  single starter.
- **A story with no media**: nothing. No frame, no prompt in the timeline. Adding lives on the
  market's own screen once it has ended (3.8, 3.37).
- **A claimant with nothing waiting**: the signup lands on Now, not on an empty inbox.
- **A market with no other participants yet**: the who's-in row reads "Just you so far", share
  is the screen's chalk (3.42), and on Now its Running row can be swiped away (3.15). Never a
  count of zero.
- **Offline**: a 28px `--surface-2` bar under the header, "Offline. You can still look around."
  Entries queue and send on reconnect.

### 3.15 Needs-you row

One `--surface` card, radius 12, rows divided by 1px `--line`. Each row is a grid of `40px
minmax(0,1fr) auto`, 12px gap, 14px padding. Left: the market's 40px stamp on its field colour,
or the owner's 40px avatar for an obligation. Middle: the subject (`serif-m` for a question,
`body` 600 otherwise, with the unit glyph inline for an obligation), then a meta line in
`caption` `--ink-3` that starts with the citron dot on the one row whose clock is soonest (one
citron element per viewport, 4.5; other rows with clocks keep the clock and lose the dot), then
the state mark, then the clock or the reason ("Voting ends at midnight", "From the tunnel
argument"). Right: a 44px row-action button whose label is the verb: Vote, Enter, Yep, Finish,
"Try again".

Running and Just happened use the same row without the button; Just happened may carry a 44px
media thumbnail on the right.

A Running row's meta line is the state mark, then your entry and how many are in ("You're in at
17 · six of you", or "You're in at 70% · just you so far" while nobody else is); once the market
locks, the mark and its clock ("Resolving tonight"). While your last tap on it is still going
through, the on-its-way mark stands in for the state mark ("On its way · you're in at 17",
3.23).

Ordering: anything with a clock first, soonest first; then longest waiting; then whatever is
fastest to finish.

States: **empty** (the section and its heading are removed entirely, not shown empty); **one
item**; **more than four** (show four, then a 44px "2 more" tertiary row); **resolved elsewhere
while on screen** (the row collapses over 200ms, no toast); **abandoned draft** (the dotted
ring, "You never sent this one", verb "Finish"); **didn't go through** (a routine tap that
missed after its screen moved on: the stamp, the question or subject, the didn't-go-through mark
and "Didn't go through", and the verb "Try again", which sends what was tried; it sorts with the
clocks when the market has one, 5.2); **acted on** (row collapses, the result shows up in Just
happened).

Never: a count badge on the heading, a number in an app icon, a red dot, or a row that reports
how long something has been waiting in days.

**Swipe actions** (`CallOff`). Two kinds of row on Now answer a left swipe, and no others do. A
Running row for a market you asked that nobody else is in slides 76px left over a `--remove`
square holding the 24px trash glyph in `--chalk`, named "Remove". A Just happened row for a
finished market (settled, voided or expired) slides over an `--archive` square with the 24px
archive glyph in `--on-chalk`, named "Archive". A tap on either opens a modal sheet that asks
once: "Remove this market?", "It leaves Now, and it counts against nobody.", the chalk "Remove
it" and a secondary "Keep it"; or "Archive this?", "It leaves Now. You can still find it from
the people in it.", the chalk "Archive it" and "Keep it". Then the row collapses over 200ms, a
section it empties goes with it, and nothing announces it. Every other row stays put when
swiped: a market other people are in isn't one person's to remove, and Needs you is never
cleared by hiding a row. No hint teaches the swipe. It is the platform's gesture, and nothing
depends on finding it.

Removing ends the market as a void only the asker can make, and only while they are its one
participant: the stake comes back, it never reaches Just happened, and You leaves it out of the
questions you asked, as it does expiry (3.34). Anyone the link reached who opens it later sees
the voided mark with "Called off Sun at 6:52pm", the outcome line "Called off." with the caption
"Nobody else got in.", and the details. Nothing on the market's own screen ends it. If the
deployed contract can't end a market before its close, say so: the row can instead leave Now and
the market expire at its close, which counts against nobody in the same way. Archiving changes
nothing but this person's Now: the market, its story and its photos stay where they were for
everyone, on the person views of the people in it included.

(Amended 2026-09-27, the owner's ruling. A game with more than one question in a set is one row
on Now (4.7), and it swipes as one: its Just happened row archives every one of its questions
here once the game is finished, and its Running row removes them together, only when nobody
else is in any of them. The ask names the game: "Remove this game?", "Its questions leave Now,
and they count against nobody."; the archive ask is the same as a market's. A game with a
question anyone else is in stays put, as a market does.)

### 3.16 Code input

Two forms of the same thing.

**Compact** (an empty Now): the focused form's six boxes at 48px tall with a 6px gap, sharing
the row with a 48px secondary Join. No placeholder: six empty boxes are the shape of a code, and
an example inside them reads as a code someone already typed (4.9). Typing, backspace and paste
work as below. Never `type="number"`.

**Focused** (the joining screen, headed "Got a code?" in `serif-l`, opened from the question
step's "Got a code?", 3.29): six boxes in a `repeat(6, minmax(0,1fr))` grid, 60px tall, radius
10, 1px `--line`, `--surface` fill, `numeral` 20, 8px gap. The active box takes the focus ring
(5.1). Typing advances, backspace retreats, and pasting six characters fills all six at once.
Join sits in the sheet and stays disabled until six are in.

Alphabet: A-Z and 2-9 minus O, I and Z, which leaves 31 unambiguous characters. Input is
case-insensitive and always displays uppercase, because the common case is one person reading it
off another person's screen in a dark room.

States: **empty**; **partially filled** (Join disabled); **full** (Join enabled); **invalid
shape** (5.1, at the field); **unknown or expired code** (the form-level block above Join, "No
market with that code. Worth checking the last two characters.", the typed characters kept);
**already a member** (no error at all: go straight in).

### 3.17 Arriving from a link or a code

A link, or the code scanned from someone's phone (3.42), opens the market's own screen, not a
preview card. The person lands in the market's ink, looking at the same empty line the asking
tile showed them, now under their thumb. It works for anyone, with or without an account, and it
is the first screen every invited friend sees. Board: `JoinLink`, seven frames.

**What the page names, and what the preview names.** Two rules, on purpose. The page names who
asked and the group, "Priya asked the Friday crew" in the band, because that is the reason
anyone joins. The preview that unfurls in a chat (3.27) names only the asker's first name and
that there is something to look at, because a preview is what gets forwarded furthest and
outlives the chat it was sent to. Neither says what anyone picked or what it could cost.

- **Header**: the wordmark on the left and nothing on the right when they are not signed in,
  because there is nowhere in the app to go back to. Signed in, the normal back and more. For
  the hackathon the information icon takes the right-hand corner in both, with More beside it
  (10.3).
- **Content** (frame 1): the question band (mark, state and close time, the question, "Priya
  asked the Friday crew"), the who's-in row before you're in, with a plain count ("Four friends
  are in"), and a `dl` of two facts: Decided, and How it works ("Everyone puts in their odds.
  Closest does best."). No stakes, no amounts, no leaderboard, no obligations, and no names
  beyond the asker's, the group's and the avatars'.
- **The sheet, at rest**: the odds line, untouched (3.13).
- **After sliding** (frame 2): the sheet raises to the stake chips and "I'm in at 70%, 2 beers",
  exactly as for someone signed in, because choosing a stake is the same act for everyone.
- **Who's joining?** (frame 3). When this phone doesn't know who they are, the primary raises
  the sheet one step further instead of sending: "Who's joining?" in `body` 600 with the entry's
  summary on the right in `caption` ("70% · 2 beers"), then two fields, each a `label` over an
  empty 48px field, "Your name" and "Your phone number". Under them one `caption`: "Nothing gets
  sent to it. Sign in with this number later and your entries are waiting." Then the chalk,
  which names who was typed ("Join as Alex") and stays disabled until both fields are filled,
  and a 44px tertiary "Have an account? Sign in".
- **Is one of these you?** (frame 4). Someone who joined this group before without an account
  can pick their name instead of retyping it. Suggestions appear only once the first letters are
  typed, and only for people without an account who joined this group's markets from a link and
  whose names start with those letters: at most three, as 40px chips with the stone avatar
  (3.1), under "Is one of these you?" in `label`. Nobody's name is shown to someone who hasn't
  started typing their own. Picking one fills the field, with a check.
- **A picked name needs its number** (frame 5). A picked name joins only with the number it
  joined with before. Any other number gets the field error (5.1): "That isn't the number Dani
  joined with. If you're not Dani, type your own name." Taking someone else's name therefore
  needs their number too, and a wrong tap says so at once. If it happens anyway, it shows twice:
  the entry wears the stone avatar with its dashed ring wherever it appears, and when the real
  Dani signs in with her number, the claimant screen (3.38) shows her every entry the number
  found, each one hers to keep or leave out.
- **In** (frame 6). A typed name counts as soon as it's entered, without waiting for the asker.
  The page becomes the market as anyone in sees it: the entry line with the stone avatar,
  "You're in at 70%", the weight line, and the who's-in row with its icons. This phone remembers
  them for this market until they sign in, so Change works here until the close. Before the lock
  the asker can remove the entry, from who's in (3.42), in case a forwarded link brought in a
  stranger.
- **Signed in** (frame 7): the raised sheet holds the stake chips and "I'm in at 70%, 2 beers",
  with "Joining as Sam · Not you?" under it, and nothing after it.

**The number, and signing in later.** No code is texted, because texting isn't set up. The
number isn't checked when someone joins; it is how their entries find them. When they sign in
with it, the claimant screen (3.38) lists what the number found, pressed by default, and they
keep what's theirs. Until then their entries stand under the name they typed, in stone.

**One place with passing the phone.** This page is one of two ways in. Opening the link or
scanning the code works for anyone, account or not; passing the phone (3.45) is for people with
an account, on a friend's phone. Both run the same steps in the same order: the market as anyone
sees it before they're in, the same entry sheet, "Who's joining?", and then in. Only the proof
differs, a name and a number here and a pick and a PIN there, and on a borrowed phone "No
account? Scan the code with your own phone" leads here.

**What the build should change.** The build's three departures stand, with these changes. The
caption: "code" already names the six letters that join a market (3.16), so a line saying no
code is sent reads as if something were missing, and 4.9 keeps a caption only for what the
screen can't show, which here is what the number is for. So it reads as above: the first
sentence keeps the build's reassurance without that word, and the second says what the number
does. The names: if the build lists "Is one of these you?" before anything is typed, it should
wait for the first letters, and a picked name should need its number, since a full list shows
every name without an account in the group to anyone the link reaches and makes a wrong tap one
tap away. The avatar: someone without an account wears the stone avatar with its dashed ring
everywhere, the who's-in list included. The stake chips stay as built.

States: **expired or settled** (the market's own screen in its settled state, read-only, with
the sheet reading "This one's finished" and nothing to join); **closed but unresolved** ("This
one closed at 11pm, so you can watch but not enter." in the sheet); **revoked or malformed
link** (the code screen with a form-level message).

(Amended 2026-09-28, built to the frames with Round B part 3: "Who's joining?" is its own step, raised by the
primary ("I'm in at 70%, 2 beers") with the entry's summary on its right, holding the two fields, the caption,
the chalk ("Join as Alex", waiting for the name alone and for the number too only when a name was picked) and
the 44px tertiary "Have an account? Sign in"; the name chips are 40px; the facts are two, Decided and How it
works; signed in, "Joining as Sam · Not you?" sits under the primary, and "Not you?" asks once before signing
this phone out; a revoked or malformed link is the code screen with the form-level line "That link doesn't
open anything. Ask for it again, or type the code they read you.", signed in or not.)

(Amended 2026-09-27, the owner's two additions. "That isn't the number Dani joined with"
confirms or denies a number, so wrong tries on a picked name are counted and refused past a few
an hour, whatever number is offered then. People can join without a number: the chalk waits for
the name alone, and for the number too only when a name was picked; a name that joined without
a number is never among the suggestions, since it could never be proved.)

### 3.18 Person row

56px minimum height, 12px gap, 36px avatar, name in `body` 600, and the person's open
obligations as a single token on the right, keeping the anatomy rule so ownership survives the
compression (owner's avatar leads for theirs, trails for yours). "Nothing open" in 13px
`--ink-3` when there is nothing. Long names truncate to one line; the avatar never changes.

### 3.19 Context chip

36px tall, radius 999, 1px `--line-strong`, transparent fill, 15px 500 `--ink-2`, tap area
padded out to 44px. An optional count sits after the label in 13px `--ink-3`. A set of people
that has not been named takes a dashed border and shows first names instead
("Priya, Gabe and you"), which is the same "not a settled thing yet" meaning the system
already uses for upcoming plans.

A context chip appears in exactly four places: on an event row, where it says which set of
people an event came out of; in the shared-context band on a person view (3.21); in the
same-people picker (3.20); and under a game page's header, when you are on the game with more
than one group, to switch between them (3.33). It is never a list on home, and tapping one never
navigates into a group as a place. On the person view it filters the timeline; on an event row
it is a label and is not interactive.

States: **unselected**; **selected** (`--surface-2` fill, `--ink-3` border, and a 44px Clear
tertiary appears beside the row); **unnamed set** (dashed border, first names, three names
maximum then "and N more"); **just the two of you** (the label is "Just you two", never an
empty group name).

### 3.20 Same-people picker row

One row per candidate set, in a `role="radiogroup"` labelled "Who's in". Each row is a `button`
with `role="radio"`. Grid `auto minmax(0,1fr) auto`, 12px gap, 12px by 14px padding, radius 10,
1px `--line`, `--surface` fill (the market's once a mark is picked). Left: an avatar stack at
32px with `-10px` overlap, three maximum, then a `+N` disc on field. Middle: the label in `body`
600 and a caption in `--ink-3`. Right: a 24px selection circle, filled `--chalk` with an
`--on-chalk` check when selected, 1.5px `--line-strong` outline when not. Selected rows also
take the lilac selection ring.

The label rule is the important part. A named set shows its name; an unnamed set shows first
names, up to three, then "and you". Both use the same weight, the same size and the same row, so
an unnamed set reads as a description of some people rather than as a group missing its name.
The caption carries the difference: "Last time, on Friday" against "Six of you, back in August".
Nothing anywhere says "unnamed", "untitled" or "no name".

Order: most recent set first, then by how often that set has asked something. The most recent
set is preselected, because the common case is the same people as last time and it should cost
one tap in total.

States: **preselected top row**; **named set**; **unnamed set**; **a set that has now asked
twice** (the naming prompt, below); **someone else** (a dashed row with a plus in a dashed
circle and a chevron, opening the people picker); **whoever I send it to** (amended 2026-09-28,
Round C, from the joining decision of 2026-09-27: a dashed row last, "Whoever I send it to" over
"You get a link and a code. Whoever joins is in.", a set of one that grows as people join by link
or code); **first ever market** (no rows at all: the picker is replaced by the people picker
itself, with a line about sending the link).

**The naming prompt.** When the selected set is asking its second question, a dashed block
(radius 10, 1px dashed `--line-strong`) appears directly under that row: one `body` sentence
("Second time with these four. Want to call them something?"), a 48px text input with no
placeholder, a 48px Save, and a 44px "Not now". It appears once per set, never blocks the flow,
and never returns after it is dismissed twice. A name is a convenience for chips and tiles, not
a requirement, and nothing is created by naming.

The ask flow's pinned action is the sheet (3.24) with the chalk "Set the terms" and nothing
else. The dashed "Someone else" row already says more people can come, and once it's sent the
who's-in row's icons are how they do (3.42).

### 3.21 Shared-context band

On the person view, directly under the open-obligations header: a 13px `--ink-2` heading ("Where
you two turn up"), and a wrapped row of context chips with counts of shared events. Nothing
tells the reader what tapping does: chips behave as chips.

It answers one question: why an obligation sits in one context and not another. Ordering is by
count, descending, with "Just you two" in its natural position, and it holds at most five
chips before it wraps to "and 3 more" as a final chip. Tapping filters the timeline below;
nothing here opens a screen of its own, and there is no group header, no member list, no
group avatar and no way in. If it ever grows a "see all", it has become a group list and the
rule has been broken.

States: **several shared contexts**; **one** (the band still renders, because one chip still
explains where things come from); **none, just the two of you** (the band is not rendered at
all); **filtered** (the selected chip takes the selected styling and a Clear appears beside
the row).

### 3.22 The weight line

The market screen after you are in. It is the odds line (3.13) in its second state, not a second
component: the same ten buckets, grown into a row of ten columns 100px tall, 3px apart, 8px
radius, on the market's surface as a track.

- Column fill is the market's ink, height normalised so the heaviest bucket fills the column.
- Your own share of your bucket is drawn in your person hue at the bottom of that column,
  separated from the rest by a 2px gap in the ground colour (`box-shadow: 0 -2px 0 <ground>`),
  with your 22px avatar 28px above the column.
- The group's number is a 2px `--ink` vertical marker at the stake-weighted mean, with its value
  in a 22px chip at the top ("60%"). It is never the market's ink and never citron: it has not
  happened.
- Under the columns: "0%", "50%" and "100%" at 13px `--ink-3`. Heading above: "Where the stake
  sits" while open, "Where everyone landed" once it is locked.

Arithmetic: `bucket(v) = ceil(v / 10)`, with 0 joining the first bucket; `height(b) = stake(b) /
max stake in any bucket`; `group's number = Σ(vᵢ × sᵢ) / Σsᵢ`, displayed as a whole percent with
the exact figure on the details sheet. A market's stake unit is fixed at creation, because
dollars and beers cannot be weighed against each other. A no-stake entry is a person, not
weight: an 8px hollow dot on the baseline of its bucket.

The entry line sits directly above it: your 36px avatar, "You're in at 70%" in `body` 600, "2
beers · yours to change until 10:40pm" in `caption`, and a 44px tertiary Change that reopens the
odds line in the sheet (3.13, changing). Positions are editable until lock and never after, and
on a blind market not after entry.

States: **one entry** (your column alone at full height, no marker; the marker appears from the
third entry); **one stake over half the total** (the caption says so in words, because the
picture alone reads as agreement); **everyone on one number** (one full column, marker on it,
and no caption: amended 2026-09-28, Round C, since 4.9 keeps the weight-line caption only when
one stake is more than half, and "Everyone on one number." restated the picture); **blind** (nothing before you're in, as on any market; once
you're in, everything that is in so far, heights, marker and all, and your entry is final: no
Change, and the caption reads "2 beers · final". The entry sheet says so before anyone commits,
above the primary: "You see everyone's once you're in. Yours is final then.", after the 16px
lock glyph. `Holdouts`, frames 3 and 4); **locked** (unchanged picture, Change gone, the entry
line keeps "You're in at 70%" and its caption reads "2 beers · locked at 10:40pm", nothing
greyed); **settled** (replaced by the call line and closest first); **number market** (below);
**nine or more entries** (unchanged).

**Number markets.** The same row of columns, on an axis taken from what people entered. The
asker's scoring scale (3.26) never draws anything here: the display and the scoring are
deliberately different, and the display does not try to reflect the scoring.

- **Ends.** `lo` and `hi` are the lowest and highest on-axis entries. If `hi − lo < 2`, pad by
  one on each side, never below 0. Everyone on 14 draws 13 to 15; a single entry draws your
  number with one either side, your column in the middle at full height.
- **A narrow range gets a column per value.** When `hi − lo + 1 ≤ 10`, draw `n = hi − lo + 1`
  columns, one per whole number, with the same 3px gap. Label every column when `n ≤ 7`,
  otherwise the two ends and the middle.
- **A wide range gets ten slices.** Otherwise `w = (hi − lo) / 10` and `bucket(v) =
  clamp(ceil((v − lo) / w), 1, 10)`, so `lo` joins the first slice. Labels: `lo` at the left,
  the rounded midpoint in the centre, `hi` at the right.
- **The unit** rides the right-end label only ("40 people"). Every other label, and the marker's
  chip, is a bare number.
- **One far-off entry does not stretch the axis.** With four or more entries, sort them. The
  highest is off-axis when its gap to the next highest is larger than the span of all the rest
  (`v₁ − v₂ > v₂ − vₙ`, descending). Check the high end first over every entry, then the low end
  the same way over what remains, and only while at least three entries would stay on the axis,
  so there is at most one per end. An off-axis entry becomes an overflow column one column wide,
  6px past the end, labelled with its value and an arrow ("200 →", "← 0"). Its height follows
  the same normalisation and it still counts toward the group's number.
- **The marker is the stake-weighted median**, as implemented: the smallest value with at least
  half the stake at or below it, and a tie at a boundary takes the lower value. Absolute-error
  scoring rewards each person for reporting their own median, so the group's summary is the same
  statistic, and one far-off entry cannot move it unless it holds half the stake. The median is
  always one of the entries, so the marker always stands on a column that has weight: across
  slices at `x = (g − lo) / (hi − lo)`, and across per-value columns at the centre of `g`'s
  column, `x = (g − lo + 0.5) / n`. When a far-off entry holds more than half the stake it is
  the median, and the marker stands over that entry's own overflow column (a far-off entry at
  the low end needs only half). There is no clamp and no arrow chip. The chip shows `g` with
  separators ("22", "1,240"), and the details sheet says it in a sentence rather than to a
  decimal. No-stake entries carry no weight, and if no entry carries stake the marker takes the
  median of the entries counted one each, lower on a tie; zero stakes are refused by the current
  contract, so this case cannot occur until the redeploy. Yes-or-no markets keep the
  stake-weighted mean.
- **Re-bucketing.** When a new entry moves `lo` or `hi`, the columns crossfade to the new layout
  over 200ms and the marker slides to its new place. With reduced motion, it swaps.
- **Blind.** Before you're in, a blind number market draws nothing, as any market does; the axis
  in particular would give the range away, since its ends are where people landed. Once you're
  in, the axis and the columns show like any number market's, and your number is final.
- **Locked and settled** behave as they do for yes-or-no: locked keeps the picture, and settled
  becomes the ruler (3.5) and closest first (3.7).

**A time series, for slow markets only.** A market open more than 24 hours with at least four
entries gets a 56px line of the group's number over time under the weight line, drawn in the
market's ink, labelled with the day it opened and carrying the current value at its right end.
It plots the aggregate only, never individual entries, because plotting entries would out
people's timing.

**What left the screen.** The AI's suggested number is gone entirely: from entry, from the
weight line, and from the details sheet's first view. Three numbers on one screen (a suggestion,
yours, the group's) was one too many, and the suggestion anchored everyone who saw it before
choosing.

### 3.23 The state mark

A 16px stroke mark, 1.6px weight, drawn on a 16 by 16 grid, that replaces the sentence a
screen used to spend on saying what something is doing. It sits at the head of a row or a
kicker, before the text.

Market states:

| State | Mark | Color |
| --- | --- | --- |
| Open | ring | `--ink-3` |
| You're in | ring with the lower half filled | that person's hue |
| Locked | ring with a horizontal bar | `--ink` |
| In voting | broken ring, dasharray `3.2 2.4` | `--ink` |
| Deadlocked | ring with two vertical bars | `--ink` |
| Resolved | filled disc | `--ink` |
| Voided | ring with a slash | `--ink-3` |
| Expired | dotted ring, dasharray `1 2.6` | `--ink-3` |

Obligation states: proposed is a broken ring in `--ink-3`; open is a ring in the owner's hue;
settled is a filled disc in `--ink-3`; forgiven is a ring with a 1.6px centre dot. An
obligation is never in voting, so the broken ring cannot be ambiguous between the two sets.

Two marks belong to a tap rather than to a thing. They sit wherever that tap's result shows, in
place of the state mark, and leave when the tap has gone through (5.2). Board: `OnItsWay`.

| State | Mark | Color |
| --- | --- | --- |
| On its way | the ring at 0.32 opacity with a quarter of it drawn at full, turning once every 1.2s; with reduced motion it rests at a quarter | `--ink` |
| Didn't go through | ring with 5.1's alert inside (a short bar and a dot) | `--ink` |

The words beside them are "On its way" and "Didn't go through", and nothing about how long. A
market its asker called off takes the voided mark with "Called off Sun at 6:52pm" (3.15).

The citron dot is separate and orthogonal: a 6px `--live` disc in a 10px gutter to the left of
the mark, meaning this one is waiting on you and has a clock. The mark is objective and belongs
to the thing; the dot is subjective and belongs to you. Either can appear alone. The dot never
appears on something with no deadline, which is the distinction that separates a vote closing
at midnight from a beer you could confirm next week.

Words beside a mark: a clock, when the state has one ("Voting ends at midnight", "Closes
tonight", "Resolving tonight"), or, on a needs-you row, the reason the row exists: who said what
happened, or how many are in ("Priya says yes", "4 of 6 in"). Any other sentence about state is
what the mark is replacing. Every mark carries an `aria-label` with the state name, because a
screen reader cannot see a dashed ring.

### 3.24 The sheet

Every market screen and task screen that has a move keeps it in a sheet pinned to the bottom,
where the tab bar sits on a root. It never scrolls away. The content behind it scrolls, with
bottom padding equal to the sheet's resting height plus 20px so nothing is trapped underneath. A
state with no move has no sheet at all, and its bottom padding is 20px.

Anatomy: the current place's surface (the market's on a market screen), a 1px line along the
top, 12px top corners, no shadow, padding 16px sides and 24px bottom, 10px between rows. When it
has a second height it also carries a grabber: 36 by 5px, radius 3, `--line-strong`, centred 8px
from the top, and the header row under the grabber doubles as the drag handle. Only those two
drag, so the move itself (a slider, a field, a button) keeps its own gestures. The sheet is not
modal: nothing behind it dims and the page still scrolls, with the room it takes paid as bottom
padding on the screen (`--sheet-room`). A moment that binds other people (sending a vote, asking
for the tiebreaker) opens the modal sheet (6.4) over it.

Two heights, only when there is more to show. Low holds the move; high adds what the move needs.
A swipe up or a touch on the move raises it; a swipe down lowers it so the market behind can be
read. Snap on release by direction: more than 24px up raises, more than 24px down lowers,
anything less stays. Tapping the grabber toggles. A sheet with nothing more to show has no
grabber and does not move.

Where it rests says whose move it is. When the move is nobody's, there is no sheet:

| State | Whose move | Resting | Raised |
| --- | --- | --- | --- |
| Open, not in | Yours | "What are the odds?" and the empty line (or the empty number field) | Stake and "I'm in at 70%, 2 beers" |
| Open, you're in | Nobody's | No sheet. The icons end the who's-in row (3.42), and the photo slot sits last on the screen (3.39) | |
| Closed, not yet known | Whoever saw it | "When it's clear, say what happened." and the outcomes as two equal wells in the market's words ("He fell asleep", "He stayed up"; "Yes" and "No" without them, 3.25), with a tertiary "Nobody can tell" | The claim: an optional line, photos or screenshots, and "Say it" |
| Voting, not said | Yours, with a clock | The count line ("3 of 6 have said yes. Two more and it settles."), chalk agree, secondary "Not how I saw it" | Who has said what; everything attached, as 44px squares with who supplied each; the app's read, once anyone has voted |
| Voting, said | Theirs | One line: your avatar, "You said he was out", the count, Change | No second height |
| Split | The arbiter's, or yours with proof | "Add what you saw" and the arbitration deadline | What each side said |
| Settled | Nobody's | No sheet. The add tile or the empty slot for someone who was in (3.8), and share on the who's-in row, which sends the result (3.42) | |
| Voided, expired or called off | Nobody's | No sheet. The add tile or the slot for someone who was in; no icons, since no tile tells a void (3.37, 3.42) | |

After a market ends nothing is anyone's move, so there is no sheet. Adding a photo stays one tap
away for everyone who was in it, on every visit, weeks later included: the add tile, or the slot
while there are none. Their accessible names carry the night from `fromThatNight`: the weekday
while it is under a week old ("from Friday"), "tonight" and "last night" as calendar days, and
"that night" after a week. Sending how it ended is the share icon on the who's-in row, for
anyone who can see the market; it sends the result tile's link, and once photos are added the
tile says so (3.27). The settled sheet's second height, the whole tile as the chat will get it,
goes with the sheet.

**One-time asks borrow the sheet.** The two things the app asks once, One tap (3.41) and the
heads-up (4.10), appear in the sheet of the moment they belong to, or, on a state with no sheet,
as a modal sheet in the same place. Never both in one moment (4.9). (Amended 2026-09-28: the One
tap ask is dropped, 3.41; the heads-up is the one ask left.)

**Saying what happened.** A well raises the sheet to the claim: the outcome chosen, in the
market's words, at the top; then an optional line: "What happened?" in `label` over an empty
field, with no example inside it (4.9); then a row to attach proof, "Add a photo or a
screenshot", up to three per person per question, each shown as a 44px square with a remove
control. The chalk says it in the claimant's voice ("Say it: he fell asleep", or "Say it: yes"
without the market's words) and opens the vote's modal (6.4), since it binds everyone: the
claimant is the first vote. Whatever was attached is evidence, and everyone voting sees it: the
first attachment is the claim card's clip (3.37) and the rest are in the raised sheet, each with
the first name of whoever supplied it. Anyone voting may attach too, and a case for the
tiebreaker may carry its own. Once the market ends, the claim's attachments lead the frame
(3.8); the rest stay on the record behind More, under "How it was called". A tertiary "Nobody
can tell" in the resting sheet is a vote to void. The app's read ("The app leans yes, 82 to
18.") sits on the claim card only while nobody has voted, and after that as a caption in the
raised sheet, because the group decides. On a number market it names the number with its unit
("The app leans 14 shirts, 75 to 25.").

Number markets use the same rows with their own words. **Open, not in** rests on "What's your
number?" and the empty field (3.26). **Closed, not yet known** rests on "When it's clear, say
what it was." with the number field, empty, and a chalk that reads "It was 14 shirts" once a
number is typed; it opens the claim with the number filled in. **Voting, not said** carries the
count line, a chalk "That's right, 14" and the secondary "Not how I saw it", which raises the
sheet to "What was it?" and the number field. Sending a number is the vote, and the primary says
so in the person's voice: "It was 12 shirts". Without a number there is nothing to count, so the
raised sheet also offers a tertiary "Add a note instead": one line of text that goes on the
market's record under the person's name, with one caption, "A note goes on the record. Only a
number counts toward settling it." A note never appears in the count line, and the person's line
afterwards reads "You added a note", never "You said". They can still send a number until voting
ends.

Questions a final score answers open voting on a source card instead of a claim card (3.35); the
sheet is the same.

Pick-one markets use the same rows too. **Open, not in** opens raised on "Pick one" with the
answers, and lowers to a bar (3.30). **Closed, not yet known** rests on "When it's clear, say
what happened." with the answers as equal wells, two across, each with its avatar where it has
one; any of them opens the claim. **Voting, not said** carries a count line that names the
claimed answer ("3 of 6 say Priya. Two more and it settles."), a chalk "That's right, Priya" and
the secondary "Not how I saw it", which raises the sheet to "What did you see?": the other
answers as rows, a dashed "I couldn't tell" (a vote to void), and a tertiary "Never mind". One
tap sends. When votes split, the count line names the answer nearest to settling ("3 say Priya,
1 says John. Two more for Priya and it settles."). A swipe up instead shows who has said what,
one row per answer with its voters' avatars. **Voting, said** is one line: your avatar, "You
said Priya", the count, Change.

On task screens the sheet holds the flow's primary action and at most one caption: "Set the
terms" on the ask flow, "Join" on the code screen (with the form-level error block above it when
there is one), "Yep, all 6 are right" on the claimant screen.

It never counts down at you. Clocks live in the question band. Citron appears only when a vote
has a deadline and you have not said. No badges, no timers in the sheet.

### 3.25 The question band and the market screen

The top of every market screen. 12px from the screen edges, radius 12, the market's field
colour, 16px padding (18 at the bottom), 12px gap. First row: the 44px stamp on the market's
ground on the left; on the right, the citron dot when it applies, the state mark (the market's
ink for open and resolved, your hue for you're in, `--ink` otherwise) and the clock in 13px 600
`--ink-2`. Then the question in `serif-l`. Then the asker line: 22px avatar and "Priya asked the
Friday crew" in `caption` `--ink-2`.

**A draft** (the question is saved and nothing is sent; `Explainers`, frames 1 and 2). The
band's edge is a 1px dashed `--line-strong` just inside its radius. The clock reads "Not sent
yet" after the expired mark's dotted ring in `--ink-3`, and the asker line is the 16px people
glyph and "For the Friday crew" in `caption` `--ink-2`, since nobody has been asked yet. The
details follow as usual. The sheet is the entry's own ("What are the odds?" and the empty line,
or the field, or the answers): getting in is what makes the market live, and no paragraph says
so. Once you're in, the edge turns solid, the clock becomes the close time, the asker line reads
"You asked the Friday crew", and the who's-in row reads "Just you so far" with share as the
chalk (3.42).

Under the band, in this order and only when they apply: the entry line (3.22), the claim card
while voting (3.37 gives its layout; it replaces the entry line once voting opens, and its clip
is the evidence everyone voting sees), the weight line or the call line, the who's-in row
(3.42), the details `dl` (96px labels, `body` values, the market's surface and line), and last,
while you're in and it's open, the photo slot or your photos (3.39). The details carry: Counts
if, Decided, Stakes, If it's unclear. Everything else the product needs to say about how it
works goes behind More.

The screen after a market ends, settled, voided or expired, is specified in full in 3.37, with
the memory it becomes. In short: the outcome line in `serif-l` in the market's words ("He
did."), the claim's line as its caption ("Out cold, 1h 12m in."), the frame at 200px led by the
claim's clip or, for someone who can add, the empty slot; the call line; the who's-in row with
its icons (3.42); closest first (3.7); who's got who, grouped by owner; and no sheet. On a
number market the outcome is one `serif-l` sentence with the number in it ("14 shirts, then a
seam gave out."), the caption says who was closest ("Theo was closest, off by 2."), and the
ruler (3.5) stands where the call line would.

**Outcome words.** A yes-or-no market says its outcomes in the question's own words. The
write-up that writes the terms also writes four short phrasings, stored with them: the two wells
("He fell asleep", "He stayed up") and the two outcome lines ("He did.", "He didn't."). The
claim card and the count line use the well's words after the name ("Priya says he fell asleep"),
and the agree chalk repeats them in the voter's voice ("That's right, he fell asleep"). A market
without them, any made before or a write-up that returned none, uses "Yes" and "No" on the
wells, "Priya says yes" on the claim card, and "Yes." or "No." as the outcome line, and nothing
else changes. `outcome_labels`, which already carries a number market's unit, can hold them;
otherwise they need a column beside it.

A pick-one market's settled screen says who called it and who didn't. Everyone who picked the
right answer scores the same, so there is nothing to rank and no closest-first list. The outcome
in `serif-l` with the answer in it ("Priya, 40 minutes in."); a `body-sm` caption naming who
called it ("Theo called it. Nobody else did.", "Theo and Maya called it.", "Four of you called
it: Theo, Maya, Gabe and John.", "Nobody called it."); then "Everyone's pick": one 48px row per
answer in the asker's order, with its avatar slot, the answer, the avatars of whoever picked it
(24px, overlapping by 6px, a ring in the ground behind) and its final share. The answer that
happened takes the wash across its row (the market's ink at 0.40), a 6px cream cap at its left
edge and its name in `--ink`, and everyone in that row wears the extra cream ring: that row is
who called it, and every other row is who didn't. Then who's got who: the people who picked
wrong owe the people who picked right, pairwise and capped as usual. When nobody or everybody
called it, nothing changes hands, and the section is the one line "Nothing changes hands."

### 3.26 Number entry

The entry control for a number market, in the same sheet. Header: "What's your number?" in
`body` 600. Then a row of a 48px stepper (minus), an 84px field and a 48px stepper (plus). The
field: the market's ground, a 1.5px inset ring in your hue, the number in `numeral-hero` with
the unit beside it in `body` `--ink-2`, baseline-aligned. Tapping the field opens the numeric
keypad; the steppers move by one. No caption: a field with a keypad needs none. Then the stake
chips and "I'm in at 17 shirts, $5".

**The field.** Whole numbers from 0 to 999,999,999, shown with thousands separators. Use a text
input with `inputmode="numeric"` and `pattern="[0-9]*"`, never `type="number"`, which accepts
decimals and exponents and changes value under a scroll wheel. The numeral shrinks to fit as
digits are added, from 60px to a floor of 28px, after which the unit drops beneath the number;
the field is a control, so none of this counts against the budget (1.2). No decimals anywhere. A
question that needs them asks in a smaller unit (minutes rather than hours, cents rather than
dollars), and that is settled when the market is made.

**Empty, and at the edges.** Nothing is prefilled, for the same reason the odds line has no
thumb until it is touched. Before any input the field shows a cream caret and no number, minus
is disabled, and the primary reads "Type your number", disabled. Plus from empty starts at 1.
Minus is disabled at 0. Holding a stepper repeats after 400ms, at ten steps a second.

**The unit** is stored as a singular and a plural ("shirt", "shirts"), and the field and every
sentence use the form that matches: "1 shirt", "I'm in at 17 shirts, $5". Chips, axis labels and
roll-call cells carry the bare number, except the axis's right end (3.22).

**Changing, failing, locking.** Change on the entry line reopens the sheet raised at your number
with "Never mind" beside the primary, which reads "Save: 18 shirts, $5". Failed to send and
locked are the odds line's states word for word (3.13).
**A number past the limit.** Entries are not clamped, and a far-off entry hurts nobody else: the
scale is fixed when the market is made, so a number far outside it scores zero and moves no one
else's score. It hurts the person who typed it, since a slipped finger (2400 for 24) would lose
their stake. So the sheet blocks a number at or past a limit, and there is no way to keep it.

- **The limit** is `farOffThreshold`: a hundred times the model's most likely answer
  (`dares.typical`), rounded to one significant figure (1,000 for 10; 4,000 for 37). When the
  asker set the scale and there is no most likely answer, it is fifty times that scale. With
  neither, there is no limit and no block.
- **It stays far out on purpose.** A hundredfold catches a slipped finger and never a bold
  guess. A line close enough to catch bold guesses would also sit near enough to a hidden scale
  to give it away.
- **The block** is a field error (5.1), shown when the primary is tapped: the field's ring
  becomes 1.5px `--ink`, and between the field and the stake chips one row in `--ink` at 15/20
  with the 16px alert glyph: "2,400 shirts is past the limit here. Try something under 1,000."
  The primary is disabled while the number is at or past the limit and live again the moment it
  is under, and the line goes with it. Nothing is sent. Board: `FarOff`.
- **What it names** is the limit, which is not the scoring scale. A scale the model set stays
  hidden here as everywhere, and the line is the same when the asker set one. Naming the limit
  says the model's most likely answer to one figure at a hundredfold remove, the same thing
  anyone could find by trying numbers, which the build already accepts.
- **The wording** opens with the number because the number is what the line is about: the person
  sees what they typed, and a stray zero shows itself (4.6).
- The limit applies to entries only. Saying what happened on a number market is never blocked.

**Entering, as a moment.** The odds line's moment, unchanged: the sheet lowers, then the columns
grow from the baseline, each over 320ms and 40ms after the one to its left (9.10), your share
fills in your hue, your avatar rises above your column and the marker draws last.

**No range, and the scoring scale stays out of sight.** The field never shows a range and never
clamps to one. Telling people to pick inside a range puts an answer in their mouths, and its
ends become everyone's anchor. Scoring does use a scale, fixed when the market is made: the
asker can set it, and when they leave it blank the AI sets one. It is never drawn, and the
weight line's axis never uses it (3.22). The asker sets it on the terms step as a whole-number
span in the question's own unit, in one row, "20 shirts off scores nothing", where the number is
a field and the words are fixed. If they leave it blank, the model's scale is used only when it
passes its check (the span sits between a quarter of its most likely answer and four times it);
otherwise the terms step asks the asker for one. Whose it is is stored (`range_source`). If the
asker set it, it appears once, as a details row: "Scored on" over "Off by 20 shirts or more
scores nothing. Closer scores more." If the model set it, it appears on no screen at all. This
replaces the previous revision's bounds, which clamped the field and became the axis.

The answer, when it lands, is a `serif-l` sentence with the number in it ("14 shirts, then a
seam gave out."), with the ruler (3.5) under it. The sentence is the number and its unit
followed by the claimant's words when they run to 60 characters or fewer, and the number and
unit alone otherwise ("14 shirts."). It was `numeral-hero` in the previous revision. A 60px
numeral beside a 26px question put two serif sizes on one screen, and the sentence says the same
thing in the size the screen already has.

### 3.27 Link tiles

iMessage and WhatsApp build a link preview on the sender's phone and freeze it into the chat, so
a tile can only carry facts that stay true for as long as the message is visible. Two tiles
exist. Both are 1200 by 630, and everything essential sits in the centre 630 by 630 square (from
x = 285), because WhatsApp's compact preview crops to it. The link's title is the market's
question, so no tile repeats it.

**The asking tile** (`TileAsk`, `TileAskRange`), sent when a market is created. The market's
field as the ground, the wordmark at bottom left outside the safe square in ink-hi, and centred
in the square: the asker's 64px avatar and "Priya asks" at 48px 600; the frame line in serif at
52px ("What are the odds?", or "Name a number." for a number market); the empty answer; and the
absolute close time at 40px 600 in ink-hi ("Closes Fri Sep 25, 10:40pm", never "tonight"). The
empty answer for a yes-or-no market is the odds line: ten 12px segments on the market's ground,
a 36px mark at 0.35 opacity at the left end and a 100px mark at the right, "0%" and "100%" under
it. For a number market it is the 88px mark stamp, an empty 210 by 96px field with a cream
caret, and the unit in serif.

At the size it is actually seen (about 270 points wide, 0.23 scale), the 48px asker line lands
near 11pt and the line with its two marks reads because it is a picture of the mechanic. It
carries no count of who is in, no relative time and no numbers anyone picked, so it reads the
same for one recipient or twelve. It names the asker by first name and nothing else: never the
group and never anyone else, because a preview travels further than the page it opens, which
does name the group (3.17).

**The result tile** (`TileCalled`, and `TilePhoto` for a market with photos), sent when someone
taps share on a settled market's who's-in row (3.42): the market's field, the mark and the
outcome on one line, the call line with 52px pins where the person who called it wears an extra
cream ring, the No and Yes labels, and "John called it at 10%." at 34px 600.

**A tile never carries a photo.** A tile is frozen into a chat that can include people outside
the market, and it gets forwarded further, so a photo on it would reach people the visibility
rule keeps out and show faces nobody chose for a wider chat. A result tile for a market with
photos is the tile without one plus one line directly under the outcome: a 32px camera glyph and
"With photos from that night." at 30px 600 in ink-hi, with no count. Tapping through is where
visibility is enforced, and the tile's data carries no photo address.

**A sticker does ride the tiles.** A sticker is a mark, and a market's mark is on both tiles.
Whoever chose a sticker as the mark chose to send it wherever the question is sent, so it is
drawn like an emoji, read from the bucket on the server. The two rules differ on purpose: a
photo belongs to the night and the people in it, and nobody chose to send it on; a mark is
chosen to travel with the question.

A number market's result tile says the answer as its outcome: the market's field, the mark and
"14 shirts." in serif at 72px on one line, the ruler (3.5) with 52px pins, a 6px cream answer
tick and its end labels, and "Theo called it, off by 2." at 34px 600. Whoever was closest wears
the extra cream ring, as the person who called it does on a yes-or-no tile. The scoring scale is
not on the tile.

Pick-one tiles. The asking tile's frame line is "Pick one." and its empty answer is the answers
themselves, all of them, up to six: one row each, a 44px avatar where the answer is a person,
the answer at 40px 600, left-aligned in a 420px column centred in the safe square. At 0.23 scale
that is about 9pt, the same as the asker line, and six rows still fit the square with the close
time under them. The result tile without a photo carries the answer as its outcome at 72px
("Priya."), the same rows with the pickers' 44px avatars beside each and the called answer
washed, and "Theo called it." at 34px 600 ("Theo and Maya called it.", "Nobody called it.").
Neither tile shows a share. The photos line works the same on every kind.

Tiles between two teams (3.40). The asking tile for who wins has the frame line "Who wins?" and,
as its empty answer, the two team stamps at 88px at the ends of the empty line, equal, each with
its team's name under it at 40px 600; the margin's asking tile says "By how much?" over the same
picture with a tie tick at the middle. The result tile for who wins says the winner as its
outcome ("Bills won.", or "A tie.") over the line between the stamps, the winner's half washed
and the cap at its end, or on the middle for a tie; for the margin, "Bills by 7." over the axis
centred on a tie, the real margin as the cream tick. Stamps on tiles follow 1.7, and there is
never a logo. When a game is started with more than one question, the link sent is the game
page's, and its asking tile puts the game where the question would be: "Priya asks", the two
stamps at 88px either side of "Chiefs at Bills" in serif at 52px, the chosen questions as up to
four rows at 40px 600, and the close time.

Rendering: server-side (Satori or equivalent) with Noto Color Emoji loaded for emoji marks and a
sticker's 256px derivative read from the bucket on the server. Both fail silently when
forgotten.

**Serving.** One route (`/m/[id]/opengraph-image`) serves the asking tile until the market
settles and the result tile after, so a link shared from a settled market previews as the result
while the first send stays frozen as the ask. The close time is in the asker's zone
(`dares.zone`); a market from before that column says the time in UTC and says so.

**Numbers on tiles and in notices.** A notice about a market never carries a number, a unit or
an amount ("Decided." and the screen). The result tile carries the answer ("14 shirts."). The
difference is intended: a notice goes out on its own to everyone, and a tile goes out because a
person chose to send it, the same person who could have typed the number into the chat.

### 3.28 Making a sticker

A sticker is a picture mark with transparency: the same stamp, the same ink rule, and a table of
its own.

**Built: paste a cutout.** iOS 16 and later let people lift a subject out of a photo and copy
it. The mark picker takes a paste anywhere in the sheet (the clipboard `paste` event) and
through a "Paste a cutout" cell that asks the clipboard, which on iOS shows its own Paste
prompt. The phone checks the image has at least one see-through pixel, bounds it to 1024px and
sends a PNG. The server trims the transparent margins, pads to a 512px square, measures the ink
(1.8) and bakes the 256px stamp with its edge (1.7). No model is involved.

**Waiting, as ruled.** Tap-to-cut in the app: MediaPipe's Interactive Segmenter in the browser
returns a confidence mask for the point tapped; threshold near 0.5, feather 1 to 2px, apply as
alpha, crop and pad square. It is what `StickerFromPhoto` frame 5 draws, for after submission.
Automatic background removal stays out, because IMG.LY's remover is AGPL-3.0.

**From a photo** (`StickerFromPhoto`). The loop worth building toward: John asleep on the couch
becomes the mark on the next market about John. The full-screen photo (3.38) carries "Make a
sticker" beside "Save", for any photo the viewer can see; the entry in the viewer is how anyone
learns stickers exist. Which of two outcomes ships depends on one check on a real iPhone:
whether the phone's own subject lift works on an image inside the installed app.

- **If it does** (frames 2 and 3). The entry raises a sheet over the photo: "Make a sticker" in
  `body` 600, then two named steps as rows, each after its 20px glyph, "Hold what you want, then
  tap Copy" and "Then paste it here", and the chalk "Paste", which runs the paste path above.
  The phone's own Copy menu does the lift. The result replaces the viewer's picture with the
  sticker on the market's field, "In your stickers" in `body` 600 under it, the chalk "Ask
  something with it" (the question step, with the sticker as its mark) and a tertiary "Done".
- **If it doesn't** (frame 4). The viewer ships without the entry for now, and nothing points at
  a path that fails. After submission the entry returns and the app cuts the subject itself
  (frame 5): the sheet reads "Tap what to keep", the tapped subject gets a dashed cream outline,
  and the chalk "Keep it" with a tertiary "Start over" lead to the same result.

Either way the photo's credit chip and counter stay, and the sticker belongs to whoever made it
(below).

(Amended 2026-09-27, built: the owner confirmed the lift works inside the installed app
(docs/testing.md item 59), so frames 1 to 3 are built as above. The sheet over the photo has no
scrim and lets touches through around its panel, since the photo itself is what the person
holds; it closes by its close or its handle. "Done" returns to the photo. Frame 5 is a later
round, with this path as its fallback.)

(Amended 2026-09-28, Round C, built: frame 5 comes first. "Make a sticker" opens the see-through
sheet reading "Tap what to keep"; MediaPipe's interactive segmenter, loaded in the browser only
then and kept by the browser after, returns a confidence mask for the point tapped, thresholded
at 0.5 and feathered a pixel; the subject takes the dashed cream outline; "Keep it" sends the
cutout down the paste path and "Start over" clears the tap. The chalk carries the wait while
the model loads. Where the runtime or the model cannot load, the sheet is frames 2 and 3, the
lift. One caption on the sheet reads the model's timings, an instrument for the phone check that
leaves once answered. "Waiting, as ruled" above is superseded.)

**Storage.** A sticker belongs to the person who made it and can mark any question they ask, so
it is not a `media` row on one event. It is a row in `picture_marks` holding both keys (the
512px source with alpha and the 256px derivative), the size and the ink. `media` keeps exactly
two parents, `dare_id` and `obligation_id`. `dares.mark_kind` gains `sticker`, with `mark_value`
the row's id, and every stamp reads a `MarkRef`, so a sticker never falls through a check that
only knew emoji. The bucket admits PNG beside JPEG for it.

**Who sees one.** Its owner, and anyone in a group where a question wears it, through
`/api/mark/[id]`, which answers 404 to everyone else whether or not it exists. It is also drawn
into that question's link tiles (3.27): choosing a sticker as a mark is choosing to send it
where the question goes. A sticker made later from a market's photo is seen by the people who
could see that photo, until someone chooses it as a mark.

### 3.29 The question step and the mark picker

The first step of asking. Boards: `MarkPicker` (interactive: open the picker, try marks, search)
and `MarkPickerFrames` (nothing picked, a mark with a colour, a hueless mark, done). Everything
on it is an existing part: the question band (3.25), the stamp (1.7, 3.9), the sheet (3.24) and
chips (3.3). This step is what makes an ink mean something.

**The step.** Header: the 48px close control on the left, a down chevron, because the step rises
from the + (9.5), and, on the right, a 44px tertiary "Got a code?" in `--ink-2` (for the
hackathon, directly left of the information icon, 10.3), which opens the code screen (3.16). The
+ only asks (6.1), so joining someone else's question starts from the same place as asking one.
There is no step counter. Then the question band on the market's field, which is the neutral
`--surface-2` until a mark is picked: 12px from the screen edges, radius 12, 16px padding (20 at
the bottom), 16px between its two parts.

- **The mark row**, one button with `aria-haspopup="dialog"`: the 64px stamp, then "Add a mark"
  in `body` 600 over "Optional" in `caption` `--ink-2`. What a mark does is shown by the retint
  when one is picked, never said. Unset, the stamp is dashed (1.5px `--line-strong`, radius 16)
  around a 24px plus. Set, it is the mark at 34px on the market's ground, the title reads
  "Mark", and the line under it is the emoji's name and "tap to change" ("Crescent moon · tap to
  change").
- **The question**: "Your question" in `label` `--ink-2`, then a borderless textarea in
  `serif-l`, cream, three rows to start and growing with the text.

The pinned sheet holds one chalk, "Next: who's in". "Optional" is said once, on the row, and
never again.

**How people answer.** Under the band: "How people answer" in `label`, then three chips in a
`radiogroup`, 36px, sharing the width: "Yes or no" (the default), "A number" and "Pick one", in
3.3's selected style for words. The kind is chosen here, before the write-up, because the terms
say how the answer is counted and the write-up differs by kind. The chips show only for a dare:
an argument is always yes or no. The pace and mode chips the step already has (dare or argument,
quick or careful) sit under the band above these, as built. A number market's unit is proposed
by the model with the terms and is editable on the terms step. "Pick one" opens the answers
editor (`PickOneEntry`, frame 1):

- "The answers" in `label`, then one 44px row per answer on the market's surface, radius 10, 1px
  line: a 28px slot (the person's avatar, or empty for words), the answer as an inline text
  field in `body` 600, and a 44px remove control.
- A dashed 44px "Add an answer" row while there are fewer than six.
- "Add a person" in `caption` `--ink-3`, then the people the asker has shared markets with, most
  recent first, as 32px avatars in 44px targets. One tap adds that person as an answer; people
  already added sit at 0.35 opacity. A person answer can be anyone the asker knows in the app,
  whether or not they end up in the market.
- One caption: "If none of them might happen, add that too." An outcome nobody listed forces a
  void, and a void counts against the asker (3.34), so this is the one piece of advice the step
  gives.
- Two to six answers. "Next: who's in" stays disabled under two, and the add row disappears at
  six. Six is what the entry sheet can hold (six rows, the stake and the primary) with the
  band's question still in view; a longer field ends in "Someone else".

**The picker** is a modal sheet (6.4) 560px tall, on the current place's surface with its 1px
top line and the grabber, 16px sides. It is opened from the band, not from the pinned sheet, so
no sheet opens another. It closes with Done, a 48px text button in the close position, or by
dragging down, and focus returns to the mark row. From the top:

1. A 44px search field on the field colour, placeholder "Search", with Done beside it. "Search"
   names the field's job; an example of what to type would be an answer put in someone's mouth
   (4.9).
2. "Recent" in `label`, then one row of cells: a dashed None cell first, reading "None" in 13px
   600 `--ink-3` (the no-mark option, selected by default), then up to seven recent marks, most
   recent first, kept per device.
3. Category chips as words, no icons, scrolling sideways in a `tablist`: Smileys, People,
   Animals, Food, Activities, Travel, Objects, Symbols, Flags. Choosing one shows that group and
   clears the search; while a search shows, no category is selected. The picker opens on Food,
   because Smileys and People are hueless, and a first grid that never sets a colour teaches
   nothing.
4. The grid: 8 columns of 44px cells with a 2px gap, emoji at 28px, the group's name in `label`
   above it. A search replaces the group with "Matches".

**Picking.** A tap sets the mark at once. The picked cell takes the market's field and a 1.5px
inset ring in your hue. Everything behind the sheet (the band, the stamp, the ground, the pinned
sheet) retints to the mark's ink over 200ms, and so does the picker, since it sits on the
current place's surface. The picker stays open so the person can try another; seeing the colour
arrive is how they learn what a mark does, which is why no sentence explains it. None returns
everything to the neutral room. A hueless mark retints to the market's hashed ink, and nothing
explains why. The draft's id is made on this step, so the ink previewed for a hueless mark (a
hash of the id) is the ink stored.

**Search** runs over each emoji's CLDR name and tags (emojibase's `label` and `tags`, in
English) and matches any word that starts with what was typed. Nothing found: "Nothing called
that. Try a plainer word." in `caption` `--ink-3` where the grid was.

**Skin tones.** A long press (or a right click) on a cell that has them opens a one-row popover
with the default and the five tones. The tone picked last is remembered per device and used for
that emoji from then on. Tone never changes the ink (1.8).

**What it offers.** Exactly the emoji in `src/lib/ui/emoji-inks.json`, which is exactly the set
the tile renderer can draw, so a mark can never turn into a blank box in a group chat. The
picker's catalog (`src/lib/ui/emoji-catalog.json`, made from emojibase by
`scripts/emoji-catalog.mjs`, names and tags in English) holds the table's keys and nothing else,
a test holds the two files to each other, and it loads when the picker opens. A mark the font
cannot draw is refused when the market is drafted. The grid draws emoji with the phone's own
font; the ink always comes from the table, so an iPhone's 👕 and the tile's 👕 share one ink even
though the two fonts colour it differently.

**Balance** is not shown here. The step previews the mark's own ink before anyone else is
chosen; balance (1.8) applies on the who's-in step and may move the ink to a free neighbour
there.

**Your stickers.** A row above Recent, in the same cells: a "Paste a cutout" cell first (dashed,
with a paste glyph), then this person's stickers, newest first. While they have none, the row is
the Paste a cutout cell alone. How to make one is taught where the photos are, by "Make a
sticker" (3.28), and not by a sentence here. A paste anywhere in the sheet works too (3.28).
Nothing else about the picker changes for stickers.

**For a unit's mark** the same picker opens from wherever a unit is made, with no ink preview:
nothing retints, because units take no ink (1.7). No screen makes a unit with a label of its own
yet, so this has no entry point until one does.

**Never:** a mark suggested from the question's words, anything preselected except None, or a
mark required to continue.

Accessibility: every cell is a `button` with the emoji's name as its `aria-label` and
`aria-pressed`; the None cell is labelled "No mark"; the sheet is a `dialog` labelled "Pick a
mark".

### 3.30 Pick one: entering

Pick one means choosing one answer and nothing else. There is no confidence and no odds line.
The last revision spread the rest of a person's confidence evenly across the answers they didn't
pick, and that read as the app deciding something the person never said, so it is gone.
Mechanically the pick carries full confidence: the right answer scores full, a wrong one scores
zero, and the people who picked wrong pay the people who picked right, pairwise and capped as
usual. It needs no contract change. Boards: `PickOneMarket` (interactive: tap an answer, choose
a stake, enter) and `PickOneEntry`, frames 2 and 3.

**At rest** (open, not in), the sheet opens raised, because picking is the move (`PickOneSheet`,
frame 1): "Pick one" in `body` 600 and the answers as 44px rows: radius 10, 1px line, the 28px
slot and the answer in `body` 600, in the asker's order and never sorted by stake. When the
viewer is one of the answers, their row reads "You".

**Lowered** (frames 2 and 4). The sheet has a second height, its grabber and header as 3.24
gives them: a swipe down lowers it to one bar, "Pick one" in `body` 600 on the left and, on the
right, the count of answers in `caption` ("6 answers"), or, once you have picked, your pick's
22px avatar, its name in `body-sm` 600 and a check. A touch on the bar raises it. Lowering loses
nothing: the pick and the stake stay as they were. With six answers the raised sheet covers the
details, and the bar is what lets the terms be read before choosing.

**Picking** is a tap (frame 3). The row takes the market's field, a 1.5px inset ring in your hue
and a check, and the stake chips (3.3) and the primary appear under the list as the sheet grows
to hold them (320ms). Tapping another answer moves the pick. That is the whole entry: "I'm in:
John, 2 beers", or, after the contract redeploy, "I'm in: John, just pride" with no stake (3.3).

The entry line reads "You're in: John" over "2 beers · yours to change until 11pm". Change
reopens the sheet with your pick selected and "Never mind" beside "Save: Priya, 2 beers".
Failing to send and locking are the odds line's states (3.13).

**Entering, as a moment.** The sheet lowers over 320ms and goes, since once you're in nothing is
your move (3.24). Then the bars (3.31) grow from the left, each over 320ms and 40ms after the
one above it (9.10), your stake fills in your hue on your pick's bar, your 22px avatar appears
on its row, and the shares fade in last, over 200ms as the last bar lands. With
`prefers-reduced-motion`, the resting state renders at once.

Unchanged from the last revision: the answers editor and its "If none of them might happen, add
that too." (3.29), and voting on which answer happened, with "I couldn't tell" as the vote to
void (3.24). Blind changes: final once you're in (3.31).

### 3.31 Pick one: where the stake sits

One row per answer, in the asker's order, under "Where the stake sits" (open) or "Where everyone
landed" (locked). Boards: `PickOneEntry` frames 4 and 5, and `PickOneResolve`.

- The row: the 28px slot, the answer in `body` 600, and the share in `numeral` 15 `--ink-2`,
  right-aligned. Under it, a 12px bar, radius 6, with the market's surface as its track and its
  ink as its fill; the track's full width is 100%.
- Each person's whole stake sits on their pick. An answer's share is the stake on it over all
  stake, rounded by largest remainder so the printed shares sum to 100. An answer nobody picked
  shows an empty track and 0%.
- Your stake is drawn in your hue at the left end of your pick's bar, separated by a 2px gap in
  the ground colour, and your 22px avatar sits on that row. Nothing of yours appears on any
  other bar: the slivers of the last revision showed a spread that no longer exists.
- A no-stake entry is a person, not weight: an 8px hollow dot at the left end of its pick's bar.
- No marker and no leader. Shares print from the third entry; before that, the bars alone. When
  one stake is more than half the total, the caption says so in words (4.9).

**Answers that are people** are unchanged: the avatar and first name, and a bar that stays in
the market's ink (4.5).

**Blind** (`PickOneEntry`, frame 5). Nothing before you're in, as on any market. Once you're in,
every bar grows as in the entering moment, with everyone in so far, and your pick is final: the
entry line's caption reads "2 beers · final" and there is no Change. The who's-in row counts
against everyone asked ("4 of 6 in"), with the people still out as dashed avatars (3.42). Before
anyone enters, one `body-sm` line above the primary in the sheet, after the 16px lock glyph,
says what is about to happen: "You see everyone's once you're in. Yours is final then." The lock
chip and "Numbers show when everyone's in." are gone. Why: under the reveal at lock, one holdout
kept everyone else's view closed, which is what pushed askers to lock early with people still
out. Final once you're in keeps what blind is for, since nobody can change an answer after
seeing the others, without the wait.

**Locked** keeps the picture and drops Change. **Settled** is the pick-one settled screen
(3.25).

### 3.32 What's on

Things everyone is watching, mostly games, each with a small menu of questions to ask your
friends. A person browses games, starts one with their friends by choosing which questions to
ask, and settlement stays between those friends. Boards: `WhatsOn` (the tab, as games),
`GamePage` (3.33), `WhoWins` and `Margin` (3.40), `Endings` and `FeedBallot` (3.35), and
`WhatsOnStates` (launch, empty and failed), and `WhatsOnFlow` (starting a game with one
question, 3.38).

**It never looks like a market against the world, or like a sportsbook.** The line sits at
beliefs about the outcome, not at use. What must never appear is any aggregate of what people
think will happen: odds, a price, a percentage, a share, "most picked", or how any group called
it, voted or settled. What may appear is how much a game is being used. A count of friend groups
on a game says nothing about what any of them believe, and it is what makes the tab feel like a
shared moment. No sportsbook words anywhere (4.6).

- No number about anyone's belief on What's on, or on a game's page before you are in the
  question: no percentages, no shares, nothing picked. The one cross-group number is a count of
  groups.
- Popularity is the number of friend groups that have started anything on a game since it was
  listed, counting a group once one of its markets on the game has a second person in. It is
  never the number of people, never the number of questions, and never anything they picked.
- What a person sees about use is limited to games they are already on. A row reads "You're on
  this with the Friday crew", with the you're-in mark, when a group they are in has started the
  game, and tapping it opens that group's game page.
- Nothing about any group the person is not in: no names, no picks, no results.
- A game leaves the list when it starts, since everything on it closed at kickoff. A finished
  game leaves nothing behind on What's on.

**The tab** (`WhatsOn`):

- Header: "What's on" as the root's `label`, and nothing under it: the games say what the tab
  is.
- One row per game, never one per question: a game with four questions would otherwise fill the
  tab. The row, a `button` with a chevron: the two 28px team stamps side by side with a 4px gap,
  away first as in "Chiefs at Bills"; the game in `body` 600 ("Chiefs at Bills"); and a meta
  line in `caption` `--ink-3`: the start time, then the count once ten groups are on it ("Sun
  4:25pm · Asked in 214 groups"), or, in place of both, your own use ("You're on this with the
  Friday crew", after the you're-in mark). What's on is browsed, and the move lives on the game
  page. A curated event with no teams, such as an awards show, takes the same row with its
  curated mark's 40px stamp where the team stamps would be. That row is for after submission:
  every What's on row the build lists comes from the feed, and nothing stands behind a curated
  event yet (the launch frame's "Tuesday's Wild Card games" is drawn, not built).
- **Most asked** comes first: a `label` and one card holding up to three games, the most-used
  first. A game qualifies once 10 groups have started anything on it; the section shows however
  many qualify, up to three, and is not rendered when none do. Ten is the floor because below it
  a count is noise, a small one reads as nobody caring, and a count of two or three can tell
  someone whose group it is. It is a shortcut, so its games also appear under their day.
- Then the schedule, unchanged in shape: sections by day ("Sunday, Sep 27") in `label`, soonest
  first, each one card of game rows in start order.
- Why popularity sits over a schedule rather than replacing it: a popular Tuesday game and a
  quieter Sunday one both matter, and the Sunday one closes first. Most asked gives popularity
  the top, and the schedule keeps every game findable by when it starts.
- At launch almost nothing has been started, so Most asked isn't there and what remains is the
  schedule (`WhatsOnStates`, A), which never reads as a broken ranking.
- Games come from the sports feed, with anything curated by hand beside them, and each leaves
  the list at its start.
- Nothing upcoming (`WhatsOnStates`, B), the feed failing (C) and nothing saved (D) keep their
  states and their words, and the saved games under the failure are game rows like any other. A
  curated event with no teams appears in A, under Tuesday, and waits for after submission.
- No badge, dot or count on the tab, ever. New games arrive silently, never appear in Needs you,
  and never send a push.

**Curation**, by hand for the hackathon, alongside the games the feed lists. Public events only.
Nothing involving minors, so no school or youth sport. No sponsored placement and no paid
ordering. Every question must resolve from a public result, with its edge case written into its
terms ("If no game goes past nine innings, it's no."). Also out, added here beyond the brief:
anything about injury, health, or anyone's private life. A game's menu is fixed (3.33); a
curated event's menu is its curated questions, of any kind, with pick-one at six answers.

**Why a tab.** What's on has to be visible at all times, including to someone whose Now is full.
I weighed three homes:

- A permanent section on Now. At the top, it would push the rows only this person can move below
  things nobody is waiting on them for, which breaks the ordering Now exists for (4.7). At the
  bottom, an active person with a long Now never reaches it, which is the "only appears when
  nothing else is on screen" failure in a different place.
- The Start sheet, which has since gone (6.1). Public questions are a way of starting, so they
  fit the sheet's meaning, but only someone who has already decided to start something ever sees
  the sheet. That makes them findable but never visible.
- A tab. It is visible on every root, one tap away, and a real place to browse. The cost is one
  built component (the bar), plus an amendment to the rule that nothing else earns a tab. That
  rule's reason is that every market is reached from something that already mentions it. Public
  questions are the one thing nothing in the app mentions first, so the tab passes the test the
  rule was protecting. 6.2 records the exception as a sixth rule, with the test attached.

The tab is the second of four: Now, What's on, People, You. It sits beside the root, where the
eye starts, and leaves the two tabs about people together. Its icon is a ticket stub, drawn like
the other tab icons at a 1.8px stroke on a 24px grid. It is shell furniture, like the three
existing tab icons, so the closed set of eight structural icons does not change.

### 3.33 The game page

Tapping a game opens its page. It is an index, never a new kind of market screen: a header with
the two teams and the time, then a short stack of cards, one per question the group is running.
Each card is collapsed to the question and where it stands, and tapping one opens that
question's ordinary market screen with its own pinned sheet (3.24). The page has no pinned sheet
while the game is ahead, so three sheets never share one screen. Board: `GamePage`, four frames.

**Whose page.** A game page belongs to one group: the game and the set of people it was started
with. From What's on, a game you are on with one group opens that group's page; with two or
more, the most recent, with the groups as context chips (3.19) under the header to switch
between; with none, the start below.

**The header** is a band on `--surface-2`, since the page is the neutral room and each question
keeps its own ink (7, step 5): the two 44px team stamps on the left, the start time in `label`
`--ink-2` on the right ("Sun 4:25pm"), the game in `serif-l` ("Chiefs at Bills"), and one
`caption` saying who asked and when everything closes ("You asked the Friday crew. Everything
closes at kickoff."). Controls: back, and More once the game has been started. The questions in
the cards are `body` 600, because the title takes the screen's serif (1.2).

**Starting a game** (frame A). Groups have no admins, and that stays: whoever starts a game from
What's on is its asker, and the asker already chooses the question, so they choose which
questions to start with. The group sees only those. Under the header, "What to ask" in `label`,
then the game's menu as 56px checkbox rows (`role="checkbox"`): a 28px glyph, the question's
short name in `body` 600 over one `caption` saying what kind it is, and 3.20's 24px selection
circle on the right. "Who wins" is checked when the page opens, the common case at one tap. The
sheet: the chalk "Next: who's in", disabled with nothing checked, and no caption; the checkboxes
are what the group will see. Then who's in (3.20), with the band showing the game, and the terms
step: each chosen question's written terms in `--ink-2`, locked as What's on terms are (they are
written to resolve cleanly against a public result), one Stakes row that applies to every
question started together, and the consent line (3.35). (Amended 2026-09-27: with the first
drive among the questions chosen, the one line says both settlers, "If nobody votes, the final
score settles the others and the play-by-play settles the first drive."; the first drive alone
says the play-by-play's line. The line has to be true for every question it stands above.) "Send
it" creates one ordinary market per checked question, all with the same people, all closing at
kickoff. With more than one, the link sent to the chat is the game page's (3.27); someone
arriving from it lands on the page and enters each question from its card, with the usual
arriving-from-a-link sheet (3.17) on the question they open. `WhatsOnFlow` draws the whole start
for one question (3.38).

**The menu**, fixed per sport and written by What's on:

| Menu row | Question | Kind | Offered |
| --- | --- | --- | --- |
| Who wins | "Who wins, Chiefs or Bills?" | Between two teams (3.40) | Always |
| By how much | "By how much, Chiefs or Bills?" | The margin (3.40) | Always |
| Total points | "How many points, Chiefs and Bills together?" | A number (3.26), unit "points" (runs or goals by sport) | Always |
| The Bills' first drive | "How does the Bills' first drive end?" | Pick one: Touchdown, Field goal, Punt, Turnover, Something else | Only for games with play-by-play |

Everything closes when the game starts. Questions on quarters and halves are for after
submission (7), and they close at the start like the rest, so nothing is ever entered while a
game is being played.

**Once started** (frames B and C). "Questions" in `label`, then one card per running question in
the menu's order. A card is one `button` on `--surface` with a 1px line and radius 12: the
question's 40px stamp on its field, the question in `body` 600, a meta line in `caption`
`--ink-3` saying where it stands, and a chevron. For the two sliders, a 20px-tall line under
that: the two 20px team stamps at its ends, a 6px track on the question's field with a 1px tick
at the middle, and, once you're in, a 12px dot in your hue at your value and a 2px `--ink` tick
at the group's number.

Where it stands, in the meta line:

| State | Meta line |
| --- | --- |
| Open, not in | Open mark, "Closes at kickoff · 3 of 6 in", with the citron dot if it is the soonest thing waiting on you (3.15). No numbers: nobody sees where anyone landed before they are in |
| Open, you're in | You're-in mark, your entry and the count: "You're in at Bills 70% · 5 of 6 in", "You're in: Field goal · 5 of 6 in" |
| Locked | Locked mark, "Waiting on the final score" |
| Voting | In-voting mark and the clock ("Voting ends Mon 7:45pm"), with the citron dot when it is your vote |
| Settled | Resolved mark in the question's ink, the outcome in the market's words, then your line: "Bills won · you were closest", "Bills by 7 · Theo was closest", "41 · you were off by 6", "Field goal · you called it" |
| Voided | Voided mark and the reason in three words or fewer: "Void · results disagreed", "Void · a tie" |

**One question against four.** With one question running, the page is that one card and, under
"Add another" in `label`, the rest of the menu as dashed 64px rows (the dashed border that means
not happened yet, 1.5): a 40px dashed square with a plus, the question's short name in `body`
600 over its kind in `caption`, and "Add" in 13px 600 on the right. Anyone in the group can add
one, the way anyone can ask a market: tapping a dashed row opens the terms step for that
question with the same people already chosen. With all four running there is nothing to add, and
the stack is the page. The dashed rows leave at kickoff.

**Elsewhere.** On Now, a game with more than one question in a group is one row, never one per
question (4.7). In a timeline it is one story (3.4). A question's own market screen, when it
came from a game, carries one 44px row under its band, "Part of Chiefs at Bills" in `body-sm`
600, after the two 20px stamps, with a chevron, back to the game page, on a 1px line at radius
10. It shows with one question too, since the page is where the rest of the menu waits. A game
with one question is that question everywhere, apart from this page.

**Once the game is over**, the page is the night (3.37, frame D).

### 3.34 You: how your calls land

You is where the product's claim is added up: every market's score is already a measurement of
how well-calibrated the people in it are, and nothing new is collected to draw this. Boards:
`You`, with everything in place, and `YouEarly` for before there is much to show.

The screen, top to bottom: identity (the 56px avatar, the name in `body` 600, one caption such
as "In 43 markets since March", or "Joined today" with none yet), then "How your calls land",
"Numbers", "Questions you asked" and "Account". The stats come first because they are what You
is for. Only this person's own calls appear, with no score, grade or rank, and no comparison
with anyone else.

**How your calls land** (yes-or-no):
- What counts is every scored position on a resolved yes-or-no question. Voided and expired
  questions count in neither direction. Pick-one entries are left out: a pick says nothing about
  how sure, so it has no place on a confidence axis.
- Bins are the tenths of the weight line (`bucket(v) = ceil(v / 10)`, with 0 joining the first),
  so the plot and the market screen share one grid. For each bin: the calls, how many happened,
  and the mean of what was said.
- The picture: a reliability plot 318 by 236 inside its card, with "How often it happened" in
  `caption` above it and "What you said" under it. x runs from 0% to 100% with ticks at 0%, 50%
  and 100%; y runs from 0% to 100%, with gridlines at 0, 50 and 100 and a dashed `--line-strong`
  diagonal from corner to corner labelled "right on". Each bin with a call is a dot in your hue
  at (mean said, share that happened), with radius 3 + 1.6√n px and a 2px ring in the card's
  surface, and behind it a 2px whisker at 0.45 opacity spanning the bin's 80% Wilson interval.
  There is no floor per bin: a bin with two calls draws a small dot with a long whisker, which
  shows how little it rests on, and hiding it would hide part of someone's record behind bins
  they haven't filled.
- The headline, in `serif-l`, names the bin with the most calls: "When you say about 70%, it
  happened 7 of the 10 times." It uses counts rather than a second percentage, because a count
  says how much the claim rests on.
- One caption under the plot, the total: "40 yes-or-no calls since March." The dots' sizes say
  how much each rests on, and no line explains them. A second caption counts pick one, which is
  never plotted: "Pick one: you called 5 of the 9 you were in."
- The floor is ten resolved yes-or-no questions before the plot draws. Below ten, one result
  moves the overall hit rate by ten points or more, the whole width of a bin, so every new
  question would redraw the picture.
- Under ten (`YouEarly`, frame B): the same frame with only the diagonal, at 0.6 opacity; a
  title in `body` 600, "Your picture draws at 10 resolved calls. 3 so far."; and the calls
  themselves as rows (28px stamp, "You said 70% · it happened", the question in `caption`). The
  count is a fact and not a progress bar: nothing fills, nothing marks reaching 10, and nothing
  asks the person to enter more.

**Numbers:**

- For each resolved number market, the distance is |your number − the answer| divided by the
  width of that market's scoring scale (3.26), capped at 100%. That is the score's complement,
  so the payout and the record are one number. The scale itself is never shown, and this must
  not become a way to see one, so only aggregates appear: never a single market's distance and
  never a tick per market.
- The headline in `body` 600 reads "On numbers, you land 15% of the range away." The picture is
  a line from "spot on" to 50% (distances past 50% sit at the end). Your average is a 3px cream
  mark, the middle half of your distances is a 6px band in your hue at 0.45, and a dashed
  reference at 25% is labelled "guessing the middle". That is the average distance of a guess at
  the centre of every range, if answers fell anywhere in it. The caption reads "7 number
  markets. The band is the middle half of them; the cream line is your average."
- The floor is 5 resolved number markets. Under that, one line ("Numbers draw at 5 number
  markets. 2 so far."); with none at all, the section is not rendered.

**Questions you asked** (the clean-resolution rate):

- This counts the questions you asked that ended, and how many resolved without a void. A void
  by quorum vote, or by an arbitrator finding the terms undecidable, counts against the asker.
  Expiry counts against nobody and is left out of both numbers, and so does a What's on void,
  whether the two results disagreed or the terms voided a tie (3.35, 3.40). There is no floor,
  because this means something from the first question.
- The headline in `body` 600 puts the count first and never uses a percentage: "11 of the 12
  questions you asked ended cleanly." With one: "The one question you asked ended cleanly."
- The picture is one 16px state mark per counted question, in the order they ended: the resolved
  disc in `--ink` and the voided mark in `--ink-3` (3.23), wrapping.
- The caption names what went wrong, because a void is fixable next time by wording: "The group
  voided “Does Maya make the 7:40?” Two others expired, which counts against nobody." With more
  than one void, it names the most recent, "and 2 others".

**Nothing yet** (`YouEarly`, frame A): when nothing has resolved and nothing asked has ended,
the stats collapse into one card with one line: "Nothing has resolved yet." There is no empty
chart and no zeros (4.7: one line that names the empty case).

**Account**: one card of rows, each `body` 600 over a `caption`, with a chevron: "Your units"
("Beers, coffees, a next time, “dumpling run”"), "Your marks" ("The emoji you've used, most
recent first", with your stickers once you have any), "Your number" ("Used to sign in. Nobody
else sees it."), "One tap" ("Settling, calling it even, saying yep, getting in. Voting always
asks.") with a switch where the chevron would be (3.41), and "Sign out" with no caption, which
asks once in a sheet (3.12, destructive). Sign out is the one way to leave the product, and it
lives only here (4.7). While the build is still finding the cause of the installed app's bottom
band, a tertiary "Measure the screen" sits under the card; it leaves with the cause. After
submission, an "Appearance" row joins the card (8.1). When pass the phone is built (3.45, the
round after this one), "Your PIN for a friend's phone" joins it under One tap; until then it is
not drawn on `You`.

(Amended 2026-09-28, Round D, built: the "Appearance" row is in the card between "Your number"
and "Pass the phone", captioned with the current choice ("Match your phone", "Always dark",
"Always light"), opening the three-row sheet of 8.1; the PIN is set inside the pass-the-phone
flow, so no PIN row is drawn.)

(Amended 2026-09-27, built. The screen is as above, with three readings: the "One tap" row is
not drawn, since pass the phone takes its place (built 2026-09-28: the row "Pass the phone" with the
switch, `body` 600 over the `caption` "Get into a market from a friend's phone, with your PIN. Voting
always asks.", between "Your number" and "Sign out"; 3.41's ask is dropped, 3.45); "Your number" carries its caption and no chevron, because the app
never holds the number, only its salted hash, so there is nothing behind the row to open; and
"Your units" and "Your marks" open a sheet listing what this person has used, read-only, since
the editor and the marks list behind them are not designed (7). The calls themselves are listed
as rows under the floor only, as `YouEarly` draws them. "In 43 markets since March" counts the
markets this person is in, any state but a draft or a removal, since the first entry.)

This revision draws the stats on You only. Whether friends ever see someone's clean-resolution
rate is a separate decision, and nothing here depends on it.

### 3.35 The ballot when a final score answers it

For What's on questions a final score answers (who won, how many points, how many runs), the
ballot opens with the result already proposed from the sports feed, and the group confirms it in
one tap. Board: `FeedBallot`.

- **A proposal, never a decision.** The server can never cast a vote, and the group still has to
  confirm. So the proposal is credited to its source the way a ruling is credited to the
  tiebreaker everyone agreed to: the terms said "Decided: By the final score", and the ballot
  shows the score as the thing the terms named. Nothing on it says the app decided.
- **The source card** stands where a person's claim card stands (3.25) and differs from it in
  every channel that says who is speaking: no avatar and no "says". It has a kicker with the
  ticket glyph, "From the final score"; the score as two `body` 600 rows, each a 20px team
  stamp, the team and its number, winner first and the losing side in `--ink-2`; and one
  caption, "Final, Sun 4:12pm. The terms said the final score decides." It has no clip, because
  nothing was filmed.
- **The sheet** is the ordinary voting sheet: the count line ("Nobody has said yet. Two of you
  and it settles."), a chalk that names the outcome in the voter's voice and names the team
  ("That's right, the Giants won"; for a margin "That's right, Giants by 7"; for a number
  "That's right, 41"), and "Not how I saw it", which works as it does anywhere.
- **Telling the two apart.** A question a final score can't answer, such as the first drive,
  never gets a source card. It waits for someone to say what happened, and the ballot opens on
  that person's claim card, with their avatar, "Maya says a field goal" and the clip if there is
  one. The ballot tells the two apart by who is speaking: a person, with a face, or the score
  the terms named, with none. A template is flagged as answerable by the score when it is
  written; nothing is inferred later.
- **Closed, waiting on the score.** The sheet reads "The final score will propose what
  happened." For two hours past the event's expected end, that is all; then a tertiary "Say it
  yourself" appears and opens the ordinary claim, in case the feed is late or has nothing.
- **The consent, at entry.** Every entry on a What's on market consents to the final score as
  the tiebreaker, so the terms say so where people actually read them: in the entry sheet,
  directly above the primary that gives the consent, one `body-sm` line in `--ink` after the
  16px ticket glyph, "If nobody votes, the final score settles it." The details' "If it's
  unclear" row carries the whole rule: "The final score. If the two results we check disagree,
  it's void." Board: `Endings`, frame 1.
- **Nobody votes.** The market still ends, one of three ways, and the settled screen says which
  in one `caption` line after the 14px ticket glyph, under the outcome and its caption
  (`Endings`, frames 2 to 4):
  - Both results agree: it settles after a day. "Decided by the final score, as the terms said.
    Nobody voted within a day."
  - Only one result exists, which is always true for hockey: it settles after three days if that
    result has not changed. "Decided by the final score, as the terms said. Nobody voted, and
    the score held for three days."
  - The two results disagree: it voids. The outcome line is "No final score to go by." and its
    caption "The two results we check disagreed, so it's void. Nothing changes hands, and it
    counts against nobody." Nobody wrote anything wrong, so it never counts against the asker
    (3.34).
- After the line, everything follows as usual: the photos or the slot, the call line or ruler,
  the who's-in row, closest first, who's got who. A void keeps the photos or the slot and has
  none of the rest, and no sheet (3.37). Before any of the three acts there is one warning, and
  after it one notice (4.10).

### 3.36 Multi-choice: dividing a stake (for the contract redeploy; do not build yet)

This section is for the contract redeploy. It is not part of the current build, and nothing in
it should be built before the redeploy ships. Its board, `SpreadRedeploy`, carries the same
warning.

- **One kind of market, chosen at entry.** Everyone picks one by default, exactly as in 3.30,
  and anyone who wants to can divide their stake across the answers instead. The asker doesn't
  decide for the group; the person who cares about nuance opts in. Under the answers sits one
  tertiary, "Divide it instead". The word "spread" never appears on screen: it is a sportsbook
  word (4.6).
- **Dividing.** The sheet raises to "Divide it". Each answer is a row with its value in
  `numeral` 15 on the right and a bar underneath: a native `range` per row, step 1, a 44px hit
  area, a 20px chalk thumb and a fill in your hue. Values start at the even split (20% each with
  five answers; with a remainder, the first answers take the extra points, so 34, 33 and 33 for
  three). The total must be exactly 100, in whole numbers.
- **Where raising takes from: a share left to place.** Lowering an answer frees its share into a
  pill at the top right, "15% left to place", ringed in your hue, or "All 100% placed" when
  nothing is free. Raising takes only from what is left, and each bar stops at its ceiling,
  marked with a 2px tick at its value plus what is left. The primary is enabled only at nothing
  left, "I'm in, divided like this, 2 beers"; otherwise it is disabled and reads "Place the last
  15%". Two tertiaries: "Start from 1% each" sets every answer to the floor and puts the rest in
  the pill (95% with five answers), for someone who would rather build up than trade down; "Back
  to one pick" returns to picking.
- **Why a pool rather than taking proportionally.** Taking proportionally from the rest keeps
  the total at 100 without a pool, but it moves numbers the person never touched. That is the
  reason pick one lost its implicit division: the app deciding something the person never said.
  Taking from the largest answer, or from a neighbour, fails the same way. With a pool, every
  number on the screen is one the person set, or the even start they accepted, and it is still
  one hand and two drags: lower one, raise another.
- **The floor.** No answer goes below 1%. Multi-choice uses the logarithmic score, where a
  person's score depends only on what they gave the answer that happened. Its one hazard is that
  0% on the true answer is punished without limit, and the floor bounds the loss. A bar can't be
  dragged below 1%, and no value ever reads 0.
- **Where the stake sits.** A pick puts its whole stake on one bar (3.31). A divided stake puts
  stake × share on every answer, drawn in your hue on each bar it touched, so the slivers return
  here, because here the person set them.
- **The entry line** reads "You divided it, most on John" over "John 60 · Nobody 25 · 5 each on
  the rest · 2 beers".
- **Settled.** Closest first, ranked by how much each person gave the answer that happened;
  under the logarithmic score that order is exactly the score. A divider's row reads "divided
  it" under the name and "gave it 30%" on the right. A picker's reads "picked Priya", with
  "picked it" on the right when that was the answer. The gap bar runs from what they gave to a
  cream tick at 100%, the 1px tick sits at the even split, and ties share a rank with "=".
- **For the contract, before the redeploy.** How is a plain pick scored under the logarithmic
  score? A pick at 100% gives every other answer 0%, which is exactly the unbounded case the
  floor exists for. This design assumes a pick is scored as 100 − (k − 1)% on the pick and the
  floor on each other answer, and it never shows those numbers: a picker's row says "picked",
  never "gave it 1%". Confirm that, or its replacement, before the redeploy.

### 3.37 After it ends: the settled screen, the empty photo state, and the memory it leaves

A market's own screen once it has ended, whatever the ending. Boards: `Leaderboard` (14, settled
with photos), `SettledPhotos` (no photos yet; someone who wasn't in; voided; expired) and
`Memory` (15, the same market weeks later). This section is complete on its own: build from it,
and treat the boards as pictures of it.

**Settled, yes or no** (`Leaderboard`), top to bottom:

1. The header: back and More.
2. The question band (3.25): the stamp, the resolved disc in the market's ink and "Settled Sat
   at 12:14am", the question in `serif-l`, the asker line.
3. The outcome line in `serif-l`, in the market's words ("He did.", 3.25), 20px under the band,
   then the claim's line in `caption` `--ink-2` ("Out cold, 1h 12m in."). Here the outcome comes
   before the frame, because on this screen it is the news.
4. The frame at 200px, 14px under the caption, and the strip: the claim's clip first, credited
   to the claimant, then memories, then the add tile for someone who was in (3.8). With nothing
   added yet, the empty slot for someone who was in, and nothing for anyone else.
5. The call line at screen size (3.5), 32px pins, 14px under the frame or the strip.
6. The who's-in row (3.42), 10px under the call line: the stack, "5 of you in", and share and
   copy, for anyone who can see the market (the code is dead at lock, 3.42 amended 2026-09-28).
   Share sends the result tile.
7. "Closest first" (3.7), with at most one annotated row.
8. "Who's got who", grouped by owner: the owner's 28px avatar and "John's got" in `body` 600,
   then the people they owe as tokens under it. Then one `caption` naming who called it even
   ("Called it even: you and Priya, John and Gabe.").
9. No sheet. Nothing is anyone's move (3.24).

**Number and pick one.** A number market's outcome is the sentence with the number ("14 shirts,
then a seam gave out."), its caption says who was closest ("Theo was closest, off by 2."), and
the ruler stands where the call line would. A pick-one market's outcome names the answer, its
caption names who called it, and "Everyone's pick" replaces the call line and closest first
(3.25). The frame, the who's-in row and who's got who are the same, and there is no sheet.

**Voided** (`SettledPhotos`, frame C): the voided mark and "Voided Sat at 1:05am" in the band;
the outcome line "Nobody could tell." with the caption "Nothing changes hands."; the frame or
the empty slot; the call line with every pin and no wash or cap. No closest first, no who's got
who, and no who's-in row: no result tile tells a void, so there is nothing to send. Nobody gets
a sheet; someone who was in adds from the slot or the add tile. A void by the tiebreaker's
finding says so in the caption: "The terms didn't decide it. Nothing changes hands."

**Expired** (frame D): the expired mark and "Closed for good Sun at 9am"; the outcome line
"Never settled." with the caption "Nobody said what happened before it closed for good."; then
as voided.

**Someone who wasn't in** (frame B): the same screen with no add anywhere. The frame shows, the
empty slot and the add tile never do, and share is on the who's-in row as for everyone.

**Adding** works the same from the add tile and from the empty slot: the phone's photos, the
library first, several at once, each landing as a placeholder at the end of the strip (3.8).
When the first lands, the slot becomes the frame and the add tile ends its strip.

**The memory it leaves** (`Memory`). The same market opened once the day it ended is over (from
the second calendar day in the viewer's zone, the way "yesterday" is counted everywhere),
usually from a story in a timeline, often months later. It leads with what people come back for,
the photos, and drops the ranking. Top to bottom:

1. The header: back and More.
2. The question band, with the ending's mark and the date where the clock was ("Sat, Aug 22").
3. The frame at 260px, 12px under the band, then the strip. The claim's clip leads, credited.
   With nothing added: the empty slot for someone who was in, and nothing for anyone else. With
   photos, the add tile ends the strip for someone who was in.
4. The outcome line in `serif-l`, 18px under the strip, then one `body` line in `--ink-2`: the
   claim's line, then who was closest ("Caught a shoe on the way over and landed fine. Theo was
   closest, at 90%."). On a number market the second half is "Theo was closest, off by 2."; on
   pick one, "Theo called it."
5. The call line, ruler or pick-one rows, as on the settled screen, then the who's-in row with
   its icons.
6. What it left: one `--surface` card of the consequences, grouped by owner, with no heading.
   Each row follows 2.1's direction encoding ("Gabe's got Theo" with Gabe's avatar leading,
   "You've got Theo" right-aligned with your token). A closed one carries the settled or
   forgiven mark before its sentence. There is no settle control here; settling lives on the
   person view (3.10). A market that moved nothing shows the one line "Nothing changed hands."
   instead.
7. "The rest of that night", in `label`: other events that share at least two people with this
   market, the viewer among them, and happened between six hours before it closed and six hours
   after it ended. Oldest first, at most five, in one `--surface` card of rows: the kind's 16px
   icon and label in 13px 600 `--ink-3` ("Covered a round", "Argument"), the subject in `body`
   600, one `caption` ("Nobody's paying it back", "Ruled for Priya."), and a 60px thumbnail on
   the right when there is a photo. Each row opens its event. When the market closed between 5am
   and 5pm in the viewer's zone, the heading is "The rest of that day". With none, the section
   is not rendered.
8. No sheet, as on the settled screen. The add tile's name says "from that night" once it is a
   week old.

Closest first leaves the memory screen: the call line already shows where everyone was, and
months later the ranking is not why anyone opened it. Sizes: 13, 15, 17 and serif 26.

**A game's night.** Once a game with more than one question is over, its game page is the
night's memory and follows the memory screen, not the settled one (`GamePage`, frame D). The
header's title becomes the final score in `serif-l` ("Bills 24, Chiefs 17.") and its line the
date and who asked. Then the frame at 260px with the photos from every question of the game in
one place: each question's claim attachments first (a question settled by the score has none),
then every memory in the order added, credited, with one counter across them all. Then
"Questions" and the settled cards, whose meta lines give each outcome and your line (3.33). Then
who's got who across the night, one row per pair and unit summed over the questions. Then "The
rest of that night", which leaves out the game's own questions. The page has no sheet: the add
tile ends the night's strip ("Add photos from Sunday"), and a photo added there attaches to the
game's first question, so it shows in that question's frame and in the night's. Each question's
own screen keeps its own photos, and its "Part of Chiefs at Bills" row leads back here.

**The claim card** (3.25; `Voting`, `PickOneResolve`, `FeedBallot`): the market's surface, a 1px
line, radius 12, 12px padding, 12px from the screen edges, a 12px gap between its two parts. On
the left the 72px clip, radius 10, with a 28px `--scrim` play plate on video (a photo or a
screenshot has none). On the right the claimant's 22px avatar and "Priya says he fell asleep" in
`body` 600, and under them in `caption` `--ink-3` the claim's line and when the clip was taken
("Out cold, 1h 12m in · shot 11:52pm"). With more than one attachment the clip carries a `+2`
chip; with none, the card is the avatar and the words alone. Tapping the clip opens it full
screen.

**Amended 2026-09-27: the album is open the whole time.** The frame this section describes no
longer fills at the end: it has been everyone's since the first photo (3.39, amendment). What
changes here is only that "the news" the settled screen leads with may already have been seen
while the market ran; the order, the credits, the empty slot, the add tile and who may add are
as written.

### 3.38 The rest of the screens, in text

Every screen that matters, in words, where its board drew more than its component sections say.
Components keep their own sections; this gives each screen its order and fixed copy, and notes
where a board is older than the text.

**Now** (`Now`, 4.7). The header is today's date in `label` `--ink-3`, the weekday spelled out
("Thursday, Sep 24"), 20px from the top, with nothing on the right. Needs you starts 16px under
it, then Running, then Just happened, each headed in `label` and each gone when empty. Only the
soonest row with a clock carries the citron dot, and the tab bar carries none anywhere (6.4,
amended 2026-09-28), so one citron element is in view (4.5). The board draws three dots; the
text wins. Nothing sits above Needs you or between the three sections: a claim to accept is a
Needs you row with "That's me" as its verb, and a cover to confirm is its yep row (4.7).

**First run** (`FirstRun`): as 3.14 gives it, top to bottom, with Start hidden.

**The person view** (`Main`). Top to bottom: back and More; the identity row and the open header
(3.10); the cancel-out row when a unit runs both ways; the shared-context band (3.21), with no
helper line; "Coming up" in `label` `--ink-3` with any upcoming cards (3.4); the today rule; the
timeline by date, newest first, dates in `label`; a 44px tertiary "Show earlier"; and the rally
last. The today rule is "Today" in `label` `--ink`, a 1px `--ink` hairline filling the row, and
the date in `caption` `--ink-3` ("Thu, Sep 24"). The rally is its own `--surface` card: "The
rally, lately" in `label`, the strip (3.11), its sentence in `body-sm` `--ink-2` ("You've picked
up a few more of these lately."), and one `caption`, "Rounds, coffees and cabs nobody's paying
back." A resolved market follows 3.4, with its outcome in `serif-l` ("He did, 1h 12m in."), a
`body-sm` line naming who was closest and your number ("Priya was closest at 85%. You said
55%."), and the tertiary to the full table. The board sets that outcome in `body` 600; the text
wins. The sheet holds one chalk, "I got this one" (3.43).

**A year ago tonight** (`Main`). When a market between the two of you ended on this date in an
earlier year and has photos, one card sits under the today rule: "A year ago tonight" in
`label`, up to three 84px thumbnails 6px apart, one `body-sm` line naming the question, and a
44px tertiary "Hide this" that hides it for good for that market. Tapping it opens the memory
screen (3.37). At most one a day, and never a notification.

**The story card** (`Story`). 3.4's resolved market as a timeline shows it: the frame at 180,
the outcome sentence and its caption, "Everyone's number" in `label` over the call line or
ruler, the roll call (3.6), then the consequences outside the link, ending "Everyone else called
it even." The card carries no controls; adding photos and sending live on the market's own
screen (3.37). There is no story that opens in place: tapping the card opens that screen.

**The question step and the picker** (`MarkPicker`, `MarkPickerFrames`): as 3.29 gives them.

**Who's in** (`Ask`, 3.20). The band holds the 44px stamp, "Your question" in `label` `--ink-2`
and a 44px tertiary "Edit" on the right that returns to the question step, then the question in
`serif-l`. Under it, "Who's in?" in `body` 600 and one `caption` `--ink-3`: "Everyone you pick
gets the link. Nobody needs an account to look." Then the rows of 3.20, the naming prompt under
the selected row when it applies, and last the dashed "Someone else" row, whose caption is "Pick
people, or just send the link around". The sheet: the chalk "Set the terms" alone.

**Joining with a code** (`Join`, 3.16). "Got a code?" in `serif-l`, reached from the question
step's "Got a code?" (3.29). Then the six boxes, then one `caption`: "There's no O, I, Z, zero
or one in any code." 28px under that, a row: "Got a link instead?" in `body` 600 over the
`caption` "Tap it in the chat, or paste it here.", with a 44px row action "Paste a link" that
reads the clipboard and opens that market's screen (3.17). A clipboard with no market link on it
gets the form-level block: "There's no market link on your clipboard." Join is in the sheet.

**Claiming what was waiting** (`Claim`). The screen a new person sees once, after signing up,
when things were logged under their name before they had an account.

- The header: the wordmark alone and no back, because nothing is behind it, the one exception to
  6.4's back control besides a signed-out link.
- Prints: photos from the waiting stories, 150px wide on a `--chalk` mount with 8px sides and a
  10px bottom, a 118px photo, the date in 13px 600 `--on-chalk`, radius 6, rotated −6°, 3° and
  8°, overlapping in a 200px band with the 1.5 shadow. At most three, the most recent on top;
  with fewer, fewer; with none, the band goes and the headline moves up.
- The headline in `serif-xl`: "You were already in 6 stories." Then one `body` `--ink-2` line:
  "Two weeks with the Friday crew, kept under your name, Maya."
- One group per person, most items first: a 32px avatar, the name in `body` 600 and the count in
  `caption` `--ink-3`, then one `--surface` card of claim rows (4.8): a 13px 600 kicker ("Market
  · Sep 5", with the 20px stamp for a market), the subject in `body` 600, and one `body-sm` line
  with the token ("Priya's got you").
- Each row's control: a 44px target holding a 24px `--chalk` circle with an `--on-chalk` check,
  pressed by default, labelled "Confirm: Priya's got you". A tap unpresses it (a 24px ring in
  1.5px `--line-strong`), and an unpressed item stays unclaimed under the name it was logged
  with. The row itself opens nothing.
- The sheet: the chalk "Yep, all 6 are right", which counts the pressed rows ("Yep, these 5 are
  right"), and nothing under it: the checks already say what a tap does.
- Entries made from a link without an account (3.17) appear here too, found by the number they
  were made with, as claim rows whose line is the entry ("You're in at 70% · 2 beers"), pressed
  by default like the rest. One left out stays under the typed name, in stone, and never becomes
  this person's.
- Tokens here keep their hue border: every row is unconfirmed, so 3.2's dashed style would carry
  no information, and the check already shows the state.

**The market screen, before and after you're in** (`MarketDock`, `JoinLink`, `BlindSlow`). The
participant stack under the band is 28px avatars and one `caption`. Before you're in: "3 friends
are in. Where they landed shows once you are.", with a 20px lock glyph in `--ink-3` on the
right. After: "4 of you in", the row moves under the picture, the count goes under the stack,
and the icons end it (3.42). While some of the people asked are still out, on any market: "4 of
6 in", with them as dashed avatars. From a link, signed out: "4 friends are in". While the
entering moment runs (3.13), the sheet's header reads "You're in at 70%" on the left and the
stake on the right. The asker line names a set as "Priya asked the Friday crew"; a set whose
name can't take "the", such as a possessive, reads "Theo asked · Papa's birthday"; an unnamed
set names its people ("Priya asked Gabe, John and you", three names and then "and 3 others"). A
slow market's time series is headed "The group's number since Tuesday" in `label`, with its days
under it in `caption` ("Tue", "Thu", "now") and the current value in 13px 600 at the right end.

**Voting** (`Voting`). Once voting opens, the entry line leaves and the claim card (3.37) sits
directly under the band; then "Where everyone landed" and the weight line; the sheet is 3.24's
voting row, whose chalk repeats the claim in the voter's voice.

**Closed, waiting** (`DockStates`). The wells are 56px on the market's ground with a 1px inset
`--line-strong` ring, in `body` 600 (pick one: 48px, two across, with 24px avatars), with no
caption: the sheet's heading already asks, and the wells are the answer. The band's clock after
close is "Resolving tonight", the clock 3.15 and 3.23 name, and "Settled Sat at 12:14am" once
settled (amended 2026-09-28, Round C part 2, the owner's ruling: this line used to want the
Decided term's words, "Decided when the movie ends", which contradicted 3.15 and 3.23).

(Cut 2026-09-28, Round C. The tiebreaker rules yes, no, or that the terms don't decide it; a
ruling's confidence is a lean the screen shows ("The app leans yes, 82 to 18.", 3.24), never a
split outcome, and the contract scores a yes-or-no question against 0 or 1. So no argument is
ever ruled split, and the screen below is not built: with it go 3.2's fraction state, 1.2's
uppercase exception for "THE CALL" and "WHAT IT MOVES", 3.4's split argument card, and 3.40's
line that a split ruling settles between the ends. The text stays for the record.)

**An argument, ruled split** (`Split`). An argument's band has no mark: the kicker is the 16px
argument icon and "Argument" in `label`, with the state mark and "Ruled just now" on the right,
the question in `serif-l`, and the 24px context chip where the asker line goes ("Just you two").
Then the positions card: two columns on the surface, theirs on the left with the 32px avatar
leading and "Gabe said" in `caption` over "The fastball" in `body` 600, yours mirrored on the
right with the avatar trailing. "THE CALL" (1.2's uppercase exception): a 12px bar split at the
ruling in their hue and yours with a 2px gap, a 1px dashed `--ink` marker 20px tall at 50%, and
under it in `caption` "Gabe · 40", "even would sit here" in `--ink-3`, and "You · 60". Then the
ruling in `serif-l` ("Closer to the serve, 60 to 40.") and its reasoning in `body` `--ink-2`, at
most two sentences (4.8). "WHAT IT MOVES": the consequence (3.2, halves only), or, when rounding
leaves nothing, a dashed block with "Nothing changes hands" in `body` 600 and the `caption` "A
60/40 moves a fifth of a beer. Rounded, that's nothing, so it goes on the rally.", then three
reference cells on the field: "50/50" nothing, "75/25" half a beer, "90/10" one beer. The
tiebreaker's ruling is final, because everyone agreed to it at entry, so there is no agreeing
step, and as on every settled screen there is no sheet (3.37). Under the ruling and its
reasoning come the empty slot or the photos, then the who's-in row, "Gabe and you" with the
icons, where share sends the ruling; then "WHAT IT MOVES".

**Pick one** (`PickOneEntry`, `PickOneResolve`). Under "Add a person", the asker can add
themselves last, as "You". A blind market with no close time closes when everyone asked is in,
or when the asker closes it early (3.42): its band reads "Closes when all 6 are in", and once
you're in the entry line's caption reads "2 beers · final". Who's got who lists at most three
rows owed to one person; the rest collapse into one `caption` naming them ("Maya and Priya have
got him too."), and the list ends "Everyone else called it even." when anyone is square.

**Starting a game with one question** (`WhatsOnFlow`). The start 3.33 gives, drawn for the
common case, with Jets at Giants. The game's header band stays at the top for the first three
steps: the two 44px stamps, the time, "Jets at Giants" in `serif-l`, and the caption "Everything
closes at kickoff." until people are chosen, then their stacked avatars and the group's name.

1. What to ask: the menu, with Who wins ticked as the page opens. Sheet: the chalk "Next: who's
   in".
2. Who's in (3.20): "Who's in?" in `body` 600, the caption "Everyone you pick gets the link.
   Nobody needs an account to look.", then the saved groups and "Someone else" as a dashed row.
   Sheet: "Set the terms".
3. The terms: the question in `body` 600 after its menu glyph ("Who wins, Jets or Giants?"),
   then its written rows in `--ink-2`, locked. Counts if: "The team with more points when the
   game ends, overtime included." If it's a tie: "It's void." (3.40; "It's scored at the
   middle." once the contract redeploy can score the middle). If it's unclear: "The final score.
   If the two results we check disagree, it's void." Closes: "At kickoff, Sun 1:00pm". Then the
   one Stakes row in a card of its own, since it covers every question started together. Sheet:
   the consent line (3.35) and "Send it". With more questions, each gets its heading and rows,
   in the menu's order, over the one Stakes card.
4. Running: the question's own market screen. Its band, the "Part of Jets at Giants" row (3.33),
   the entry line ("You're in at Giants 70%"), the weight line from one team to the other
   (3.40), and the details "Decided: By the final score" and "Question from: What's on". No
   sheet: the who's-in row reads "Just you so far" with share as the chalk (3.42), and the photo
   slot sits last (3.39).

**You** (`You`, `YouEarly`): as 3.34 gives it.

**The tiles** (`TileAsk`, `TileAskRange`, `TileCalled`, `TilePhoto`, 3.27). Sizes 3.27 leaves
out: "0%" and "100%" at 26px 600 in ink-hi; on the number tile the unit in serif at 60px, the
stamp at radius 20, the field with a 2px inset ring in the ink's line colour and a 4 by 52px
caret; on the result tile a 72px stamp at radius 18 beside the 72px outcome, a 12px track on the
surface, an 8 by 64px cream cap, 52px pins with a 5px ring in the field, and end labels at 22px
in ink-hi.

**The wordmark.** "dareful" in lowercase Young Serif 400. In the app header it is 20px `--ink-2`
in a 48px slot with 12px sides, and it stands where back would only when nothing is behind the
screen (a signed-out link, the claimant screen). On tiles it is 32px in ink-hi, 56px from the
left and 44px from the bottom. It is a logo, outside the type budget.

**The full-screen photo.** Opened from a frame or a strip square: black, the photo fitted, a
13px 600 counter ("2 / 5") at the top left and the 48px close at the top right (for the
hackathon, the close moves to the top left, the counter to the centre of the row, and the
information icon takes the top right, 10.3), the credit chip at the photo's bottom left, and
under it, 44px icon buttons with their words in `caption`: "Make a sticker" (3.28, when the
phone can lift) and "Save" (named "Save to your phone", through the share sheet, 3.39). For your
own memory, "Remove" joins them. Swipes move through the market's photos in the frame's order.
Board: `StickerFromPhoto`.

### 3.39 A photo while the market is open

A photo can be added at the claim and while voting (as evidence, 3.24), and from the moment a
market ends (3.8, 3.37). Nothing covered the window before lock, when the pizza lands and the
phone is already out. Photos taken then are not lost, since they can be added from the library
once it ends; what was missing is the in-the-moment version. Board: `OpenPhoto`.

**What it is.** A memory, never evidence: nothing has happened yet that it could prove. It is
stored like any memory (`media.role = 'memory'`, on the market), counts toward the market's
forty-eight, and never reaches the proposal or the tiebreaker.

**Who can add one.** Only people who have entered. The open screen's job is getting people in,
and for someone who isn't in, entering stays the only move on it: no camera, no photo row,
nothing beside the odds line. It is also the rule once a market ends (a position adds), so one
rule covers a market's whole life. The case for anyone who can see it: a friend at the table who
hasn't entered took the best photo. They can enter, which is what the screen is asking them to
do anyway, or send it to the chat; once they're in, the camera is theirs too.

**Where it goes.** Adding photos while it's open looks exactly like adding them after it ends:
the same 120px empty slot (3.8), and once you've added one, the same 200px frame and strip with
the add tile. While it's open it sits last on the screen, under the details, where it doesn't
compete with entering or with the picture; once the market ends it moves up under the outcome,
where the photos are the screen's news (3.37). "Yours from tonight" is gone, and so is the
camera button that sat in the sheet: the slot is where the photos will land, which says what it
does without a word. It shows only once you're in, so it never sits beside entering. It shows
while the market is open and goes when it locks: from lock until the market ends, anything
attached is evidence, and it goes through saying what happened. Boards: `OpenPhoto`, `AddPhotos`
frames 1 and 2.

**What it opens.** The camera itself (`capture="environment"` on the file input), not the
library: this window is for the photo being taken now. Photos already on the phone wait for the
end, when adding opens the library first. On an iPhone a photo taken this way is not saved to
the phone's own photos, so its full-screen view offers "Save to your phone" through the share
sheet, and the phone keeps the file until it is stored.

**Before it ends, only you see it.** (Superseded 2026-09-27; see the amendment at the end of
this section.) Once you have added one, the frame shows it, credited to
"You", the strip holds the rest (three, then `+N`, then the add tile), and one `caption` sits
under the strip: "Everyone sees these once it's over." A photo still going up is its square at
0.88 opacity with the 2px runner of 5.2 along its bottom edge; one that fails keeps its square
with the camera glyph, and a tap retries. Tapping a photo opens it full screen with "Remove" and
"Save to your phone". Nobody else sees any of it before the market ends: not on the open screen,
not on the locked or voting screens, and not in any notice. Three reasons. A strip of other
people's photos on the open screen would compete with entering for everyone not yet in. From
lock until the end, the screen is about what happened, and a photo from before lock sitting
beside the claim reads as evidence without having gone through the evidence path. And the frame
filling with the night's photos when it ends is the payoff (3.37).

**When it ends.** Settled, voided or expired, the photos join the frame after the claim's
attachment, in the order they were added and credited to whoever took them (3.8), for everyone
the market's rule lets see it: its participants and the group it was asked in. Your frame and
strip move up under the outcome and become everyone's (3.37).

**Edges.** A photo started before lock lands as a memory even if it finishes after; the button
itself goes at lock. Taking a photo sends nobody anything. An argument locks the moment the
second person is in, so its open window is usually seconds, and the button follows the same
rule. Type: the section's words are 13, and nothing new joins the screen's sizes.

**Amended 2026-09-27: the album is open the whole time.** The owner's decision: from the first
photo onward, everyone the market's rule admits (its participants and the group it was asked
in) sees every photo, while it is open, through the vote and after. It is a social album, and
keeping photos private until the end risked stranding them on markets that never finish. So:
the frame and its strip show every memory to everyone admitted from the moment each lands,
credited as always; the same slot and frame sit last on the screen, under the details, while
the market is open and while it is being called, with the add tile and the empty slot only for
someone who is in while it is open (adding after lock is evidence, through the claim, as
before); someone in the group who is not in sees the frame and no add; and the caption
"Everyone sees these once it's over." is gone, since it is no longer true. The rule lives at the
door, not only on the screen. Someone who has opened the link but not entered is not admitted,
so the link page (3.17) shows no photos. The claim's evidence stays on the claim card, never in
this frame, and a memory still never reaches the proposal or the tiebreaker.

### 3.40 Between two teams: who wins and the margin

Both new kinds of What's on market sit between the two teams, so they share one picture: a line
from one team to the other, with a team stamp (1.7) at each end. Boards: `WhoWins` (entering,
in, won, a tie at the middle, a tie that voids) and `Margin` (entering, in, settled).

**The shared language.** Away on the left, home on the right, in the order of "Chiefs at Bills",
on every screen and tile. The stamps replace the odds line's single riding mark: each sits at
its own end, bottom-anchored 30px above the base, growing as the slider moves toward it and
shrinking as it moves away, equal at the middle. With v running from 0 at the left team to 1 at
the right, the right stamp is 18 + 42v px and the left 18 + 42(1 − v): both 39px at the middle,
60 against 18 at an end. Size only, with no fading, because a team's colour is its identity and
dimming one would read as calling it the loser. The track is the odds line's ten segments, but
the fill runs from the middle to the thumb in your hue, since the choice is which way and how
far. A 1px `--ink` tick at 0.5 opacity, 16px tall, marks the middle. The thumb, the native range
and the riding pill are the odds line's (3.13), and the pill names a team.

**Who wins.** The position is how likely the right-hand team is to win, as a whole percent,
scored as a yes-or-no market with the right-hand team winning as yes, however the build stores
it.

- The pill reads the team the thumb leans to and its chance ("Bills 70%", "Chiefs 60%"), and
  "Even" at 50. The header reads "Who wins?" and, on the right, a word band for the lean: 0
  "Chiefs, no doubt"; 1–15 "Chiefs, surely"; 16–44 "Leaning Chiefs"; 45–55 "Close to even";
  56–84 "Leaning Bills"; 85–99 "Bills, surely"; 100 "Bills, no doubt". Under the line: the two
  names at the ends and "Even" in the middle.
- Nothing starts at the middle: the line has no thumb until it is touched, both stamps sit at
  39px, and the primary reads "Slide to pick a side", disabled.
- Entering: "I'm in: Bills 70%, 1 beer". The entry line: "You're in at Bills 70%".
- The weight line (3.22) keeps its ten columns, labelled with the two names and "Even", and its
  marker chip names the team the group leans to ("Bills 62%").
- Settled, a team won (frame 3): the outcome line "Bills won.", the final score as its caption
  ("Bills 24, Chiefs 17."), then the call line between the two teams: the winner's half takes
  the wash and its end the cream cap, and under it the two 20px stamps with their names and
  "Even", the winner's name in `--ink` 600. Closest first ranks by distance from the winner's
  end ("said Bills 85%", "off by 15"; a lean the other way reads "said Chiefs 55%").
- A tie, scored at the exact middle (frame 4; for the contract redeploy, and not built before
  it): the outcome line "A tie.", its caption the score
  and the rule: "Chiefs 20, Bills 20. A tie is scored at the middle, so whoever was nearest even
  did best." No wash on either half; the cream cap stands on the middle, 6px wide and 40px tall,
  and "Even" takes `--ink` 600. Closest first ranks by distance from 50, and whoever is nearest
  even wears the extra cream ring. This needs the contract to take a middle result; an
  argument's split ruling already settles between the ends.
- A tie, if the contract cannot take a middle result (frame 5): an NFL tie voids. The voided
  mark and "Voided Sun at 8:02pm"; the outcome line "A tie."; the caption "Chiefs 20, Bills 20.
  The terms make a tie void, so nothing changes hands, and it counts against nobody."; the call
  line with its pins and no wash or cap; no closest first; no sheet, with the slot or the add
  tile for someone who was in (3.37). Such games' terms say so in the "If it's a tie" row, "It's
  void."; where a tie is scored at the middle, the row reads "It's scored at the middle." The
  deployed contract cannot take a middle result (checked by read-only call,
  tests/db/scoring-chain.test.ts), so the void version is the one built; the middle version
  stays drawn, marked for the redeploy on its board, since the redeploy is exactly when it
  becomes buildable.
- Sports that can't end tied (basketball, baseball, and hockey, which the score settles in
  overtime or a shootout) never show either.

**The margin.** A number market between the teams: how many points the right-hand team wins by,
where a win for the left-hand team is a margin the other way and a tie is zero. People can go as
far either way as they like.

- It is always said in words: "Bills by 7", "Chiefs by 3", "A tie". Never a plus or minus sign,
  never a half point, never a sportsbook word (4.6). However the build stores the sign, the
  screen says the team.
- The entry is the shared line, centred on a tie: the header "By how much?", the pill "Bills by
  7" ("A tie" at zero), and under the line "Chiefs by 35+", "Tie" and "Bills by 35+". The line
  covers the sport's usual range either way (35 for football, 30 for basketball, 8 for baseball,
  5 for hockey), one step per point. Past an end, the number is typed: tapping the pill turns it
  into a numeric field with the keypad, and a two-way choice of team under it. One caption: "Any
  margin. Tap the number to type one." The far-off limit (3.26) applies, from the model's most
  likely margin.
- Entering: "I'm in: Bills by 7, 1 beer". The entry line: "You're in at Bills by 7".
- The weight line is 3.22's number market with one change: the axis stays centred on a tie, as
  wide as the furthest entry either way and the same distance the other way, so "Tie" is always
  the middle label and the ends read "Chiefs by 10" and "Bills by 10". The marker is the
  stake-weighted median, its chip in words ("Bills by 4").
- Settled (frame 3): the outcome line is the margin in words ("Bills by 7."), its caption the
  final score and who was closest ("Bills 24, Chiefs 17. Theo was closest, off by 2."), then the
  ruler (3.5) centred on a tie and as wide either way as the furthest pin or the answer, "Tie"
  in the middle, the ends in words, and the real margin as the cream answer tick with its label
  under it in `--ink` 600 ("Bills by 7"). Closest first ranks by distance ("said Bills by 9",
  "off by 2"). A tie is a margin of zero, so its tick stands on "Tie".

**Team colours stay in the stamps.** The fill, the wash, the columns and the marker keep their
usual colours, so the market's ink still carries place and a team never colours the screen
(4.5).

### 3.41 One tap

Routine actions are signed by the ledger wallet through a share of it the server holds, the
delegated share: settling, calling it even, saying yep to an obligation, and getting in. Using
it lets those go through on the tap alone, with no second step, and it needs the person's
say-so, asked once. Board: `OneTap`.

**What never changes.** Nothing happens without a tap: One tap removes the confirming step after
the tap, never the tap. Voting always asks, and so does saying what happened, because both bind
other people and are signed by the governance wallet, which the delegated share can't reach. The
wallet provider shows no screen of its own at any point, the consent included; if its own
delegation prompt can't be kept off screen, say so, because this design depends on it. Nothing
the person sees here says wallet, share, key, signature or permission (4.6).

**When it asks.** Once, right after the first routine action has gone through, in the sheet that
action was made from, while the step the person just went through is still in mind: the first
settle asks in the settle sheet once the close has gone through (frame 1); the first time in
asks in the space the entry sheet used, once the columns have grown (frame 2, borrowing it,
3.24). Never before an action, never over one, and never on a screen that had no routine action.
If the heads-up (4.10) would be due in the same moment, One tap goes first and the heads-up
waits for its own next moment (4.9).

**What it says.** A modal sheet (6.4) on the current place's surface, with the grabber and the
close. When the action has words of its own, a kicker first: its state mark and "Settled with
Gabe: two beers" in `caption` `--ink-2`. Then "Skip this step next time?" in `body` 600, and two
rows, each a 20px glyph and a `label` over a `body` line:

- the check-in-a-circle glyph, "One tap": "Settling, calling it even, saying yep, getting in"
- the in-voting mark, "Always asks": "Saying what happened, and voting"

Then one `caption`, "Turn it off any time on You, under One tap.", the chalk "Skip it from now
on" and a secondary "Keep this step". The two rows are the whole explanation: what it covers,
and what it never will.

**Saying no.** "Keep this step", the close and a drag down all mean no. No changes nothing:
every routine action keeps its step exactly as it has it now, and the question never comes back.
The row on You can still turn it on. Store the answer on the account, not the device, so a new
phone, a reinstall or a second browser never asks again.

**Saying yes.** The chalk records the consent and closes the sheet, and nothing is announced.
From the next routine action on, the tap is the whole thing.

**On You** (frames 3 and 4). Under Account, before Sign out: "One tap" in `body` 600 over the
`caption` "Settling, calling it even, saying yep, getting in. Voting always asks.", with a 48 by
28px switch where the chevron would be (`role="switch"`, labelled "One tap"): on, a track in
your hue with a `--ground` knob at the right; off, a `--surface-2` track with a 1px
`--line-strong` ring and an `--ink-3` knob at the left. The row is there from the first day,
off, so someone can turn it on before ever being asked, and then the ask never appears. Turning
it off takes effect at once and asks nothing.

**When it stops working.** If the delegated share can't sign (it was revoked, or the server
can't reach it), routine actions quietly go back to their step, as with One tap off, and the
switch shows off. Nothing announces the change and nothing asks again. The switch always says
what is true.

**One check decides a word.** "Getting in" is listed because the build's delegated share signs
entering along with confirming, closing and netting. If that turns out not to hold, drop
"getting in" from both lines, and the ask comes only after a first settle, yep or call-it-even.
Pass the phone (3.45) waits on the same check.

(Amended 2026-09-28, the owner's ruling. **The ask is dropped, and the row is Pass the phone.** On the
phone holding the login, routine actions already show no confirmation: the wallet provider's sheet is off,
and the app's own button is the whole act (docs/decisions.md 2026-09-27, "What delegation would remove,
flow by flow"), so "Skip this step next time?" would offer to skip a step that is not there. Delegation's
real uses are the two devices that cannot sign: a friend's phone (3.45) and a second device of the
person's own without the login. So the delegated share is used only there, signing stays on the device
that holds the login, the ask at the first routine action is never shown, and the switch on You is "Pass
the phone" (3.45), which takes One tap's place in the Account card and sets the PIN in the same flow.
The two rows above, what it covers and what it never will, are kept in that sheet's words: "It allows:
getting into a market from a friend's phone, with your PIN" and "It never allows: saying what happened,
voting, settling, or calling it even". Everything under "What never changes" and "When it stops working"
still holds.)

### 3.42 The who's-in row: sharing, holdouts, and who's in

The row that says who is in, and the one place a market is shared from. It replaces "They're
right here: show a code", "Send the link", "Copy" and "Send how it ended", which were four
sentences and buttons in three places for one act. Boards: `ShareIcons`, `Holdouts`, `WhosIn`,
and every market screen that shows it.

**Anatomy.** Once you're in: on the left, the 28px avatar stack (3.1) with the count under it in
`caption` `--ink-2`, 4px apart; at the right end, four 44px icon buttons, 2px apart, their 22px
glyphs in `--ink`: share (a tray with an arrow up), copy (two overlapping squares), the code to
scan (a code glyph), and pass the phone (a phone with an arrow each way). The last button's
glyph sits on the 20px gutter, so the group hangs 11px into it. Names: "Share", "Copy the link",
"Show a code to scan", "Pass the phone". The count sits under the stack because four icons and a
count beside five faces don't fit one line at 390px. The stack shows at most five circles (four
faces, then `+N`) and at most two dashed ones (one face, then a dashed `+N`). The stack and its
count are one button, which opens who's in (below). Pass the phone ships only with 3.45; until
then the row has three icons and nothing else moves.

**Where it sits.** Before you're in, the row sits under the band as 3.38 gives it, one line with
the lock glyph and no icons: sharing belongs to people who are in. Once you're in, it moves
under the picture (the weight line, the stakes, the claim card), in every state you're in: open,
locked and voting. Settled, it sits under the call line (or the ruler, or "Everyone's pick"),
with its icons, for anyone who can see the market. Voided, expired and removed markets have
nothing to send, so the row is not drawn there. (Amended 2026-09-28, Round C: the code icon is
there only while the market is open, since a room code is one live code per question and dead
at lock (docs/decisions.md, the joining rules); once locked, the row has share and copy. Pass the
phone is open-only for the same reason.)

**Share** opens the phone's share sheet (`navigator.share`, with the market's link and its
question as the title); where there is none, it copies instead and says so as copy does. While
the market is open the link previews as the asking tile, and once it's settled as the result
tile (3.27), which is what "Send how it ended" used to send.

**Copy** copies the link. Its glyph turns to a check for 1.5s and its name becomes "Link copied"
through an `aria-live` region. No toast, and nothing else moves.

**The code to scan** opens a modal sheet (6.4), opaque, on the current place's surface, with the
grabber and the close: the question in `body` 600 as its title, then a 216px code on a `--chalk`
plate, radius 12, with the market's mark in a 44px stamp at its centre (error correction high
enough to carry it), and under it the market's six characters as read-only boxes (3.16's, 48px),
for reading aloud across a table. No instructions: a phone camera knows what to do with it.
Scanning it opens the link page (3.17).

**Pass the phone** opens 3.45. The first time a person taps it, a modal sheet explains it once
(`PassThePhone`, frame 2): its 22px glyph and "Pass the phone" in `body` 600, one line, "A
friend who set this up on their own phone gets in here with their PIN. Nothing of theirs stays
on yours.", the chalk "Hand it over" and a secondary "Not now". After that the icon goes
straight to the friend's entry. Like One tap's answer, it is remembered on the account.

**Just you so far.** While you're the only one in a market you asked, the count reads "Just you
so far", and share becomes the screen's chalk, a 44px `--chalk` circle with the glyph in
`--on-chalk`, because getting people in is the only move left. The first person in returns share
to an icon. A market nobody else joins can be removed from Now with a swipe (3.15); nothing on
its own screen ends it.

**Holdouts** (`Holdouts`, frames 1 and 2). When some of the people the market was sent to aren't
in yet, they follow the stack as dashed avatars (3.1), and the count names both numbers: "4 of 6
in". The icons are how they're reached; nothing else nudges them, and nobody is named as late.
For the asker, while the close is still ahead, a tertiary "Close it with 4" sits under the row.
It is never the primary and never chalk, because the close is coming anyway and closing early
binds everyone else. It asks once, in a modal sheet: "Close it with 4?" in `body` 600, then the
dashed avatars of who it leaves out with one line naming them ("John and Maya can't get in after
this."), the chalk "Close it now" and a secondary "Keep it open". Closing early locks the market
as its close would. A blind market with no close time closes when everyone asked is in, and
"Close it with 4" is how it closes sooner.

**Who's in** (`WhosIn`). Tapping the stack opens a modal sheet, "Who's in" in `body` 600, with
one 56px row per person in: the 36px avatar, the name in `body` 600, and a `caption` only where
it says something ("Asked it"; "From the link, no account" for someone who joined from a link
without an account, whose avatar is stone with a dashed ring, 3.1). No numbers: where people
landed is the weight line's job. For the asker, until the lock, a row from someone without an
account carries a 44px row action "Remove". This is for a forwarded link that brings in a
stranger, since a typed name counts as soon as it's entered (3.17). It asks once: "Remove Alex's
entry?", "It comes out before anything is decided, and nothing changes hands.", the chalk
"Remove it" and a secondary "Keep it". The entry comes out, the count drops, and nothing is sent
to anyone; if Alex opens the link again, the page is the one anyone sees before they're in.
Everyone else in sees the same list without Remove, and nobody can remove an entry from someone
with an account, since the asker sent it to them.

**Words.** "Just you so far", "4 of you in", "4 of 6 in", "Close it with 4", "Who's in". Never
"waiting on", never a name beside "hasn't", never a count of hours or days.

(Amended 2026-09-27, the owner's two rulings on the build. **The count while the asker is
alone:** when the asker named people, the holdouts rule holds from the first entry, "1 of 6 in"
with the dashed avatars; "Just you so far" is only for a question where nobody was named. Share
stays the chalk while the asker is alone either way. **The nudge and the relay are back**,
for entering and for voting: the nudge is the only way someone in a market can prod the people
who have not entered or voted, and the relay, the person's own composer from their own number,
is the only way to reach someone who signed up by phone without installing the app, since
texting is not set up. The card under the row, "Waiting on Maya and John.", with "Nudge them",
says honestly what it reached and offers the relay for anyone no device took; and who's in
lists the people still out under "Not in yet" (or "Still to call it" once locked), each with
"Nudge Maya" beside them for anyone who is in, the relay taking the button's place when nothing
of theirs takes messages. A person hears about a question at most once per six hours, whoever
taps. "The icons are how they're reached; nothing else nudges them" above is superseded by
this.)

### 3.43 I got this one

Logging a cover lives on the person view, because a cover is always between you and one person,
and their page is where you are when you think of it (6.2, rule 3). The + only asks (6.1).
Boards: `GotThisOne`, `Main`.

**At rest** (frame 1). The person view's sheet holds one chalk, "I got this one", and nothing
else: it is the one move between the two of you, so it rests at the bottom like every other move
(3.24). Nobody has to be picked; the page already did that.

**Raised** (frame 2). "I got this one" in `body` 600, then, top to bottom:

1. What: unit chips (3.3) for the units between you, most used first ("Beer", "Round",
   "Coffee"), each after its glyph (2.2), and "$" for an amount.
2. How many: a row of a 48px minus, the count and unit in `body` 600 ("1 beer"), and a 48px
   plus. With "$", the number field (3.26) in dollars.
3. Who picks up next, as two rows that each show what they'll make: the token it will create
   ("Gabe's got you", Gabe's avatar leading, with the unit), selected by default, or "Nobody's
   paying it back", after a small dot in your hue, which is how the rally counts it (3.11). The
   token is exactly what will appear on both pages.
4. "Add a photo of it": optional, the camera glyph and the words, as a row.
5. The primary, which says the whole thing: "I got Gabe a beer" ("I got Gabe 2 coffees", "I got
   Gabe $40").

**Logged** (frame 3). The sheet lowers back to "I got this one". The new token appears on its
owner's side of the header in 3.2's proposed style until Gabe says yep on his Now, and the story
is in today: "Covered" with the context chip, "You got Gabe a beer", and the token with the
proposed mark. No toast.

A round for the table, a receipt, or credit card roulette covers more than one person, and the
person view is about one. Where a group's cover lives is not placed yet (7).

(Amended 2026-09-27, the owner's rulings on the build. Item 4, "Add a photo of it", is left
out: settlement is the photo moment (Principle 6). Between item 3 and the primary, optional and
below the main choices so the sheet still opens short, two fields the board never mentioned
dropping and Principle 4 rests on: "What was it", the memo, and, on a cover that is not in
dollars, "What it cost", the private magnitude with the caption "Only you see this."; no example
text in either, per 4.9.)

**The +** (frame 4). Start opens the question step directly (3.29), with "Got a code?" at its
top right. The Start sheet is gone (6.1).

### 3.44 A named subject

When a question names someone or something the app can't place (not a person the asker shares a
market with, not a team, not anything the terms already define), the careful step can't write
good edge cases without knowing what it is: "Does Nova sleep in the new bed tonight?" has
different edges for a toddler, a cat and a robot vacuum. Board: `NamedSubject`.

**One tap first** (frame 2). The careful step opens with one question, in the step's own card:
"Nova is" in `body` 600, then three 48px rows, "a person", "a pet" and "something else". The tap
answers; there is no button. It shows only when the write-up found a name it couldn't place,
only on the careful step (a quick ask takes the write-up's reading), and never for someone the
asker shares a market with.

**Then the questions** (frame 3). The card collapses to one line, "Nova is" with the answer
after it in `--ink-2` ("a pet") and a 44px tertiary "Change" that reopens the three rows. Under
it, the careful questions written for that answer, each in the step's card with Yes and No as
the step has them: "Does a nap on it before midnight count?", "If she's on it but awake, does
that count?", "If she sleeps in the box it came in instead, is that a no?". Changing the answer
rewrites the questions, and answers to questions that survive the rewrite are kept. The sheet is
"Next: who's in", as on the step.

The kind goes to the write-up with the question and is stored with the terms, so the terms read
right later. Nothing on the market's screen shows it.

The card style is the careful step's own. The board draws those cards on the market's surface
with the question in `body` 600 and two 48px choices, because the careful step as built is not
on the canvas; where the build's card differs, the build's card wins.

(Amended 2026-09-28, Round C, built as drawn: "Nova is" over the three rows "a person", "a pet",
"something else", the tap answering; the collapsed line with Change; and the sheet "Next: who's
in" on the careful step. The step's heading and its explaining line are gone.)

### 3.45 Pass the phone (built: Round B, parts 2 and 3, 2026-09-28)

Drawn ready. The owner scheduled it on 2026-09-27 for the round after this one, before
submission, together with One tap (3.41), on the developer confirming that entering is signed by
the delegated share. Board: `PassThePhone`; its NOT YET SCHEDULED banner predates the build, and
the who's-in row shows the fourth icon (3.42).

The case: at the table, one person has the market open, and a friend whose phone is dead, or in
a coat, wants in. Passing the phone should take the friend under a minute and leave nothing of
theirs behind.

**One place with the link.** Opening the link or scanning the code works for anyone, with or
without an account (3.17); passing the phone is for people with an account, on a friend's phone.
Both run the same steps in the same order: the market as anyone sees it before they're in, the
same entry sheet, "Who's joining?" in the same sheet, and then in. Only the proof differs: a
name and a number on the link page, a pick and a PIN here.

1. **The way in** (frame 1). The fourth icon on the who's-in row, on the phone owner's screen,
   once they're in and while the market is open. The first tap explains it once (frame 2, 3.42),
   then never again.
2. **Their entry** (frame 3). The screen becomes the friend's: the header says whose phone it is
   ("On Sam's phone") with a close, then the band, the details and the entry sheet as the link
   page draws them. No who's-in row, no weight line, nothing of anyone else's, not even the
   phone owner's number.
3. **Who's joining?** (frame 4). After "I'm in at 60%, 1 beer", the sheet asks who's joining,
   with the entry's summary on the right ("60% · 1 beer"): "Pick yourself" and the people the
   market was sent to who aren't in yet. Only people with an account who have set up One tap and
   a PIN on their own phone can be picked; the rest show at 0.45 opacity with "Not set up for
   this yet". A tertiary, "No account? Scan the code with your own phone", opens the code to
   scan (3.42), which takes them to the link page on their own phone. (Amended 2026-09-28, Round
   C, pre-approved: when nobody was named, or everyone named is already in, the list is the
   host's own people who have pass the phone on, ready ones only, since the PIN is the proof of
   identity either way and limiting it to the named people added no protection.)
4. **Their PIN** (frame 5). The friend's 56px avatar and name, "Your PIN", four 14px dots and a
   keypad of 56px keys on the field colour. The PIN was set on their own phone, on You, in a row
   under One tap ("Your PIN for a friend's phone"). The fourth digit sends the entry. Three
   wrong tries end the handoff and nothing is said to anyone.
5. **A clear handback** (frame 6). After the entry goes through, the whole screen is the
   handback: the check, "You're in, Maya.", "Change it on your own phone until 10:40pm.", and
   the chalk "Hand it back to Sam". Once it goes back nothing of Maya's stays on the screen, and
   back never returns to her entry.
6. **On her own phone** (frame 7). One notice, with the question as its title and "You entered
   this from Sam's phone." as its body, and her entry line says where it came from ("1 beer ·
   from Sam's phone · yours to change until 10:40pm"). She can change it until the close, like
   any entry.

The entry goes through Maya's own One tap, which is why One tap is a condition; the PIN is what
says it's her on a phone that isn't hers. Nothing of hers is stored on Sam's phone.

(Amended 2026-09-28, built, Round B part 3. The six steps above are built as drawn, with these readings: the
fourth icon opens the friend's screen in place of the host's in history, so back never returns to the entry;
the friend's screen is the host's session with nothing of anyone's answer on it, the host's included, blind or
open; "Who's joining?" lists the people the market was sent to who aren't in, the ready ones first; the PIN is
checked before anything is signed, three wrong tries end the handoff on the phone and count toward the PIN's
own lock; the friend's entry is signed by the friend's own delegated share over an entry the server built,
recorded against the request with the host on the position; the notice goes by push else email, once; the
entry line on her own phone reads "1 beer · from Sam's phone · yours to change until 10:40pm", and on a blind
market "· final" with "Withdraw it". The wording "It's final. You can withdraw it from your own phone until
10:40pm." stands in for "Change it on your own phone" on a blind market's handback.)

(Amended 2026-09-28, the owner's ruling and the build. One tap is not a separate switch: "Pass the phone"
on You (3.34) is the one row, and turning it on delegates the ledger wallet and sets the PIN in one flow,
only from the person's own phone; "set up One tap and a PIN" above reads "set up pass the phone". Turning
it off revokes the delegation, wipes what the server stored and clears the PIN. The PIN is four digits,
kept under a slow hash, never logged; five wrong tries in a row lock it for an hour, and the owner hears
on their own account, naming whose phone. A watched PIN stays fixable: in an open market the entry can be
changed from the person's own phone until the close; a blind entry is final, so its owner can withdraw it
from their own phone before the close, and cannot enter again, so the remedy is never a way around blind.
The steps above are built in Round B's part 3.)

---

## 4. Rules that generalize

### 4.1 When each type weight is used

- Young Serif carries three things and nothing else: a question, an outcome, and a single number
  people care about. If a new screen has none of those, it has no serif on it. A person's name
  is not one of them.
- One serif size per screen. A screen headed in `serif-xl` sets any questions it lists in Hanken
  600; a screen headed by a `serif-l` question sets its outcome in `serif-l` too.
- Hanken 600 at 17px is the subject of a row, the one line you would read out loud.
- Hanken 400 at 15px is everything that supports that line, in `--ink-2`.
- 13px 600 is an eyebrow or a section label; 13px 400 is metadata in `--ink-3`.
- A line never mixes weights to emphasize a word. If a word matters, it belongs in the subject
  line.

### 4.2 Density

Density is fixed, not responsive. One phone layout, 390px reference, everything scales by
flexing the content column between the 20px gutters.

- Cards in a list: 12px apart, 14/16 padding inside, 8px between lines.
- A card holds at most five stacked blocks before it needs a 1px `--line` divider. Consequence
  rows always sit under a divider.
- Rows inside a card: 28-32px tall with a 6px gap; a row with a token is 32px minimum.
- A screen has at most one media frame above the fold and at most one primary button.
- Wider viewports centre the 390-430px column; they do not add columns, and nothing becomes a
  two-up grid at tablet width.

### 4.3 Deciding between the 84px thumbnail and the full-width frame

The weight follows what kind of event it is, not how good the picture is.

1. Is the event a cover, a plan, or an argument with no media? Thumbnail if there is an image
   at all, nothing if there is not. Nobody comes back for a receipt.
2. Is the event a market or an argument that people photographed or filmed? Full-width frame,
   with credit and counter. This is a memory, and the media is the reason someone opens the
   app in November.
3. Does the event have more than one piece of media? Frame for the first, 60px strip under it
   for the rest, `+N` past four.
4. Is the media what the claim carried, the evidence that resolved the question (the clip of the
   fence, John asleep)? Everyone voting sees it on the claim card, and once the market ends it
   leads the frame, credited to whoever attached it. The frame sits above the outcome line on a
   story card and on the memory screen; on the settled screen the outcome comes first, because
   there it is the news.
5. Nothing to show? Render nothing, with one exception: on a market's own screen after it ends,
   someone who can add sees the empty slot (3.8), which is a button.

### 4.4 What makes something a story rather than a row

A row is one fact and reads in a single line: someone covered something, a plan is coming up,
an argument was settled cleanly. It gets `body` 600, one supporting line, and at most one
token.

A story is an event with a question, several people's inputs, and a result. It gets the serif
question, the participants' numbers as a call line or ruler, an outcome line, and its
consequences grouped underneath as one block. A market that produced eight obligations is one
story with eight consequences, never eight rows.

The test, in order: does it have a question? Did more than two people put something in? Is
there media? Two yeses make it a story. One makes it a row with a link to the full thing.

### 4.5 Color discipline

Four channels, and each one carries exactly one thing.

- Value carries hierarchy. Chalk is the brightest object on a screen and it is always the thing
  to tap. What happened is ink, at the largest size on that screen. Everything else is the three
  ink levels on the surfaces.
- Hue carries identity. The six person hues mean a person and nothing else, with one borrowed
  case: the "you're in" mark and your riding percent take your own hue, which is still identity.
  A team's colour is identity too, and it appears only inside its stamp (1.7): never a fill, a
  wash, a line or type.
- Form carries state. Ring, half ring, bar, broken ring, disc, slash (3.23). A state that seems
  to need a new colour needs a new mark instead.
- Ink carries place. A market's ink says which market you are standing in and nothing more:
  never good or bad, never urgency, never an outcome. That is why the eight are matched in
  lightness and chroma, and why the group's number is drawn in `--ink` rather than the market's
  ink.

The one exception is `--live`, citron, meaning "waiting on you, with a clock". At most one
citron element in a viewport, never larger than a 6px dot or a 2px rule, and it disappears when
the thing is handled.

(Amended 2026-09-27, the owner's ruling. The two swipe colours in 1.1, `--remove` and
`--archive`, are the second exception, and they belong to a gesture rather than to anything on
the screen: red behind the remove glyph and amber behind the archive glyph, in Now's swipe
action (3.15) and nowhere else, never as text, never on a market, never beside a number. "No red
and no green anywhere in the product" reads with that one square excepted.)

### 4.6 Copy rules

The aggregate of everyone's numbers is called the group's number, and the words around it stay
inside one boundary: nothing here has a price at any moment, nothing is bought or sold, no pot
is held and nobody makes a market. Say the group's number, where the stake sits, your number,
what's riding on it, who's in, called it.

"Odds" is allowed only for what a person puts in: the question the app asks you, "What are the
odds?", on the odds line and the asking tile, and "your odds" or "their odds" for someone's own
number ("Slide to pick your odds", "Everyone puts in their odds."). It is never a label on
anything the app shows back, so never implied odds, and never "the odds" for the group's number.
Also never: price, "the market says", pot, house, buy, sell, shares, position size or liquidity.
The picture can look like finance; the language has to keep saying it is six friends guessing.

One tap has its own short list. Say "One tap", "this step", "Always asks". Never wallet, key,
share (of a wallet), signature, sign, session, delegate or permission, on the ask, the row or
anywhere else; the person is choosing whether a step happens, and that is all the words describe
(3.41).

"Notifications" is said plainly where the phone's permission is asked ("Turn on notifications",
4.10). It is the word the phone's own prompt uses a second later, and a softer phrase only made
the button harder to read.

Numbers people put in are percentages: "You're in at 70%", "Priya called it at 90%", "said 85%".
Number markets use the plain number and the unit: "You're in at 17", "14 shirts".

Pick-one entries name the answer and nothing else: "You're in: John", "said Priya", "Theo called
it". Never "favourite", "leading" or "the group's pick". On What's on, counts of use are allowed
and are phrased as use ("Most asked", "Asked in 214 groups"). Nothing that states or implies a
belief about an outcome is ever allowed: no odds, prices, percentages, "most picked", or how any
group called it. A dissent without a number is "a note", never "a vote" (3.24). A ruling is
credited to the agreement, never to the app: "the tiebreaker everyone agreed to", on the settled
screen, in the details' "If it's unclear" row, on the arbitration sheet and on the result tile.

No sportsbook words, anywhere, and on What's on above all: never spread, moneyline, a line or
the over and under, parlay, pick'em, juice, vig, handicap, favourite, underdog, push (for a
tie), action, lock (for a sure thing), bet or wager. A margin is said in words ("Bills by 7"),
never with a sign or a half point. "Cover" keeps its meaning in this product, paying for
someone, and is never used about a game. "Lock it in" is a sportsbook phrase too: an asker
ending a market early closes it ("Close it with 4", 3.42), which is also the word the band's
clock uses. "Stake" and "what's riding" stay, because they are about friends putting something
on it.

Sentence case everywhere. Contractions. Second person for the viewer, first names for everyone
else. A line opens with a number only when the number is what the line is about: a count, where
the count is the subject ("3 of 6 say Priya.", "3 friends are in.", "40 yes-or-no calls since
March."), or a number the person just typed, said back to them ("2,400 shirts is past the limit
here."). Everywhere else, words come first. Times are relative for the last week inside the app
("Sat, Sep 12" after that) and always absolute on a link tile. No exclamation marks in system
copy. The app never thanks the user for settling something and never congratulates anyone for
winning.

### 4.7 Now, and why it is event-first

Now is the root screen, it has no back control, and every other screen has a 48px back
control in its top left. The app is installed to a home screen with no browser chrome, so
nothing may depend on a browser back button.

The root is called Now, and it routes rather than does. Creating things moved off it: asking is
the Start button, and everything else that begins something lives where it happens, a cover on
the person view and joining behind "Got a code?" (section 6), because a hub that also holds five
ways to begin something is what made it unreadable. Now holds three sections, in this order:

1. **Needs you.** Only things that will not move without this person: a vote, a market they have
   not entered, an obligation to confirm, a claim to accept, a draft they abandoned, a tap that
   didn't go through (5.2). This is the strip that makes the app worth opening, and it is the
   one place the no-nagging rule is under real pressure. What keeps it honest: every row is an
   action this person can finish now, the section disappears when it is empty, and nothing in it
   counts or ages. Inside it, anything with a clock outranks anything without one, and within
   each of those, soonest first. Only the soonest row with a clock carries the citron dot
   (3.15).
2. **Running.** Markets in flight that this person has already acted on, each with its state
   mark and no action button. It exists so that "I entered that, didn't I?" has an answer
   without a search. A market only you are in says so in its row ("just you so far") and stays
   here until it ends or you remove it with a swipe (3.15); a removed market leaves Now at once
   and never reaches Just happened.
3. **Just happened.** Resolved markets, closed obligations, covers that landed, each as one row:
   the 3.15 anatomy, with a 44px thumbnail when there is media and the outcome in the meta line
   ("He got carded · Maya called it"). Tapping a row opens the market's own screen (3.37) or the
   obligation's. A finished market's row can be archived with a left swipe, which takes it off
   Now and nowhere else (3.15). Closed obligations order by when the close went through
   (`obligations.closed_at`) and read as settled or called even from the indexer, settled while
   it hasn't caught up; cancelling out appears in nobody's Just happened. This used to say
   stories keep their full anatomy here, which put a `serif-l` story question beside the
   `serif-m` questions above it, a second serif size on the one screen everyone opens (4.8). The
   `Now` board always drew rows.

**Games on Now.** A game with more than one question in the same group is one row, in the
section its most pressing question belongs to, never one row per question. The row's 40px stamp
slot holds the two 28px team stamps overlapping by 16px; the subject is the game in `body` 600
("Chiefs at Bills"), since it is not a question; and the meta line is the most pressing
question's reason or clock, then how many questions ("Voting ends at 7:45pm · 3 questions",
"You're in 3 of 4 · kickoff 4:25pm"), or in Just happened the final score ("Final: Bills 24,
Chiefs 17"). In Needs you, the row's button is that question's verb (Vote, Enter) and opens that
question; the row itself opens the game page. A game with one question is that question's
ordinary row.

People is a tab rather than a section, because the person view is where the thesis lives and
it should be one tap from the root rather than a scroll and a tap. Where a list of people does
appear, people with something open get a row each and everyone who is square collapses into a
single row with an avatar stack and one sentence, because four rows that each say "nothing
open" is four repetitions of nothing.

What is deliberately not on home: a group list, and account actions. A group is a namespace, not
a place. It forms lazily out of whoever was in a market, it earns a name only if the same set
asks a second question, and it does its work in exactly two screens, the same-people picker
(3.20) and the shared-context band on a person view (3.21). Listing groups on home was what made
an occasion group permanent in the interface, and it is what forced leaving and archiving to
exist as features. Take the list away and a group that is over simply stops being mentioned,
with nothing to leave and nothing to archive. Account actions, sign out included, live on You
(3.34), because the primary screen of a social product should not end in a way to leave it.

Placing something new on home: if it is an action only this person can take, it goes in Needs
you. If it is something the group did, it goes in Just happened. If it is a way to reach
someone, it goes in People. If it is organisational, or about the account, or about a group as
an object, it does not go on home at all.

Games nobody has started with you are not on Now, except as the first-run starters (3.14). They
have their own tab (6.2, rule 6), and a permanent block on Now would push the rows only this
person can move below things nobody is waiting on them for.

Two rules generalise out of this and apply everywhere:

- Never repeat an empty phrase down a list. One row saying nothing is information; four rows
  saying nothing is noise. Collapse the empty cases into a single line that names them.
- The root carries no way to leave the product. Account actions, sign out included, live
  behind You.

### 4.8 The style budget

Two counts, both mechanical enough to lint:

- At most four sizes on a screen, at most one of them serif, and at most two weights at any one
  size (1.2). Text inside controls and obligation tokens is not counted, and a card has no cap
  of its own.
- At most one chalk-filled control and at most one citron element in a viewport. On a root, the
  Start button is the chalk.

If a screen exceeds either, the fix is not a smaller size or a dimmer grey. Something on the
screen is doing a second job and belongs on the screen that does that job.

A third count, softer, for review rather than lint: a screen that carries more than two
sentences of explanation is explaining a mechanism at the wrong moment (4.9).

**The lint.** A test over each screen's rendered DOM. Mark the root of every control and token
component with `data-type-exempt`: buttons, chips, inputs and textareas (except the ask flow's
question, which counts as its step's serif line), the odds line's riding percent, the code
boxes, the number field, the obligation token, and the wordmark. Walk every text node that is
not inside `[data-type-exempt]`, an avatar, or an emoji-only run, and read `getComputedStyle` on
its parent: the first family in `font-family`, `font-size`, and `font-weight`. Fail when the
screen has more than four distinct family and size pairs, more than one distinct Young Serif
size, or more than two weights at any one pair. Run it per state and per step: each step of a
flow is its own screen, and each sheet state (raised, a modal sheet open) is its own state of
that screen. The build's static lint leaves out the same things by element, by
`data-type-exempt` or by file (the button, chip, tab bar, odds line, obligation token, number
field and picker components); counting per state is what the DOM lint adds.

**Why sizes and not tokens.** The tester's complaint was "too many different types of text", and
a reader counts a family at a size as one type of text: 13px 600 and 13px 400 read as one size
doing two jobs, the way `body` 400 and 600 always have. Counted as tokens, eleven built screens
failed at four while reading clean, because `label` and `caption`, or `body-sm` and a 15px
figure, counted twice. Excluding control labels changed no count, because every token a control
uses also appears in content on the same screen; the double count was in the unit being counted,
not in what was in scope. Raising the token cap far enough to pass them would also have passed
the old settled screen, which set text at 26, 20, 17, 15 and 13. That is five sizes, and exactly
the specimen-sheet look the complaint was about. Counting sizes at four fails that screen and
passes the rest, so the fix costs one property on one built screen (the rank, 3.7) plus the
lint. Redesigning components to fit a four-token count was the other option, and it would have
reopened all eleven screens to remove distinctions nobody reported.

The canvas after this revision, outside controls and tokens:

| Screen | Sizes | Count |
| --- | --- | --- |
| `Now` | 13 · 17 · serif 17 | 3 |
| `FirstRun` | 13 · 17 · serif 40 | 3 |
| `Main` | 13 · 15 · 17 · serif 26 | 4 |
| `Story` | 13 · 15 · 17 · serif 26 | 4 (was 6, with two serif sizes) |
| `MarkPicker` | 13 · 17 · serif 26 | 3 |
| `Ask` | 13 · 17 · serif 26 | 3 |
| `JoinLink`, all seven | 13 · 17 · serif 26, plus 15 for a field error; the wordmark is a logo | 3 or 4 |
| `Join` | 13 · 17 · serif 26 | 3 |
| `Claim` | 13 · 15 · 17 · serif 40 | 4 |
| `MarketDock` | 13 · 17 · serif 26 | 3 |
| `BlindSlow` | 13 · 17 · serif 26 | 3 |
| `Voting` | 13 · 17 · serif 26 | 3 |
| `Split` | 13 · 17 · serif 26 | 3 |
| `Leaderboard` | 13 · 15 · 17 · serif 26 | 4 (was 5) |
| `Memory` | 13 · 15 · 17 · serif 26 | 4 |
| `SettledPhotos`, all four | 13 · 15 · 17 · serif 26 at most | 4 |
| `FarOff`, both | 13 · 15 · 17 · serif 26 (blocked); 13 · 17 · serif 26 (fixed) | 4, then 3 |
| `OpenPhoto`, all four | 13 · 17 · serif 26 | 3 |
| `GamePage`, all four | 13 · 17 · serif 26, plus 15 in the night's who's got who | 3 or 4 |
| `WhoWins`, all five | 13 · 15 · 17 · serif 26 | 4 |
| `Margin`, all three | 13 · 15 · 17 · serif 26 | 4 |
| `Endings`, all four | 13 · 15 · 17 · serif 26 | 4 |
| `LightScreens` (built in Round D) | the same sizes as `Now`, `OpenPhoto` frame 3 and `Leaderboard` | 3, 3 and 4 |
| `DockStates`, all seven | 13 · 17 · serif 26 | 3 |
| `PickOneMarket` | entering: 13 · 17 · serif 26; in: 13 · 15 · 17 · serif 26 | 3, then 4 |
| `PickOneEntry`, frames 1 to 5 | 13 · 17 · serif 26, plus 15 once the shares show (frame 4) | 3 or 4 |
| `PickOneResolve`, all four | 13 · 15 · 17 · serif 26 | 4 |
| `WhatsOn` (as games) | 13 · 15 · 17 | 3 |
| `WhatsOnFlow`, all four | 13 · 17 · serif 26 (the menu, who's in); 13 · 15 · 17 · serif 26 (the terms, running) | 3, then 4 |
| `You` | 13 · 17 · serif 26 | 3 |
| `YouEarly` | 13 · 17 | 2 |
| `PickOneMarket`, `PickOneEntry`, `PickOneResolve` (redrawn) | 13 · 17 · serif 26, plus 15 once shares show | 3 or 4 |
| `WhatsOnStates` (as games) | 13 · 15 · 17 | 3 |
| `FeedBallot` | 13 · 17 · serif 26, plus 15 where shares or who's got who show | 3 or 4 |
| `SpreadRedeploy` (for the redeploy) | 13 · 15 · 17 · serif 26 | 4 |
| `OneTap`, all four | 13 · 15 · 17, plus serif 26 over a market; You 13 · 17 | 2 to 4 |
| `ShareIcons`, all four | 13 · 17 · serif 26, plus 15 once settled (the code's boxes are controls) | 3 or 4 |
| `AddPhotos`, all five | 13 · 15 · 17 · serif 26 at most | 2 to 4 |
| `Explainers`, all four | 13 · 17 · serif 26, plus 15 under the heads-up | 3 or 4 |
| `GotThisOne`, all four | 13 · 15 · 17 (the person view with its sheet); frame 4 is the question step, 13 · 17 · serif 26 | 3 |
| `CallOff`, all six (Now) | 13 · serif 17; with a confirm sheet, plus 15 and 17 | 2, then 4 |
| `Holdouts`, all four | 13 · 15 · 17 · serif 26 | 3 or 4 |
| `PickOneSheet`, all four | 13 · 17 · serif 26, plus 15 once picked with shares | 3 or 4 |
| `NamedSubject`, all three | 13 · 17 · serif 26 at most (the answers are controls) | 2 |
| `StickerFromPhoto`, all five | 13 · 15 · 17 at most | 1 to 3 |
| `OnItsWay`, the four phones | 13 · 15 · 17 · serif 26 at most; Now 13 · serif 17 | 2 or 3 |
| `PassThePhone` (built) | 13 · 15 · 17 · serif 26 at most | 2 to 4 |
| `WhosIn`, all four | 13 · 17 · serif 26, plus 15 in the remove sheet | 3 or 4 |
| `Shells`, all eleven | 13 · 15 · 17 · serif 26 at most; a shell draws less than its screen | 0 to 4 |
| `TabsInstant`, all four | 13 (the rows and the bar are controls) | 1 |
| `SheetMotion`, all six | 13 · 17 · serif 26 | 3 |
| `OpenMarketFrames`, all fifteen | 13 · 15 · 17 · serif 26 at most; a frame caught mid-transition shows two screens, each inside its own budget | 1 to 4 |
| `OpenFrom`, all nine | 13 · 15 · 17 · serif 26 at most | 1 to 4 |
| `AskStepsFrames`, all eighteen | 13 · 17 · serif 26 at most | 1 to 3 |
| `ReducedMotion`, all eight | 13 · 15 · 17 · serif 26 at most | 2 to 4 |
| `OpenMarket`, `AskSteps` (interactive) | As their frames boards | 1 to 4 |
| `InfoCorner` | The strips are header rows, 13 at most (their controls aren't counted); the phones in place, 13 · 17 · serif 26 at most | 0 to 3 |
| `InfoSheet`, all six | 13 · 17 · serif 26; with the sheet open, plus 15 | 3, then 4 |
| `Opening`, all ten | None in the launch image and first frame (the placeholder's label is board annotation); Now: 13 | 0 or 1 |

The screens at the cap each read as one serif line, a subject line, a supporting line and
metadata, which is the shape the cap is meant to allow. What's on's lists carry no serif at all,
because a game's name is a subject line and not a question (4.1).

**The three day-one baselines, resolved.** The build held Now, the claimant screen and the ask
flow above the budget from the first day it counted sizes (2026-09-25), and the log names each
cause. Each resolution below answers it.

- **Now.** This was the contradiction inside the specification. 4.7 said Just happened keeps
  full story anatomy, and a story sets a market's question in `serif-l` (26) and brings a
  `body-sm` supporting line and its consequence rows. Beside the `serif-m` (17) questions of
  Needs you and Running, that is five sizes, two of them serif, on a screen that 1.2 and 4.1
  hold to one serif size. 4.7 now makes Just happened rows, as the `Now` board always drew them.
  Now: 13 (the date, section labels, meta), 17 (obligation subjects), serif 17 (questions).
  Three sizes. The log names the same cause: serif 17 rows beside serif 26 story cards. Built
  code: Just happened's story cards become rows, and the row component already exists (3.15).
  The static lint also sums the signed-out and empty states, which the per-state count treats as
  separate screens.
- **The claimant screen.** It is headed in `serif-xl`, and 1.2 says a screen headed that way
  sets the questions it lists in `body` 600. But the things it lists are events, and 3.4 sets an
  event's question in `serif-l`. Read one way it has two serif sizes; read the other, one. The
  resolution: the claimant's items are claim rows, not event cards. Each has a 13px 600 kicker
  ("Market · Sep 5"), the subject in `body` 600 whatever kind of event it is, and one `body-sm`
  line carrying the token ("Priya's got you"), as the `Claim` board draws. Claimant: 13, 15, 17
  and serif 40. Four sizes, one serif, and nothing else may join: the prints' dates and the
  per-person counts are 13. The log's cause is simpler: the dead, used and own-link states sit
  at serif 26 beside the live state's serif 40 in one file, and a static lint sums them. Each
  state is within budget on its own, so the per-state count passes it with no screen change, and
  the claim-row rule still holds for the live state.
- **The ask flow.** It carries three kinds, an answers editor and the mark picker, and the
  pressure came from counting it as one screen. Each step is its own screen, and each sheet
  state is its own state of that step (the lint note above). Inside a step, everything the asker
  types or taps is a control: the kind chips, the answer fields, a number market's unit and
  scale fields, and the picker's search and chips. The question textarea is the exception and
  counts, because it is the line the whole step exists for. The log names the cause: a step
  echoes the question and the declined screen's dare-instead line at serif 17 beside a serif 26
  headline. The fix is 1.2's. A step has one serif line, the question at 26; a step headline is
  `body` 600; a question echoed on a later step is that step's serif line, never a second size;
  and the dare-instead line is `body` 600.
  - The question step, any kind: 13 (labels, the mark row's sub-line, "Add a person", the
    caption), 17 (the mark row's title) and serif 26 (the question). Three sizes. A number
    market's block adds only labels and fields; any helper text in it is `caption`.
  - With the mark picker open: the same three, since the picker's own text is 13 or controls.
  - Who's in: 13, 17 and serif 26. Three.
  - Terms: 13 (labels, captions), 15 (the stake-step sentences in `body-sm`), 17 (values) and
    serif 26. Four, and the only four-size state in the flow.

### 4.9 Copy that earns its place

The product may not say wallet, transaction, gas, signature, chain or token, which meant every
mechanism had to be explained in plain language, and those explanations turned into paragraphs
sitting on screens. The rule that clears it: an explanation appears at the moment it changes a
decision, once per flow, and never again on a screen where the person has already acted on it.
The information sheets (10) are outside this rule rather than an exception to it: nobody meets
one without asking for it, and they go after the hackathon.

Keep, at the point of consequence:

- "What are the odds?" On the odds line.
- "The most you can be out is what you put on it." On the stake step, nowhere else.
- "You only settle with people who land closer than you, and only by the gap between your
  numbers." On the stake step.
- "You see everyone's once you're in. Yours is final then." In a blind market's entry sheet,
  above the primary (3.31).
- "Yours to change until it closes." Under your own entry line.
- "Nobody needs an account to look." On the who's-in step.
- "If nobody votes, the final score settles it." In a What's on market's entry sheet, above the
  primary, because the backstop rests on that consent (3.35).
- "Nothing gets sent to it. Sign in with this number later and your entries are waiting." Under
  the phone number on the link page, because it says what the number is for (3.17).
- The weight-line caption, but only when one stake is more than half the total.
- (Cut 2026-09-27: "Everyone sees these once it's over." was under your own photos while the
  market was open; the album is open the whole time now, 3.39, so nothing is true for a caption
  to say.)
- "Any margin. Tap the number to type one." On the margin's entry, because past the ends typing
  is the only way further, and nothing else on the screen shows it (3.40).
- "Turn it off any time on You, under One tap." In the One tap ask (3.41).
- "It leaves Now, and it counts against nobody." In the remove sheet on Now, because removing
  can't be undone (3.15).
- "It leaves Now. You can still find it from the people in it." In the archive sheet on Now,
  because it says where the market still is (3.15).
- "It comes out before anything is decided, and nothing changes hands." In the asker's
  remove-entry sheet (3.42).
- "John and Maya can't get in after this." In the close-early sheet, because closing early binds
  them (3.42).

Cut:

- Any sentence naming a state that the mark now carries (3.23).
- Scoring explained again on the settled screen, where the bars already show it.
- Captions that restate the picture directly above them.
- Instructions for gestures people find anyway.
- Anything repeated on a later screen in the same flow.
- The AI's suggested number, everywhere (3.22).
- An example inside a field. A placeholder reads as a value someone already typed, and a
  real-looking one gets submitted as is, so labels say what goes in and fields start empty
  (3.16, 3.17, 3.20, 3.24). "Search" is the one placeholder, because it names the field's job
  rather than suggesting an answer.
- A paragraph standing in for structure: the draft's (3.25), the heads-up's (4.10), and every
  caption under a control that says what the control plainly does (3.26, 3.29, 3.33, 3.38).
- "Put your number on it", anywhere. The sheet's heading already says what to fill in, and a
  pick-one market has no number.

Everything the product needs to say about how it works, beyond the lines above, belongs in the
details sheet on the market, where someone can go looking for it.

**This revision's pass.** Every screen was read for sentences doing a structure's job. `CutList`
lists each cut, where it was, and what does its job now; the lines above are what stayed.

**One ask at a time.** The app asks two things once each: One tap (3.41) and the heads-up
(4.10). (Amended 2026-09-28: One tap's ask is dropped, 3.41, so the heads-up asks alone.) Never both in one moment and never back to back: One tap goes first, at the first
routine action, and the heads-up waits for its own next moment. A no to either is final, and the
row on You (One tap) or the phone's own settings (the heads-up) is where it changes.

### 4.10 One warning, one notice

Every market has a backstop, agreed to in every entry: for What's on, the final score (3.35);
for every other market, what the asker chose when asking, the tiebreaker or closing for good.
When nobody decides, the backstop acts for them. Around that moment the app sends exactly two
things. Board: `Notices`.

- **One warning, before.** Six hours before the backstop acts, to everyone who could still vote
  and hasn't. It names the backstop everyone agreed to and says it is about to act for them. It
  never says time is running out. It is not sent when the votes already cast would decide the
  market, since then the backstop won't act.
- **One notice, after.** When the backstop has acted, to everyone in the market. It replaces the
  ordinary result notice rather than adding to it.
- **Never a second reminder.** No repeat, no follow-up, nothing in Needs you beyond the row
  already there, and no badge.
- **Push, else email, never both.** Push where the person allowed it, email otherwise. No text
  message and no in-app banner.
- **Asking first.** Push needs the phone's permission, and the ask for it used to be a paragraph
  about when this phone gets told things. It is one sheet now (`Explainers`, frame 3), shown
  once, after someone first asks something or first gets in, when a push would first be worth
  having: the 20px bell glyph and "Want a heads-up?" in `body` 600, then two rows, each a 16px
  state mark and a `body` line, the in-voting mark with "When it's your turn" and the resolved
  disc with "When it's decided". Then the chalk "Turn on notifications", which raises the
  phone's own permission prompt, and a tertiary "No thanks". The button says "notifications"
  plainly: it is the word the phone's own prompt uses a second later. A no, the phone's own no,
  or a dismissal ends it: the app never asks again, and email carries what push would have.
  Never in the same moment as the One tap ask (4.9).
- **Never at night.** A warning that would land between 11pm and 8am in the person's zone goes
  at 8pm the evening before.
- **What they carry.** The question as the title and one sentence as the body. Nothing about the
  answer, the stakes or anyone's number (3.27). A clock time is allowed, since it says when the
  agreement acts; it follows 3.23's clocks, with the day when it isn't today. Tapping opens the
  market's screen. The email's subject is the sentence, its body the question in serif, the
  sentence, one button ("Open it") and one line under it: "You get this because you're in this
  question. It's the only one before it settles."

The words:

| Backstop | When | Sentence |
| --- | --- | --- |
| The final score | Before | "Nobody has voted. The final score you all agreed to settles it at 7:45pm." |
| The final score | Before, the results disagree | "Nobody has voted, and the two results we check disagree. At 11:30pm it becomes void, as the terms said." |
| The final score | After, both results agreed | "Decided by the final score, as everyone agreed." |
| The final score | After, one result held three days | "Decided by the final score, as everyone agreed. It held for three days." |
| The final score | After, the results disagreed | "Void. The two results we check disagreed, so nothing changes hands, and it counts against nobody." |
| The tiebreaker | Before | "It hasn't been decided. At 11pm the tiebreaker everyone agreed to makes the call." |
| The tiebreaker | After, it decided | "Decided by the tiebreaker everyone agreed to." |
| The tiebreaker | After, the terms don't decide it | "Void. The tiebreaker everyone agreed to found the terms don't decide it, so nothing changes hands." |
| Closing for good | Before | "It hasn't been decided. At 9am it closes for good, as everyone agreed, and nothing changes hands." |
| Closing for good | After | "Closed for good. Nobody said what happened, so nothing changes hands." |

The tiebreaker's void counts against the asker (3.34), and its notice doesn't say so, because a
notice is no place to assign it. The What's on void counts against nobody, and its notice says
so, because the asker would otherwise reasonably wonder.

---

## 5. Errors and waiting

### 5.1 Errors

There is no red for errors in this product (its only red is behind Now's swipe-to-remove, 3.15),
so color cannot carry an error. Ink carries it instead, on four channels: position, weight, a
glyph, and the words.

**Focus.** A 2px `--ink` outline sitting 2px outside the control (`outline: 2px solid
var(--ink); outline-offset: 2px`). Focus and error must never look alike, and the offset is what
separates them: focus floats outside the field, an error changes the field's own border. The two
can appear together.

**A field error.** The field's border goes from 1px `--line` to 1.5px `--ink`. Under it, a row
with the 16px alert glyph and the message in `--ink` at 15/20. The field's label does not change
color.

**A form error.** Every field error repeats once in a summary block directly above the submit
button: `--surface-2` fill, 1px `--line-strong`, radius 10, 12px by 14px padding, the alert
glyph and the message in `--ink` at 15/20, problems listed in the order the fields appear. A
server or network failure uses the same block with a 44px "Try again" inside it. On a screen
with a sheet, the block sits inside the sheet above the primary. It is never a toast, and it
never blames the person.

**Timing.** Validate on submit, then on blur for any field already marked. Never on keystroke. A
failed submit keeps everything typed and moves focus to the first field with a problem.

**Wiring.** `aria-invalid` on the field, `aria-describedby` pointing at its message,
`role="alert"` on the summary block so it is announced once when it appears.

**Voice.** Say what is wrong and what to do: "Codes are six characters. This one is five." Not
"Invalid input", not an apology, not an error code. "No market with that code. Worth checking
the last two characters." "This one closed at 11pm, so you can watch but not enter." "Your
number didn't send. Tap to try again." "Slide to pick your odds first."

### 5.2 Buttons that are working

A tap dims the control to 0.88 for 120ms. If the action has not finished in 300ms the control
enters **pending**: the label stays exactly where it was, the control holds its size, opacity
stays at 0.88, and a 2px indeterminate line runs along its bottom edge on a 1.2s loop. On a
chalk button the track is `rgba(18,17,16,0.25)` and the runner is `--on-chalk`; on a secondary
button the track is `--surface-2` and the runner is `--ink`. The control is `aria-busy` and not
interactive; every other control on the screen stays live, so a slow action can still be
abandoned.

At 3 seconds, a 13px `--ink-3` line appears under the control: "Still going." At 10 seconds it
becomes the 5.1 summary block with "Try again". A tap is never silently dropped.

(Amended 2026-09-28, Round D: one set of rules for waiting, for a tap that does something and a
tap that goes somewhere alike. The stages are one function, `waitStage`: nothing under 300ms, the
runner from 300ms, "Still going." at three seconds, and at ten the 5.1 block with "Try again". A
working control carries them as above. A navigation's shell (9.4) carries the 2px runner under the
status band, "Still going." under the last thing drawn, and the block with "Try again", which asks
for the screen again. The terms being written (9.8) read the same stages from the last word to
arrive, with "Still writing." and "The terms stopped partway." as their words. A form's summary
block draws "Try again" for a failure a retry could put right (5.1), never for a refusal at a
field. Round C part 2's ten-second step under a control is this rule's first half.)

**On its way, and didn't go through** (`OnItsWay`). Pending covers the wait for the app to have
the tap. Some taps then take longer to go through, because what they change is recorded
underneath: settling, calling it even, saying yep, getting in, a vote. The screen does not wait
for those. Once the app has the tap, the screen moves on as if it had gone through, and the
result shows where it lives, marked On its way (3.23) with the words "On its way" in place of
its state: the entry line's caption ("On its way · 2 beers"), a token's state on a person view
("Settled · on its way"), a Running row on Now. When it has gone through, the mark and the words
simply go. Words, never a clock: no seconds, no percentage, no progress.

If it doesn't go through, the same place says so: the didn't-go-through mark, "Didn't go
through", the words of what was tried ("70%, 2 beers"), and a 44px "Try again" beside it.
Anything the screen drew as done is undone (an entry's columns, the icons that came with being
in). It also becomes a Needs you row on Now (3.15), because only this person can send it again.
No toast, no push, and nothing is silently dropped. The 3-second and 10-second rules above are
for taps whose result can't be shown before it finishes, such as signing in, joining by code and
a photo going up.

### 5.3 Waiting, and the one place a skeleton is allowed

A tap that does something keeps the screen it was made on, and the control carries the wait. A
tap that goes somewhere leaves at once for its destination's shell: the destination's real
parts, drawn from what the tapped thing already knew, with the rest fading in as it arrives
(9.4). Neither replaces a screen with a skeleton of itself. Two reasons beyond the aesthetic
one: a route-level streamed loading state made this app answer 404s with a 200, and a person
reading a screen in a bar who loses it loses their place, which is why back from any shell
returns them to exactly where they were.

Under 300ms: nothing beyond the press. A spinner that lives for 180ms reads as a glitch.

Skeletons are allowed in exactly one case: content loading into a screen that is already on
display, such as pagination, older events on a person view, or media opening inside a story.
Bars at 8px and 12px, hatched blocks for media, no shimmer, minimum 200ms so they cannot
flash. Navigations never get one, and route handlers keep returning real status codes.

### 5.4 What none of this is allowed to become

No red error states, no toasts that disappear before they are read, no modal error dialogs, no
full-screen error pages inside the app, no error codes in front of people, and no message that
makes someone feel audited for typing a code wrong in a dark room.

### 5.5 Keeping a screen current

Pulling only helps someone who thinks to pull, so there are three pieces.

- **Pull to refresh** from the top of any scrolling screen: a touch that starts at the top and
  travels 72px re-reads what is on screen, one server render and never a reload. A 2px line
  under the status band fills with the pull and runs while the read is on, in `--ink`, the same
  runner a working button carries (5.2). No spinner. A touch inside a modal sheet belongs to the
  sheet.
- **A re-read on return** to the foreground after more than two seconds away, which covers
  switching to Messages and back, and on a page restored from the back-forward cache.
- **A light poll on a locked market**, from lock until it settles: every six seconds while the
  screen is visible, every thirty after five minutes on it, and stopping when it settles, when
  the screen is hidden (resuming on return) and when the market is gone. It re-reads the screen
  only when what the voting screen shows has changed, so a vote or an attachment on one phone
  reaches the others within six seconds.

None of it announces itself: no toast, no "updated", and nothing moves under a finger that is
mid-gesture.

---

## 6. The shell: four destinations and one button

Nineteen features, present and planned, collapse into four destinations and one action, because
most of that list is a way of starting something rather than a place to be. A hub offers a few
clearly distinct destinations; each destination does one job and has one obvious action.

### 6.1 The destinations

- **Now.** What is live and what is waiting on this person. The root, the back-stop for every
  other screen, and the only screen that carries the citron dot. Contents and ordering: 4.7.
  Every market row carries its stamp on its ink's field colour. (Amended 2026-09-27: "Got a
  code?" also sits at Now's top right, on the line with the date, placed as the question step
  places it, so joining by code is one tap from home; an empty Now keeps the compact boxes of
  3.16. Now still starts nothing: joining is arriving, not asking.)
- **What's on.** Public questions about things everyone is watching, to start with your own
  friends (3.32). The only destination holding things nothing in the app has pointed you to,
  which is the only reason it has a tab (6.2, rule 6).
- **People.** The list, and through it the person view, which is where the product's thesis
  lives. Two segments: People, and Standings (who has been fronting what). One tap from the
  root.
- **You.** Calibration, clean-resolution rate, your marks and stickers, your account, sign out.
  Everything about you rather than between you and somebody.
- **Start**, the button: a 56px chalk circle 16px above the bar on the right, on the four roots
  only, and hidden on an empty Now where "Ask something" does its job. It asks and does nothing
  else: a tap opens the question step (3.29), where an argument is a chip and "Got a code?" sits
  at the top right. Its accessible name is "Ask something". The Start sheet is gone: a cover is
  logged from the person it's with (3.43), joining is "Got a code?", and a cover for a group or
  a receipt is not placed yet (7). One button with one meaning is what lets it sit on every
  root. Starting is not a place, so it never becomes a tab.

### 6.2 The routing rule, for anything built later

1. Asks something → the Start button, straight into the question step. Anything else that begins
   something goes where it happens: with one person, their view (rule 3); inside a market, that
   market's screen (rule 2).
2. Acts on one market → that market's screen, as the move in its sheet for that state (3.24).
3. Acts on one relationship → that person's view.
4. Is about you alone → You.
5. Is about who has been fronting what → People, standings segment.
6. Is something to start from that nothing in the app has pointed you to → What's on.

Rule 6 is the one exception to a rule that otherwise held. Markets are deliberately not a
destination: a market is always reached from something that already mentions it (a row on Now, a
link in a chat, a story), and a markets tab would be a feed of everything anyone ever asked,
competing with the person view for the same attention. Public questions are the one thing a
person goes looking for before anything in the app mentions them, and that is why they get a
tab. Anything that asks for a fifth has to pass the same test (it holds things nothing in the
app has pointed you to), and markets you are in, people, groups, standings and settings all fail
it. Groups are not a destination for the reasons in 4.7.

### 6.3 Where each feature lives

| Feature | Home |
| --- | --- |
| Asking something | Start → the question step (3.29) |
| Asking a pick-one question | The ask flow's question step, "Pick one" and the answers (3.29) |
| Browsing games | What's on tab, one row per game (3.32) |
| Starting a game | What's on → the game page → pick the questions → who's in → terms (3.33) |
| Adding a question to a game | The game page's dashed rows, anyone in the group, until kickoff (3.33) |
| Picking a mark | The ask flow's question step, then the picker sheet (3.29); the same picker wherever a unit is made |
| Joining by link | Deep link → the market's own screen, the sheet holding the empty odds line, with or without an account (3.17) |
| Joining by code | "Got a code?" at the top right of the question step, beside the information icon during the hackathon (10.3); the six boxes on an empty Now (3.16); scanning someone's code opens the link page (3.17) |
| Putting your odds in | Market screen, the sheet (3.13, 3.26) |
| Picking an answer | Market screen, the sheet (3.30); dividing it only after the contract redeploy (3.36) |
| Confirming a public result | Market screen, voting state, the sheet, on the source card (3.35) |
| Voting | Market screen, voting state, the sheet |
| Saying what happened, with photos or screenshots | Market screen, closed state, a well in the sheet (3.24) |
| Changing your number | Change on the entry line, which reopens the line in the sheet |
| Confirming an obligation | Now, needs-you row; also in place on the person view |
| Settling or forgiving | Person view → the obligation row → sheet; a market's consequence from its story on the person view (3.4, 3.10) |
| Cancelling out what runs both ways | Person view, the row under the header (3.10) |
| Logging a cover | Person view → I got this one (3.43) |
| Splitting a group cover | Not placed yet: the person view covers one person (7) |
| Person view and timeline | People tab; every avatar anywhere links to it |
| Claiming what was waiting | The claimant screen after signup, then Now's rows |
| Settling an argument | Start → the question step, as an argument |
| Arbitration on a deadlock | Market screen, deadlocked state, the sheet |
| Receipt capture and split | Not placed yet (7) |
| Credit card roulette | Not placed yet (7) |
| Capture standings | People tab, second segment |
| Plans | Person timeline above today; the next one surfaces on Now |
| Adding photos | While it is open, the photo slot last on the market screen, for someone who is in (3.39); once it has ended, settled, voided or expired, the same slot or the add tile, under the outcome (3.8, 3.37) |
| Making a sticker | "Make a sticker" in the full-screen photo (3.28), or a paste in the mark picker's "Your stickers" row (3.29) |
| Sending how it ended | Share on the settled market's who's-in row (3.42, 3.27) |
| Sharing a market, copying its link, showing its code | The icons at the end of the who's-in row, once you're in (3.42) |
| Closing early with people still out | The asker's tertiary under the who's-in row (3.42) |
| Removing a market nobody joined | Now, a left swipe on its Running row (3.15) |
| Archiving a finished market | Now, a left swipe on its Just happened row (3.15) |
| Seeing who's in; removing an entry from someone without an account | The avatar stack on the who's-in row; Remove is the asker's, until the lock (3.42) |
| Pass the phone | The switch on You, with the PIN set in the same flow (3.45); the One tap ask is dropped (3.41, amended 2026-09-28) |
| Entering on a friend's phone | The fourth icon on the who's-in row (3.45) |
| Profile, calibration, clean resolution | You (3.34) |
| What a screen can do (for the hackathon) | The information icon, at the top right of every screen (10) |

### 6.4 Shell rules

- The tab bar renders on the four roots and nowhere else. A task screen hides it and puts its
  one move in the sheet, in the same place (3.24), which is what makes voting findable: the vote
  controls sit where the bar would be, under a one-line consequence ("Two more and it settles").
- Every non-root screen has a 48px back control at its top left, and back lands on the root it
  came from. The app is installed with no browser chrome, so this is the only way home. A market
  screen reached from a link while signed out shows the wordmark instead.
- For the hackathon, the top-right corner of every screen is the information icon (10). A
  screen's own control from that corner (More, "Got a code?") sits directly left of it, and the
  full-screen photo's close moves to the top left (10.3).
- A modal sheet (settling an obligation, sending a vote, the code to scan, closing early,
  removing, archiving, who's in, One tap) closes with a 48px close at its top right and by
  dragging its handle down; the drag is read from the handle row only, so the sheet's content
  still scrolls. A sheet never opens another sheet.
- (Amended 2026-09-28, Round C, the owner's ruling.) Nothing on the tab bar: no dot, no badge,
  no count, ever. The one citron dot lives on Now's soonest needs-you row (3.15, 4.5). The line
  this replaces put a dot on the Now tab when something time-bound was waiting.
- Nothing tapped more than once a session sits above the midpoint of the screen.

---

## 7. What we did not design, and how to derive it

Not drawn in this canvas: the People tab's list and its standings segment, the rest of You (the
unit editor and the marks list behind its account rows), the rest of market creation (the terms
step once written; its writing is drawn in `AskStepsFrames`, and the question step, the careful
step's named subject and the who's-in step exist), argument creation, the people picker behind
"Someone else", the claim behind the two outcome wells (3.24 specifies it), the arbitration
screen, a cover for a group, receipt capture and splitting, credit-card roulette, plans and
RSVPs, search, the details sheet, the pick-one asking and result tiles (3.27 specifies them),
the light theme beyond its three proving screens (section 8), and any desktop layout. Every one
of them has an address in 6.3, so a later phase has somewhere to put its screens without
reopening the structure. The three about a group's money (a cover for a group, a receipt,
roulette) are marked not placed: the person view that now holds covers is about one person, and
where a group's cover lives is the next decision this structure needs.

Drawn, but not to be built yet: multi-choice dividing (3.36, `SpreadRedeploy`), which waits for
the contract redeploy. So does a stake of nothing: boards that draw "Just pride" show the
redeploy (3.3). Questions on quarters and halves (3.33), which are not drawn, and which close at
the game's start like the rest, wait for after submission. (Amended 2026-09-28: the light theme
(section 8) was built in Round D, the app's own tap-to-cut from a photo (3.28, `StickerFromPhoto`
frame 5) in Round C, and pass the phone (3.45, `PassThePhone`) in Round B, parts 2 and 3.)

Group management has come off this list rather than moving up it. Leaving, archiving, renaming
and the group view do not exist, because a group is not a navigable object: there is no place to
leave and nothing to archive, and a set of people that stops asking questions simply stops being
mentioned. If a future requirement looks like it needs a group screen, check it against 4.7
first. It is almost always a person view, a filter, or the picker.

To build one of them without waiting for a design pass:

1. **Find its nearest relative in the canvas.** The terms step of market creation is the market
   screen before anyone is in: the question band in the chosen mark's ink, the details `dl` with
   its labels made editable, the stake chips, and the sheet with a chalk "Send it". The claim
   behind the outcome wells is specified in 3.24, under "Saying what happened". There is no
   group view to derive: a group is the picker, the chips, and the person views of the people in
   it (4.7).
2. **Classify every event it shows** with 4.4, then use the row or story anatomy as given.
3. **Encode any obligation** with 2.1: side, hue, grammar, anatomy. If the screen has no "you,"
   fall back to sentence order with the owner's avatar leading.
4. **Encode any unit** with 2.2: glyph and tally, quoted words, numerals last, mark optional and
   never load-bearing.
5. **Decide its place.** If it belongs to one market it takes that market's ink (1.8); otherwise
   it is the neutral room, and markets appear in it only as stamps.
6. **Put its one move in the sheet** (3.24), with a second height only if there is more to show.
   A state with no move has no sheet.
7. **Pick components from section 3 only.** If you need a component that is not there, build it
   from the tokens in section 1 and give it the states in 3 that apply: empty, loading, error,
   too long, too many, and none-of-this-exists-yet.
8. **Check it against the three product rules** before you ship it: nothing nags, count comes
   before amount, and no screen says wallet, transaction, gas, signature, chain, or token. The
   word for a thing someone owes is a beer, a round, a next time, or a dollar amount.

If two of these rules conflict on a screen, the no-nagging rule wins, then direction encoding,
then density.

---

## 8. The light theme (built in Round D, 2026-09-28)

Light ships beside dark, following the phone's setting (built 2026-09-28, Round D). This section
specifies it, and it is not an inversion: v2 is dark-specific in ways that carry weight, and
each is decided here. Almost all of it is a second set of values for the same custom properties.
Four rules change how something is drawn: the citron's edge, person-hue strokes, the avatar's
edge and the grain tile. Boards: `LightScreens` (Now, a market
in its ink, and the settled screen, board 14, each converted by exactly these rules) and
`LightRules` (the primary action, the tokens and inks side by side, citron, focus and marks).

### 8.1 When it applies

The app follows the phone, through `prefers-color-scheme`. A manual override is worth having,
and it lives on You: an "Appearance" row in the Account card, captioned with the current choice
("Match your phone"), opening a modal sheet of three rows: "Match your phone" (the default),
"Always dark" and "Always light". The reason is where the app gets used: a dark room, a bar, a
movie. Someone who keeps their phone in light all day still wants dark at 11pm; someone on
Automatic gets it at sunset anyway, and the override is for the first person. It is a device
preference kept on the device, like recents, and never a record about the person.

Before first paint, an inline script in the document head reads the stored choice and sets
`data-theme` on `html`, so a cold start of the installed app never flashes the wrong theme. The
opening (11) is the one exception: it draws in the phone's own scheme, since that is what picked
the launch image, and the override takes over as it hands off to Now. `color-scheme` follows the
theme, and `theme-color` has one value per scheme (`<meta name="theme-color"
media="(prefers-color-scheme: light)" content="#F5EFE4">`). On a market's own screen the status
band already paints that market's ground, in either theme.

What does not follow the theme: link tiles, which are one image for everyone, frozen into a chat
whose theme the app can't know, so they stay as 3.27 draws them.

### 8.2 The primary action

On dark, the thing to tap is a chalk fill because chalk is the brightest object on a dark
ground. As a rule rather than a colour, the primary action takes the value extreme opposite the
ground (4.5: value carries hierarchy). On light that is the darkest object on the screen: a
graphite fill, `--chalk` resolving to `#1B1815`, with paper-coloured text, `--on-chalk`
`#F5EFE4`, at 15.4:1. `--ink` and `--chalk` stay one token in both themes, as they are now, so
the button and body text share graphite; the button still reads as the thing to tap because it
is the only solid dark mass on the screen, 56px tall and full width, where text is strokes. At
most one per viewport, unchanged. The Start circle is graphite with a paper plus, and the
selected stake chip fills graphite the same way.

Rejected: the market's ink as the fill, since ink carries place and nothing else (1.8), and a
primary that changed colour per market would give ink a second job; a new accent colour, which
is a fifth channel, the job marigold was retired for; and an outlined primary, which would speak
the secondary's language.

### 8.3 Neutral tokens

The Light column of 1.1. `--ink` on `--ground` is 15.4:1, `--ink-2` 7.6:1, and `--ink-3` 5.3:1
on the ground, 5.9:1 on `--surface` and 4.8:1 on `--surface-2`, so the 13px floor passes AA on
every neutral surface. Depth changes direction and keeps its meaning: cards and sheets
(`--surface`, `#FFFBF4`) are lighter than the ground, tracks, chips and tokens (`--surface-2`,
`#EDE4D4`) sit recessed below it, and the 1px line still draws every edge. `--line-strong` on
the ground is 1.7:1, as quiet as on dark (2.0:1), on purpose: dashed edges and secondary
outlines stay quiet, and a secondary's words carry it.

### 8.4 The eight inks

Retuned for light with each ink's hue unchanged, so a market keeps its colour across themes, and
matched in OKLCH like the dark set so no market shouts louder than another:

| Ink | Hue | ground | surface | field | line | ink | ink-hi |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Clay | 45 | `#F9EDE9` | `#FEF9F7` | `#F4D9CD` | `#E0CAC1` | `#A26448` | `#6E412D` |
| Ochre | 85 | `#F4F0E6` | `#FCFAF6` | `#EADEC7` | `#D8CEBB` | `#8F7131` | `#604B1C` |
| Olive | 112 | `#F0F1E7` | `#FAFBF6` | `#E0E2C9` | `#CFD2BD` | `#777B38` | `#4F5221` |
| Sea | 192 | `#E6F3F2` | `#F6FBFB` | `#C7E7E5` | `#BCD6D4` | `#1E8783` | `#0A5A58` |
| Slate | 248 | `#E9F1F9` | `#F7FBFE` | `#CFE2F6` | `#C2D1E1` | `#487AA8` | `#2D5173` |
| Iris | 288 | `#EFEFF9` | `#FAF9FE` | `#DEDDF6` | `#CECDE1` | `#746DA8` | `#4D4872` |
| Plum | 330 | `#F6EDF5` | `#FDF9FC` | `#EDD8EB` | `#DAC9D8` | `#94628F` | `#644061` |
| Rose | 8 | `#F9ECEE` | `#FEF8F9` | `#F5D7DB` | `#E1C8CC` | `#A35F6B` | `#6F3D47` |

Layer levels in OKLCH: ground L 0.955 C 0.014; surface 0.985, 0.006; field 0.905, 0.034; line
0.855, 0.028; ink 0.565, 0.090; ink-hi 0.425, 0.070. A market's line-strong is its hue at 0.79,
0.04. The ink layer is darker and a little stronger than on dark (0.70, 0.075), because on a
pale ground a colour reads through depth rather than brightness: ink on its own ground is 3.8 to
4.2:1, enough for columns, marks and washes. ink-hi, the ink's type colour, becomes the darker
tone, 6.1 to 6.4:1 on field. Graphite on every field is 13.1 to 13.5:1.

Where each layer goes is unchanged (1.8): on the market's own screen the four structural tokens
swap to its layers and the band sits on field; elsewhere only the stamp's field. The tint is
quieter in light, where a ground at chroma 0.014 is a whisper on paper, so the band and the ink
in the columns carry the place. The resolved call line's wash stays the ink at 0.40.

### 8.5 Citron

`#E4E34A` on the light ground is 1.2:1: gone at 6px. It keeps its colour, because the colour is
the signal and should mean the same thing in both themes, and it gains an edge, `--live-edge`,
which is `#1B1815` in light and transparent in dark. The dot stays a 6px disc with a 1px edge
outside it (`box-shadow: 0 0 0 1px var(--live-edge)`, an 8px footprint). The 2px rule gains a
1px keyline above and below (`box-shadow: 0 -1px 0 var(--live-edge), 0 1px 0 var(--live-edge)`).
Citron against its edge is 12.9:1, and the edge against the ground far more. Everything else
about citron holds: one element per viewport, never larger, gone when handled.

Rejected: the darker yellow the table used to list for light, `#8A7A00`. It reaches 3.8:1 on the
ground, but it lands at the lightness and hue of the light Ochre and Olive inks (OKLCH 0.58 at
hue 100, against their 0.565 at 85 and 112), so on those markets' screens the urgency mark would
read as the market's own colour, which 4.5 forbids.

### 8.6 Grain

Kept, recalibrated. The paper look is part of what made v2 read as made rather than generated,
and on a light ground it reads as paper tooth. The same 120px tile over `--ground` only; in
light its specks are dark, `#3A3024` at 4%, where dark's are cream at 3%. The light tile is its
own image with the colour and opacity inside it, and nothing adds a CSS `filter` or
`backdrop-filter` to make it, for the containing-block reason in 1.5. If the tile reads as dirt
on a real phone at full brightness, it is dropped in light before shipping: light may be flat,
and nothing else depends on the grain.

### 8.7 Everything else that assumed dark

- Focus: the same 2px `--ink` outline 2px outside the control, now graphite. On the graphite
  primary it sits across the 2px gap on the ground, so it still separates. Errors keep their
  rule, the field's own border going to 1.5px `--ink`.
- State marks keep their forms (3.23), with the tokens' colours. "You're in" draws in the
  person's text-on-light variant (1.1), because a pastel stroke on paper is under 2:1. Open and
  resolved on a market's own screen use the light ink.
- Person hues: the fills stay the same pastels, since a person's colour is who they are in
  either theme. Avatars gain a 1px inset edge, `rgba(27,24,21,0.10)`, so a pale avatar keeps its
  outline on paper; initials stay `#121110`. Everything drawn as a line or a translucent wash in
  a person's hue (token borders at 0.55, selection rings at 0.50, leaderboard gap bars at 0.40,
  the riding percent's ring, the number field's ring, the "you're in" mark) uses the
  text-on-light variant at the same alpha.
- The call line: the resolved cap is `--ink`, graphite, since what happened is ink; the neutral
  wash is `rgba(27,24,21,0.08)`; the cream ring on whoever called it is a 2px `--ink` ring. The
  weight line's marker is `--ink`.
- Media keep their scrims, which sit on photos. The hatched placeholder uses the light field and
  surface. The claimant's prints' shadow drops to `rgba(0,0,0,0.18)`.
- Type: sizes, weights and the budget are unchanged. Desktop browsers thin dark text on light
  under `-webkit-font-smoothing: antialiased`, so light sets it to `auto`; phones are
  unaffected.
- No glass (1.5), in light as in dark.

### 8.8 Building it

`globals.css` gains a `[data-theme="light"]` block, and the same values under `@media
(prefers-color-scheme: light)` for `:root:not([data-theme="dark"])`, holding 1.1's Light column,
`--live-edge`, and the light layers of the eight inks, which `inkVars` reads for the current
theme. The component changes are the four drawn rules: the citron's edge, the person-hue variant
for strokes and washes, the avatar's edge, and the light grain tile. Everything else is the
swap, which is why `LightScreens` could be made from the dark boards by the values plus those
four rules and nothing more. `data-theme` is read by the inline script in the head (8.1) and by
`globals.css`, and by nothing else: a component never asks which theme it is in.

---

## 9. Motion

Moving around the app felt clunky in four places: tapping + to ask, switching tabs, opening a
market, and the steps of asking. Part of that is waiting, a tap that shows nothing while the
server answers, which the build times and fixes. This section is the design's part: what appears
at the instant of a tap, and how things move. Every transition comes from the set in 9.1 and
follows the rules in 9.2, and 9.13 lists each one with the layer it moves. Boards, in two rows:
`MotionSet`, `Shells`, `TabsInstant`, `Presses`, `SheetMotion`, `ReducedMotion` and
`MotionLayers`; then `OpenMarket` (interactive), `OpenMarketFrames`, `OpenFrom`, `AskSteps`
(interactive) and `AskStepsFrames`.

### 9.1 The set

Three durations and three curves. Nothing in the app moves on any other timing.

| Token | Value | For |
| --- | --- | --- |
| `--motion-quick` | 120ms | A press letting go; a label or a small part changing in place; the page being left, before what replaces it arrives |
| `--motion-base` | 200ms | Content arriving in a shell; a step of asking; a row collapsing; a retint; anything leaving the screen |
| `--motion-travel` | 320ms | Something going to a new place: a market opening and closing, the ask layer rising, a sheet rising or changing height, a photo opening, a column growing |
| `--ease-move` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Anything that travels, grows or arrives: quick off the mark, a long settle, no overshoot |
| `--ease-leave` | `cubic-bezier(0.4, 0, 1, 1)` | Anything leaving the screen: a slow start, gone at speed |
| `--ease-fade` | `cubic-bezier(0, 0, 0.58, 1)`, which is CSS `ease-out` | Opacity and colour |

The move curve is the one the sheet already used (1.6). Anything leaving the screen takes base
on the leave curve, whatever it took to arrive, because a thing on its way out is no longer
being read.

Two more values complete the set, and neither is a duration. **Stagger**, 40ms: when a moment
grows several things at once (the columns of the weight line, the bars of a pick-one market),
each starts 40ms after the one before it, so ten columns take 680ms from the first starting to
the last landing. **Loop**, 1.2s, linear: the three things that repeat, the pending runner
(5.2), the on-its-way ring (3.23) and the writing caret (9.8), repeat on it, and only while what
they stand for is happening.

All of it lives as custom properties on `:root` (`--motion-quick`, `--motion-base`,
`--motion-travel`, `--ease-move`, `--ease-leave`, `--ease-fade`, `--motion-stagger`,
`--motion-loop`), and every `transition` and `animation` in the app reads them. A duration or a
curve typed anywhere else fails lint, the way a colour from outside section 1 does. Board:
`MotionSet`.

### 9.2 What moves and what holds still

1. **Motion answers the person.** Something moves because someone tapped, dragged or changed
   something. Nothing moves to get attention: no pulsing citron, no shimmer, no nudging +,
   nothing that wiggles. The three loops are the only repeating motion, and each stops the
   moment its reason ends.
2. **One thing travels.** In any transition, one thing goes from where it was to where it will
   be: the market's ink when it opens, the ask layer when asking starts, a step's content when
   the step advances, the sheet when it rises. Everything else fades or holds still. If two
   things would travel in two directions, it is two transitions, and one of them goes.
3. **Some things never move.** The tab bar. The Start button. A header and its back control. The
   question band while the steps of asking pass under it (what it says changes; where it is does
   not). The page behind a sheet: no dimming, no pushing back, no shrinking into a card. Type
   never scales, and a number never counts up or rolls: it is drawn at its value, because count
   comes before amount and a figure that spins makes the amount the show.
4. **Short distances.** Content inside a page travels 24px at most. Only whole layers travel
   further (the ask layer, a sheet, a market's ink as it opens, a photo as it opens), and they
   go from where they are to where they will be, never in from an arbitrary edge.
5. **Direction means something.** Up is a layer arriving over the place you were. Leftward is
   forward through steps, rightward is back. Growing out of a row is opening it, and shrinking
   into it is going back.
6. **Arrive on the move curve, leave on the leave curve, fade on the fade curve.** No spring, no
   bounce, no overshoot, no parallax, no blur, no 3D, and still no confetti (1.6).

### 9.3 Layers: what a transition may move

The tab bar and the pinned sheet are `position: fixed`, and any ancestor that carries a
transform becomes their containing block, so they stop being fixed to the screen and ride along
with that ancestor. That is the bug that made the tab bar drift for weeks, and 1.5's no-glass
rule exists for the same reason. So the app is built in layers, and motion moves page content
only. Board: `MotionLayers`.

| Layer | What it holds | May it move? |
| --- | --- | --- |
| `app` | `html`, `body` and the app root, which holds every other layer | Never. None of the properties below is ever set on it, not even for a frame |
| `page` | The current screen: its header, band, content and scroller. Nothing inside it is `position: fixed` | Yes, and it is the only layer navigation moves: through view-transition snapshots (below), or a transform on an element inside it |
| `tab-bar` | The tab bar, fixed | Never. It can be covered, and its snapshot can fade out and back in |
| `start` | The Start button, fixed | Never, as the tab bar |
| `sheet` | The pinned sheet, fixed (3.24) | Only itself: a `translateY` on the sheet element while it changes height, arrives or leaves |
| `modal` | Modal sheets, fixed (6.4) | Only itself, as the sheet |
| `ask` | The ask layer, fixed, full screen (9.5) | Only itself, while it rises or lowers. Nothing inside it is `position: fixed` |

The fixed layers are children of the app root, rendered there through a portal, and never
descendants of `page`. A fixed layer may carry a transform on itself, because that moves it
without making it anyone's containing block. Nothing may carry one on an element that contains a
fixed layer.

These make an element the containing block of its fixed descendants, so none of them is ever set
on `app`, on anything between `app` and a fixed layer, or on anything that contains a fixed
layer: `transform`, `translate`, `rotate`, `scale`, `perspective`, `filter` and
`backdrop-filter` with any value but `none` (`translateZ(0)` and `scale(1)` included); `contain:
layout`, `paint`, `strict` or `content`; `content-visibility: auto`; and `will-change` naming
any of them. A test walks the ancestors of the tab bar, the Start button and the sheet on every
root and task screen, and fails on any of these.

(Built 2026-09-28, Round D: the walk is the http suite's, over the markup of every root and task
screen, with the rules in `src/lib/ui/layers.ts`, which also read the live tree's computed styles
in the browser check. A fixed layer renders in place on the server, so the first frame has it, and
is portalled to the host once hydrated. The grain and the band behind the status bar are layers of
the shell too, painted from `--ground` on `html`, which a market's own screen swaps for its ink.)

A transform is on an element only while its motion runs. At the end it is removed (`transform:
none`, never left at `translateY(0)`), and a motion that is interrupted, by a tap or a route
change, removes it too, so no transform outlives its motion.

**View transitions.** Opening a market, going back from one, and the steps of asking use the
View Transitions API (`document.startViewTransition`), which Safari has supported for
same-document transitions since 18.0. It never transforms the live page: the browser draws
snapshots on a layer of its own and animates those, so the fixed layers underneath stay fixed.
Each fixed layer carries its own `view-transition-name` (`tab-bar`, `start`, `sheet`) so no
transition drags it along inside the page's snapshot, and each transition below says what those
groups do. Five rules keep it quick:

- The update callback draws the destination's shell (9.4) synchronously and returns. It never
  awaits a fetch: while the callback runs, the browser holds the old snapshot on screen, so an
  awaited fetch would freeze the screen for exactly the wait this section is about.
- A name is given to the one element that travels just before the transition starts, and taken
  off when it ends, so a list of rows never holds two elements with one name.
- The page's two snapshots never fade out together. The new page fades in over the old one,
  which holds with no animation of its own, and the root's images use `mix-blend-mode: normal`,
  so nothing behind the transition shows through between them.
- A tap during a transition finishes it (`skipTransition()`), and then the tap acts.
- Where the API is missing (iOS before 18) there is no transition: the shell is simply there in
  the next frame. Style the pseudo-elements by name, with a class on `html` for direction
  (`html.back`), rather than with view-transition classes or types, which arrived only in Safari
  18.2.

### 9.4 The instant of a tap

A tap shows something in the frame it happens in, and the next frame shows where it leads.
Boards: `Presses`, `Shells`.

**Presses.** Set from `pointerdown`, in the same frame, with no transition in; released over
quick on the fade curve. Use a pointer listener rather than `:active` alone, which iOS Safari
applies late, or not at all inside a scrolling area, and set `touch-action: manipulation` on the
app so no tap waits to find out whether it is a double tap.

| What is pressed | Its pressed state |
| --- | --- |
| A control with a fill: primary, row action, a selected chip or stake chip, a well, the Start button | Opacity 0.88, as 3.12 has it |
| A control drawn only in lines and words: secondary, tertiary, icon-only, back, close, an unselected chip, the icons on the who's-in row, a tab | Opacity 0.5. At 0.88 a line, a glyph or a word barely changes, so the tap would show nothing |
| A row or card that opens something: a Now row, a person row, a story card, a game row, a question card on a game page, a picker row | Its fill goes to the ground of the place it is in: `--ground`, or the market's ground on a market's own screen. Its stamp, text and line stay as they were |

A row in a scrolling list waits 60ms before showing its press and cancels it if the finger
travels 8px, so a scroll never flashes rows. A tap quicker than 60ms shows the press at release,
which is also the frame the next screen's transition captures, so the pressed row is what the
market opens out of. A press that turns into a drag lets go at once.

A row presses to the ground rather than to `--surface-2` because of its stamp. On a row pressed
to the ground, the stamp's field still stands off it by 1.36 to 1.40:1 in dark and 1.15 to
1.17:1 in light; on `--surface-2` it would drop to 1.04 to 1.07:1 in light, and the ink would
vanish in the one frame it matters (9.12).

**Two kinds of tap.** A tap that goes somewhere (a row, a card, a tab, the +, a step's Next,
back) leaves at once for the destination's shell. A tap that does something (getting in, voting,
settling, joining by code) keeps its screen, and the control carries the wait as 5.2 says. 5.3's
first rule is now about the second kind only.

**The shell** is the destination drawn in the frame after the tap from what the tapped thing
already knew, before anything is fetched. Everything in a shell is real: the real header, the
real band with the real question, real labels. What isn't known yet isn't drawn, and the ground
shows there. It is not a skeleton, and 5.3 still allows none on a navigation: no bars, no
hatching, no spinner, no blank screen. What arrives later fades in over base, in place, and
nothing already drawn moves to make room for it: a part whose size is known holds its room from
the first frame.

| Destination | Drawn in the first frame | Fades in when it arrives |
| --- | --- | --- |
| A market, from anywhere that lists it | The header (back, More); the market's ground, surfaces and line; the band, whole: the stamp and its mark, the state mark and the clock's words, the question, the asker line; the sheet at the resting height of the state the row showed, with its first line ("What are the odds?", a count line) | The entry line, the weight or call line, the who's-in row, the details, the photos, and the sheet's controls. If the market's state has changed since the row was drawn, the sheet crossfades to the right one over quick |
| A game page, from What's on | The header band on `--surface-2`: both team stamps, the time, the game | The caption, then the menu or the question cards |
| A person view | The header: the avatar and the name | The rest of the header, then the timeline |
| Now, What's on, People or You, on the first visit in a session | Now: the date line. What's on: its label. People: the People and Standings segments. You: the identity block (avatar, name, caption), which the phone already knows | Everything else, section by section in order |
| The question step, from the + | All of it: nothing on it needs the server (9.5) | Nothing |
| Who's in | The band, "Who's in?" and its caption, and the sheet with "Set the terms" | The saved groups, fetched when the question step opened, so usually there already |
| The terms | The band, the four detail labels, the stake chips, and "Send it", disabled | The written terms (9.8) |
| A photo, full screen | The thumbnail's own image, enlarged, since it is already loaded | The full image, crossfaded over base |

The source knows enough because every row, card and tile that opens a market already draws its
mark, its ink, its question and its state. The asker's name travels with them; where it doesn't,
the asker line's 22px row is held empty until it comes.

**When it is slow.** At 300ms without content, the 2px runner under the status band runs, the
same line pull to refresh uses (5.5). At 3 seconds, "Still going." in `caption` `--ink-3` under
the last thing drawn. At 10 seconds, the 5.1 block with "Try again". Back works throughout, and
returns the person to exactly where they were, scroll and all. A market that turns out not to
exist replaces its shell with the not-found state in place (3.17). The shell is drawn by the
client from what it holds, never by a route-level streamed loading state, so route handlers keep
answering with real status codes (5.3).

### 9.5 Starting to ask

The + opens the ask layer: fixed, full screen, a sibling of the tab bar, holding the steps of
asking. Its header, band, step content and action bar are one column, and the action bar sits in
flow at the layer's foot rather than being fixed, so the layer moves as one piece. "Ask
something" on an empty Now opens it the same way. Boards: `AskSteps` (interactive),
`AskStepsFrames` row A.

- **The tap.** The Start button presses (0.88) in the same frame. In the next, the layer is
  mounted at `translateY(100%)` with the question step drawn whole, and it rises to
  `translateY(0)` over travel on the move curve. The root holds still under it: no dim, no push,
  no shrink; the tab bar and the Start button are simply covered. At the end the transform is
  removed, and the root is made `inert` but kept mounted, scroll and all.
- **Its control.** The question step's 48px top-left control is Close, a down chevron, because
  the layer came up from below. The steps after it show Back, the left chevron, because they
  come from the side (9.8). This changes 3.29's header.
- **Closing.** The layer goes to `translateY(100%)` over base on the leave curve and is removed,
  and the root is live again as it was.
- Nothing on the question step waits on the server, so nothing about its arrival waits either.
  The saved groups that who's in will show are fetched when it opens.

With Reduce Motion, the layer fades in over base and fades out over base.

### 9.6 Switching tabs

Instant, as on iOS: no slide and no crossfade. What felt clunky there is the tab loading after
the tap, which the build fixes; the design's part is what the tap draws, and when. Board:
`TabsInstant`.

- The bar acts on `pointerdown`, the one control in the app that does. The bar never scrolls, so
  a touch on it is always meant, and a tab switch is undone by another tap, so acting on the
  touch rather than the release costs nothing and gives back the length of a tap.
- The selected tab's glyph and label change at once, and the new root is drawn in the next
  frame. Nothing in the bar moves.
- A root, once visited, stays mounted while it isn't showing, with its scroll position, so going
  back to it draws its last content at once. If it was last read more than 30 seconds ago it
  re-reads silently, and what changed is drawn in place, with no motion (5.5). (Built 2026-09-28,
  Round D, as the router's own hold rather than four mounted screens: a root read within thirty
  seconds is drawn from what the router holds, its scroll put back, and re-read after; every
  mutation revalidates what it changes. Four rendered roots kept mounted would render every root
  on every load.)
- After Now's first paint, the other three roots are fetched while the phone is idle, so no
  tab's first visit waits. If one does, its shell is drawn (9.4) and its content fades in over
  base.
- Tapping the tab you are on scrolls that root to the top, smoothly (at once with Reduce
  Motion). At the top it does nothing, and it never reloads.

### 9.7 Opening a market

The market opens out of the row it was in. A market's row carries its ink in exactly one place,
the stamp on its field colour (1.8), and a market's band is that same field colour, so the stamp
grows into the band. Boards: `OpenMarket` (interactive: tap a row, go back, slow it down, turn
Reduce Motion on, switch to light), `OpenMarketFrames` (opening and back, in dark and in light,
frame by frame) and `OpenFrom` (from People, from a game page, and from What's on into a game
page).

**Opening**, 320ms, with times from the tap's release:

1. Frame one: the row is pressed (9.4). Its stamp takes `view-transition-name: market-ink` and
   the mark inside it `market-mark`, and the transition starts. The callback draws the market's
   shell, where the band's background element takes `market-ink`, the band's content (its
   stamp's ground square, the state and clock, the question, the asker line) takes
   `market-words`, and the band stamp's mark takes `market-mark`.
2. `market-ink`, 0 to 320ms, travel on the move curve: from the stamp's box (on Now, 40px square
   at radius 10) to the band's box (12px in from each side, radius 12). Both ends are the
   market's field colour, so what is seen is the ink opening out. Its snapshots are drawn at
   full size and clipped (`object-fit: none` on the images, `overflow: clip` and the radius
   animated on the group), so the colour never stretches and the corners stay round.
3. `market-mark`, 0 to 320ms, travel on the move curve: the mark from the row's stamp into the
   band's stamp.
4. The old page, the list, holds where it is under everything. It is never faded, only covered.
5. The new page and `market-words`, 120 to 320ms: the market's ground and everything under the
   band fade in over the list, and the band's words fade in above the ink, base, on the fade
   curve. The question arrives as the ink lands, so the band fills with its own words.
6. `tab-bar` and `start`, 0 to 120ms: fade out, quick. `sheet`, 120 to 320ms: fades in, base.
   The sheet does not rise here: it belongs to the place, and the place is what is opening.
7. After 320ms the market is live, and whatever arrives later fades in (9.4).

**Back** is the reverse over the same 320ms. Before the new snapshot is taken, the list's scroll
position is restored, and the market's row, wherever it now is, takes `market-ink` and
`market-mark` (after getting in, a row may have moved from Needs you to Running, and the ink
goes to where it is now). The ink shrinks from the band into that stamp and the mark goes with
it; `market-words` fades out over quick above the ink; the list fades in over the market from 0
to 200ms, base, while the market holds under it; `sheet` fades out over quick, and the tab bar
and the Start button fade in over base from 120ms. If the row is gone, or out of view once the
scroll is restored, nothing takes the names, and the ink fades out over quick with the band's
words. A market reached from a link, a notification or a cold start has no row to go back to, so
its back is a fade: the root fades in over the market over base.

**From elsewhere**, it is the same transition from that place's stamp: a story card's 20px
kicker stamp on a person view (radius 6), and a question card's stamp on a game page. What's on
opens a game page, whose band is `--surface-2` rather than an ink, so there the game row's own
box travels into the band as `market-ink` (a surface at both ends) and its two team stamps
travel as `market-mark` and `market-mark-2`. A photo opens the same way, from its thumbnail or
frame to full screen as `photo`, travel on the move curve, which replaces 1.6's 240ms.

**Every other push** (a person view from a row or an avatar, a row on You, More, the code screen
from "Got a code?") uses the step transition (9.8): the content moves 24px and crossfades, the
header crossfades, and, when it leaves a root, the tab bar and the Start button fade out over
quick and fade back in over base on the way back. (Built 2026-09-28, Round D, as the arrival
half: the router commits a push when its screen has arrived, and holding the old snapshot until
then would freeze the screen on the fetch this section forbids, so the header fades in over base
and the content comes 24px from the side it is going to, rightward on Back, while the old screen
is not animated out. Opening a market and Back from one keep both halves, through the shell and
the root the router holds.)

With Reduce Motion nothing travels: the market fades in over the list, which holds, over base,
and back is the same the other way.

### 9.8 The steps of asking

Each step advances, and back returns. Boards: `AskSteps` (interactive), `AskStepsFrames` rows B
and C.

**Advancing** ("Next: who's in", "Set the terms", a careful step's Next), 200ms:

- The question band holds its place. It carries `view-transition-name: ask-band`, and where its
  height changes (the question step's band is taller than the compact band on the steps after
  it), the group's height changes over base on the move curve, with its snapshots drawn at full
  size and clipped from the top so nothing in it stretches. What it says crossfades over quick.
- The step's content under the band is `ask-step`. The old content moves 24px left and fades out
  over quick on the leave curve; the new comes from 24px to the right and fades in over base on
  the move curve. The group itself does not morph.
- The action bar, `ask-action`, holds still. Its label crossfades over quick ("Next: who's in"
  to "Set the terms").
- The header crossfades with the page: Close becomes Back, and "Got a code?" goes.
- A retint the step brings (balance moving the ink on who's in, 1.8) waits for the step to land,
  then runs over base on the fade curve.

**Back** (the header's Back, or Edit in the band) mirrors it: the old content goes 24px to the
right, and the new comes from 24px to the left.

**The write-up starts early.** The model writes the terms, and that takes a few seconds however
fast everything else is. So the write-up starts when the question step's Next is tapped (or the
careful step's), not when "Set the terms" is, and most of its seconds pass while the person
chooses who's in. If the question is edited, it starts again.

**The terms being written** (`AskStepsFrames` row C). The terms step is the market before anyone
is in (7): the band; the details card with its four labels, "Counts if", "Decided", "Stakes" and
"If it's unclear", all drawn in the first frame; the stake chips; and the sheet with "Send it",
disabled. Stakes come from the chips, so that value is drawn at once. The other three are
written in front of the person:

- The write-up streams, and each value's words appear as they arrive, at the pace they arrive,
  in `body` `--ink`. Words are never held back to look like typing, and typing is never faked
  when the words came all at once.
- A caret, 2 by 20px in `--ink-2` at radius 1, sits at the end of the words being written and
  blinks on the loop, 0.6s shown and 0.6s hidden. It moves to the next value when that one
  starts. Before the first words arrive, it waits at the start of "Counts if": the pen on the
  paper.
- A value not yet started is empty: no bar, no dash, no dots.
- If the write-up can't stream, the caret waits in "Counts if" until the terms arrive, then the
  three values appear in order, each fading in over quick, 40ms apart.
- When the last value is written, the caret goes and "Send it" enables, its fill crossfading
  over quick. The values become editable then, and not before.
- A polite live region says "Writing the terms" once when the step opens and "The terms are
  written" at the end, so a screen reader hears the same story.
- **When it stalls.** If no new words arrive for 3 seconds, "Still writing." appears in
  `caption` `--ink-3` under the details card. At 10 seconds without new words, the 5.1 block
  sits in the sheet above "Send it" with "The terms stopped partway." and "Try again", which
  writes them again. A slow write that keeps moving shows neither, because it is visibly
  working.
- Back is allowed while it writes. The write-up carries on, and coming back shows what it has
  written so far.

The careful step's questions (3.44) are written the same way: the step's card holds the caret,
then each question fades in over quick as it arrives, the one-tap "Nova is" question included.
(Read 2026-09-28, Round D: the three come from one answer, so they arrive together and fade in
over quick 40ms apart, the rule for words that came all at once. The terms step's four labels are
the rows of one details card whose editors are the chips already there, "Counts if" the field
that opens once written; the title stays in the band and opens once written too.)

**Sending it.** "Send it" turns the terms step into the market's own screen in place.
`market-ink` is on the band in both, so the band doesn't move; the terms' edit affordances fade
over quick; the action bar gives way to the market's sheet (the entry, 3.25) in a crossfade over
base; and Back now leads to the root the + was tapped on. Going back from there is 9.7's back,
which on Now shrinks the ink into the market's new row.

With Reduce Motion, every step change is a crossfade over base, nothing slides, the band's
height changes at once, and the caret holds still.

### 9.9 Sheets

Board: `SheetMotion`.

**The pinned sheet between its heights** (3.24). The sheet is laid out at its raised height and
sits at its low height by a `translateY` on itself equal to the difference, with nothing inside
it fixed and nothing that contains it moving. A tap on the grabber or a touch on the move raises
or lowers it over travel on the move curve, the value 1.6 always gave it. While a finger drags
the handle, the sheet follows the finger with no transition; past either height it moves a third
of the finger's travel, 16px at most. On release it goes where 3.24's 24px rule sends it, over
base if less than half the distance is left and over travel otherwise, on the move curve, from
wherever it is. `--sheet-room`, the page's bottom padding, changes when the sheet settles, never
frame by frame.

**The pinned sheet arriving or leaving**, when a state gains or loses a move (the sheet going
once you're in, 3.13; a market closing while it is on screen): it arrives from below its own
height over travel on the move curve, and leaves downward over base on the leave curve. The
page's padding changes at the end.

**Modal sheets** (6.4) open from below over travel on the move curve and close over base on the
leave curve. A drag on the handle row follows the finger; on release the sheet closes if it has
gone a third of its height or was flicked down, and otherwise returns over base on the move
curve. The page behind holds still and does not dim (1.5).

**Swipe rows** on Now (3.15) follow the finger; on release a row opens to 76px or closes over
base on the move curve, and after a remove or an archive it collapses over base, as 3.15 already
says.

With Reduce Motion, the sheet still follows a dragging finger, since the person is moving it,
and every settle, arrival and exit is instant, with the sheet's content crossfading over quick
where it changes.

### 9.10 Everything else that moves

Every existing motion, in the set:

| Motion | Duration and curve |
| --- | --- |
| A press (3.12, 9.4) | In at once; out over quick, fade |
| Pending (5.2): the control at 0.88 after 300ms, and its 2px runner | The runner on the loop |
| The on-its-way ring (3.23) | One turn per loop, linear |
| Entering, as a moment (3.13): the sheet lowers | Travel, move |
| Entering: the ten segments grow into columns | Each over travel on the move curve, 40ms after the one to its left, 680ms from first to last (was 700ms, all at once) |
| Entering: your avatar rises over your column, and the group's marker draws | The avatar over base, move, as your column lands; the marker over base, fade, after the last column |
| Entering: the sheet goes, at about 1.8s | Base, leave (9.9) |
| Pick one, entering (3.30): the bars grow, then the shares | Each bar over travel, 40ms apart from the top; the shares over base, fade, as the last bar lands (was 700ms, and the shares 300ms from 600ms) |
| Number entry (3.26): the columns grow | As entering |
| Re-bucketing (3.22): the columns crossfade, the marker slides | Base, fade; base, move |
| A retint (1.8, 3.29) | Base, fade |
| A Now row collapsing (3.15) | Base, move |
| The riding mark on the odds line (3.13) | Follows the finger with no transition; a tap that places the value moves the thumb, the percent and the mark over quick, move (was 90ms linear on font-size) |
| A switch (Pass the phone, 3.45) and a selection circle or checkbox | The knob over quick, move; a fill over quick, fade |
| Pull to refresh (5.5) | Follows the finger, then the runner on the loop |
| A skeleton loading into a screen already shown (5.3) | Its content replaces it with a fade over base, after its 200ms minimum |
| Link tiles, the claimant's prints, a resolution | Nothing moves (1.6) |

### 9.11 Reduce Motion

When the phone's Reduce Motion setting is on (`@media (prefers-reduced-motion: reduce)`, which
an installed web app follows), the app keeps every change of state and drops the travel:
crossfades or instant changes, and nothing slides or grows. Board: `ReducedMotion`.

| Transition | With Reduce Motion |
| --- | --- |
| Opening a market, and back | The new page fades in over the old one over base, and the old holds under it. The ink and the mark stay where they are |
| Starting to ask, and closing | The ask layer fades in over base, and out over base |
| A step of asking, and back | A crossfade over base; the band's height changes at once |
| Switching tabs | Unchanged: it was already instant. Scrolling to the top jumps |
| Presses | Unchanged: they change colour and opacity, and nothing moves |
| The pinned sheet: raising, lowering, arriving, leaving | Instant. It still follows a finger that drags it |
| Modal sheets | Fade in over base, out over quick |
| The entering moment, pick one and number entry | The resting state at once, as 3.13 already says |
| Swipe rows | Follow the finger; open, close and collapse at once |
| A retint, a label changing, content arriving in a shell | Unchanged: they are fades |
| The pending runner | Holds still as a full 2px line in the runner's colour |
| The on-its-way ring | Rests at a quarter, as 3.23 says |
| The writing caret | Shown and steady, not blinking |
| The information sheet (10) | As modal sheets |
| The opening's handoff (11) | Unchanged: it is two fades |

It is one `@media` block: the travelling keyframes swap for the fade, the translate and height
transitions go, and the three durations stay as they are.

### 9.12 Light

Motion is the same in both themes: the same set, the same layers, the same choreography. The one
transition that depends on colour is a market opening, carried by the stamp's field growing into
the band, and it reads in light because the field keeps its distance from what it passes over in
both themes: against a Now row's surface it is 1.25 to 1.29:1 in dark and 1.27 to 1.30:1 in
light, and against a pressed row (the ground) 1.36 to 1.40:1 in dark and 1.15 to 1.17:1 in
light. A market's ground barely differs from the app's in either theme, and in light least of
all ("a whisper on paper", 8.4), so the page's fade carries almost no colour and the band
carries the place, as 8.4 says it should. `OpenMarketFrames` row C draws the opening in light,
and `OpenMarket` switches between the themes.

The other motions that carry colour hold as well. A retint fades between the light inks as it
does between the dark ones. A pressed graphite primary at 0.88 is still the darkest thing on the
screen. A control drawn only in lines and words presses by opacity, so it reads the same on
either ground.

### 9.13 Every transition, and the layer it moves

| Transition | Trigger | Layer that moves | How | Duration and curve | Start → end | With Reduce Motion |
| --- | --- | --- | --- | --- | --- | --- |
| A press | `pointerdown` on a control | None: the control's own opacity or fill | A class set from a pointer listener | In at once; out over quick, fade | Rest → pressed → rest | The same |
| Switching tabs | `pointerdown` on a tab | None | The mounted roots swap | None | The old root hidden, the new one shown, in one frame | The same |
| The current tab again | A tap on it | The root's own scroll | `scrollTo({ top: 0, behavior: 'smooth' })` | The browser's smooth scroll | Where it was → the top | Jumps |
| Content arriving in a shell | Data | None: the arriving parts' opacity | CSS on those parts | Base, fade | 0 → 1, in place | The same |
| Opening a market | A tap on a row, card or question card | `page`, as snapshots | View transition: `market-ink`, `market-words`, `market-mark`, the root, `tab-bar`, `start`, `sheet` | The ink and the mark travel, move; the new page, `market-words` and `sheet` fade in over base from 120ms over the old page, which holds; `tab-bar` and `start` fade out over quick | The stamp's box → the band's box | The new page fades in over the old, over base |
| Back from a market | Back | `page`, as snapshots | The same names, with `html.back` | As opening | The band's box → the row's stamp, where the row now is | The list fades in over the market, over base |
| Opening a photo | A tap on a thumbnail or frame | `page`, as snapshots | View transition: `photo` | Travel, move | The thumbnail's box → full screen | Crossfade |
| Starting to ask | A tap on + | `ask`, itself | `translateY` on the layer | Travel, move | 100% → 0, then `none` | Fades in over base |
| Closing the ask layer | Close | `ask`, itself | `translateY` on the layer | Base, leave | 0 → 100%, then removed | Fades out over base |
| A step forward, and every other push | Next, "Set the terms", a push | `page`, as snapshots | View transition: `ask-band`, `ask-step`, `ask-action`, the root | The old content over quick, leave; the new over base, move; the band's height over base, move | Old 0 → −24px and out; new +24px → 0 and in | Crossfade over base |
| A step back | Back, Edit | `page`, as snapshots | As forward, with `html.back` | As forward | Old 0 → +24px and out; new −24px → 0 and in | Crossfade over base |
| The terms being written | The write-up streaming | None: words appear, the caret blinks | Text appended; the caret on the loop | The loop | Empty → written | The caret holds still |
| Sending it | "Send it" | `page`, as snapshots | `market-ink` on both bands; the root crossfades | Base, fade | The terms step → the market | The same |
| The sheet raising or lowering | The grabber, the move, a drag | `sheet`, itself | `translateY` on the sheet | Travel, move; base if less than half is left | Its low offset → 0, and back | Instant |
| The sheet arriving or leaving | A state gains or loses a move | `sheet`, itself | `translateY` on the sheet | Arriving over travel, move; leaving over base, leave | Its height → 0; 0 → its height | Instant |
| A modal sheet opening or closing | Its control; close; a drag | `modal`, itself | `translateY` on the sheet | Opening over travel, move; closing over base, leave | Its height → 0; 0 → its height | Fades in over base, out over quick |
| A swipe row | A sideways drag on Now | The row's inner box, inside `page` | `translateX` on it | Base, move, on release | 0 ↔ −76px | Instant |
| A row collapsing | Removed, archived or handled | The row, inside `page` | `height` to 0 | Base, move | Its height → 0 | Instant |
| Entering, as a moment | "I'm in" | `sheet` itself, then the columns inside `page` | `translateY`; `height` per column | Travel, move; the 40ms stagger | As 3.13 | The resting state at once |
| The information sheet opening or closing | The icon; its close, a drag, or the icon again | `modal`, itself | `translateY` on the sheet | Opening over travel, move; closing over base, leave | Its height → 0; 0 → its height | Fades in over base, out over quick |
| The opening's handoff to Now | Now's shell has painted | `#opening`, a fixed element outside the app root, itself | Opacity only | The logo over quick and the ground over base, both on the fade curve, from the same frame | Opaque → gone, then removed | The same |

---

## 10. The information icon and its sheets (for the hackathon)

A lot of what the app does is invisible by design: icon-only controls, swipes, holding a photo,
tapping the avatar stack, rules such as a blind answer being final. That is right for someone
who knows the app and a problem for someone exploring it for a few minutes, a judge above all.
So for the hackathon every screen carries a small information icon at its top right, and the
icon opens a sheet listing everything a person can do on that screen. This does not undo 4.9's
cut: that cut was about words nobody can avoid, and a sheet appears only when someone asks for
it. The icon and its sheets come out after the hackathon, and 10.3 says where everything they
displaced returns. Boards: `InfoCorner`, `InfoSheet`, `InfoRules`.

The developer writes every screen's sheet from the code, since the code is the final word on
what a screen does. This section is what they write to: how the icon and the sheet look and move
(10.2 to 10.5), how a sheet is written (10.6), the one line every sheet carries word for word
(10.7), and a worked example that holds to all of it (10.8).

### 10.1 Which screens get it

Every full screen a person can land on and look around:

- The four roots: Now (first run included), What's on, People and You.
- A market's own screen in every state (open, closed, voting, split, settled, voided, expired,
  the draft), the page someone reaches from a link (3.17, signed in or not), and the memory it
  leaves (3.37).
- A person view, a game page, the claimant screen and the code screen.
- Each step of asking: the question step, the careful step, who's in and the terms.
- The full-screen photo.

Not these, because each is a moment rather than a place, or someone else's interface: any modal
sheet (who's in, the code to scan, a confirmation, a vote, the mark picker, the heads-up, and
the information sheet itself); pass the phone's picker, PIN keypad and handback
(3.45); the opening (11); the camera and the phone's own prompts.

While a modal sheet is open over a screen, that screen's icon does nothing, because a sheet
never opens another sheet (6.4).

### 10.2 The icon

A 22px glyph, a circle with a lower-case i (a 9px-radius ring, a stem from 11 to 16 and a dot at
8, on the 24px grid, 1.8px stroke), in `--ink-2`, inside a 48px target. `--ink-2` rather than
`--ink`, so it is findable and never louder than the screen's own controls. Its accessible name
is "What you can do here", with `aria-haspopup="dialog"` and `aria-expanded` following the
sheet. It presses to 0.5 like every control drawn in lines (9.4). On the full-screen photo,
which is black in both themes, it draws in `--ink` of the dark theme, `#F2EDE3`. Nothing about
it moves, pulses or marks itself as new: it is found by being in the same place everywhere.

### 10.3 The corner, and what moves out of it

The icon owns the top-right corner of every screen in 10.1: the rightmost 48px of the 56px
header row, 8px from the screen's right edge, identical everywhere. The rule for everything else
is short. The top-left control leaves a screen (Back, or Close where the screen rose from
below), the top-right corner is the icon, and a screen's own control that used to sit in the
corner moves one place left, into the same header row, directly beside the icon. Screens with no
header row (Now, What's on, People, You) gain one for the hackathon: 56px, with what already sat
at the top of the screen moved into it.

| Screen | Top left | Beside the icon | After the hackathon |
| --- | --- | --- | --- |
| Now | The date line, now in the header row | "Got a code?", a 44px tertiary in `--ink-2` | "Got a code?" returns to the corner |
| What's on | "What's on" | Nothing | The row goes; the label returns to the top of the screen |
| People | The People and Standings segments, narrower by the icon's 56px | Nothing | The segments return to full width |
| You | Nothing | Nothing | The row goes |
| A market, a person view, a game page, the link page signed in | Back | More, the 48px icon | More returns to the corner |
| The link page signed out, the claimant screen | The wordmark | Nothing | The corner is empty again |
| The question step | Close (9.5) | "Got a code?" | "Got a code?" returns to the corner |
| The careful step, who's in, the terms, the code screen | Back | Nothing | The corner is empty again |
| The full-screen photo | Close, moved from the top right | Nothing; the counter ("2 / 5") moves from the top left to the centre of the row | Close returns to the top right and the counter to the top left |

"Got a code?" stays on Now at the top, reachable without going through asking, and in the same
header row as ever: it has moved 48px. (This copy of the spec puts "Got a code?" on the question
step, 3.29; the build also has it on Now, and both are covered.) On an empty Now the six boxes
stay where they are (3.16).

The icon is added by this rule, so the existing boards are not redrawn with it: `InfoCorner`
draws the header row of every screen in 10.1 as it is during the hackathon and after.

### 10.4 The sheet: how it looks

A modal sheet (6.4) on the current place's surface: a market's surface on a market, `--surface`
elsewhere, with its 1px top line and 12px top corners, in both themes by the token swap of
section 8. Nothing behind it dims (1.5). From the top:

1. The grabber (36 by 5px, `--line-strong`), then the header row, pinned while the rest scrolls:
   the screen's name in `body` 600 on the left and the 48px close on the right. The name is what
   the screen is, in five words at most, sentence case: "Now", "Who's in", "A market, while it's
   open".
2. The fixed line (10.7), in `caption` `--ink-3`, 4px under the name.
3. The groups, in 10.6's order. Each opens with its heading in `label` `--ink-3`, 20px above it.
   Under the heading, the entries, 12px apart.
4. An entry is two lines at most of its own. The term, in `body-sm` 600 `--ink`, is what to
   touch or what the rule is about; an icon's term starts with the icon's own glyph at 20px in
   `--ink`, 8px before its name. After the term, on the same line where it fits, an optional
   qualifier in `caption` `--ink-3` says who or when ("if you asked it", "once you're in").
   Under the term, the description in `body-sm` `--ink-2`.
5. 24px of padding at the bottom, plus the phone's safe area.

The sheet is 16px in from each side, as every sheet is, and its type is 13, 15 and 17 only
(4.8). It is as tall as its content and never taller than 88% of the screen, so the screen's
header row, with its icon, stays in view above it; past that the content scrolls under the
pinned header row.

In light, the sheet is the light surface with the light line, and the glyphs, terms and
descriptions take the light `--ink`, `--ink-2` and `--ink-3`. Nothing else changes.

### 10.5 The sheet: how it moves

It is a modal sheet in 9.9's terms: it rises from below over travel on the move curve, and
closes over base on the leave curve. It closes from its close, from a drag down on its handle
row (past a third of its height, or a downward flick), and from the icon, which stays visible
above it and toggles it. The page behind holds still. The layer that moves is `modal`, by a
`translateY` on the sheet itself (9.3). With Reduce Motion it fades in over base and out over
quick (9.11). Opening it does not change the screen's scroll position, and closing it returns
focus to the icon.

### 10.6 Writing a sheet

**What it is for.** Someone should see every function on the screen at a glance, and a fairly
technical person should be able to find and use any of them from the sheet alone. So it lists
everything a person can do on the screen, and it starts with what the screen doesn't show.

**The groups, in this order, each left out when it would be empty:**

1. **Gestures.** Anything done by a movement rather than a tap on something labelled: a swipe, a
   hold, a drag, a tap on something that doesn't look tappable (an avatar stack, a photo).
2. **Icons.** Every control drawn as a glyph with no word beside it.
3. **Rules and timing.** What changes when, and what binds: what locks at the close, what is
   final, who sees what and when, who can do what.
4. **Everything else.** A labelled control whose effect goes beyond its label, or whose place
   isn't obvious. Its entry says where it is and what it does that its label doesn't.

**Within a group**, entries go in the order the screen meets the eye: top to bottom, and left to
right within a row.

**An entry** is a term and a description. The term is five words at most. The description is one
sentence of at most 90 characters, two lines in the sheet, in the second person and the present
tense, with contractions. A sheet holds at most 16 entries; a screen that needs more is doing
too much, and that goes back to design.

**Naming a gesture.** The words are Tap, Hold (for half a second), Drag, Swipe (up, down, left
or right) and Pinch, followed by the thing touched, named as the screen names it: "Swipe left on
a row", "Hold a photo", "Tap the avatars", "Drag along the odds line". Never press, long-press,
click or scroll.

**Naming an icon.** The glyph, then its accessible name exactly as its `aria-label` has it
("Share", "Copy the link", "Show a code to scan", "Pass the phone", "More"). The word "icon"
appears only where the description needs it ("the icon turns to a check").

**Never narrate a label the screen already shows.** "Tap Vote to vote" is never an entry. A
labelled control earns an entry only through what it does beyond its words, or through where it
is: "Change, on your entry line" reopens your entry until the close.

**Qualifiers** say who can do it or when it applies, and nothing else: "if you asked it", "once
you're in", "in a blind market", "until the lock".

**States.** A sheet describes the screen in the state it is in, and each state that changes what
a person can do gets its own sheet: a market while it's open, while it's closed, while voting,
once it's settled. Kinds of market share a sheet, with the entries that differ swapped in (10.8
gives the swaps).

**Shared gestures** that work on every screen, pulling down from the top to re-read it (5.5) and
the back control, are listed on Now's sheet and nowhere else, so no sheet spends its entries on
them.

**Every copy rule still applies** (4.6, 4.9): the product's words, sentence case, no exclamation
marks, no wallet, transaction, gas, signature, chain or token, no sportsbook words, no "button",
"click" or "simply", no marketing, and no number except the rule's own. The app's words for
things are the sheet's words for them.

**Checking a sheet.** Every control and gesture the screen's code wires up has an entry, or is a
label that says everything it does. Every entry is under its length. The shared lint (4.8) runs
over the sheets for the banned words.

### 10.7 The fixed line

Every sheet carries this line, word for word, under the screen's name:

"This sheet is here only for the hackathon, so every feature on every screen can be seen."

### 10.8 The worked example: a market while it's open

The busiest screen, written to 10.6 for a yes-or-no market (`InfoSheet`; unrolled on
`InfoRules`). It covers someone not yet in and someone in, since both are the open market;
qualifiers mark what applies to whom.

**A market, while it's open**

"This sheet is here only for the hackathon, so every feature on every screen can be seen."

Gestures

- Tap the avatars. Opens who's in: everyone in, and anyone still out, whom you can nudge.
- Swipe the sheet. Up shows your stake and the button that gets you in; down lowers it to read
  the market.
- Drag along the odds line. Sets your odds from 0% to 100%; a tap anywhere on the line jumps
  there.

Icons

- More. Beside this sheet's icon: the rest of the market's details, and how it gets decided.
- Share · once you're in. Sends the market's link to a chat, with the question as its picture.
- Copy the link · once you're in. Copies it; the icon turns to a check for a moment.
- Show a code to scan · once you're in. A code a friend scans with their own phone to open this
  market.
- Pass the phone · once you're in. A friend with an account gets in on your phone with their
  PIN.

Rules and timing

- Your entry · once you're in. Yours to change until the close, from Change on your entry line.
- Where everyone landed. Shows once you're in, never before.
- Your answer · in a blind market. Final once you're in, and then you see everyone's.
- The close. The time in the band: after it nobody gets in or changes, and people say what
  happened.
- Photos · once you're in. Add them any time from the slot at the bottom; everyone in it sees
  them.

Everything else

- Remove, in who's in · if you asked it. Takes out an entry from someone without an account,
  until the lock.
- Close it with 4 · if you asked it. Closes it early; whoever isn't in yet can't get in after.

Fifteen entries, each under 90 characters. The swaps for the other kinds: a number market
replaces the odds line's entry with "Tap the number. Type your number; − and + step it, and
holding either repeats."; a pick-one market replaces it with "Tap an answer. Picks it; tap
another to move your pick." and its sheet entry with "Swipe the sheet down. Lowers it to a bar
so the terms behind six answers can be read."

Two entries follow the brief this revision was written from rather than an older section, and
the code decides between them: that everyone in sees photos added while it is open (3.39 keeps
them to the person who added them until it ends), and that anyone still out can be nudged from
who's in (3.42 has nothing that nudges). Whichever the build does is what those two lines say.
(Resolved 2026-09-28, Round D: the album is open the whole time and who's in nudges the people
still out, both by the owner's rulings amended into 3.39 and 3.42, so the two lines stand as
written.)

---

## 11. The opening

Opening the installed app used to show a few seconds of white. It is two things in a row. iOS
shows a static launch image from the moment the home-screen icon is tapped, and shows white when
the app supplies none sized for that phone; it ignores the manifest's `background_color` for
this. Then the app takes a moment to start, and its first paint can be white before its styles
arrive. The opening makes those one continuous moment, the launch image, then the app's first
frame, then Now, with nothing jumping between them. Boards: `Opening` (dark and light),
`OpeningSpec`.

### 11.1 The three parts

1. **The launch image**, which iOS shows while the app starts. It cannot animate.
2. **The app's first frame**, drawn by the page itself from its own HTML and an inline style in
   the document head, before any script or stylesheet loads. It is the launch image again, pixel
   for pixel, so the moment iOS swaps its image for the page nobody can see it happen.
3. **The handoff to Now**: once the app has drawn Now's shell underneath (9.4), the first frame
   fades away over it.

Both still parts are the same picture: the ground, flat, with the logo at the centre. No grain
(1.1), which arrives with Now in the handoff, no text, no spinner and no status of any kind,
because the only honest thing to show before the app runs is the app's mark.

### 11.2 The logo placeholder

The logo is designed in a separate session, so everything here is drawn with a placeholder that
the real logo replaces without anything else moving: a box of 120 by 120 CSS px, centred
horizontally and vertically on the full screen (the whole display, status bar and home indicator
included, since the launch image covers all of it). Its centre is the screen's centre. The real
logo is delivered as an SVG drawn to fit inside that box, centred in it at any aspect ratio, in
one colourway for each ground: on the dark ground `#121110` and on the light ground `#F5EFE4`.
On the boards the placeholder is a 1.5px dashed `--line-strong` square labelled "Logo, 120 ×
120".

### 11.3 The launch image

One PNG per iPhone screen size the app supports, portrait, at the device's full pixel size (1179
× 2556 on a 6.1-inch iPhone 15 or 16, 1290 × 2796 on a 6.7-inch one; the generator's device list
supplies the rest), each linked with `<link rel="apple-touch-startup-image" media="…">` matching
that device's width, height, pixel ratio and portrait orientation. A script renders the whole
set from one SVG of the placeholder or logo, so the box sits at exactly 120 × 120 CSS px times
the pixel ratio, centred. Two sets, dark and light, each with `(prefers-color-scheme: dark)` or
`(prefers-color-scheme: light)` in its `media`.

Check on a real iPhone, in both appearances, that iOS picks the set by scheme. If it doesn't, it
takes the first image that matches the size, so list only the dark set: dark is the default, the
first frame draws dark to match (11.4), and a light phone's handoff fades from dark into light.

### 11.4 The first frame

In the document head, before anything else, an inline style and one element in the body:

- `html` and `body` take the ground as their background (`#121110`, and `#F5EFE4` under `@media
  (prefers-color-scheme: light)`), with `color-scheme` to match, so the page never paints white
  behind anything.
- A fixed element, `#opening`, covering the screen (`inset: 0`), in the same ground, holding the
  logo box: `position: absolute; left: 50%; top: 50%; width: 120px; height: 120px; margin: -60px
  0 0 -60px`. The logo is inline SVG, so it paints in the first frame with nothing to fetch.
- The viewport is `width=device-width, initial-scale=1, viewport-fit=cover`, so the page covers
  the same full screen the launch image did.

The first frame draws in the phone's own scheme, whatever the Appearance override on You says
(8.1), because the phone's scheme is what picked the launch image. The override takes over from
Now, and when the two differ the handoff's fade carries the change.

`#opening` is a child of the body, never inside the app root, and it is never transformed (9.3):
it only fades.

(Built 2026-09-28, Round D: the first frame's inline style holds `html`'s ground only until the
handoff marks the document (`data-dressed`); from that frame the stylesheet's tokens, and the
Appearance override with them, own `html`'s ground, which is how the fade carries the change when
the two differ.)

### 11.5 The handoff to Now

The app starts under `#opening`, draws the first screen's shell (Now's date line or, for the
hackathon, its header row, its tab bar and the + for someone signed in, first run for someone
who isn't), and on the frame after that shell has painted:

- the logo fades out over quick on the fade curve;
- `#opening`'s ground fades out over base on the fade curve, starting at the same moment,
  uncovering Now, grain and all;
- at the end `#opening` is removed from the page.

Nothing travels, grows or shrinks: the logo is not Now's, and nothing on Now takes its place.
Now's content then fades in as it arrives (9.4). The handoff never waits for data, and never
holds the logo for show: if the app is ready in 300ms, the opening lasts 300ms and the fade. If
it is slow, the first frame simply stays; nothing is added to it.

With Reduce Motion the handoff is unchanged, since it is two fades (9.11).

The opening runs on a cold start only. Coming back to the app from the background shows it as it
was, and 5.5's re-read keeps it current.
