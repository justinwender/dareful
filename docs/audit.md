# The design against the build

An audit of `docs/design.md` against the build, made on 2026-09-28 (Round B, part 1) and kept here so each item can be marked closed. Round C (2026-09-28) sorted the fourth group by direction: a fix that removes or corrects something was built, a fix that adds words or an element was built only where pre-approved and otherwise listed for the owner (the report of 2026-09-28), and where the doc conflicted with a later ruling the doc was amended. Three read-only passes swept the document in thirds and grepped the build for every item; a dozen of the notable ones were spot-checked by hand and held. The groups are the owner's: what this round builds, what later rounds before submission build, what waits for after submission, and what the design specifies that is on none of those lists. Section numbers are the design document's. A closed item says the round that closed it.

## Planned for this round (parts 0, 2 and 3)

- 3.45, all of it: the fourth icon and its one-time explainer, "Who's joining?", the PIN step, the handback, the notice, the "from Sam's phone" caption. **Closed in Round B, part 3 (2026-09-28).**
- 3.17: "No account? Scan the code with your own phone" on a borrowed phone. **Closed in Round B, part 3.**
- 3.42: the fourth icon and the count under the stack with four icons. **Closed in Round B, part 3.**
- 3.41: the ask is dropped by the owner's ruling (3.41, amended 2026-09-28) and is not a gap.

## Planned for later rounds before submission

