# Dareful design specification

The build reference for the Dareful client. Every value here is literal. Where a screen you
need is not in the canvas, the reasoning sections and the decision rules are what you build
from, so read those before improvising.

Canvas: the Design artifact "Dareful". Board names referenced below match the artboards there:
`Main`, `Story`, `Entry`, `States`, `Leaderboard`, `Split`, `Memory`, `Claim`, `Home`, `Join`,
`JoinLink`, `FirstRun`, `Ask`, `AfterEntry`, `BlindSlow`, `Empty`, the three share cards, and
the five spec boards (`Tokens`, `Language`, `Marks`, `Errors`, `WeightSpec`).

Target: mobile web, installable as a PWA, 390px reference width. Tailwind plus shadcn/ui.
Dark is the default and only shipped theme for v1; light values are given so nothing has to be
re-derived later.

---

## 1. Tokens

### 1.1 Color

Root is 16px. All colors are opaque hex unless an alpha form is given.

| Token | Dark | Light | Used for |
| --- | --- | --- | --- |
| `--ground` | `#17140F` | `#F7F1E6` | App background, the only full-bleed surface |
| `--surface` | `#211D17` | `#FFFBF4` | Cards, sheets, list containers |
| `--surface-2` | `#2B261F` | `#EFE6D6` | Tokens, tiles, chips, bar tracks |
| `--line` | `#3A3329` | `#DDD1BD` | 1px borders and dividers |
| `--line-strong` | `#4A4236` | `#C9B99E` | Dashed borders, tick marks, secondary outlines |
| `--ink` | `#F5EDE0` | `#1E1A14` | Primary text |
| `--ink-2` | `#C7BBA8` | `#564B3D` | Secondary text |
| `--ink-3` | `#9D9181` | `#6E6254` | Captions, metadata, the 13px floor |
| `--marigold` | `#F4B73E` | `#F0AD2E` | What happened, today, primary action |
| `--on-marigold` | `#1D1608` | `#1D1608` | Text and glyphs on marigold |
| `--scrim` | `rgba(23,20,15,0.78)` | `rgba(23,20,15,0.78)` | Chips sitting on media |
| `--scrim-play` | `rgba(23,20,15,0.70)` | `rgba(23,20,15,0.70)` | Play button plate on media |

Person hues. Assigned per person at account creation, stable across every group. Avatar
initials are always `#17140F`, in both themes.

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
- Marigold wash on the yes half of a call line: `rgba(244,183,62,0.24)`, and `0.26` on share
  cards (larger surface, same perceived weight).

There is no red token and no green token. Hues between 345° and 25° and between 75° and 165°
are unused on purpose, so nothing in the product can read as loss or gain. `destructive` in
shadcn maps to `--ink` with a confirmation step, not to a color.

shadcn mapping:

```
--background: var(--ground)        --card / --popover: var(--surface)
--muted / --secondary / --accent: var(--surface-2)
--border / --input: var(--line)    --foreground: var(--ink)
--muted-foreground: var(--ink-3)   --primary / --ring: var(--marigold)
--primary-foreground: var(--on-marigold)
--destructive: var(--ink)
```

### 1.2 Type

Two families, loaded from Google Fonts with `display=swap`:

```
Young Serif       400 only          fallback: Georgia, 'Times New Roman', serif
Hanken Grotesk    400 500 600 700   fallback: 'Helvetica Neue', Helvetica, sans-serif
```

Numerals that sit in a column, a table, a bar or a readout use
`font-variant-numeric: tabular-nums`.

