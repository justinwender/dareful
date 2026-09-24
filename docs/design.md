# Dareful design specification

The build reference for the Dareful client. Every value here is literal. Where a screen you need
is not in the canvas, the reasoning sections and the decision rules are what you build from, so
read those before improvising.

Canvas: the Design artifact "Dareful". Every board on it is now drawn in the current system, so
the canvas and this file agree; where they ever disagree, this file wins. Board names referenced
below match the artboards:

- System row: `Tokens`, `System2` (state, copy and the style budget), `Language`, `Marks`,
  `WeightSpec` (the odds line and the weight line), `Errors`, `Nav`.
- Screens row, in flow order: `Now`, `FirstRun`, `Main` (person view), `Story`, `Ask`,
  `JoinLink`, `Join`, `Claim`, `MarketDock` (the interactive market screen), `BlindSlow`,
  `Voting`, `Split`, `Leaderboard` (settled), `Memory`.
- `DockStates` (the sheet through a market's life), the link tiles (`TileAsk`, `TileAskRange`,
  `TilePhoto`, `TileCalled`, `TileInChat`), and the ink boards (`Inks`, `InkCompare`).

Target: mobile web, installable as a PWA, 390px reference width. Tailwind plus shadcn/ui. Dark
is the default and only shipped theme for v1; light values are given so nothing has to be
re-derived later.

### What changed in this revision

If you built against the previous version of this file, these are the changes that touch code:

1. Entry is an odds line, in percentages. The ten tiles, the "in 10" readout and the separate
   fine-tune slider are gone. One slider, 0 to 100 percent, with the market's mark riding the
   thumb (3.13). Every "7 in 10" in the product is now "70%".
2. The market screen's action lives in a sheet pinned to the bottom (3.24). It has a grabber and
   two heights when there is more to show, and it changes with the market's state. The tab bar's
   old "pinned action" is this sheet.
3. Every market has an ink: one of eight muted colour families derived from its mark (1.8,
   3.25). It tints the market's own screen and appears as the stamp behind the mark everywhere
   else.
4. The AI's suggested number ("a number to argue with", "Start at 6") is removed from every
   screen.
5. Number markets have no range unless the asker set one (3.26). The axis comes from what people
   entered.
6. Link previews are two tiles only: the asking tile and the result tile (3.27). The "who's in"
   and "everyone's in" tiles are retired, because previews freeze on the sender's phone.
7. Stickers are a new kind of mark: a cutout with transparency and a cream die-cut edge (1.7,
   3.28).
8. `serif-m` is 17/22, down from 20/26. One serif size per screen; `numeral-hero` may join it
   (1.2).
9. No drop shadow on the sheet or anywhere else except the claimant's prints (1.5). Focus is a
   2px ink outline (5.1). The pending line on chalk is `#121110` on a 25% track (5.2).
10. Retired boards: `Entry`, `States`, `AfterEntry`, `Home`, `Empty`, the three share cards,
    `TileOpen`, `TileLocked`.

---

## 1. Tokens

### 1.1 Color

Root is 16px. All colors are opaque hex unless an alpha form is given.

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
| `--live` | `#E4E34A` | `#8A7A00` | Citron. Only a 6px dot or a 2px rule, only for "needs you, with a clock" |
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
| `numeral-hero` | Young Serif 400 tabular | 60 | 3.75 | 60px | A number people care about: a numeric answer, the number-entry field |
| `numeral` | Hanken 600 tabular | 20 / 15 | 1.25 / 0.9375 | 24px / 20px | Figures in chips, rows and tables; the riding percent on the odds line (at 700) |
| `body` | Hanken 400, 600 | 17 | 1.0625 | 24px / 22px | Running prose at 400, the subject of a row at 600 |
| `body-sm` | Hanken 400 | 15 | 0.9375 | 20px | Supporting lines, token sentences |
| `label` | Hanken 600 | 13 | 0.8125 | 16px | Section labels and kickers |
| `caption` | Hanken 400 | 13 | 0.8125 | 18px | Metadata, clocks, helper text |

