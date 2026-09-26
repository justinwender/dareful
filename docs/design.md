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
  `PickOneResolve`), What's on (`WhatsOn`; `WhatsOnFlow`; `WhatsOnStates`; `FeedBallot`), You
  (`You`; `YouEarly`), a row for the contract redeploy only (`SpreadRedeploy`), which must not
  be built before it, and a last row for after submission, the light theme (`LightScreens`,
  `LightRules`).

Market colours on boards other than `Inks` and `MarkPicker` are illustrative and were drawn
before the emoji ink table existed (1.8). Where a board and `src/lib/ui/emoji-inks.json`
disagree, the table wins.

The developer builds from this text, and a board export has come out blank before, so every
screen that matters is specified here in words: the market screen and its sheet (3.24, 3.25),
what happens after a market ends and the memory it leaves (3.37), and the rest of the screens
(3.38). Where a board is older than its text, 3.38 says so, and the text wins.

Target: mobile web, installable as a PWA, 390px reference width. Tailwind plus shadcn/ui. Dark
is the default and only shipped theme for v1. The light theme is specified in section 8, to be
built after submission.

### What changed in this revision

This revision covers the ninth design session only. Everything not listed here is unchanged from
the copy in the repository. Each item says what it asks of existing code.

1. A photo while the market is open (new 3.39; 3.8, 3.24, 6.3). The "you're in" sheet gains a
   camera button beside "Send it to the chat", for people who have entered and only while the
   market is open. What it takes is a memory, never evidence, and only the person who took it
   sees it until the market ends; then it joins the frame after the claim's attachment. Someone
   who isn't in sees no camera at all, so entering stays the open screen's only move. Built
   code: the sheet's row gains the button; `addMarketPhoto` accepts an open market from someone
   with a position, with `role = 'memory'`; a photo added before the end is visible to its
   author alone until then; the frame already orders memories by when they were added.
2. The light theme, for after submission (new section 8). Follows the phone, with an override on
   You. The primary action is graphite, the value extreme on a light ground; the eight inks keep
   their hues at light layers; citron keeps its colour and gains a graphite edge; the grain is
   recalibrated as a dark tile. Built code: none before submission. After it, a second set of
   values for the same custom properties plus four drawn rules (8.8).
3. No glass (1.5). Frosted and translucent surfaces stay out of both themes, with the reasons
   written down, so a later pass doesn't reach for them.
4. Cleanups. 4.7 said every row with a clock carries the citron dot, which contradicted 3.15's
   one dot per viewport; it now points at 3.15. 1.1's Light column is marked as the value half
   of section 8, and its citron value is replaced (8.5).
5. Canvas. New `OpenPhoto`, at the end of the screens row. A new last row for after submission:
   `LightScreens` (Now, a market in its ink, and board 14, in light) and `LightRules`. The
   export at `docs/design/reference/design.html` is regenerated.

---

## 1. Tokens

### 1.1 Color

Root is 16px. All colors are opaque hex unless an alpha form is given.

The Light column is not shipped before submission. It is the value half of the light theme;
section 8 gives the rules that are not a value swap, and they win where the two differ.

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

There is no red token and no green token. Hues between 345° and 25° and between 75° and 165° are
unused by person hues on purpose, so nothing in the product can read as loss or gain.
`destructive` in shadcn maps to `--ink` with a confirmation step, not to a color.

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
naming prompt). Never use dashed for errors.

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
- Taps: 120ms ease-out on opacity and background. Screen transitions and a sheet opening: 200ms
  ease-out. Media opens at 240ms.
- The sheet moving between its two heights: 320ms `cubic-bezier(0.2, 0.8, 0.2, 1)`, and none
  while a finger is dragging it.
- The odds line growing into the weight line on entry: 700ms on the same curve (3.13).
- The mark riding the odds line: 90ms linear on font-size, so it tracks the finger without lag.
- No parallax, no confetti, no celebratory animation on a resolution. The settled screen is not
  a win screen.
- Respect `prefers-reduced-motion`: drop the transitions, keep the state changes.

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

The light theme's layers for all eight inks are in 8.4, for after submission.

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
`--line-strong` ring); **no name yet** (no question mark: use the first character of the phone
number's contact label, and if there is none, an empty stamp-grey circle with an `aria-label`
of "unnamed friend").

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
- **Fraction**: `½ ×` plus one glyph. Fractions come only from split rulings and only in
  halves.
- **Mixed**: glyphs, then quoted words, then the rule, then dollars. If the pill would exceed
  the row width, drop to two stacked tokens on the owner's side rather than shrinking type.
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
- **Argument, split**: question, the 60/40 bar, the ruling sentence, and either a consequence or
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

- **Hidden** (the viewer is not in yet, or a blind market before everyone is in): no pins, no
  average, no count of who is ahead. The weight line's blind state (3.22) carries the lock chip.
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
the answer, and there is no 50% tick); **pick one** (no closest-first list: everyone who called
it scores the same, so 3.25 shows who called it instead); **multi-choice, for the redeploy
only** (3.36: "spread it" or "picked Priya" under the name, and "gave it 30%" or "picked it" on
the right; the gap bar runs from what they gave the answer that happened to a 3px cream tick at
100%, and the 1px tick sits at the even split).

### 3.8 Media frame

Where a market's photos live: its own screen once it has ended, and its story card in a
timeline. Never on a link tile (3.27).

Full card width with no radius when it is edge to edge inside a card; radius 12 when it is inset
on a screen, 12px from the edges. Heights: 180 in a timeline card, 200 on the settled screen,
260 on the memory screen (3.37). The strip under it: 60px squares, radius 10, 6px gap, four and
then a `+N` square.

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
stored. A photo that fails leaves the 5.1 block in the sheet, "That photo didn't go up.", with
"Try again". Forty-eight memories a market is the limit and no screen counts toward it; past it,
the sheet says "This one's full." and never how full. Whoever added a memory can remove it from
its full-screen view at any time. Evidence stays, since a vote or a ruling may rest on it.

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
night ("Add the first photo from Friday"). It opens the same picker as the sheet's chalk, and
once the first photo lands it becomes the frame. It is drawn as the place photos go, so it never
reads as a heading; it is a control, so its words sit outside the type budget. Board:
`SettledPhotos`, frames A and C.

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

States: **pressed** (opacity 0.88, 120ms); **disabled** (`--ink-3` text, 1px `--line` border, no
fill, `aria-disabled`, no opacity trick); **pending** (5.2); **destructive** (secondary styling,
`--ink` text, and a confirmation sheet; no red).