| Token | Family / weight | px | rem | line-height | Where |
| --- | --- | --- | --- | --- | --- |
| `display-xl` | Young Serif 400 | 40 | 2.5 | 44px | Claimant headline, empty-state headline |
| `display` | Young Serif 400 | 32 | 2 | 36px | Person name, empty-state h1 (32/38 when 3 lines) |
| `question-lg` | Young Serif 400 | 30 | 1.875 | 36px | Market entry h1 |
| `question` | Young Serif 400 | 26 | 1.625 | 32px | Opened story, leaderboard, memory, split ruling |
| `card-question` | Young Serif 400 | 22 | 1.375 | 28px | Market card inside a timeline |
| `card-question-sm` | Young Serif 400 | 20 | 1.25 | 26px | Argument card inside a timeline, ruling line |
| `outcome` | Young Serif 400 | 44 | 2.75 | 48px | "He did." on the resolution screen, marigold |
| `outcome-sm` | Young Serif 400 | 34 | 2.125 | 38px | Outcome on the memory screen, marigold |
| `numeral-hero` | Young Serif 400 tabular | 60 | 3.75 | 60px | Entry readout ("7"), story answer ("14") |
| `numeral` | Hanken 600 tabular | 20 | 1.25 | 24px | Roll-call numbers, rank figures |
| `numeral-sm` | Hanken 600 tabular | 15 | 0.9375 | 20px | "off by 45", "$40", counters |
| `body-strong` | Hanken 600 | 17 | 1.0625 | 22px | The subject line of a row |
| `body` | Hanken 400 | 17 | 1.0625 | 24px | Running prose |
| `body-sm` | Hanken 400 | 15 | 0.9375 | 20px | Supporting lines, token sentences |
| `body-sm-prose` | Hanken 400 | 15 | 0.9375 | 22px | Two-line-plus secondary paragraphs |
| `label` | Hanken 600 | 13 | 0.8125 | 16px | Eyebrows, section labels, kickers |
| `caption` | Hanken 400 | 13 | 0.8125 | 18px | Metadata, helper text |

13px is the floor. Nothing in the product is smaller, including legal and timestamps.

Uppercase with `letter-spacing: 0.04em` to `0.06em` appears only on spec-sheet eyebrows and
the two in-app section labels on the split-ruling screen ("THE CALL", "WHAT IT MOVES"). Do not
introduce uppercase elsewhere; a 13px 600 sentence-case label is the in-app default.

Never bold inside a sentence. Weight distinguishes a line's role, not a word inside a line.

### 1.3 Spacing

4px base. Named steps, all used literally:

```
space-1  4px      space-2  8px      space-3  12px     space-4  16px
space-5  20px     space-6  24px     space-7  28px     space-8  32px
space-10 40px     space-14 56px
```

Fixed applications:

- Screen gutter: 20px left and right, every screen.
- Card padding: 14px vertical, 16px horizontal. Cards that contain a media frame use 0 padding
  and pad their text blocks instead, so the frame goes edge to edge.
- Gap between cards in a timeline: 12px. Gap between a date header and its card: 12px, with
  8px extra top padding on the header itself.
- Gap between labelled sections on a screen: 28px.
- Gap between lines inside a card: 6px to 10px; 8px is the default.
- Bottom action area: 16px top, 20px sides, 24px bottom.
- Media frame to the text under it: 12px. Media strip under a frame: 6px gap, 60px squares.

### 1.4 Radii

```
6px    mark stamp at 20px
8px    mark stamp at 28px
10px   media thumbnail at 60px
12px   mark stamp at 44px, media thumbnail 64-84px, entry tile, icon plate
14px   chip button, inner card, small action
16px   mark stamp at 64px, button, media frame, list row
18px   card
20px   spec panel, share-card media
24px   large spec panel
999px  token, chip, avatar, bar track, pill
```

### 1.5 Elevation and borders

No shadows for elevation. Depth is surface steps plus 1px `--line`. Three sanctioned uses of
`box-shadow`:

1. Avatar ring where pins or stacks overlap: `0 0 0 2px <the surface behind it>` at 24px,
   `0 0 0 3px` at 32px, `0 0 0 4px` at 44px and above.
2. Selection ring: `inset 0 0 0 1px rgba(<person hue>, 0.5)`.
3. The claimant screen's photo prints: `0 10px 24px rgba(0,0,0,0.45)`, because they are meant
   to read as physical objects. Nothing else in the app uses a drop shadow.

Border conventions: solid 1px `--line` is a normal boundary. Dashed 1px `--line-strong` means
the thing has not happened yet (an upcoming plan, an unset mark, "nothing changes hands").
Never use dashed for errors.

### 1.6 Targets and motion

- Minimum hit target 48px. Primary action 56px. Inline secondary action 44px.
- An icon-only control may be drawn at 28px, but its tappable box is 44px via padding.
- Taps: 120ms ease-out on opacity and background. Sheets and screen transitions: 200ms
  ease-out. Media opens at 240ms.
- No parallax, no confetti, no celebratory animation on a resolution. The leaderboard is not a
  win screen.
- Respect `prefers-reduced-motion`: drop the transitions, keep the state changes.

### 1.7 Marks

A mark is user-supplied: an emoji, or a square picture. It always sits in a stamp:

| Context | Stamp | Radius | Glyph size |
| --- | --- | --- | --- |
| Inside a token | 20px | 6px | 14px |
| In a list row | 28px | 8px | 16px |
| In a screen header | 44px | 12px | 24px |
| On an entry tile | 64px | 16px | 34px |