Motion (the twelfth design session's section 9). **Closed in Round D (2026-09-28):** the set as custom properties every transition reads and a lint that refuses a timing typed anywhere else; the sheet by a transform on itself over travel on the move curve; the columns, bars and number columns over travel with the 40ms stagger, the avatar over base as its column lands, the marker over base after the last; the riding mark with no transition; the marker sliding over base; the pulse and the runner on the loop; a swipe row over base on the move curve; presses from `pointerdown`; the shells; the ask layer; tabs on the touch; the market opening out of its row and back into it; the steps under a band that holds; the terms streaming with the caret; Reduce Motion in one block.

Light mode (section 8, with its toggle on You). **Closed in Round D (2026-09-28):** the Light column as the second set of values, chosen on You or by the phone; `--live-edge`, the citron keeping its colour; the stroke variants for people; the avatar's edge; the light grain; the eight inks' light layers on the document root; the Appearance row (3.34, 8.1). Every colour the audit found outside a token is on one, or in the palette of the two literals that never follow the theme (the tiles, the share card, the outline on a photo, a team stamp's abbreviation, the code generator's black turned to `currentColor`).

Also:

- 3.28: cutting a sticker inside the app (frame 5). **Closed in Round C (2026-09-28): the cut path first, the lift as the fallback.**
- The labels that still call light mode "after submission" and pass the phone "scheduled" or "not yet scheduled". **Closed in Round D:** the doc merged three ways carries dated notes at each.

## After submission

- 3.36 multi-choice ("Divide it"), and 3.38 and 3.40's tie scored at the middle: the contract redeploy.
- 3.3, 3.13, 3.30: "Just pride" and a stake of nothing: the redeploy.
- 3.7: the multi-choice leaderboard state.
- 3.32: curated event rows on What's on.
- 3.33: questions on quarters and halves.
- 3.38, 3.42: a market that closes when everyone is in, including a blind market with no close time ("Closes when all 6 are in").
- 3.43, 6.1, 6.3, 7: a cover for a group, receipts and roulette, "not placed yet".
- 3.43: a photo when a cover is logged (the Round A ruling).
- 3.8: video.
- 3.38: the "A year ago tonight" card.

## Designed, and on none of the lists

### Copy the doc bans

- 2.1, 4.6: "owed" in "Only the person who is owed this can close it." (`src/lib/actions/obligations.ts`, `src/lib/ledger/closes.ts`). **Closed in Round C (2026-09-28).** Now "Only the person who’s got this one can close it."
- 4.6: "Lock" as the Needs you verb (`src/lib/ledger/home.ts`) and in "Only the person who asked it can lock it." and "Locking it didn't go through." (`src/lib/ledger/markets.ts`, `src/lib/actions/markets.ts`). **Closed in Round C (2026-09-28).** The verb is "Close"; the errors say close.
- 4.6: "bets" on the signed-out screen (`src/components/home/signed-out.tsx`) and in the plain share card's footer (`src/lib/ui/share-card.tsx`). **Closed in Round C (2026-09-28).** "The dares, the rounds, …".
- 4.6: the ruling credited to the app: "The app hears both sides and calls it" (the terms chip, `src/components/markets/ask-form.tsx`), "asked the app to hear it" and "the app heard it" (the ruling notice, `src/lib/notify/messages.ts`). **Closed in Round C (2026-09-28).** The chip reads "A tiebreaker hears both sides and calls it", the details row and the card's line say the tiebreaker, the notice says "Decided by the tiebreaker everyone agreed to." per 4.10's table.
- 4.9: "put your number on it" in "You're signed in, so put your number on it as yourself." (`src/lib/actions/markets.ts`). **Closed in Round C (2026-09-28).** "You’re signed in, so get in as yourself."
- 4.6, 4.9, 5.1, 5.4: raw system errors reaching people: "the chain write failed" or the relayer's own message through `ConfirmError` and `CloseError`; `MarketError` messages appending the raw error in brackets; `/api/session` answering "invalid login token: …", "bad request", "could not create user"; the login bootstrap showing those and the SDK's own messages. **Closed in Round C (2026-09-28).** Every one logs the failure and says a sentence; the bootstrap shows only sentences it wrote itself.

### Copy the doc cut or asks for

- 4.9: example placeholders inside fields: the cover form ("Gabe", "dumpling run", "47.20", "Dinner at Sal's"), the claim's field ("The sign said 8,558 feet"), the ask form ("shirt", "shirts", "20"), the number entry ("How many"), the name step ("First name"). **Closed in Round C (2026-09-28).** Every example is gone (the cover form itself is gone, WC item 5). One placeholder stays: the even share in an adjusted split, which is the value in effect when the field is left blank, not an example.
- 3.29, 4.9: the captions under the kind chips, where the step's one advice is "If none of them might happen, add that too."; the sticker caption in the picker, where 3.29 says stickers are taught at the photos. **Closed in Round C (2026-09-28).**
- 4.9: the two stake-step sentences the doc keeps, "The most you can be out is what you put on it." and "You only settle with people who land closer than you, and only by the gap between your numbers.", are not on the terms step. **Round C, part 2:** the first sentence built on the stake step, the one fact that changes whether someone stakes; the second, about settling only with people who land closer, declined here and sent to the market's information sheet next round. **Round D:** the second sentence is on the open market's information sheet, under Rules and timing.
- 4.9: the weight-line caption is shown always; the doc keeps it only when one stake is more than half the total. **Closed in Round C (2026-09-28).** The rule now holds on all three pictures (the weight line, the number axis, the pick-one bars); 3.22's "Everyone on one number." caption amended away.
- 4.6: "waiting on" outside the two uses the doc allows: the group invite page, the claim landing's "Nothing is waiting on you.", the tab bar's screen-reader text, the ghost actions, the Running captions "Waiting on how it came out" and "Waiting on the other side", and the errors "It isn't waiting on an answer." and "It isn't waiting on the feed.". **Closed in Round C (2026-09-28).** The two that stay are the doc's: the nudge card (3.42) and the game page's locked line (3.33); the feed's waiting sheet lost its "Waiting on the score" label and its explaining caption too.

### Now and the shell

- 3.15, 4.5, 4.7: the citron dot on every needs-you row with a clock, and the tab's dot on Now itself; the doc has one per viewport, on the soonest row. **Closed in Round C (2026-09-28).** One dot, on the soonest row; none on the tab bar anywhere (the owner's ruling; 6.4 and 3.38 amended).
- 3.15, 4.7: the Running row's meta line without your entry ("You're in at 17 · six of you"); the build says "N of M in · closes …". **Closed in Round C (2026-09-28).** "You’re in at 70% · six of you", "just you so far" while alone; once locked the clock alone.
- 4.7: two sections beyond the three: "One thing was waiting for you" above Needs you and "Is this you?" between Needs you and Running. **Closed in Round C (2026-09-28).** The strip was the yep rows already in Needs you; a claim to accept is a Needs you row with "That’s me" as its verb.
- 5.4: no `not-found.tsx` or `error.tsx`, so `notFound()` shows Next's default full-screen page. **Closed in Round C (2026-09-28).** `not-found.tsx` is the code screen with its line; `error.tsx` is the error card ("Couldn’t load this one." with "Try again") under the back control.
- 6.1, 6.3: People's Standings segment; plans on the timeline and Now. **Declined by the owner in Round C, part 2 (2026-09-28): after submission.**
- 4.1, 4.7: the group invite page (`/join/[token]`) sets a group's name and "You're invited to …" in the serif; nothing links to it. **Closed in Round C (2026-09-28).** Removed with its card and its paste reading; the invite rows and their functions stay for the data.
- WC item 5: the `/new` full-page cover form still exists; nothing links to it. **Closed in Round C (2026-09-28).** Removed.