At most one chalk-filled control per viewport. On a root, the Start button is that control.

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
send** (the sheet stays raised with a 15px line "Your number didn't send" and a tertiary "Try
again"; the number is never silently dropped).

**Entering, as a moment.** Confirming lowers the sheet over 320ms, which carries the stake row
away. Then every segment grows from 6px to its column height over 700ms, your share of your
column fills in your hue, your avatar rises to sit above your column, and the group's marker
draws last. At about 1.8s the sheet becomes the next state's ("Send it to the chat") and the
screen gains the entry line, "You're in at 70%", with the full weight line under it. No toast,
no navigation. With `prefers-reduced-motion`, the resting state renders at once. The growth is
the reveal as well as the receipt: other people's weight is never visible before you are in.

### 3.14 Empty and first-run states

- **Now, before anything** (`FirstRun`): today's date as a label, the `serif-xl` headline
  "Nothing happens here until somebody else is in it.", one `body` line in `--ink-2` ("Ask your
  group chat something, or join something one of them already asked."), the chalk "Ask
  something", the compact code field (3.16) under the `label` "Someone sent you a code?", and
  three questions from What's on as 40px-stamp rows in `body` 600, under "Or start from
  something everyone's watching" and followed by a tertiary "See everything on What's on"
  (3.32). These were fixed starters: the row component is unchanged and only its label and
  source are new. The three are the most asked, or the next to close while there is too little
  to rank on (3.32). If nothing is curated, the old starters return. This is a bonus on the
  empty state; What's on itself lives on its tab. The Start button is hidden on this screen,
  because "Ask something" is already the chalk.
- **A person with no shared history**: identity block, "Nothing between you two yet," and a
  single starter.
- **A story with no media**: nothing. No frame, no prompt in the timeline. Adding lives on the
  market's own screen once it has ended (3.8, 3.37).
- **A claimant with nothing waiting**: the signup lands on Now, not on an empty inbox.
- **A market with no other participants yet**: "You're first in" plus the send control, never a
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
argument"). Right: a 44px row-action button whose label is the verb: Vote, Enter, Yep, Finish.

Running and Just happened use the same row without the button; Just happened may carry a 44px
media thumbnail on the right.

A Running row's meta line is the state mark, then your entry and how many are in ("You're in at
17 · six of you"); once the market locks, the mark and its clock ("Resolving tonight").

Ordering: anything with a clock first, soonest first; then longest waiting; then whatever is
fastest to finish.

States: **empty** (the section and its heading are removed entirely, not shown empty); **one
item**; **more than four** (show four, then a 44px "2 more" tertiary row); **resolved elsewhere
while on screen** (the row collapses over 200ms, no toast); **abandoned draft** (the dotted
ring, "You never sent this one", verb "Finish"); **acted on** (row collapses, the result shows
up in Just happened).

Never: a count badge on the heading, a number in an app icon, a red dot, or a row that reports
how long something has been waiting in days.

### 3.16 Code input

Two forms of the same thing.

**Compact** (an empty Now): a 48px text input, radius 10, 1px `--line`, `--surface` fill, 17px
with `letter-spacing: 0.08em` and `text-transform: uppercase`, placeholder a real-shaped code
(`K7QMD3`), and a 48px secondary Join beside it. Never `type="number"`.

**Focused** (the joining screen, headed "Got a code?" in `serif-l`): six boxes in a `repeat(6,
minmax(0,1fr))` grid, 60px tall, radius 10, 1px `--line`, `--surface` fill, `numeral` 20, 8px
gap. The active box takes the focus ring (5.1). Typing advances, backspace retreats, and pasting
six characters fills all six at once. Join sits in the sheet and stays disabled until six are
in.

Alphabet: A-Z and 2-9 minus O, I and Z, which leaves 31 unambiguous characters. Input is
case-insensitive and always displays uppercase, because the common case is one person reading it
off another person's screen in a dark room.

States: **empty**; **partially filled** (Join disabled); **full** (Join enabled); **invalid
shape** (5.1, at the field); **unknown or expired code** (the form-level block above Join, "No
market with that code. Worth checking the last two characters.", the typed characters kept);
**already a member** (no error at all: go straight in).

### 3.17 Arriving from a link

A link opens the market's own screen, not a preview card. The person lands in the market's ink,
looking at the same empty line the asking tile showed them in the chat, now under their thumb.

- **Header**: the wordmark on the left and nothing on the right when they are not signed in,
  because there is nowhere in the app to go back to. Signed in, the normal back and more.
- **Content**: the question band (mark, state and close time, question, "Priya asked the Friday
  crew"), the participant stack with a plain count ("Four friends are in"), and a `dl` of two
  facts: Decided, and How it works ("Everyone puts in their odds. Closest does best."). No
  stakes, no amounts, no leaderboard, no obligations, and no names beyond the asker's and the
  avatars'. What someone sees before joining is what it is and who asked, never what it could
  cost.
- **The sheet, at rest**: the odds line, untouched (3.13).
- **Signed out, after sliding**: the sheet raises and asks for a phone number under the line
  ("Your phone number, so this one is yours"), with a chalk "Join at 70%" and one caption: "We
  text a code. No password, nothing to download." After the code, the stake chips appear and the
  entry completes as usual.
- **Signed in**: the raised sheet holds the stake chips and "I'm in at 70%, 2 beers", with
  "Joining as Sam · Not you?" under it.

States: **expired or settled** (the market's own screen in its settled state, read-only, with
the sheet reading "This one's finished" and nothing to join); **closed but unresolved** ("This
one closed at 11pm, so you can watch but not enter." in the sheet); **revoked or malformed
link** (the code screen with a form-level message).

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

A context chip appears in exactly three places: on an event row, where it says which set of
people an event came out of; in the shared-context band on a person view (3.21); and in the
same-people picker (3.20). It is never a list on home, and tapping one never navigates into a
group as a place. On the person view it filters the timeline; on an event row it is a label
and is not interactive.

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
circle and a chevron, opening the people picker); **first ever market** (no rows at all: the
picker is replaced by the people picker itself, with a line about sending the link).

**The naming prompt.** When the selected set is asking its second question, a dashed block
(radius 10, 1px dashed `--line-strong`) appears directly under that row: one `body` sentence
("Second time with these four. Want to call them something?"), a 48px text input whose
placeholder is a plausible name, a 48px Save, and a 44px "Not now". It appears once per set,
never blocks the flow, and never returns after it is dismissed twice. A name is a convenience
for chips and tiles, not a requirement, and nothing is created by naming.

The ask flow's pinned action is the sheet (3.24) with one caption, "You can add anyone else
right up until it closes.", and a chalk "Set the terms".

### 3.21 Shared-context band

On the person view, directly under the open-obligations header: a 13px `--ink-2` heading
("Where you two turn up"), a wrapped row of context chips with counts of shared events, and
one 13px `--ink-3` line telling the reader what tapping does.

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
odds line in the sheet (3.13, changing). Positions are editable until lock and never after.

States: **one entry** (your column alone at full height, no marker; the marker appears from the
third entry); **one stake over half the total** (the caption says so in words, because the
picture alone reads as agreement); **everyone on one number** (one full column, marker on it,
caption "No spread at all."); **blind until lock** (outlined columns with no heights, your own
bucket marked with your avatar and a 5px cap in your hue, a centred lock chip "Numbers show when
everyone's in", a count of who is in, and no group's number); **locked** (unchanged picture,
Change gone, the entry line keeps "You're in at 70%" and its caption reads "2 beers · locked at
10:40pm", nothing greyed); **settled** (replaced by the call line and closest first); **number
market** (below); **nine or more entries** (unchanged).

**Number markets.** The same row of columns, on an axis taken from what people entered. The
asker's scoring scale (3.26) never draws anything here: the display and the scoring are
deliberately different, and the display does not try to reflect the scoring.

- **Ends.** `lo` and `hi` are the lowest and highest on-axis entries. If `hi − lo < 2`, pad by
  one on each side, never below 0. Everyone on 14 draws 13 to 15; a single entry draws your
  number with one either side, your column in the middle at full height.
- **A narrow spread gets a column per value.** When `hi − lo + 1 ≤ 10`, draw `n = hi − lo + 1`
  columns, one per whole number, with the same 3px gap. Label every column when `n ≤ 7`,
  otherwise the two ends and the middle.
- **A wide spread gets ten slices.** Otherwise `w = (hi − lo) / 10` and `bucket(v) =
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
- **Blind.** A blind number market draws no axis before the reveal: your entry line, the lock
  chip ("Numbers show when everyone's in") and the count. On a yes-or-no market the outlined
  columns give nothing away, because 0 to 100 is fixed; on a number market the ends alone would
  say what range everyone else picked.
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

Every market screen, and every task screen, keeps its one move in a sheet pinned to the bottom,
where the tab bar sits on a root. It never scrolls away. The content behind it scrolls, with
bottom padding equal to the sheet's resting height plus 20px so nothing is trapped underneath.

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

Where it rests says whose move it is, and it never goes empty while the market runs:

| State | Whose move | Resting | Raised |
| --- | --- | --- | --- |
| Open, not in | Yours | "What are the odds?" and the empty line (or the empty number field) | Stake and "I'm in at 70%, 2 beers" |
| Open, you're in | Nobody's | "Send it to the chat" under "Anyone with the link can get in until 10:40pm.", with a 56px camera button beside it (3.39) | No second height |
| Closed, not yet known | Whoever saw it | "When it's clear, say what happened." and the outcomes as two equal wells in the market's words ("He fell asleep", "He stayed up"; "Yes" and "No" without them, 3.25), with a tertiary "Nobody can tell" | The claim: an optional line, photos or screenshots, and "Say it" |
| Voting, not said | Yours, with a clock | The count line ("3 of 6 have said yes. Two more and it settles."), chalk agree, secondary "Not how I saw it" | Who has said what; everything attached, as 44px squares with who supplied each; the app's read, once anyone has voted |
| Voting, said | Theirs | One line: your avatar, "You said he was out", the count, Change | No second height |
| Split | The arbiter's, or yours with proof | "Add what you saw" and the arbitration deadline | What each side said |
| Settled, you were in | Yours, no clock | Chalk "Add yours from Friday" ("Add a photo from Friday" while there are none), secondary "Send how it ended" | The whole result tile, as the chat will get it |
| Settled, you weren't in | Nobody's | "Send how it ended" | The whole result tile |
| Voided or expired, you were in | Yours, no clock | Chalk "Add a photo from Friday" ("Add yours" once there are some), and nothing else: no tile tells a void | No second height |
| Voided or expired, you weren't in | Nobody's | No sheet. The story is the whole screen. | |

After a market ends, adding a photo is the move for everyone who was in it, so their sheet stays
on every visit, weeks later included. The night comes from `fromThatNight`: the weekday while it
is under a week old ("from Friday"), "tonight" and "last night" as calendar days, and "that
night" after a week. Sending is the secondary because it is worth doing more than once: once
photos are added, the tile says so (3.27). For someone who wasn't in, the sheet holds "Send how
it ended" alone and goes once they have sent it or left the screen, remembered on the device and
never as a record.

**Saying what happened.** A well raises the sheet to the claim: the outcome chosen, in the
market's words, at the top; then an optional line, "What happened?"; then a row to attach proof,
"Add a photo or a screenshot", up to three per person per question, each shown as a 44px square
with a remove control. The chalk says it in the claimant's voice ("Say it: he fell asleep", or
"Say it: yes" without the market's words) and opens the vote's modal (6.4), since it binds
everyone: the claimant is the first vote. Whatever was attached is evidence, and everyone voting
sees it: the first attachment is the claim card's clip (3.37) and the rest are in the raised
sheet, each with the first name of whoever supplied it. Anyone voting may attach too, and a case
for the tiebreaker may carry its own. Once the market ends, the claim's attachments lead the
frame (3.8); the rest stay on the record behind More, under "How it was called". A tertiary
"Nobody can tell" in the resting sheet is a vote to void. The app's read ("The app leans yes, 82
to 18.") sits on the claim card only while nobody has voted, and after that as a caption in the
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

Pick-one markets use the same rows too. **Open, not in** rests on "Pick one" with the answers
(3.30). **Closed, not yet known** rests on "When it's clear, say what happened." with the
answers as equal wells, two across, each with its avatar where it has one; any of them opens the
claim. **Voting, not said** carries a count line that names the claimed answer ("3 of 6 say
Priya. Two more and it settles."), a chalk "That's right, Priya" and the secondary "Not how I
saw it", which raises the sheet to "What did you see?": the other answers as rows, a dashed "I
couldn't tell" (a vote to void), and a tertiary "Never mind". One tap sends. When votes split,
the count line names the answer nearest to settling ("3 say Priya, 1 says John. Two more for
Priya and it settles."). A swipe up instead shows who has said what, one row per answer with its
voters' avatars. **Voting, said** is one line: your avatar, "You said Priya", the count, Change.

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

Under the band, in this order and only when they apply: the entry line (3.22), the claim card
while voting (3.37 gives its layout; it replaces the entry line once voting opens, and its clip
is the evidence everyone voting sees), the weight line or the call line, the participant stack
with its count, and the details `dl` (96px labels, `body` values, the market's surface and
line). The details carry: Counts if, Decided, Stakes, If it's unclear. Everything else the
product needs to say about how it works goes behind More.

The screen after a market ends, settled, voided or expired, is specified in full in 3.37, with
the memory it becomes. In short: the outcome line in `serif-l` in the market's words ("He
did."), the claim's line as its caption ("Out cold, 1h 12m in."), the frame at 200px led by the
claim's clip or, for someone who can add, the empty slot; the call line; closest first (3.7);
who's got who, grouped by owner; and the sheet whose move is adding a photo. On a number market
the outcome is one `serif-l` sentence with the number in it ("14 shirts, then a seam gave
out."), the caption says who was closest ("Theo was closest, off by 2."), and the ruler (3.5)
stands where the call line would.

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
keypad; the steppers move by one. One caption: "Any whole number. Tap it to type." Then the
stake chips and "I'm in at 17 shirts, $5".

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
grow from the baseline over 700ms, your share fills in your hue, your avatar rises above your
column and the marker draws last.

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
same for one recipient or twelve.

**The result tile** (`TileCalled`, and `TilePhoto` for a market with photos), sent when someone
chooses "Send how it ended" from the settled sheet: the market's field, the mark and the outcome
on one line, the call line with 52px pins where the person who called it wears an extra cream
ring, the No and Yes labels, and "John called it at 10%." at 34px 600.

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

Rendering: server-side (Satori or equivalent) with Noto Color Emoji loaded for emoji marks and a
sticker's 256px derivative read from the bucket on the server. Both fail silently when
forgotten.

**Serving.** One route (`/m/[id]/opengraph-image`) serves the asking tile until the market
settles and the result tile after, so a link sent by "Send how it ended" previews as the result
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
alpha, crop and pad square. And "Make a sticker" from a photo on a market that has ended, which
is the loop worth building toward: John asleep on the couch becomes the mark on the next market
about John. Automatic background removal stays out, because IMG.LY's remover is AGPL-3.0.

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

**The step.** Header: the 48px back control and nothing on the right, matching the who's-in
step, so there is no step counter. Then the question band on the market's field, which is the
neutral `--surface-2` until a mark is picked: 12px from the screen edges, radius 12, 16px
padding (20 at the bottom), 16px between its two parts.

- **The mark row**, one button with `aria-haspopup="dialog"`: the 64px stamp, then "Add a mark"
  in `body` 600 over "Optional. It picks this market's colour." in `caption` `--ink-2`. Unset,
  the stamp is dashed (1.5px `--line-strong`, radius 16) around a 24px plus. Set, it is the mark
  at 34px on the market's ground, the title reads "Mark", and the line under it is the emoji's
  name and "tap to change" ("Crescent moon · tap to change").
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

1. A 44px search field on the field colour, placeholder "Search: moon, beer, dog", with Done
   beside it.
2. Only while the picked mark is hueless, one `caption` line in `--ink-2`: "Faces, people and
   grey marks don't set a colour, so this market gets one of its own."
3. "Recent" in `label`, then one row of cells: a dashed None cell first, reading "None" in 13px
   600 `--ink-3` (the no-mark option, selected by default), then up to seven recent marks, most
   recent first, kept per device.
4. Category chips as words, no icons, scrolling sideways in a `tablist`: Smileys, People,
   Animals, Food, Activities, Travel, Objects, Symbols, Flags. Choosing one shows that group and
   clears the search; while a search shows, no category is selected. The picker opens on Food,
   because Smileys and People are hueless, and a first grid that never sets a colour teaches
   nothing.
5. The grid: 8 columns of 44px cells with a 2px gap, emoji at 28px, the group's name in `label`
   above it. A search replaces the group with "Matches".

**Picking.** A tap sets the mark at once. The picked cell takes the market's field and a 1.5px
inset ring in your hue. Everything behind the sheet (the band, the stamp, the ground, the pinned
sheet) retints to the mark's ink over 200ms, and so does the picker, since it sits on the
current place's surface. The picker stays open so the person can try another; seeing the colour
arrive is how they learn what a mark does, which is why no sentence explains it. None returns
everything to the neutral room. A hueless mark retints to the market's hashed ink and shows the
one line in item 2. The draft's id is made on this step, so the ink previewed for a hueless mark
(a hash of the id) is the ink stored.

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
with a paste glyph), then this person's stickers, newest first. While they have none, one
`caption` under the row: "Lift a subject out of a photo, copy it, and paste it here." A paste
anywhere in the sheet works too (3.28). Nothing else about the picker changes for stickers.

**For a unit's mark** the same picker opens from wherever a unit is made, with no ink preview:
nothing retints and the hueless line never shows, because units take no ink (1.7). No screen
makes a unit with a label of its own yet, so this has no entry point until one does.

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

**At rest** (open, not in), the sheet holds "Pick one" in `body` 600 and the answers as 44px
rows: radius 10, 1px line, the 28px slot and the answer in `body` 600, in the asker's order and
never sorted by stake. When the viewer is one of the answers, their row reads "You".

**Picking** is a tap. The row takes the market's field, a 1.5px inset ring in your hue and a
check, and the stake chips (3.3) and the primary appear under the list as the sheet grows to
hold them (320ms). Tapping another answer moves the pick. That is the whole entry: "I'm in:
John, 2 beers", or, after the contract redeploy, "I'm in: John, just pride" with no stake (3.3).

The entry line reads "You're in: John" over "2 beers · yours to change until 11pm". Change
reopens the sheet with your pick selected and "Never mind" beside "Save: Priya, 2 beers".
Failing to send and locking are the odds line's states (3.13).

**Entering, as a moment.** The sheet lowers over 320ms. Then the bars (3.31) grow from the left
over 700ms, your stake fills in your hue on your pick's bar, your 22px avatar appears on its
row, and the shares fade in last (300ms, starting at 600ms). With `prefers-reduced-motion`, the
resting state renders at once.

Unchanged from the last revision: the answers editor and its "If none of them might happen, add
that too." (3.29), blind (3.31), and voting on which answer happened, with "I couldn't tell" as
the vote to void (3.24).

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

**Blind** is unchanged: outlined tracks, your pick marked with a 5px cap in your hue and your
avatar, the lock chip and the count, and nothing else before lock. At lock, the bars grow as in
the entering moment.

**Locked** keeps the picture and drops Change. **Settled** is the pick-one settled screen
(3.25).

### 3.32 What's on

A set of shared questions about things everyone is watching, such as a game or an awards show.
Each is a template: its question, terms and close time are written once by the team. A person
browses them, picks one that fits their friends, and asks those friends exactly as they would
ask anything; settlement stays between those friends. Boards: `WhatsOn`; `WhatsOnFlow` for
picking one; `WhatsOnStates` for launch, empty and failed; `FeedBallot` for voting (3.35).

**It never looks like a market against the world.** The line sits at beliefs about the outcome,
not at use. What must never appear is any aggregate of what people think will happen: odds, a
price, a percentage, a share, "most picked", or how any group called it, voted or settled. What
may appear is how much a question is being used. A count of friend groups arguing about a
question says nothing about what any of them believe, so it tells nobody anything about the
outcome and does not compete with settling only among friends; it is also what makes the tab
feel like a shared moment. The last revision drew the line at any aggregate across groups, which
was too wide.

- No number about anyone's belief, anywhere on What's on or on a question's page: no
  percentages, no shares, nothing picked. The one cross-group number allowed is a count of
  groups using a question.
- The order is popularity, with time as its fallback and its frame, as the tab below describes.
  Popularity is the number of friend groups that have started a market from the question since
  it opened, counting a market once it has a second person in. It is never the number of people,
  and never anything they picked.
- What a person sees about use is limited to markets they can already see. A row reads "You're
  in this with the Friday crew", with the you're-in mark, when a market started from it includes
  them, and tapping that row opens that market instead of the question's page.
- Nothing about any particular group the person is not in: no names, no picks, no results. The
  count is the only thing that crosses groups, and it counts groups, never what they said.
- Once an event is over, its questions drop off. A finished event leaves nothing behind on
  What's on, least of all how groups did.

**The tab** (`WhatsOn`):

- Header: "What's on" as the root's `label`, then one `body-sm` line in `--ink-2`: "Things
  everyone's watching, to argue about with your friends. Whatever you pick stays between you."
  The second sentence is the product's difference, said once, at the place someone might wonder
  about it.
- **Most asked** comes first: a `label` and one card holding up to three questions, the
  most-used first, each row carrying its count and when it closes ("Asked in 214 groups ·
  Tuesday, first pitch"). A question qualifies once 10 groups have used it; the section shows
  however many qualify, up to three, and is not rendered at all when none do. Ten is the floor
  because below it a count is noise, a small one beside a question reads as nobody caring, and a
  count of two or three can tell someone whose group it is. It is a shortcut, so its rows also
  appear under their day.
- Then the schedule: sections by day ("Sunday, Sep 27") in `label`, soonest first. Each event is
  a card: its name in `body` 600, its time and place in `caption`, a hairline, then one row per
  question: the 40px stamp on the question's field colour, the question in `serif-m`, and a meta
  line in `caption`. Inside an event, questions go most-used first, falling back to the
  curators' order. The meta line gives the count once a question has 10 groups ("Asked in 41
  groups · A number"), its kind and close below that ("Pick one · closes at kickoff"), and your
  own use in place of either ("You're in this with the Friday crew"). The whole row is the
  button; there are no action buttons in rows, because What's on is browsed and the one move
  lives on the question's page.
- Why popularity sits over a schedule rather than replacing it: a popular Tuesday game and a
  quieter Sunday one both matter, and the Sunday one closes first. Ordering the whole list by
  popularity would bury the question about to close; ordering it all by time would hide what
  everyone is talking about. Most asked gives popularity the top of the screen, and the schedule
  keeps every question findable by when it closes.
- At launch, almost no question has been used, so Most asked isn't there and what remains is the
  schedule (`WhatsOnStates`, A). A list ordered by time is exactly what a schedule looks like,
  so the fallback never reads as a broken ranking, and counts appear row by row as questions
  cross 10 groups.
- Events come from the sports feed as well as by hand, so What's on lists upcoming games and
  drops each one at its close. Nothing already started or finished is ever shown.
- Nothing upcoming (`WhatsOnStates`, B): the header and one card with one line, "Nothing on
  right now. Games show up here a few days before they start."
- The feed fails (C): the 5.1 form-level block at the top of the list, "Couldn't get the latest
  games." over "These were right as of 2:10pm." and a 44px "Try again", then whatever was saved
  and is still before its close, plus anything curated by hand. When nothing saved is still open
  (D), the block alone, reading "Couldn't load what's on." It never shows an event whose close
  has passed, saved or not.
- No badge, dot or count on the tab, ever. New questions arrive silently, never appear in Needs
  you, and never send a push.

**Curation**, by hand for the hackathon, alongside the games the feed lists. Public events only.
Nothing involving minors, so no school or youth sport. No sponsored placement and no paid
ordering. Every question must resolve from a public result, with its edge case written into its
terms ("A tie counts as no."). Also out, added here beyond the brief: anything about injury,
health, or anyone's private life. All three kinds are allowed, and pick-one follows the
six-answer limit.

**Why a tab.** What's on has to be visible at all times, including to someone whose Now is full.
I weighed three homes:

- A permanent section on Now. At the top, it would push the rows only this person can move below
  things nobody is waiting on them for, which breaks the ordering Now exists for (4.7). At the
  bottom, an active person with a long Now never reaches it, which is the "only appears when
  nothing else is on screen" failure in a different place.
- The Start sheet. Public questions are a way of starting, so they fit the sheet's meaning, but
  only someone who has already decided to start something ever sees the sheet. That makes them
  findable but never visible.
- A tab. It is visible on every root, one tap away, and a real place to browse. The cost is one
  built component (the bar), plus an amendment to the rule that nothing else earns a tab. That
  rule's reason is that every market is reached from something that already mentions it. Public
  questions are the one thing nothing in the app mentions first, so the tab passes the test the
  rule was protecting. 6.2 records the exception as a sixth rule, with the test attached.

The tab is the second of four: Now, What's on, People, You. It sits beside the root, where the
eye starts, and leaves the two tabs about people together. Its icon is a ticket stub, drawn like
the other tab icons at a 1.8px stroke on a 24px grid. It is shell furniture, like the three
existing tab icons, so the closed set of eight structural icons does not change.

### 3.33 A public question's page, and asking your friends

`WhatsOnFlow`, four frames.

**The page.** A task screen in the question's ink; a template carries a curated mark, so its ink
comes from the table like any market's (1.8). Header: back and nothing else. The band: the 44px
stamp; on the right, the event's day and time in `label`; the question in `serif-l`; and, where
a market has its asker line, the ticket glyph at 16px with "From What's on · Titans at Giants"
in `caption` `--ink-2`. Then the details `dl` with the written terms (Counts if, Decided, the
edge case, Closes). A question a final score can answer says so in Decided ("By the final
score"), and that row is what its ballot later credits (3.35). One caption above the sheet:
"Only the people you ask see what anyone picks." Sheet: a chalk "Ask your friends". When a
market you are in already came from this question, its row sits between the band and the terms
("You're in this with the Friday crew", which opens it), and the chalk still asks a different
set of friends.

**Asking your friends** is the who's-in step (3.20), unchanged. The band shows the template's
question, with "From What's on" where "Edit" would be. Then the terms step: the written rows in
`--ink-2` and not tappable, the rows people set themselves (Stakes) as usual, and one caption,
"What's on wrote the wording, so everyone reads the same terms." Then "Send it". That creates an
ordinary market: its asker is whoever sent it ("You asked the Friday crew"), its close time is
the template's, its ink is balanced on the who's-in step like any other (1.8), and everything
after that already exists.

**Why the wording is locked.** Curated terms are written to resolve cleanly against a public
result, with the edge case settled in advance. An edited question is the likeliest route to a
void, and a void counts against the asker (3.34).

**Once it is running**, it looks like any other market, with one extra details row: "Question
from | What's on". There is no badge on the band, no link to other groups and no public result.
The moment someone picks a question, it belongs to them and their friends, and a badge would
make it look like a shared market. The link tiles are the kind's usual tiles, and nothing on
them says where the question came from.

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
- One caption under the plot, the total and how to read the dots: "40 yes-or-no calls since
  March. A bigger dot stands on more calls." A second caption counts pick one instead of
  plotting it: "Pick-one markets aren't plotted, because a pick says nothing about how sure. You
  called 5 of the 9 you were in."
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
  Expiry counts against nobody and is left out of both numbers. There is no floor, because this
  means something from the first question.
- The headline in `body` 600 puts the count first and never uses a percentage: "11 of the 12
  questions you asked ended cleanly." With one: "The one question you asked ended cleanly."
- The picture is one 16px state mark per counted question, in the order they ended: the resolved
  disc in `--ink` and the voided mark in `--ink-3` (3.23), wrapping.
- The caption names what went wrong, because a void is fixable next time by wording: "The group
  voided “Does Maya make the 7:40?” Two others expired, which counts against nobody." With more
  than one void, it names the most recent, "and 2 others".

**Nothing yet** (`YouEarly`, frame A): when nothing has resolved and nothing asked has ended,
the stats collapse into one card with one line: "Once some of your calls resolve, this is where
you see how they land, and how cleanly the questions you ask end." There is no empty chart and
no zeros (4.7: one line that names the empty case).

**Account**: one card of rows, each `body` 600 over a `caption`, with a chevron: "Your units"
("Beers, coffees, a next time, “dumpling run”"), "Your marks" ("The emoji you've used, most
recent first", with your stickers once you have any), "Your number" ("Used to sign in. Nobody
else sees it."), and "Sign out" with no caption, which asks once in a sheet (3.12, destructive).
Sign out is the one way to leave the product, and it lives only here (4.7). While the build is
still finding the cause of the installed app's bottom band, a tertiary "Measure the screen" sits
under the card; it leaves with the cause. After submission, an "Appearance" row joins the card
(8.1).

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
  ticket glyph, "From the final score"; the score as two `body` 600 rows, team and number, the
  losing side in `--ink-2`; and one caption, "Final, Sun 4:12pm. The terms said the final score
  decides." It has no clip, because nothing was filmed.
- **The sheet** is the ordinary voting sheet: the count line ("Nobody has said yet. Two of you
  and it settles."), a chalk that names the outcome in the voter's voice ("That's right, they
  won"), and "Not how I saw it", which works as it does anywhere.
- **Telling the two apart.** A question a final score can't answer, such as the first drive,
  never gets a source card. It waits for someone to say what happened, and the ballot opens on
  that person's claim card, with their avatar, "Maya says a field goal" and the clip if there is
  one. The ballot tells the two apart by who is speaking: a person, with a face, or the score
  the terms named, with none. A template is flagged as answerable by the score when it is
  written; nothing is inferred later.
- **Closed, waiting on the score.** The sheet reads "The final score will propose what
  happened." For two hours past the event's expected end, that is all; then a tertiary "Say it
  yourself" appears and opens the ordinary claim, in case the feed is late or has nothing.
- **Nobody votes.** The 24-hour arbitration backstop rules using the same result. The settled
  screen says so without making the app the judge: the outcome ("Yes. Giants 24, Titans 17."),
  then "Decided by the final score, as the terms said. Nobody voted within a day." Everything
  after that follows as usual: the call line or ruler, closest first, who's got who.

### 3.36 Multi-choice spreading (for the contract redeploy; do not build yet)

This section is for the contract redeploy. It is not part of the current build, and nothing in
it should be built before the redeploy ships. Its board, `SpreadRedeploy`, carries the same
warning.

- **One kind of market, chosen at entry.** Everyone picks one by default, exactly as in 3.30,
  and anyone who wants to can spread their answer instead. The asker doesn't decide for the
  group; the person who cares about nuance opts in. Under the answers sits one tertiary, "Spread
  it instead".
- **Spreading.** The sheet raises to "Spread it". Each answer is a row with its value in
  `numeral` 15 on the right and a bar underneath: a native `range` per row, step 1, a 44px hit
  area, a 20px chalk thumb and a fill in your hue. Values start at the even split (20% each with
  five answers; with a remainder, the first answers take the extra points, so 34, 33 and 33 for
  three). The total must be exactly 100, in whole numbers.
- **Where raising takes from: a share left to place.** Lowering an answer frees its share into a
  pill at the top right, "15% left to place", ringed in your hue, or "All 100% placed" when
  nothing is free. Raising takes only from what is left, and each bar stops at its ceiling,
  marked with a 2px tick at its value plus what is left. The primary is enabled only at nothing
  left, "I'm in with this spread, 2 beers"; otherwise it is disabled and reads "Place the last
  15%". Two tertiaries: "Start from 1% each" sets every answer to the floor and puts the rest in
  the pill (95% with five answers), for someone who would rather build up than trade down; "Back
  to one pick" returns to picking.
- **Why a pool rather than taking proportionally.** Taking proportionally from the rest keeps
  the total at 100 without a pool, but it moves numbers the person never touched. That is the
  reason pick one lost its implicit spread: the app deciding something the person never said.
  Taking from the largest answer, or from a neighbour, fails the same way. With a pool, every
  number on the screen is one the person set, or the even start they accepted, and it is still
  one hand and two drags: lower one, raise another.
- **The floor.** No answer goes below 1%. Multi-choice uses the logarithmic score, where a
  person's score depends only on what they gave the answer that happened. Its one hazard is that
  0% on the true answer is punished without limit, and the floor bounds the loss. A bar can't be
  dragged below 1%, and no value ever reads 0.
- **Where the stake sits.** A pick puts its whole stake on one bar (3.31). A spread puts stake ×
  share on every answer, drawn in your hue on each bar it touched, so the slivers return here,
  because here the person set them.
- **The entry line** reads "You spread it, most on John" over "John 60 · Nobody 25 · 5 each on
  the rest · 2 beers".
- **Settled.** Closest first, ranked by how much each person gave the answer that happened;
  under the logarithmic score that order is exactly the score. A spreader's row reads "spread
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
   to the claimant, then memories (3.8). With nothing added yet, the empty slot for someone who
   was in, and nothing for anyone else.
5. The call line at screen size (3.5), 32px pins, 14px under the frame or the strip.
6. "Closest first" (3.7), with at most one annotated row.
7. "Who's got who", grouped by owner: the owner's 28px avatar and "John's got" in `body` 600,
   then the people they owe as tokens under it. Then one `caption` naming who called it even
   ("Called it even: you and Priya, John and Gabe.").
8. The sheet (3.24): for someone who was in, the chalk "Add yours from Friday" ("Add a photo
   from Friday" while there are none) and the secondary "Send how it ended", with the whole
   result tile at the second height. For anyone else, "Send how it ended" alone.

**Number and pick one.** A number market's outcome is the sentence with the number ("14 shirts,
then a seam gave out."), its caption says who was closest ("Theo was closest, off by 2."), and
the ruler stands where the call line would. A pick-one market's outcome names the answer, its
caption names who called it, and "Everyone's pick" replaces the call line and closest first
(3.25). The frame, the sheet and who's got who are the same.

**Voided** (`SettledPhotos`, frame C): the voided mark and "Voided Sat at 1:05am" in the band;
the outcome line "Nobody could tell." with the caption "Nothing changes hands."; the frame or
the empty slot; the call line with every pin and no wash or cap. No closest first and no who's
got who. For someone who was in, the sheet is the chalk alone, "Add a photo from Friday": no
result tile tells a void, so there is nothing to send. Anyone else gets no sheet. A void by the
tiebreaker's finding says so in the caption: "The terms didn't decide it. Nothing changes
hands."

**Expired** (frame D): the expired mark and "Closed for good Sun at 9am"; the outcome line
"Never settled." with the caption "Nobody said what happened before it closed for good."; then
as voided.

**Someone who wasn't in** (frame B): the same screen with no add anywhere. The frame shows, the
empty slot never does, and the sheet is "Send how it ended".

**Adding** works the same from the chalk and from the empty slot: the phone's photos, the
library first, several at once, each landing as a placeholder at the end of the strip (3.8).
When the first lands, the slot becomes the frame and the chalk becomes "Add yours from Friday".

**The memory it leaves** (`Memory`). The same market opened once the day it ended is over (from
the second calendar day in the viewer's zone, the way "yesterday" is counted everywhere),
usually from a story in a timeline, often months later. It leads with what people come back for,
the photos, and drops the ranking. Top to bottom:

1. The header: back and More.
2. The question band, with the ending's mark and the date where the clock was ("Sat, Aug 22").
3. The frame at 260px, 12px under the band, then the strip. The claim's clip leads, credited.
   With nothing added: the empty slot for someone who was in, and nothing for anyone else.
4. The outcome line in `serif-l`, 18px under the strip, then one `body` line in `--ink-2`: the
   claim's line, then who was closest ("Caught a shoe on the way over and landed fine. Theo was
   closest, at 90%."). On a number market the second half is "Theo was closest, off by 2."; on
   pick one, "Theo called it."
5. The call line, ruler or pick-one rows, as on the settled screen.
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
8. The sheet, as on the settled screen, saying "from that night" once it is a week old.

Closest first leaves the memory screen: the call line already shows where everyone was, and
months later the ranking is not why anyone opened it. Sizes: 13, 15, 17 and serif 26.

**The claim card** (3.25; `Voting`, `PickOneResolve`, `FeedBallot`): the market's surface, a 1px
line, radius 12, 12px padding, 12px from the screen edges, a 12px gap between its two parts. On
the left the 72px clip, radius 10, with a 28px `--scrim` play plate on video (a photo or a
screenshot has none). On the right the claimant's 22px avatar and "Priya says he fell asleep" in
`body` 600, and under them in `caption` `--ink-3` the claim's line and when the clip was taken
("Out cold, 1h 12m in · shot 11:52pm"). With more than one attachment the clip carries a `+2`
chip; with none, the card is the avatar and the words alone. Tapping the clip opens it full
screen.

### 3.38 The rest of the screens, in text

Every screen that matters, in words, where its board drew more than its component sections say.
Components keep their own sections; this gives each screen its order and fixed copy, and notes
where a board is older than the text.

**Now** (`Now`, 4.7). The header is today's date in `label` `--ink-3`, the weekday spelled out
("Thursday, Sep 24"), 20px from the top, with nothing on the right. Needs you starts 16px under
it, then Running, then Just happened, each headed in `label` and each gone when empty. Only the
soonest row with a clock carries the citron dot, and the Now tab's dot hides while Now is on
screen, so one citron element is in view (4.5). The board draws three dots; the text wins.

**First run** (`FirstRun`): as 3.14 gives it, top to bottom, with Start hidden.

**The person view** (`Main`). Top to bottom: back and More; the identity row and the open header
(3.10); the cancel-out row when a unit runs both ways; the shared-context band (3.21), whose
helper line reads "Tap one to see only those."; "Coming up" in `label` `--ink-3` with any
upcoming cards (3.4); the today rule; the timeline by date, newest first, dates in `label`; a
44px tertiary "Show earlier"; and the rally last. The today rule is "Today" in `label` `--ink`,
a 1px `--ink` hairline filling the row, and the date in `caption` `--ink-3` ("Thu, Sep 24"). The
rally is its own `--surface` card: "The rally, lately" in `label`, the strip (3.11), its
sentence in `body-sm` `--ink-2` ("You've picked up a few more of these lately."), and one
`caption`, "Rounds, coffees and cabs nobody's paying back." A resolved market follows 3.4, with
its outcome in `serif-l` ("He did, 1h 12m in."), a `body-sm` line naming who was closest and
your number ("Priya was closest at 85%. You said 55%."), and the tertiary to the full table. The
board sets that outcome in `body` 600; the text wins.

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
people, or just send the link around". The sheet: "You can add anyone else right up until it
closes." and the chalk "Set the terms".

**Joining with a code** (`Join`, 3.16). "Got a code?" in `serif-l`, then one `body` `--ink-2`
line: "Someone read you one, or sent you a link." The six boxes, then one `caption`: "Six
characters. There's no O, I, Z, zero or one in any code." 28px under that, a row: "Got a link
instead?" in `body` 600 over the `caption` "Tap it in the chat, or paste it here.", with a 44px
row action "Paste a link" that reads the clipboard and opens that market's screen (3.17). A
clipboard with no market link on it gets the form-level block: "There's no market link on your
clipboard." Join is in the sheet. The board's helper leaves out Z; the text wins.

**Claiming what was waiting** (`Claim`). The screen a new person sees once, after signing up,
when things were logged under their name before they had an account.

- The header: the wordmark alone and no back, because nothing is behind it, the one exception to
  6.4's back control besides a signed-out link.
- Prints: photos from the waiting stories, 150px wide on a `--chalk` mount with 8px sides and a
  10px bottom, a 118px photo, the date in 13px 600 `--on-chalk`, radius 6, rotated −6°, 3° and
  8°, overlapping in a 200px band with the 1.5 shadow. At most three, the most recent on top;
  with fewer, fewer; with none, the band goes and the headline moves up.
- The headline in `serif-xl`: "You were already in 6 stories." Then one `body` `--ink-2` line:
  "Two weeks with the Friday crew, kept under your name, Maya. Say yes to what looks right and
  it's yours."
- One group per person, most items first: a 32px avatar, the name in `body` 600 and the count in
  `caption` `--ink-3`, then one `--surface` card of claim rows (4.8): a 13px 600 kicker ("Market
  · Sep 5", with the 20px stamp for a market), the subject in `body` 600, and one `body-sm` line
  with the token ("Priya's got you").
- Each row's control: a 44px target holding a 24px `--chalk` circle with an `--on-chalk` check,
  pressed by default, labelled "Confirm: Priya's got you". A tap unpresses it (a 24px ring in
  1.5px `--line-strong`), and an unpressed item stays unclaimed under the name it was logged
  with. The row itself opens nothing.
- The sheet: the chalk "Yep, all 6 are right", which counts the pressed rows ("Yep, these 5 are
  right"), and one `caption` under it: "Something off? Tap it to leave it out."
- Tokens here keep their hue border: every row is unconfirmed, so 3.2's dashed style would carry
  no information, and the check already shows the state.

**The market screen, before and after you're in** (`MarketDock`, `JoinLink`, `BlindSlow`). The
participant stack under the band is 28px avatars and one `caption`. Before you're in: "3 friends
are in. Where they landed shows once you are.", with a 20px lock glyph in `--ink-3` on the
right. After: "4 of you in". Blind: "4 of 6 in". From a link, signed out: "4 friends are in".
While the entering moment runs (3.13), the sheet's header reads "You're in at 70%" on the left
and the stake on the right. The asker line names a set as "Priya asked the Friday crew"; a set
whose name can't take "the", such as a possessive, reads "Theo asked · Papa's birthday"; an
unnamed set names its people ("Priya asked Gabe, John and you", three names and then "and 3
others"). A slow market's time series is headed "The group's number since Tuesday" in `label`,
with its days under it in `caption` ("Tue", "Thu", "now") and the current value in 13px 600 at
the right end.

**Voting** (`Voting`). Once voting opens, the entry line leaves and the claim card (3.37) sits
directly under the band; then "Where everyone landed" and the weight line; the sheet is 3.24's
voting row, whose chalk repeats the claim in the voter's voice.

**Closed, waiting** (`DockStates`). The wells are 56px on the market's ground with a 1px inset
`--line-strong` ring, in `body` 600 (pick one: 48px, two across, with 24px avatars), under one
caption: "Anyone who's in can say. Everyone else confirms it." The band's clock after close says
when it will be decided, in the Decided term's words ("Decided when the movie ends"), and
"Settled Sat at 12:14am" once settled.

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
step: the sheet is 3.37's, with "Add a photo from tonight" and "Send how it ended". The board
drew "That's fair" and "Push back" from before that; it is redrawn.

**Pick one** (`PickOneEntry`, `PickOneResolve`). Under "Add a person", the asker can add
themselves last, as "You". A blind market with no close time locks when everyone asked is in, or
when the asker locks it: its band reads "Locks when all 6 are in", the entry line's caption
"yours to change until it locks", and the sheet "Anyone you asked can get in until then." Who's
got who lists at most three rows owed to one person; the rest collapse into one `caption` naming
them ("Maya and Priya have got him too."), and the list ends "Everyone else called it even."
when anyone is square.

**Starting from a public question** (`WhatsOnFlow`, 3.33). The who's-in band keeps the page's
layout: the clock top right, and "From What's on · Titans at Giants" with the ticket glyph where
the asker line goes. On the terms step the asker line becomes the chosen set, as 22px avatars
and its name ("Friday crew"). The Stakes row is a full-width button showing the unit ("Beers")
with a chevron, and it opens a modal sheet with the units this person uses and a cap ("Up to 2
each").

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

**Where it goes.** In the "you're in" sheet (3.24), beside "Send it to the chat": a 56px square
secondary button, radius 10, 1px `--line-strong` border and no fill, the 24px camera glyph in
`--ink`, named "Take a photo". The chalk stays the chalk and nothing else in the sheet changes.
It sits under the thumb because this is an in-the-moment action, and because it only exists once
you're in, it never sits beside entering. It shows while the market is open and goes when it
locks: from lock until the market ends, anything attached is evidence, and it goes through
saying what happened.

**What it opens.** The camera itself (`capture="environment"` on the file input), not the
library: this window is for the photo being taken now. Photos already on the phone wait for the
end, when adding opens the library first. On an iPhone a photo taken this way is not saved to
the phone's own photos, so its full-screen view offers "Save to your phone" through the share
sheet, and the phone keeps the file until it is stored.

**Before it ends, only you see it.** Under the participant stack, once you have added one:
"Yours from tonight" in `label`, your photos as 60px squares (four, then `+N`), and one
`caption`, "Everyone sees these once it's over." A photo still going up is its square at 0.88
opacity with the 2px runner of 5.2 along its bottom edge; one that fails keeps its square with
the camera glyph, and a tap retries. Tapping a photo opens it full screen with "Remove" and
"Save to your phone". Nobody else sees any of it before the market ends: not on the open screen,
not on the locked or voting screens, and not in any notice. Three reasons. A strip of other
people's photos on the open screen would compete with entering for everyone not yet in. From
lock until the end, the screen is about what happened, and a photo from before lock sitting
beside the claim reads as evidence without having gone through the evidence path. And the frame
filling with the night's photos when it ends is the payoff (3.37).

**When it ends.** Settled, voided or expired, the photos join the frame after the claim's
attachment, in the order they were added and credited to whoever took them (3.8), for everyone
the market's rule lets see it: its participants and the group it was asked in. "Yours from
tonight" goes.

**Edges.** A photo started before lock lands as a memory even if it finishes after; the button
itself goes at lock. Taking a photo sends nobody anything. An argument locks the moment the
second person is in, so its open window is usually seconds, and the button follows the same
rule. Type: the section's words are 13, and nothing new joins the screen's sizes.

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
- Form carries state. Ring, half ring, bar, broken ring, disc, slash (3.23). A state that seems
  to need a new colour needs a new mark instead.
- Ink carries place. A market's ink says which market you are standing in and nothing more:
  never good or bad, never urgency, never an outcome. That is why the eight are matched in
  lightness and chroma, and why the group's number is drawn in `--ink` rather than the market's
  ink.

The one exception is `--live`, citron, meaning "waiting on you, with a clock". At most one
citron element in a viewport, never larger than a 6px dot or a 2px rule, and it disappears when
the thing is handled.

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

Numbers people put in are percentages: "You're in at 70%", "Priya called it at 90%", "said 85%".
Number markets use the plain number and the unit: "You're in at 17", "14 shirts".

Pick-one entries name the answer and nothing else: "You're in: John", "said Priya", "Theo called
it". Never "favourite", "leading" or "the group's pick". On What's on, counts of use are allowed
and are phrased as use ("Most asked", "Asked in 214 groups"). Nothing that states or implies a
belief about an outcome is ever allowed: no odds, prices, percentages, "most picked", or how any
group called it. A dissent without a number is "a note", never "a vote" (3.24). A ruling is
credited to the agreement, never to the app: "the tiebreaker everyone agreed to", on the settled
screen, in the details' "If it's unclear" row, on the arbitration sheet and on the result tile.

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

The root is called Now, and it routes rather than does. Creating things moved off it into the
Start button and its sheet (section 6), because a hub that also holds five ways to begin
something is what made it unreadable. Now holds three sections, in this order:

1. **Needs you.** Only things that will not move without this person: a vote, a market they have
   not entered, an obligation to confirm, a claim to accept, a draft they abandoned. This is the
   strip that makes the app worth opening, and it is the one place the no-nagging rule is under
   real pressure. What keeps it honest: every row is an action this person can finish now, the
   section disappears when it is empty, and nothing in it counts or ages. Inside it, anything
   with a clock outranks anything without one, and within each of those, soonest first. Only the
   soonest row with a clock carries the citron dot (3.15).
2. **Running.** Markets in flight that this person has already acted on, each with its state
   mark and no action button. It exists so that "I entered that, didn't I?" has an answer
   without a search.
3. **Just happened.** Resolved markets, closed obligations, covers that landed, each as one row:
   the 3.15 anatomy, with a 44px thumbnail when there is media and the outcome in the meta line
   ("He got carded · Maya called it"). Tapping a row opens the market's own screen (3.37) or the
   obligation's. Closed obligations order by when the close went through
   (`obligations.closed_at`) and read as settled or called even from the indexer, settled while
   it hasn't caught up; cancelling out appears in nobody's Just happened. This used to say
   stories keep their full anatomy here, which put a `serif-l` story question beside the
   `serif-m` questions above it, a second serif size on the one screen everyone opens (4.8). The
   `Now` board always drew rows.

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

Public questions are not on Now, except as the first-run starters (3.14). They have their own
tab (6.2, rule 6), and a permanent block on Now would push the rows only this person can move
below things nobody is waiting on them for.

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
| `JoinLink` | 13 · 17 · serif 26 | 3 |
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
| `LightScreens` (after submission) | the same sizes as `Now`, `OpenPhoto` frame 3 and `Leaderboard` | 3, 3 and 4 |
| `DockStates`, all seven | 13 · 17 · serif 26 | 3 |
| `PickOneMarket` | entering: 13 · 17 · serif 26; in: 13 · 15 · 17 · serif 26 | 3, then 4 |
| `PickOneEntry`, frames 1 to 5 | 13 · 17 · serif 26, plus 15 once the shares show (frame 4) | 3 or 4 |
| `PickOneResolve`, all four | 13 · 15 · 17 · serif 26 | 4 |
| `WhatsOn` | 13 · 15 · 17 · serif 17 | 4 |
| `WhatsOnFlow`, all four | 13 · 17 · serif 26 | 3 |
| `You` | 13 · 17 · serif 26 | 3 |
| `YouEarly` | 13 · 17 | 2 |
| `PickOneMarket`, `PickOneEntry`, `PickOneResolve` (redrawn) | 13 · 17 · serif 26, plus 15 once shares show | 3 or 4 |
| `WhatsOn` (redrawn), `WhatsOnStates` | 13 · 15 · 17 · serif 17 | 4 |
| `FeedBallot` | 13 · 17 · serif 26, plus 15 where shares or a caption line show | 3 or 4 |
| `SpreadRedeploy` (for the redeploy) | 13 · 15 · 17 · serif 26 | 4 |

The screens at the cap each read as one serif line, a subject line, a supporting line and
metadata, which is the shape the cap is meant to allow. On `WhatsOn` those four are the
questions in `serif-m`, the event names, the one intro line, and captions.

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

Keep, at the point of consequence:

- "What are the odds?" On the odds line.
- "The most you can be out is what you put on it." On the stake step, nowhere else.
- "You only settle with people who land closer than you, and only by the gap between your
  numbers." On the stake step.
- "Numbers show when everyone's in." Inside the blind lock chip.
- "Yours to change until it closes." Under your own entry line.
- "Nobody needs an account to look." On the who's-in step.
- "We text a code. No password, nothing to download." When joining from a link.
- The weight-line caption, but only when one stake is more than half the total.

Cut:

- Any sentence naming a state that the mark now carries (3.23).
- Scoring explained again on the settled screen, where the bars already show it.
- Captions that restate the picture directly above them.
- Instructions for gestures people find anyway.
- Anything repeated on a later screen in the same flow.
- The AI's suggested number, everywhere (3.22).

Everything the product needs to say about how it works, beyond the lines above, belongs in the
details sheet on the market, where someone can go looking for it.

---

## 5. Errors and waiting

### 5.1 Errors

There is no red in this product, so color cannot carry an error. Ink carries it instead, on four
channels: position, weight, a glyph, and the words.

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

### 5.3 Waiting, and the one place a skeleton is allowed

A tap keeps the screen it was made on. The control carries the wait; the screen does not
replace itself with a skeleton of itself. Two reasons beyond the aesthetic one: a route-level
streamed loading state made this app answer 404s with a 200, and a person reading a screen in
a bar who loses it loses their place.

Under 300ms: nothing beyond the press. A spinner that lives for 180ms reads as a glitch.

Skeletons are allowed in exactly one case: content loading into a screen that is already on
display, such as pagination, older events on a person view, or media opening inside a story.
Bars at 8px and 12px, hatched blocks for media, no shimmer, minimum 200ms so they cannot
flash. Navigations never get one, and route handlers keep returning real status codes.

### 5.4 What none of this is allowed to become

No red, no toasts that disappear before they are read, no modal error dialogs, no full-screen
error pages inside the app, no error codes in front of people, and no message that makes
someone feel audited for typing a code wrong in a dark room.

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
  Every market row carries its stamp on its ink's field colour.
- **What's on.** Public questions about things everyone is watching, to start with your own
  friends (3.32). The only destination holding things nothing in the app has pointed you to,
  which is the only reason it has a tab (6.2, rule 6).
- **People.** The list, and through it the person view, which is where the product's thesis
  lives. Two segments: People, and Standings (who has been fronting what). One tap from the
  root.
- **You.** Calibration, clean-resolution rate, your marks and stickers, your account, sign out.
  Everything about you rather than between you and somebody.
- **Start**, the button: a 56px chalk circle 16px above the bar on the right, on the four roots
  only, and hidden on an empty Now where "Ask something" does its job. It opens one sheet
  holding what a person can begin: ask something, settle an argument, log a cover, join with a
  code, and split a receipt once that flow exists. A row appears only when what it opens is
  built, because a row that leads nowhere is a broken control. Starting is not a place, so it
  never becomes a tab.

### 6.2 The routing rule, for anything built later

1. Creates an event → the Start sheet.
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
| Asking something | Start sheet → ask flow |
| Asking a pick-one question | The ask flow's question step, "Pick one" and the answers (3.29) |
| Browsing public questions | What's on tab (3.32) |
| Starting from a public question | What's on → the question's page → who's in → terms (3.33) |
| Picking a mark | The ask flow's question step, then the picker sheet (3.29); the same picker wherever a unit is made |
| Joining by link | Deep link → the market's own screen, the sheet holding the empty odds line (3.17) |
| Joining by code | Start sheet → join; plus the field on an empty Now |
| Putting your odds in | Market screen, the sheet (3.13, 3.26) |
| Picking an answer | Market screen, the sheet (3.30); spreading it only after the contract redeploy (3.36) |
| Confirming a public result | Market screen, voting state, the sheet, on the source card (3.35) |
| Voting | Market screen, voting state, the sheet |
| Saying what happened, with photos or screenshots | Market screen, closed state, a well in the sheet (3.24) |
| Changing your number | Change on the entry line, which reopens the line in the sheet |
| Confirming an obligation | Now, needs-you row; also in place on the person view |
| Settling or forgiving | Person view → the obligation row → sheet; a market's consequence from its story on the person view (3.4, 3.10) |
| Cancelling out what runs both ways | Person view, the row under the header (3.10) |
| Logging a cover | Start sheet → cover flow |
| Splitting a group cover | A step inside the cover flow |
| Person view and timeline | People tab; every avatar anywhere links to it |
| Claiming what was waiting | The claimant screen after signup, then Now's rows |
| Settling an argument | Start sheet → argument flow |
| Arbitration on a deadlock | Market screen, deadlocked state, the sheet |
| Receipt capture and split | Start sheet → its own flow, lands as covers |
| Credit card roulette | Inside the cover flow, as how the payer gets chosen |
| Capture standings | People tab, second segment |
| Plans | Person timeline above today; the next one surfaces on Now |
| Adding photos | While it is open, the "you're in" sheet's camera, for someone who is in (3.39); once it has ended, settled, voided or expired, the sheet's chalk or the empty slot (3.8, 3.37) |
| Making a sticker | The mark picker's "Your stickers" row, by paste (3.28, 3.29); from a market's photo, later |
| Sending how it ended | The settled sheet's secondary (3.24, 3.27) |
| Profile, calibration, clean resolution | You (3.34) |

### 6.4 Shell rules

- The tab bar renders on the four roots and nowhere else. A task screen hides it and puts its
  one move in the sheet, in the same place (3.24), which is what makes voting findable: the vote
  controls sit where the bar would be, under a one-line consequence ("Two more and it settles").
- Every non-root screen has a 48px back control at its top left, and back lands on the root it
  came from. The app is installed with no browser chrome, so this is the only way home. A market
  screen reached from a link while signed out shows the wordmark instead.
- A modal sheet (Start, settling an obligation, sending a vote) closes with a 48px close at its
  top right and by dragging its handle down; the drag is read from the handle row only, so the
  sheet's content still scrolls. A sheet never opens another sheet.
- The citron dot appears on the Now tab when something time-bound is waiting on this person. No
  number, ever. It clears when the last of those is handled.
- Nothing tapped more than once a session sits above the midpoint of the screen.

---

## 7. What we did not design, and how to derive it

Not drawn in this canvas: the People tab's list and its standings segment, the rest of You (the
unit editor and the marks list behind its account rows), the Start sheet itself, the rest of
market creation (the terms step; the question step and the who's-in step exist), "Make a
sticker" from a photo (3.28, waiting), argument creation, the people picker behind "Someone
else", the claim behind the two outcome wells (3.24 specifies it), the arbitration screen,
receipt capture and splitting, credit-card roulette, plans and RSVPs, search, the details sheet,
the pick-one asking and result tiles (3.27 specifies them), the light theme beyond its three
proving screens (section 8), and any desktop layout. Every one of them has an address in 6.3, so
a later phase has somewhere to put its screens without reopening the structure.

Drawn, but not to be built yet: multi-choice spreading (3.36, `SpreadRedeploy`), which waits for
the contract redeploy. So does a stake of nothing: boards that draw "Just pride" show the
redeploy (3.3). The light theme (section 8, `LightScreens`, `LightRules`) waits for after
submission.

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
7. **Pick components from section 3 only.** If you need a component that is not there, build it
   from the tokens in section 1 and give it the states in 3 that apply: empty, loading, error,
   too long, too many, and none-of-this-exists-yet.
8. **Check it against the three product rules** before you ship it: nothing nags, count comes
   before amount, and no screen says wallet, transaction, gas, signature, chain, or token. The
   word for a thing someone owes is a beer, a round, a next time, or a dollar amount.

If two of these rules conflict on a screen, the no-nagging rule wins, then direction encoding,
then density.

---

## 8. The light theme (for after submission; do not build yet)

Dark stays the only shipped theme until after submission. This section specifies light so it can
be built then, and it is not an inversion: v2 is dark-specific in ways that carry weight, and
each is decided here. Almost all of it is a second set of values for the same custom properties.
Four rules change how something is drawn: the citron's edge, person-hue strokes, the avatar's
edge and the grain tile. Boards, both marked for after submission: `LightScreens` (Now, a market
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
`data-theme` on `html`, so a cold start of the installed app never flashes the wrong theme.
`color-scheme` follows the theme, and `theme-color` has one value per scheme (`<meta
name="theme-color" media="(prefers-color-scheme: light)" content="#F5EFE4">`). On a market's own
screen the status band already paints that market's ground, in either theme.

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
four rules and nothing more. Nothing reads `data-theme` before submission.