Stamp background `--surface` with a 1px `--line` border when it sits on `--ground`; no border
when it sits inside a token. A picture mark fills the stamp, cropped square, served at 256px.
No mark renders nothing at all in app surfaces. The dashed empty stamp exists only in the
picker.

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
loaded in the server-side share-card renderer, and turn a list into a sticker sheet in bad
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
up with what a group invents, the creator of a market or a unit may attach a mark (2.1 of
section 1.7). It rides in front of the words and never replaces them: the words are what the
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

Circle, person hue fill, `#17140F` initial, Hanken 700. Sizes in use: 20, 22, 24, 26, 28, 32,
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

One card per event in a timeline. Background `--surface`, border 1px `--line`, radius 18.

Anatomy: kicker row (structural icon 16px plus 13px 600 label, group chip right), subject line
(`body-strong` for a cover, `card-question`/`card-question-sm` serif for a market or
argument), supporting line (`body-sm`, `--ink-2`), optional media, then a divider and the
consequence rows.

Kinds and states:

- **Covered**: subject line, amount line, one consequence token. Optional 84px thumbnail.
- **Covered, off the tab** (nobody is paying it back): no consequence row, the line "Nobody's
  paying it back," and it feeds the rally instead.
- **Argument, clean**: question, ruling sentence, one consequence.
- **Argument, split**: question, the 60/40 bar, the ruling sentence, and either a consequence
  or "Nothing changes hands. It goes on the rally."
- **Market, resolved**: question, media frame if there is media, outcome line, call line or
  ruler, consequences between the two people in view, then a link to the full table.
- **Market, open**: question, participant stack with "4 of 6 in," the covered strip with the
  lock chip, a close time, and the primary action.
- **Market, everyone in**: question, call line with every pin and no outcome cap, "Everyone's
  in, and numbers are locked."
- **Upcoming**: 1px dashed `--line-strong` border, no fill, calendar icon, and at most one
  soft line tying an open obligation to the plan.
- **Voided**: subject line, "Nobody could tell, so it's void," no consequences, no toll, and
  no explanation of who failed to resolve it.
- **Loading**: only when the card is loading into a screen that is already on display (5.3);
  the card shape with 8px and 12px `--line`/`--line-strong` bars in place of text, hatched
  block in place of media, no shimmer, minimum 200ms on screen to avoid a flash. A navigation
  never renders this.
- **Error**: the card shape with one `body-sm` line, "Couldn't load this one," and a 44px
  "Try again" text button. Never a red state.

### 3.5 Call line (binary markets)

Horizontal axis from No (0) to Yes (100). Track 6px in a card, 8px on a full screen, radius
999, `--surface-2`. Midpoint divider: 1px `--line-strong`, 16px tall in a card, 24px on a
screen. Labels under: "Said no" left, "even" centered, the outcome or "Yes" right.

Pins: avatars at 24px in a card, 32px on a screen, 44px on a share card, centered on the track
with a ring in the surface behind. Positioned at `calc(<value>% - <half pin>)`, with the
container inset 12px so pins at 0 and 100 stay inside the card.

States:

- **Hidden** (people are still entering): the track becomes a 10px dashed strip
  (`repeating-linear-gradient(90deg, #2B261F 0 10px, #241F19 10px 20px)`) with a centered chip
  carrying the lock icon and "Numbers show when everyone's in." No pins, no average, no count
  of who is ahead.
- **Everyone in, unresolved**: full pins, no wash, no cap, 2px `--line-strong` end ticks,
  labels "No / even / Yes."
- **Resolved**: the true half takes the `rgba(244,183,62,0.24)` wash and the true end takes a
  solid marigold cap (4px wide in a card, 6px on a screen), label becomes "Yes, he did" or
  "No, he didn't" in marigold 600.
- **Collisions**: pins overlap like an avatar stack in entry order. Beyond six participants,
  cluster pins within 6% of each other into a single stacked avatar showing the first two plus
  `+N`, and put the full list in the roll call.
- **Nine participants**: cluster as above; the line never grows a second row.
- **Everyone identical**: one cluster at that value reading `9`, and the outcome cap still
  renders.

For numeric markets the same component takes the stated range as its ends, labels them with
the range values and the unit, and marks the answer with the marigold tick at its position
rather than at an end.

### 3.6 Roll call

Grid of participants ordered by closeness, 5 columns, each cell 10px vertical padding,
`--surface-2`, radius 12: avatar 28, name 13px 600, number `numeral`, "off N" caption.