### The market screen

- 3.25, 3.38: the entry line stays through voting; the doc has the claim card directly under the band. **Closed in Round C (2026-09-28).** Once locked the entry line goes and the claim card sits under the band.
- 3.23, 3.25: the locked screen's "Everyone's in, and numbers are locked" section listing each person's number, which the mark replaces. **Closed in Round C (2026-09-28).** Gone; "Where everyone landed" and the picture stand for it.
- 3.37, 3.38: band clocks after the end ("Settled Sat at 12:14am", "Voided …", "Closed for good …"), and the Decided term's words while closed ("Decided when the movie ends"; the build says "Resolving tonight"). **Built in Round C, part 2 (2026-09-28).** The clocks after the end are in the band; "Resolving tonight" stays by the owner's ruling and 3.38 is amended to match 3.15 and 3.23.
- 3.25, 3.38: the asker line: "asked the Friday crew" with "the", "Theo asked · Papa's birthday", an unnamed set's people on a live market, "and 3 others" (the build says "and N more"). **Closed in Round C (2026-09-28).** `askerLine` in `src/lib/ledger/groups.ts`.
- 3.38: the sheet header during the entering moment ("You're in at 70%" with the stake).
- 3.37, 3.42: the code icon in locked, voting and settled; the build passes it only while open. **Closed in Round C by amending the doc:** a room code is dead at lock (the joining rules), so the icon is open-only; 3.42 and 3.37 amended.
- 3.37: the claim's clip opens in a new tab rather than full screen; the memory view's consequences lack the closed mark. **The clip closed in Round C** (it opens in the album viewer). The closed mark on the memory view's consequences needs the indexer's state per edge on that screen: declined by the owner in Round C, part 2 (new data from the indexer).
- 3.24: the number vote's "What was it?" heading; the app's read on the claim card only while nobody has voted. **Sorted in Round C:** the read sits in the sheet's header while nobody has voted and as a caption in the raised sheet after, which is the doc's rule in the sheet rather than on a card; "What was it?" over the number vote's raised sheet was built in Round C, part 2; the app's read on a claim card of its own was declined by the owner (a prominent opinion from the app invites people to rubber-stamp it instead of judging), so it stays the sheet's header.
- 3.35: the ballot count line "Nobody has said yet. Two of you and it settles."; the waiting text past two hours; the feed-settled ruling card where the doc has one caption line; a void reason over three words; the ending's 14px glyph. **Closed in Round C:** the waiting sheet's explaining caption, the feed's ruling card (the one caption line stands) and the void reason ("unclear terms"). The count line before anyone has said ("Nobody has said yet. Two of you and it settles.") was built in Round C, part 2, and in Round D it is the count line's empty state on every ballot, under the app's read where there is one (the owner's correction).
- 3.22, 3.38: the time series in the market's ink, the current value at 13px 600 and the day labels; the locked caption's capital mid-caption. **The capital closed in Round C** ("2 beers · locked at 10:40pm"); the series' colour and sizes are the feel round's.
- 3.33, 3.40: "Bills won." (the build says "The Bills won."); the first drive's naming; the voting meta line with a count. **Closed in Round C:** "Bills won." on the settled lines (the wells keep "The", so the chalk reads "That’s right, the Bills won" as 3.35 has it); the voting line is the clock alone. The first drive's menu name ("The first drive" against the doc's "The Bills' first drive") is the doc's possessive of a team name, which a real session read as "the Giants's" (docs/decisions.md); left as built.
- 3.27: the tile's close time with an extra comma. **Closed in Round C (2026-09-28).**

### Screens drawn and not built

- 3.38: the argument ruled split (the band with no mark, the positions card, THE CALL, WHAT IT MOVES, the reference cells). **Closed in Round C by cutting it from the doc:** the tiebreaker rules yes, no or void and the contract scores against 0 or 1, so no ruling is ever split; 3.38, 3.2, 3.4 and 1.2 carry the cut.
- 3.38: the claimant screen as drawn: the wordmark alone with no back, the prints, "You were already in 6 stories.", groups per person, a check on every row labelled "Confirm: Priya's got you". **Round C, part 2:** the headline, its line, the groups per person with their count and the check rows are built; the prints were declined (the wordmark comes with the logo, being designed now), and the back control stays for the same reason. **Round D:** the covers start unpressed and the person's own link entries pressed (the owner's correction). **The logo round (2026-09-29):** the header is the wordmark alone, the logo's own outlines, and the back control is gone; closed but for the prints.
- 3.38, 3.10, 3.14: the person view's "Coming up", the today rule, dates in `label`, "Show earlier", the rally in its own card with its label and caption, the identity caption ("43 things since March"), the starter under "Nothing between you two yet", and the resolved market's line "Priya was closest at 85%. You said 55%.". **Round C, part 2:** "Coming up" and "Show earlier" built; the rest declined by the owner (a lot of words on the most repeated element).
- 3.4, 3.6, 3.38: the story card's "Everyone's number" label, the roll call (not built at all), "Everyone else called it even.", the "Market · asked by Priya" kicker, "Covered a round", off-the-tab covers with "Nobody's paying it back" and no consequence, argument cards, the tertiary "The whole table, and 7 more between others", frames on voided and expired cards, "Never settled.", the error card "Couldn't load this one". **The error card closed in Round C** (`ErrorCard`, the shape every failed screen takes); frames on voided and expired cards were built in Round C, part 2 (an ended market takes photos whatever its ending); the rest ("Everyone's number", the roll call, "Everyone else called it even.", the "asked by" kicker, "Covered a round", "Nobody's paying it back", argument cards, "The whole table, and 7 more between others", "Never settled.") were declined by the owner: a lot of words on the most repeated element in the app.
- 3.38: pick one's who's-got-who collapse past three rows, ending "Everyone else called it even.". **Built in Round C, part 2 (2026-09-28).** At most three rows under one person, the rest in one caption naming them; the list keeps its "Called it even:" caption, since "Everyone else called it even." was declined.
- 3.14: the offline bar. 3.4: the upcoming card. **Round C, part 2:** the offline bar built; the upcoming card declined by the owner.