The cap: a screen may use at most four of these nine, a card at most three, and one serif size.
The same serif token may appear twice (a screen's question and its outcome are both `serif-l`).
`numeral-hero` is a number rather than a sentence, so it may sit beside that one serif size.
Counting is mechanical, so it can be a lint rule: if a screen's markup references five,
something on it is decoration. Button labels belong to the button component (3.12) and do not
count.

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

Border conventions: solid 1px `--line` is a normal boundary. Dashed 1px `--line-strong` means
the thing has not happened yet (an upcoming plan, an unset mark, "nothing changes hands", the
naming prompt). Never use dashed for errors.

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
| Large, the picker | 64px | 16px | 34px | The market's `field` |

A picture mark fills the stamp, cropped square, served at 256px. A sticker is fit to 80% of the
stamp with its transparency kept, and carries a cream (`#F2EDE3`) die-cut edge: 2px at 40px and
up, 1.5px at 28px, none at 20px. Render the edge into the asset (dilate the alpha mask, fill it
cream, composite under) rather than chaining CSS drop-shadows, so the app and the tile renderer
draw it the same way. No mark renders nothing in app surfaces; the dashed empty stamp exists
only in the picker.

A market's mark also decides its ink (1.8), and it rides the odds line (3.13).

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
2. Otherwise the mark's dominant hue, from a table computed once for every emoji and at upload
   for pictures and stickers. Pixels under chroma 0.04 are ignored, and for a sticker only
   pixels with alpha over 0.5 count. The hue snaps to the nearest of the eight and the mark's
   own lightness and chroma are thrown away. Reds fold into Rose, greens into Olive.
3. Hueless marks fall through to a hash of the market id: fewer than a quarter of pixels carry
   colour, or the colour is a template rather than a choice (the yellow smiley family,
   default-yellow hands).
4. Balance last: among markets open between the same people, no two share an ink while fewer
   than eight are open. A collision moves the newcomer to the nearest free neighbour. This is
   what stops beer turning every Friday market Ochre.

Arguments get an ink the same way, which usually means a hash, because most arguments have no
mark.

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
words, rule, dollars.

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
transparent background, `--ink-2` text at 13px 500, radius 999. Selected state for a stake or
filter chip: background `--ink`, text `--ground`, border `--ink`. Disabled: text `--ink-3`,
border `--line`, no fill, `aria-disabled`.

### 3.4 Event card

One card per event in a timeline. Background `--surface`, border 1px `--line`, radius 12.

Anatomy: kicker row (a 20px mark stamp for a market, otherwise the 16px structural icon, plus
13px 600 label, context chip right), subject line (`body` 600 for a cover, `serif-l` for a
market or argument question), supporting line (`body-sm`, `--ink-2`), optional media, then a
divider and the consequence rows.

Kinds and states:

- **Covered**: subject line, amount line, one consequence token. Optional 84px thumbnail.
- **Covered, off the tab** (nobody is paying it back): no consequence row, the line "Nobody's
  paying it back," and it feeds the rally instead.
- **Argument, clean**: question, ruling sentence, one consequence.
- **Argument, split**: question, the 60/40 bar, the ruling sentence, and either a consequence or
  "Nothing changes hands. It goes on the rally."
- **Market, resolved**: question, media frame if there is media, outcome line, call line or
  ruler, consequences between the two people in view, then a link to the full table.
- **Market, open**: question, participant stack with "4 of 6 in", the close time. The action
  lives on the market's screen, never on the card.
- **Upcoming**: 1px dashed `--line-strong` border, no fill, calendar icon, and at most one soft
  line tying an open obligation to the plan.
- **Voided**: subject line, "Nobody could tell, so it's void," no consequences, no toll, and no
  explanation of who failed to resolve it.
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

For number markets the same component becomes a ruler: its ends are the lowest and highest
numbers entered (or the asker's bounds, if they set any), labelled with the values and the unit,
and the answer is a 4px cream tick at its position.

### 3.6 Roll call

Grid of participants ordered by closeness, 5 columns, 4px gap, each cell 10px vertical padding,
`--surface-2`, radius 10: avatar 28, name 13px 600, number `numeral` 20, "off N" caption.

States: **fewer than 5** (cells keep their width, grid left-aligns); **6 to 10** (wrap to a
second row); **more than 10** (first 10 then a "Show all" text button); **your cell** (the
selection ring); **tie** (identical "off" values share a position, prefix both with `=`);
**didn't enter** (not in the roll call at all).

### 3.7 Leaderboard row

Grid `22px minmax(0,1fr)`, 12px column gap, 8px row gap, 10px by 12px padding, radius 10.
Heading above the list: "Closest first".

Rank in `numeral` 20 `--ink-3`. Avatar 36. Name `body` 600, "said 85%" caption under it. "off by
15" right, `numeral` 15 `--ink-2`. Under that, the gap bar: 4px track (the market's field), the
person's segment from their value to the outcome end at `rgba(hue,0.40)`, a 14px dot in their
hue at their value, a 3px cream tick at the outcome end, and a 1px `--line-strong` tick at 50%.

States: **you** (background the market's surface plus the selection ring); **annotated** (one
13px `--ink-2` line under the bar, used when a result is counterintuitive, at most one per
screen: "Only 20%, and still closer than Gabe and John."); **tie** (same rank number, `=`
prefix, order alphabetically); **long name** (truncate at one line); **nine rows** (8px vertical
padding, nothing else changes).

### 3.8 Media frame

Full card width, no radius when it is edge to edge inside a card, radius 12 when it is inset on
a screen (12px from the edges). Heights: 180 in a timeline, 240 in an opened story, 260 on the
memory screen, 200 on the settled screen, full-bleed on a result tile.

Always: a credit chip bottom left (`--scrim`, 28px tall, avatar 20 plus name, plus duration for
video) and a counter bottom right (`1 / 7`, `--scrim`, tabular).

States: **photo**; **video** (56px `--scrim-play` circle with the play glyph, duration in the
credit chip, plays inline muted on tap, never autoplays with sound, never loops in a timeline);
**multiple** (the strip below: 60px squares, radius 10, 6px gap, video items carry a small play
glyph, overflow becomes a `+N` tile); **loading** (the hatched placeholder, no spinner before
300ms, then a 1.2s opacity pulse between 1 and 0.75); **failed** (hatched placeholder, camera
glyph, "Couldn't load," 44px "Try again"); **none** (the frame is not rendered at all).

The hatched placeholder on a market's own screen uses its field and surface:
`repeating-linear-gradient(135deg, field 0 10px, surface 10px 20px)`.

### 3.9 Mark stamp

Sizes, radii and backgrounds in 1.7. States: **emoji** (rendered as text at the glyph size,
never as an image); **picture** (256px square derivative, `object-fit: cover`); **sticker**
(512px source with alpha, 256px derivative with the die-cut edge baked in, `object-fit: contain`
at 80%); **none** (nothing renders in app surfaces; layout closes up); **broken image** (falls
back to none, silently); **in the picker** (the dashed empty stamp is the "no mark" option and
is the default selection).

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
primary button, which carries the whole entry: "I'm in at 70%, 2 beers". A no-stake entry reads
"I'm in at 70%, just pride".

States: **untouched** (the legend, no thumb, the primary disabled and reading "Slide to pick
your odds"); **touched** (thumb, rider, fill; the first touch raises the sheet); **changing**
(reached from Change on the entry line: the sheet opens raised at your current value, a
secondary "Never mind" sits beside the primary, which reads "Save: 60%, 2 beers", and the weight
line above updates live as you drag); **locked** (the market closed: the line is gone from the
sheet; your entry line reads "Locked at 10:40pm"); **failed to send** (the sheet stays raised
with a 15px line "Your number didn't send" and a tertiary "Try again"; the number is never
silently dropped).

**Entering, as a moment.** Confirming lowers the sheet over 320ms, which carries the stake row
away. Then every segment grows from 6px to its column height over 700ms, your share of your
column fills in your hue, your avatar rises to sit above your column, and the group's marker
draws last. At about 1.8s the sheet becomes the next state's ("Send it to the chat") and the
screen gains the entry line, "You're in at 70%", with the full weight line under it. No toast,
no navigation. With `prefers-reduced-motion`, the resting state renders at once. The growth is
the reveal as well as the receipt: other people's weight is never visible before you are in.

### 3.14 Empty and first-run states

- **Now, before anything** (`FirstRun`): today's date as a label, the `serif-xl` headline
  "Nothing happens here until somebody else is in it.", one `body` line, the chalk "Ask
  something", the compact code field (3.16), and three starters as 40px-stamp rows in `body`
  600. The Start button is hidden on this screen, because "Ask something" is already the chalk.
- **A person with no shared history**: identity block, "Nothing between you two yet," and a
  single starter.
- **A story with no media**: nothing. No frame, no prompt in the timeline. The "add" control
  lives on the opened story only.
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
`caption` `--ink-3` that starts with the citron dot when there is a clock, then the state mark,
then the clock or the reason ("Voting ends at midnight", "From the tunnel argument"). Right: a
44px row-action button whose label is the verb: Vote, Enter, Yep, Finish.

Running and Just happened use the same row without the button; Just happened may carry a 44px
media thumbnail on the right.

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
Change gone, the entry line reads "Locked at 10:40pm", nothing greyed); **settled** (replaced by
the call line and closest first); **number market** (below); **nine or more entries**
(unchanged).

**Number markets.** Ten slices of an axis that runs from the lowest number entered to the
highest, ends labelled with the real extremes and the unit ("12", "26", "40 people"). If the
asker set bounds, the bounds are the axis. The marker's chip shows a plain number ("22").

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

Words beside a mark: only a clock, and only when the state has one ("Voting ends at midnight",
"Closes tonight", "Locked, resolving tonight"). Any other sentence about state is what the mark
is replacing. Every mark carries an `aria-label` with the state name, because a screen reader
cannot see a dashed ring.

### 3.24 The sheet

Every market screen, and every task screen, keeps its one move in a sheet pinned to the bottom,
where the tab bar sits on a root. It never scrolls away. The content behind it scrolls, with
bottom padding equal to the sheet's resting height plus 20px so nothing is trapped underneath.

Anatomy: the current place's surface (the market's on a market screen), a 1px line along the
top, 12px top corners, no shadow, padding 16px sides and 24px bottom, 10px between rows. When it
has a second height it also carries a grabber: 36 by 5px, radius 3, `--line-strong`, centred 8px
from the top, and the header row under the grabber doubles as the drag handle.

Two heights, only when there is more to show. Low holds the move; high adds what the move needs.
A swipe up or a touch on the move raises it; a swipe down lowers it so the market behind can be
read. Snap on release by direction: more than 24px up raises, more than 24px down lowers,
anything less stays. Tapping the grabber toggles. A sheet with nothing more to show has no
grabber and does not move.

Where it rests says whose move it is, and it never goes empty while the market runs:

| State | Whose move | Resting | Raised |
| --- | --- | --- | --- |
| Open, not in | Yours | "What are the odds?" and the empty line (or the empty number field) | Stake and "I'm in at 70%, 2 beers" |
| Open, you're in | Nobody's | "Send it to the chat" under "Anyone with the link can get in until 10:40pm." | No second height |
| Closed, not yet known | Whoever saw it | "When it's clear, say what happened." and the outcomes as two equal wells ("He fell asleep", "He stayed up"); either opens the claim | No second height |
| Voting, not said | Yours, with a clock | The count line ("3 of 6 have said yes. Two more and it settles."), chalk agree, secondary "Not how I saw it" | Who has said what; the clip full width |
| Voting, said | Theirs | One line: your avatar, "You said he was out", the count, Change | No second height |
| Split | The arbiter's, or yours with proof | "Add what you saw" and the arbitration deadline | What each side said |
| Settled | Nobody's | A thumbnail of the result tile, one caption, "Send how it ended" | The whole result tile, as the chat will get it |
| Voided or expired | Nobody's | No sheet. The story is the whole screen. | |

Once the result has been sent, or once you leave the settled screen, the sheet is gone and the
market is a story.

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
while voting (the claimant's avatar and "Priya says he fell asleep", a 72px clip, "Out cold, 1h
12m in" and when it was shot), the weight line or the call line, the participant stack with its
count, and the details `dl` (96px labels, `body` values, the market's surface and line). The
details carry: Counts if, Decided, Stakes, If it's unclear. Everything else the product needs to
say about how it works goes behind More.

The settled screen adds, above the call line: the outcome in `serif-l` ("He did."), a caption
("Out cold, 1h 12m in."), the media frame at 200px and a tertiary "Add yours from Friday". Under
the call line: closest first (3.7) and who's got who, grouped by owner.

### 3.26 Number entry

The entry control for a number market, in the same sheet. Header: "What's your number?" in
`body` 600. Then a row of a 48px stepper (minus), an 84px field and a 48px stepper (plus). The
field: the market's ground, a 1.5px inset ring in your hue, the number in `numeral-hero` with
the unit beside it in `body` `--ink-2`, baseline-aligned. Tapping the field opens the numeric
keypad; the steppers move by one. One caption: "Any whole number. Tap it to type." Then the
stake chips and "I'm in at 17 shirts, $5".

No range unless the asker set one. Telling people to pick inside a range nobody chose puts an
answer in their mouths, and the ends of that range become everyone's anchor. When the asker did
bound it ("between 1 and 10 rounds"), the field clamps to the bounds, the caption says them, and
the weight line's axis is the bounds.

The answer, when it lands, is a `numeral-hero` numeral on the story ("14 shirts, then a seam
gave out.") with the ruler (3.5) under it.

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

**The result tile** (`TilePhoto`, `TileCalled`), sent only when someone chooses "Send how it
ended" from the settled sheet. With a photo: the photo full-bleed, the mark stamp top left of
the safe square, and a bottom band on `rgba(<ground>, 0.9)` with the outcome in serif at 76px
("He did.") and who called it with their avatar ("Priya called it. Out cold, 1h 12m in.").
Without one: the market's field, the mark and the outcome on one line, the call line with 52px
pins where the person who called it wears an extra cream ring, the No and Yes labels, and "John
called it at 10%." at 34px 600.

Rendering: server-side (Satori or equivalent) with Noto Color Emoji loaded for emoji marks and
the 256px derivative reachable for picture marks and stickers. Both fail silently when
forgotten.

### 3.28 Making a sticker

A sticker is a picture mark with transparency, so it goes through the same stamp, the same
storage and the same ink rule. The loop worth building toward: when a market settles with a
photo, the settled screen offers "Make a sticker", and John asleep on the couch becomes the mark
on the next market about John. Only people who could see the photo can see a sticker made from
it.

Three ways in, cheapest first:

1. **Paste a cutout.** iOS 16 and later let people lift a subject out of a photo and copy it.
   The mark picker accepts a paste (the clipboard `paste` event), keeps the alpha channel, trims
   the transparent edges, pads to square and scales. No model involved; realistic for the
   hackathon.
2. **Tap-to-cut in the app.** MediaPipe's Interactive Segmenter runs in the browser: an image
   plus the point the person tapped returns a per-pixel confidence mask. Threshold near 0.5,
   feather the edge 1 to 2px, apply it as alpha, crop to the bounding box and pad square. All on
   the phone.
3. **Automatic background removal.** IMG.LY's in-browser remover works but is AGPL-3.0, which is
   a problem for a closed-source app unless their commercial licence is bought.

Storage: the 512px source with alpha, plus a 256px derivative with the die-cut edge baked in
(1.7). Schema: `mark_kind` gains `'sticker'` beside `'emoji'` and `'image'`, and every mark row
stores its derived `ink` so balance (1.8) can be checked without re-reading pixels.

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
4. Is the media the evidence that resolved the question (the clip of the fence, John asleep)?
   Frame, and it sits above the outcome line rather than below it.
5. Nothing to show? Render nothing. An empty frame is worse than no frame.

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

"Odds" is allowed in exactly one place: the question the app asks you, "What are the odds?", on
the odds line and on the asking tile. It is never a label on anything the app shows back, so
never implied odds, and never "the odds" for the group's number. Also never: price, "the market
says", pot, house, buy, sell, shares, position size or liquidity. The picture can look like
finance; the language has to keep saying it is six friends guessing.

Numbers people put in are percentages: "You're in at 70%", "Priya called it at 90%", "said 85%".
Number markets use the plain number and the unit: "You're in at 17", "14 shirts".

Sentence case everywhere. Contractions. Second person for the viewer, first names for everyone
else. Numbers never open a sentence in the interface. Times are relative for the last week
inside the app ("Sat, Sep 12" after that) and always absolute on a link tile. No exclamation
marks in system copy. The app never thanks the user for settling something and never
congratulates anyone for winning.

### 4.7 Now, and why it is event-first

Now is the root screen, it has no back control, and every other screen has a 48px back
control in its top left. The app is installed to a home screen with no browser chrome, so
nothing may depend on a browser back button.

The root is called Now, and it routes rather than does. Creating things moved off it into the
Start button and its sheet (section 6), because a hub that also holds five ways to begin
something is what made it unreadable. Now holds three sections, in this order:

1. **Needs you.** Only things that will not move without this person: a vote, a market they
   have not entered, an obligation to confirm, a claim to accept, a draft they abandoned.
   This is the strip that makes the app worth opening, and it is the one place the no-nagging
   rule is under real pressure. What keeps it honest: every row is an action this person can
   finish now, the section disappears when it is empty, and nothing in it counts or ages.
   Inside it, anything with a clock outranks anything without one, and within each of those,
   soonest first. The rows with clocks carry the citron dot; the rest do not.
2. **Running.** Markets in flight that this person has already acted on, each with its state
   mark and no action button. It exists so that "I entered that, didn't I?" has an answer
   without a search.
3. **Just happened.** Resolved markets, closed obligations, covers that landed. Stories keep
   their story anatomy here (4.4); this is what the group did, not a notification list.

People is a tab rather than a section, because the person view is where the thesis lives and
it should be one tap from the root rather than a scroll and a tap. Where a list of people does
appear, people with something open get a row each and everyone who is square collapses into a
single row with an avatar stack and one sentence, because four rows that each say "nothing
open" is four repetitions of nothing.

What is deliberately not on home: a group list, and account actions. A group is a namespace,
not a place. It forms lazily out of whoever was in a market, it earns a name only if the same
set asks a second question, and it does its work in exactly two screens, the same-people
picker (3.20) and the shared-context band on a person view (3.21). Listing groups on home was
what made an occasion group permanent in the interface, and it is what forced leaving and
archiving to exist as features. Take the list away and a group that is over simply stops being
mentioned, with nothing to leave and nothing to archive. Account actions, sign out included,
live behind the avatar in the header, because the primary screen of a social product should
not end in a way to leave it.

Placing something new on home: if it is an action only this person can take, it goes in Needs
you. If it is something the group did, it goes in Just happened. If it is a way to reach
someone, it goes in People. If it is organisational, or about the account, or about a group as
an object, it does not go on home at all.

Two rules generalise out of this and apply everywhere:

- Never repeat an empty phrase down a list. One row saying nothing is information; four rows
  saying nothing is noise. Collapse the empty cases into a single line that names them.
- The root carries no way to leave the product. Account actions, sign out included, live
  behind You.

### 4.8 The style budget

Two counts, both mechanical enough to lint:

- At most four of the nine type tokens on a screen, at most three in a card, and one serif size
  (4.1).
- At most one chalk-filled control and at most one citron element in a viewport. On a root, the
  Start button is the chalk.

If a screen exceeds either, the fix is not a smaller size or a dimmer grey. Something on the
screen is doing a second job and belongs on the screen that does that job.

A third count, softer, for review rather than lint: a screen that carries more than two
sentences of explanation is explaining a mechanism at the wrong moment (4.9).

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

---

## 6. The shell: three destinations and one button

Nineteen features, present and planned, collapse into three destinations and one action,
because most of that list is a way of starting something rather than a place to be. A hub
offers a few clearly distinct destinations; each destination does one job and has one obvious
action.

### 6.1 The destinations

- **Now.** What is live and what is waiting on this person. The root, the back-stop for every
  other screen, and the only screen that carries the citron dot. Contents and ordering: 4.7.
  Every market row carries its stamp on its ink's field colour.
- **People.** The list, and through it the person view, which is where the product's thesis
  lives. Two segments: People, and Standings (who has been fronting what). One tap from the
  root.
- **You.** Calibration, clean-resolution rate, your marks and stickers, your account, sign out.
  Everything about you rather than between you and somebody.
- **Start**, the button: a 56px chalk circle 16px above the bar on the right, on the three roots
  only, and hidden on an empty Now where "Ask something" does its job. It opens one sheet
  holding the five things a person can begin: ask something, settle an argument, log a cover,
  split a receipt, join with a code. Starting is not a place, so it never becomes a tab.

### 6.2 The routing rule, for anything built later

1. Creates an event → the Start sheet.
2. Acts on one market → that market's screen, as the move in its sheet for that state (3.24).
3. Acts on one relationship → that person's view.
4. Is about you alone → You.
5. Is about who has been fronting what → People, standings segment.

Nothing else earns a tab. A fourth tab means one of the five was not applied. Markets are
deliberately not a destination: a market is always reached from something that already mentions
it, and a markets tab would be a feed of everything anyone ever asked, competing with the person
view for the same attention. Groups are not a destination for the reasons in 4.7.

### 6.3 Where each feature lives

| Feature | Home |
| --- | --- |
| Asking something | Start sheet → ask flow |
| Joining by link | Deep link → the market's own screen, the sheet holding the empty odds line (3.17) |
| Joining by code | Start sheet → join; plus the field on an empty Now |
| Putting your odds in | Market screen, the sheet (3.13, 3.26) |
| Voting | Market screen, voting state, the sheet |
| Changing your number | Change on the entry line, which reopens the line in the sheet |
| Confirming an obligation | Now, needs-you row; also in place on the person view |
| Settling or forgiving | Person view → the obligation row → sheet |
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
| Adding photos, making a sticker | The market's own screen, once settled |
| Sending how it ended | The settled sheet, once (3.24, 3.27) |
| Profile and calibration | You |

### 6.4 Shell rules

- The tab bar renders on the three roots and nowhere else. A task screen hides it and puts its
  one move in the sheet, in the same place (3.24), which is what makes voting findable: the vote
  controls sit where the bar would be, under a one-line consequence ("Two more and it settles").
- Every non-root screen has a 48px back control at its top left, and back lands on the root it
  came from. The app is installed with no browser chrome, so this is the only way home. A market
  screen reached from a link while signed out shows the wordmark instead.
- A modal sheet (Start, settling an obligation) closes with a 48px close at its top right and by
  dragging down. A sheet never opens another sheet.
- The citron dot appears on the Now tab when something time-bound is waiting on this person. No
  number, ever. It clears when the last of those is handled.
- Nothing tapped more than once a session sits above the midpoint of the screen.

---

## 7. What we did not design, and how to derive it

Not drawn in this canvas: the People tab's list and its standings segment, the You tab, the
Start sheet itself, the rest of market creation (the question step with the mark picker and
"Make a sticker", and the terms step; only the who's-in step exists), argument creation, the
people picker behind "Someone else", the claim flow behind the two outcome wells, the
arbitration screen, receipt capture and splitting, credit-card roulette, plans and RSVPs,
search, the details sheet, the light theme in situ, and any desktop layout. Every one of them
has an address in 6.3, so a later phase has somewhere to put its screens without reopening the
structure.

Group management has come off this list rather than moving up it. Leaving, archiving, renaming
and the group view do not exist, because a group is not a navigable object: there is no place to
leave and nothing to archive, and a set of people that stops asking questions simply stops being
mentioned. If a future requirement looks like it needs a group screen, check it against 4.7
first. It is almost always a person view, a filter, or the picker.

To build one of them without waiting for a design pass:

1. **Find its nearest relative in the canvas.** The terms step of market creation is the market
   screen before anyone is in: the question band in the chosen mark's ink, the details `dl` with
   its labels made editable, the stake chips, and the sheet with a chalk "Send it". The mark
   picker is the 64px stamp grid (1.7) with the dashed empty stamp selected by default and a
   paste target for stickers (3.28). The claim flow behind the outcome wells is the claim card
   (3.25) being filled in: the outcome already chosen, a camera row, and "Say it happened" in
   the sheet. There is no group view to derive: a group is the picker, the chips, and the person
   views of the people in it (4.7).
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