States: **fewer than 5** (cells keep their width, grid left-aligns); **6 to 10** (wrap to a
second row); **more than 10** (first 10 then a "Show all" text button); **your cell** (the
selection ring); **tie** (identical "off" values share a position, prefix both with `=`);
**didn't enter** (not in the roll call at all; they belong in the participants list, not the
results).

### 3.7 Leaderboard row

Grid `22px minmax(0,1fr)`, 12px column gap, 10px by 12px padding, radius 16.

Rank numeral in Young Serif 22/36 `--ink-3`. Avatar 36. Name `body-strong`, "said 85%" caption
under it. "off by 15" right, `numeral-sm`. Under that, the gap bar: 4px track `--surface-2`,
the person's segment from their value to the outcome end at `rgba(hue,0.40)`, a 14px dot in
their hue at their value, a 3px marigold tick at the outcome end, and a 1px `--line-strong`
tick at 50%.

States: **you** (background `--surface` plus the selection ring); **annotated** (one 13px
`--ink-2` line under the bar, used when a result is counterintuitive, at most one per screen);
**tie** (same rank number, `=` prefix, order alphabetically); **long name** (truncate with an
ellipsis at one line, full name in the detail sheet, never wrap the row); **nine rows** (the
row shrinks to 8px vertical padding and the bar to 12px tall; nothing else changes).

### 3.8 Media frame

Full card width, no radius when it is edge to edge inside a card, radius 16 when it is inset
on a screen. Heights: 180 in a timeline, 240 in an opened story, 260 on the memory screen, 200
on the resolution screen, 280 on a share card.

Always: a credit chip bottom left (`--scrim`, 28px tall, avatar 20 plus name, plus duration
for video) and a counter bottom right (`1 / 7`, `--scrim`, tabular).

States: **photo**; **video** (56px `--scrim-play` circle with the play glyph, duration in the
credit chip, plays inline muted on tap, never autoplays with sound, never loops in a
timeline); **multiple** (the strip below: 60px squares, radius 10, 6px gap, video items carry
a small play glyph, overflow becomes a `+N` tile in `--surface-2`); **loading** (the hatched
placeholder, no spinner before 300ms, then a 1.2s opacity pulse between 1 and 0.75);
**failed** (hatched placeholder, camera glyph, "Couldn't load," 44px "Try again"); **none**
(the frame is not rendered at all: no empty box, no placeholder, no "add a photo" prompt in
the timeline, because a market with nothing to show is a normal market).

### 3.9 Mark stamp

Sizes and radii in 1.7. States: **emoji** (rendered as text at the glyph size, never as an
image); **picture** (256px square derivative, `object-fit: cover`); **none** (nothing renders
in app surfaces; layout closes up); **broken image** (falls back to none, silently); **in the
picker** (the dashed empty stamp is the "no mark" option and is the default selection).

### 3.10 Person-view header

Two columns, grid `repeat(2, minmax(0,1fr))`, 14px padding, radius 18, 1px `--line` border,
divider on the right column's left edge.

States: **both sides** (caption plus token each side); **one side only** (that side keeps its
half, the empty half shows its caption and, under it, "nothing" in `--ink-3` 15px, so the
layout does not jump when it fills); **neither** (the header is replaced by a single 15px
`--ink-2` line, "Nothing open between you," and the timeline starts immediately); **many
units** (the token wraps to a second token under the first on the same side, dollars always in
the last token); **large counts** (numerals, never repeated glyphs beyond three).

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
| Primary | 56 | 16 | `--marigold` | `--on-marigold`, 17px 700 |
| Primary inline | 44 | 14 | `--marigold` | `--on-marigold`, 15px 700 |
| Secondary | 48 | 16 | transparent, 1px `--line` | `--ink-2` or `--ink`, 15px 600 |
| Tertiary | 44 | 0 | none | `--ink-2`, 15px 600 |
| Icon only | 48 | 999 | transparent | `--ink`, glyph 22-24px, `aria-label` required |

States: **pressed** (opacity 0.88, 120ms); **disabled** (`--ink-3` text, 1px `--line` border,
no fill, no opacity trick); **pending** (5.2); **destructive** (secondary styling, `--ink`
text, and a confirmation sheet; no red).

At most one primary button per viewport.

### 3.13 Probability entry

Ten tiles, grid `repeat(5, minmax(0,1fr))`, 8px gap, 56px tall, radius 12, 1px
`--line-strong`, background `--surface`. Fill is a left-anchored `--person-lilac` bar whose
width is the tile's share of the current value, so a value of 65 fills six tiles and 50% of
the seventh.