### Components at the wrong size or shape

- 3.1: the ghost ring is on the edge, not 2px outside. **Closed in Round D (2026-09-28):** the dashed ring 2px outside.
- 3.2, 2.2: the fraction state ("½ ×") and the Mixed token; whole dollars in lists (the build shows cents in tokens). **Closed in Round D:** the fraction state was cut with the split ruling (3.38); the Mixed token in one pill with `splitMixed` past what fits; whole dollars in every token, the cents in the accessible name and on the detail sheet.
- 3.3: the selected style of word chips (the kind chips, the picker's categories); stake chips at radius 999 and 13px instead of radius 10 and 17px 600; the smallest not selected when the sheet raises; "Something else" not swapping the row. **Closed in Round D:** the choice chips' fill, border and ink; the stake chips at 44px, radius 10, 17px 600, the selected one chalk; the smallest by default; "Something else" swapping the row for the field.
- 3.5: the call line's cluster past six, the cap's height, "Yes, he did" labels, the track on the market's field. **Closed in Round D:** two stacked avatars and "+N" past six within six points; the cap 8px taller than the pins; the outcome's label from the settled lines ("Yes, he did"); the track on the field.
- 3.7: the gap bar's track on the field; the annotated line. **Closed in Round D:** the track on the field; one annotated line per screen naming who a wrong-sided number still beat.
- 3.10: the header's padding per column; the cancel-out row and its sheet's words; "Gabe settled up"; the photo row's action. **Closed in Round D:** 14 by 16 per column; the row in `body` 600 with its caption and a 44px "Cancel out"; the sheet's chalk "Cancel out $10 each way" and "Not now"; the notice "Gabe settled up"; the photo row with the camera glyph and a 44px "Add".
- 3.11: the rally avatar at 24px (the build has 22px). **Closed in Round D.**
- 3.19: the dashed chip for an unnamed set on event rows. **Closed in Round D:** a story card on a person view names an unnamed set by its people on a dashed chip.
- 1.7: the unit mark in "Your units" (28px at radius 8 with a 16px glyph). **Closed in Round D.**
- 2.2: the argument and coming-up glyphs, unused. **The coming-up glyph closed in Round D** (it leads "Coming up" on the person view); the argument glyph waits with the argument cards the owner declined.
- 1.1: the grain as one fixed layer (the build paints it on the body). 1.5: the modal sheet's translucent scrim. **Closed in Round D:** the grain is a fixed layer of the shell over `html`'s ground; a modal sheet's backdrop takes the touches and dims nothing.

### The link page and asking

- 3.17: "Who's joining?" as its own step with the entry's summary; the chalk waiting for the name alone; "Have an account? Sign in" in the sheet; 40px chips; two facts, not three; "Joining as Sam · Not you?"; a dead or malformed link's code screen with a form-level message. **Closed in Round B, part 3.**
- 3.20: who's in as a `radiogroup` of `radio` rows; rows at radius 10 with a surface fill; "+N" on the field; "Someone else" with a chevron and last; the naming prompt's block; the first-ever market's picker; the extra "Whoever I send it to" row. **Closed in Round C:** the radiogroup; the "Whoever I send it to" row is the joining decision of 2026-09-27 and 3.20 now carries it. The naming prompt and the first-ever picker were declined by the owner in Round C, part 2; the rest is the feel round's.
- 3.29: the "How people answer" label over a `radiogroup`; the picker opening on Food; the None cell's word; the pace chips' place. **Closed in Round C:** the radiogroup, Food, "None"; the label "How people answer" built in Round C, part 2 (a label, not a caption). The chips' place is the feel round's.
- 3.44: "Nova is" over the three rows, and "Next: who's in". **Closed in Round C (2026-09-28).**
- 3.43: the dollar cover's field as the number field (3.26).

### Rules with no check

- 5.1: focus outlines removed on the question, the answers, the margin and the number entry; Start's ring flush with its edge. **Closed in Round C (2026-09-28).** The global 2px outline 2px outside the control, on all five.
- 5.1: re-validation on blur; focus moving to the first field with a problem.
- 5.1, 5.2: "Try again" inside the summary block; the 10-second step. **Built in Round C, part 2 (2026-09-28).** A 44px "Try again" inside the block for a failure the same tap could put right, wired into the entry sheet, the ballot, the cover sheet, the code forms and the claimant's chalk; at ten seconds a waiting control becomes the block with "Try again" and takes taps again. The next round's slow-load states reconcile the two.
- 4.8: the lint as a DOM check with `getComputedStyle`, per state and per step; `data-type-exempt` on every control's root.
- 4.10: the backstop email as the question in serif, the sentence and an "Open it" button; the build sends plain text. **Declined by the owner in Round C, part 2 (2026-09-28): the email's styling waits.**

## The logo round (2026-09-29)

Not an audit of the design against the build, but three things the round found that belong on this list.

- 11.4, 11.5: the opening could come back and stay. The handoff takes `#opening` off the page, and an app that started after that rebuilt the page with the opening in it. **Closed:** the opening sits in a box the app keeps, and the http suite watches the page in a real browser, signed out and signed in.
- 10.6: the sheets named things by this document's words ("the chalk", "the band", "the wells", "the photo moment", "the rally", "the set", "the slot", "the add tile", "the owner's colour", and beside them "the count line", "citron", "the context chips", "stone", "the frame"). **Closed:** thirty entries reworded, and the sheet lint refuses each word.
- 3.33: the chips that switch between groups on a game page are named "Which set of people" to a screen reader, which is the same word on a screen. **Open:** outside this round's list, reported to the owner.