Tile content: the market's mark at 22px when one is set, at full opacity on a filled tile and
0.4 on an unfilled one; when no mark is set, the tile's numeral in `numeral-sm`, `#1D1608` on
fill and `--ink-3` off it.

Under the tiles: a native `range` input, `accent-color: #B9A5F3`, 44px tall, step 1, labelled
"Fine-tune," with "Not once" and "Every time" at the ends.

Readout above: optional "about" when the value is not a multiple of ten, `numeral-hero` count,
"in 10" at 26px serif `--ink-2`, and on the right the word band plus the percent in
`caption`. Bands: 0 "Not a chance"; 1-15 "Doubt it"; 16-40 "Probably not"; 41-59 "Coin flip";
60-84 "Probably"; 85-99 "Almost surely"; 100 "Every single time".

States: **0** (no tiles filled, readout reads 0); **100** (all filled); **locked** (after
everyone is in: tiles at 0.6 opacity, slider disabled, caption "Numbers are locked");
**suggested value not yet used** (the suggestion card with its own 44px "Start at N" button);
**average hidden** (the lock row: three stacked avatars, "3 friends are in. Their average
shows once you pick."); **average shown** (same row, the average as a `numeral-sm` and a ghost
pin on the tiles at that position).

### 3.14 Empty and first-run states

- **No groups, nothing on the timeline**: today's marker, a dotted spine, the headline, and
  three starters (ask, settle an argument, log a cover), primary styling on the first only.
- **A person with no shared history**: identity block, "Nothing between you two yet," and a
  single starter.
- **A story with no media**: nothing. No frame, no prompt in the timeline. The "add" control
  lives on the opened story only.
- **A claimant with nothing waiting**: the signup lands on the empty state above, not on an
  empty inbox.
- **A market with no other participants yet**: "You're first in" plus the share control, never
  a count of zero.
- **Offline**: a 28px `--surface-2` bar under the header, "Offline. You can still look
  around." Entries queue and send on reconnect.
- **A number that failed to send**: the entry screen stays, with a 15px line, "Your number
  didn't send," and a "Try again" tertiary button. The number is never silently dropped.

### 3.15 Needs-you row

One `--surface` card, radius 18, rows divided by 1px `--line`. Each row is a grid of
`minmax(0,1fr) auto` with 12px gap and 14px by 16px padding. The left column is a 13px
`--ink-3` context line saying why it needs this person and when it closes, then the subject:
Young Serif 17/22 when the subject is a question, `body-strong` otherwise, plus a token row
when the item is an obligation. The right column is a 44px secondary button whose label is the
verb: Vote, Enter, Yep, Finish.

Ordering: soonest deadline first, then longest waiting, then whatever is fastest to finish.

States: **empty** (the section and its heading are removed entirely, not shown empty);
**one item**; **more than four** (show four, then a 44px "2 more" tertiary row); **resolved
elsewhere while on screen** (the row collapses over 200ms, no toast, no "done" confirmation);
**abandoned draft** (same shape, context line "You started this and never sent it", verb
"Finish"); **acted on** (row collapses, the action's result shows up in Just happened).

Never: a count badge on the heading, a number in an app icon, a red dot, or a row that reports
how long something has been waiting in days.

### 3.16 Code input

Two forms of the same thing.

**Compact** (home, first run): a 48px text input, radius 14, 1px `--line`, `--surface` fill,
17px with `letter-spacing: 0.08em` and `text-transform: uppercase`, placeholder a real-shaped
code (`K7QMD3`), and a 48px secondary Join button beside it. Never `type="number"`.

**Focused** (the joining screen): six boxes of 48 by 60, radius 12, 1px `--line`, 24px 600
tabular, 8px gap. The active box takes a 2px `--marigold` border. Typing advances, backspace
retreats, and pasting six characters fills all six at once.

Alphabet: A-Z and 2-9 minus O, I and Z, which leaves 31 unambiguous characters. Input is
case-insensitive and always displays uppercase, because the common case is one person reading
it off another person's screen in a dark room.

States: **empty**; **partially filled** (submit disabled); **full** (submit enabled);
**invalid shape** (5.1, at the field); **unknown or expired code** (form-level message, the
typed characters are kept); **already a member** (no error at all: go straight in).

### 3.17 Invite preview

The card someone sees before they commit to anything. `--surface`, radius 18, 16px padding:
an inviter row (32px avatar, "Priya invited you", group chip right), the market's 44px mark
stamp beside the question in `question`, a participant stack with a plain-language count
("Four friends are in"), then a divider and two 15px facts: when it decides, and how it works.

It shows no amounts. No stakes, no dollar figures, no leaderboard, no obligations, and no
names beyond the inviter. What someone sees before joining is what it is and who asked, never
what it could cost.

States: **market invite**; **group invite** (the question becomes the group name in `display`
and the facts become what the group has going); **expired** ("This one's finished," plus a
link to the result if the market is visible to that group); **revoked or malformed token** (no
card: the joining screen with a form-level message).

### 3.18 Person row

56px minimum height, 12px gap, 36px avatar, name in `body-strong`, and the person's open
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

One row per candidate set, in a `role="group"` labelled "Who's in". Grid
`auto minmax(0,1fr) auto`, 12px gap, 12px by 14px padding, radius 18, 1px `--line`. Left: an
avatar stack at 32px with `-10px` overlap, three maximum, then a `+N` tile in `--surface-2`.
Middle: the label in `body-strong` and a caption in 13px `--ink-3`. Right: a 24px selection
circle, filled `--ink` with a `--ground` check when selected, 1.5px `--line-strong` outline
when not. Selected rows also take the `--surface` fill and the lilac selection ring.

The label rule is the important part. A named set shows its name; an unnamed set shows first
names, up to three, then "and you". Both use the same weight, the same size and the same row,
so an unnamed set reads as a description of some people rather than as a group missing its
name. The caption carries the difference: "Last time, on Friday" against "Six of you, back in
August". Nothing anywhere says "unnamed", "untitled" or "no name".

Order: most recent set first, then by how often that set has asked something. The most recent
set is preselected, because the common case is the same people as last time and it should cost
one tap in total.

States: **preselected top row**; **named set**; **unnamed set**; **a set that has now asked
twice** (the naming prompt, below); **someone else** (a dashed row with a plus in a dashed
circle and a chevron, opening the people picker); **first ever market** (no rows at all: the
picker is replaced by the people picker itself, with a line about sending the link).

**The naming prompt.** When the selected set is asking its second question, a dashed
`--surface` block appears directly under that row: one sentence ("Second time with these four.
Want to call them something?"), a 48px text input whose placeholder is a plausible name, a
48px Save, and a 44px "Not now". It appears once per set, never blocks the flow, and never
returns after it is dismissed twice. A name is a convenience for chips and share cards, not a
requirement, and nothing is created by naming.

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

The market screen after you have entered. It is the entry control (3.13) in its second state,
not a second component: the same ten buckets, re-laid from a 5 by 2 grid of 56px tiles into a
single row of ten columns, 120px tall, 3px apart, 8px radius, `--surface` track on `--ground`.

- Column fill is `--ink-3`, height normalised so the heaviest bucket fills the column.
- Your own share of your bucket is drawn in your person hue at the bottom of that column, with
  your 24px avatar 30px above it and your numeral below it in `--ink` 600.
- The group's number is a 2px `--ink` vertical marker at the stake-weighted mean, with its
  value in a 22px chip at the top. It is never marigold: marigold means what happened, and
  this has not happened.
- Under the columns, the numerals 1 to 10 at 13px `--ink-3`, then the range ends, then one
  caption in 13px `--ink-3` explaining the picture in words.

Arithmetic: `bucket(v) = ceil(v / 10)`; `height(b) = stake(b) / max stake in any bucket`;
`group's number = Σ(vᵢ × sᵢ) / Σsᵢ`, displayed to the nearest whole tenth with the exact figure
on the details sheet. A market's stake unit is fixed at creation, because dollars and beers
cannot be weighed against each other. A no-stake entry is a person, not weight: an 8px hollow
dot on the baseline of its bucket.

States: **one entry** (your column alone at full height, no marker; the marker appears from
the third entry); **one stake over half the total** (the caption says so in words, because the
picture alone reads as agreement); **everyone on one number** (one full column, marker on it);
**blind until lock** (outlined columns with no heights, your own bucket marked with your
avatar and a 5px cap, a centred lock chip, a count of who is in, and no group's number);
**locked** (unchanged picture, the Change control gone, a line reading "Locked at 11pm",
nothing greyed); **resolved** (the weight line is replaced by the call line and the
leaderboard); **numeric market** (ten slices of the stated range, ends labelled with the
range); **nine or more entries** (unchanged, because weight does not grow with headcount).

**Entering, as a moment.** Submitting does not navigate and does not raise a toast. The grid
merges into the row over 200ms, your cumulative fill collapses into your single column over
240ms, everyone else's weight rises from the baseline over 320ms staggered 30ms apart, and the
marker draws last. Under 800ms in total, and with `prefers-reduced-motion` the resting state
renders directly. The confirmation is not the animation but what it leaves behind: a permanent
line at the top of the screen reading "You're in at 7 in 10", with the stake and "yours to
change until it closes" under it, which is still there on the next visit.

**What leaves the screen.** The AI anchor is gone once you are in. It existed to be argued
with while choosing, and three numbers on one screen (the anchor, your number, the group's
number) is one too many. It reappears only inside the Change flow, and it stays available in
the details sheet.

**The way back in.** Positions are editable until lock and never after. The route back is a
44px tertiary Change on the confirmation line, never a primary button, because the screen's
primary action once you are in is getting other people in.

**A time series, for slow markets only.** A market open more than 24 hours with at least four
entries gets a 56px sparkline of the group's number over time under the weight line, labelled
with the day it opened and carrying the current value at its right end. It plots the aggregate
only, never individual entries, because plotting entries would out people's timing. A market
that ran for ten minutes has no shape worth drawing and gets no line.

---

## 4. Rules that generalize

### 4.1 When each type weight is used

- Young Serif carries three things and nothing else: a question, an outcome, and a single
  number people care about. If a new screen has none of those, it has no serif on it.
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
an argument was settled cleanly. It gets `body-strong`, one supporting line, and at most one
token.

A story is an event with a question, several people's inputs, and a result. It gets the serif
question, the participants' numbers as a call line or ruler, an outcome line, and its
consequences grouped underneath as one block. A market that produced eight obligations is one
story with eight consequences, never eight rows.

The test, in order: does it have a question? Did more than two people put something in? Is
there media? Two yeses make it a story. One makes it a row with a link to the full thing.

### 4.5 Color discipline

- Marigold marks what is real: what happened, today, and the one action to take. At most one
  marigold element in a viewport. An aggregate that has not resolved is not real yet, so the
  group's number takes an ink marker rather than a marigold one. A marigold outcome and a marigold button never appear
  together; the button wins and the outcome takes `--ink`.
- Person hues identify people. They never indicate status, quality, or direction of value.
- Everything else is the three ink levels on the three surfaces. If a new state seems to need
  a new color, it needs a sentence instead.

### 4.6 Copy rules

The aggregate of everyone's numbers is called the group's number, and the words around it stay
inside one boundary: nothing here has a price at any moment, nothing is bought or sold, no pot
is held and nobody makes a market. Say the group's number, where the stake sits, your number,
what's riding on it, who's in. Never say implied odds, odds, price, "the market says", pot,
house, buy, sell, shares, position size or liquidity. The picture can look like finance; the
language has to keep saying it is six friends guessing.

Sentence case everywhere. Contractions. Second person for the viewer, first names for
everyone else. Numbers never open a sentence in the interface. Times are relative for the last
week ("Sat, Sep 12" after that). No exclamation marks in system copy. The app never thanks the
user for settling something and never congratulates anyone for winning.

### 4.7 Home, and why it is event-first

Home is the root screen, it has no back control, and every other screen has a 48px back
control in its top left. The app is installed to a home screen with no browser chrome, so
nothing may depend on a browser back button.

Home holds three things: markets, people, and what needs this person. Groups are not on it at
all. The hierarchy is fixed, and the reasoning matters more than the order, because you will
have to place new things into it:

1. **Ask something.** The only marigold control on the screen. Creating a market is the act
   the product exists for, and everything else on home is downstream of somebody having done
   it.
2. **Join.** A code field and a button, directly under the primary action, not marigold
   because two primary buttons is none. It sits this high because a person who cannot join
   from inside the app has to leave the app to do it, which is how the product loses people
   who are already signed in.
3. **I got this one.** A tertiary text button under the join row. Logging a cover creates an
   event too, so it belongs with the other two, but it records something that already
   happened while asking starts something, and the screen has to say which of those is the
   headline. Three tiers, three weights: marigold fill, outlined, text.
4. **Needs you.** Only things that will not move without this person: a resolution to vote on,
   a market they have not entered, an obligation to confirm, a claim to accept, a draft they
   abandoned. This is the strip that makes the app worth opening, and it is the one place the
   no-nagging rule is under real pressure. The discipline that keeps it honest: every row is
   an action this person can complete now, the section disappears when it is empty, and
   nothing in it counts or ages.
5. **Just happened.** Resolved markets, closed obligations, covers that landed. Stories keep
   their story anatomy here (4.4); this is what the group did, not a notification list.
6. **People.** The person view is where the product's thesis lives, so home keeps a short path
   into it. People with something open get a row each. Everyone who is square collapses into a
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
- The primary screen carries the two actions the product is for and nothing that leaves it.

---

## 5. Errors and waiting

### 5.1 Errors

There is no red in this product, so color cannot carry an error and the build's marigold
version cannot stand either: marigold already means what happened, today, and the next tap,
and a marigold error competes with the button at the moment a person most needs to find it.
Ink carries errors instead, on four channels: position, weight, a glyph, and the words.

**A field error.** The field's border goes from 1px `--line` to 1.5px `--ink`. Under it, a row
with the 16px alert glyph and the message in `--ink` at 15/20. The field's label does not
change color. Focus rings stay 2px `--marigold`, which is what keeps focus and error
distinguishable.

**A form error.** Every field error repeats once in a summary block directly above the submit
button: `--surface-2` fill, 1px `--line-strong`, radius 14, 12px by 14px padding, the alert
glyph and the message in `--ink` at 15/20, problems listed in the order the fields appear. A
server or network failure uses the same block with a 44px "Try again" inside it. It is never a
toast, and it never blames the person.

**Timing.** Validate on submit, then on blur for any field already marked. Never on keystroke.
A failed submit keeps everything typed and moves focus to the first field with a problem.

**Wiring.** `aria-invalid` on the field, `aria-describedby` pointing at its message,
`role="alert"` on the summary block so it is announced once when it appears.

**Voice.** Say what is wrong and what to do: "Codes are six characters. This one is five." Not
"Invalid input", not an apology, not an error code. "No market with that code. Worth checking
the last two characters." "This one closed at 11pm, so you can watch but not enter." "Your
number didn't send. Tap to try again."

### 5.2 Buttons that are working

A tap dims the control to 0.88 for 120ms. If the action has not finished in 300ms the control
enters **pending**: the label stays exactly where it was, the control holds its size, opacity
stays at 0.88, and a 2px indeterminate line runs along its bottom edge on a 1.2s loop. On a
marigold button the track is `rgba(29,22,8,0.25)` and the runner is `--on-marigold`; on a
secondary button the track is `--surface-2` and the runner is `--marigold`. The control is
`aria-busy` and not interactive; every other control on the screen stays live, so a slow
action can still be abandoned.

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

## 6. What we did not design, and how to derive it

Not drawn in this canvas: the rest of market creation (the question step and the terms step;
only the who's-in step exists), argument creation, the people picker behind "Someone else",
the account sheet behind the avatar, receipt scanning and splitting, capture standings,
credit-card roulette, plans and RSVPs, notification inbox, search, the light theme in situ,
and any desktop layout.

Group management has come off this list rather than moving up it. Leaving, archiving, renaming
and the group view do not exist, because a group is not a navigable object: there is no place
to leave and nothing to archive, and a set of people that stops asking questions simply stops
being mentioned. If a future requirement looks like it needs a group screen, check it against
4.7 first. It is almost always a person view, a filter, or the picker.

To build one of them without waiting for a design pass:

1. **Find its nearest relative in the canvas.** The terms step of market creation is the entry
   screen run backwards: terms as a `dl` with 104px labels, the same stake chips, the same
   primary button, plus the mark picker from 3.9, and it follows the who's-in step that is
   already drawn. There is no group view to derive: a group is the picker, the chips, and the
   person views of the people in it (4.7).
2. **Classify every event it shows** with 4.4, then use the row or story anatomy as given.
3. **Encode any obligation** with 2.1: side, hue, grammar, anatomy. If the screen has no
   "you," fall back to sentence order with the owner's avatar leading.
4. **Encode any unit** with 2.2: glyph and tally, quoted words, numerals last, mark optional
   and never load-bearing.
5. **Pick components from section 3 only.** If you need a component that is not there, build it
   from the tokens in section 1 and give it the states in 3 that apply: empty, loading, error,
   too long, too many, and none-of-this-exists-yet.
6. **Check it against the three product rules** before you ship it: nothing nags, count comes
   before amount, and no screen says wallet, transaction, gas, signature, chain, or token. The
   word for a thing someone owes is a beer, a round, a next time, or a dollar amount.

If two of these rules conflict on a screen, the no-nagging rule wins, then direction encoding,
then density.
