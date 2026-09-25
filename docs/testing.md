# Testing log

Real-world testing: who tested (by role, never by name), what broke, and what changed because of it. Continuous from the first submittable build (end of Phase 2). This log is a submission deliverable.

## Session 1: cross-device passkey testing, before any code existed

**Date:** September 2026

Tested the passkey login flows the product will depend on, across devices and password managers, using stock sign-in pages rather than Dareful (which did not exist yet).

- iCloud Keychain passkeys worked across macOS and iOS, including in incognito windows.
- Google Password Manager passkeys worked across Android and macOS Chrome, including in incognito windows.
- With Dashlane set as the sole iOS AutoFill provider, iCloud Keychain passkeys were invisible in every browser, and Dashlane created a credential that did not function. This resolved once iCloud Keychain was re-enabled as an AutoFill provider.

Conclusion: default-configuration users on both platforms are fine. Third-party password manager users are the risk. The login flow needs a plain message when a passkey fails ("your password manager may be hiding your passkey; try email or phone instead"), never a generic error.

What changed: the Phase 1 login acceptance test includes a passkey failure path with a specific message, and email and phone OTP remain first-class alternatives rather than fallbacks buried behind passkeys.

## Session 2: first real use, two platforms
 
**Date:** September 18-19, 2026
**Testers:** the author on two accounts (one email login, one phone login), and a family member on Android
**Devices:** one iPhone (number and email), one macbook (same number and email as iphone), one Android
**Build:** production, `dareful.app`
 
First session with real people on real phones. Everything below was hit by
someone trying to use the app, not by looking for problems.
 
### What worked
 
Signing in worked on both platforms. Signature prompts appeared and completed
on iOS and on Android, which is the prompted ledger-wallet path working on real
hardware for the first time.
 
Group creation worked. An invite link sent from one phone opened and joined
correctly on Android.
 
### Bugs
 
**An invite link cannot be reused after leaving the screen.** Existing links are
listed with a "Turn off" beside each, so revocation works, but there is no way
to copy or re-send one. The only way forward is "Make a link" again, so live
links accumulate: one group ended the session with three. The rows are also
labeled by who created them, so two of the creator's own links read as if they
came from different people. Each row needs a copy or send action, and the label
should be the creation date.
 
**A cover with the Dollars denomination and no amount fails silently in a
group.** Tapping the button does nothing: no message, no error, no state change.
The same thing in a one-on-one relationship correctly says to enter an amount.
Validation exists on one path and not the other. This is a Principle 9 violation
(errors must be visible, not silent) and it is in a money path.
 
**The cover form asks for the amount twice.** "How much" takes `$47.20`, and
"How much was it?" appears again at the bottom. The second is presumably the
magnitude field, which is meant to be the invisible shadow value retained when
someone logs a dollar cost as a non-monetary claim. When the denomination is
Dollars the two values are the same number, so the magnitude prompt should not
render at all. It should appear only for non-monetary denominations, and read as
an optional note rather than a second required amount.
 
**A one-on-one relationship offers only Dollars.** In a group, the denomination
picker offers a next time, a beer, a round, a coffee, and something else. With a
single other person, only Dollars appears. Dyads are implicit two-person groups,
so they should offer the same inline denomination creation. This is the most
common case in the product and the one where "a next time" matters most.
 
### Gaps
 
**No name is asked for at phone signup.** The account defaulted to "Friend."
Display name appears on every share card, every timeline row, and the claimant's
first screen, so this is not cosmetic.
 
**Phone and email cannot be attached to the same account.** Signing in with one
method gives no way to add the other. A phone-only user therefore receives no
transactional email, which leaves push and voter-relayed nudges as the only
notification channels for them.
 
**Covering a group requires typing an amount per person.** The form composes one
obligation at a time, which is right for two people and repetitive for five. The
natural flow is one total, pick who was there, split evenly by default, adjust
individuals only if needed. Receipt scanning is a later phase and does not
address this, since the common case is a single total rather than an itemized
bill.
 
### Performance
 
Registration took roughly three to five seconds with no loading state, and
testers tapped repeatedly because nothing indicated anything was happening.
Other transitions took one to three seconds. Some of the registration time is
the two-wallet bootstrap and is irreducible, but the absence of any feedback is
not. [Note whether both platforms were similar.]
 
### What changed because of it

Diagnosed by reproducing each report before changing anything, and recorded in
`docs/decisions.md` (2026-09-19, Phase 2A).

- **The silent failure and the second amount field were one bug, and not the one
  reported.** The group path did validate, and there was never a second amount
  field. The refusal "How much was it?" was plain body text at the bottom of the
  form, phrased as a question, so it read as one more thing to fill in and the
  tap looked like nothing happened. Every refusal in the app is now a statement
  at the field it is about, repeated once above the button. The look was
  invented in 2A and then specified properly (`docs/design.md` 5.1): ink, a
  glyph, and position carry an error, never color.
- **Invite links** each have Send and Copy and are labeled by when they were
  made; the main button re-sends the newest live link, so links stop piling up.
  The link is rebuilt from a stored seed and a server secret, so the database
  still holds nothing that works as a link.
- **One-on-one covers** offer the same units as a group. The unit is registered
  when the cover is saved, so composing never leaves an empty group behind.
- **Signup asks "What do your friends call you?"** while the account is set up
  behind the question, which also covers the three to five seconds with no
  feedback. An account named "Friend" is asked once at its next sign-in.
- **Covering several people** is one total, split evenly, with individual
  amounts pinnable and the odd cent on the payer.
- **Every tap answers at once.** Links and buttons show progress in place. A
  route-level loading screen was tried and removed: it made a 404 answer 200.
- **Not changed:** phone and email cannot yet be attached to one account. It is
  a Dynamic account-linking feature and is not scheduled.
- **Found while closing the Phase 1 checkpoint, not by testers:** no phone login
  had ever stored its phone hash (a misspelled key, with a test fixture that
  shared the misspelling), and every sign-in on a new device created two more
  embedded wallets. Both fixed in 2A. The first means the contact-to-signup
  binding path has never worked in production and is still unverified.

### Still to record
 
- What the contact picker did on each platform, and whether behavior differed
  between an installed PWA and a browser tab.
- Whether registration time differed between iOS and Android.
 
## Session 3: four accounts, first markets
 
**Date:** september 19, 2026
**Testers:** the author, two additional accounts of the author's, and one other
person (referred to below as the Android tester)
**Devices:** desktop browser, installed PWA on iOS, Android phone
**Build:** production, `dareful.app`, after Phase 2A
 
First session with markets. Four accounts in one group: the author's primary,
two plus-addressed accounts (account A and account B), and the Android tester's.
 
### What worked
 
Market setup was good. Account B tapped through creation, the AI asked useful
scoping questions, the terms read correctly, and the market was created when
account B entered their own position.
 
### Blocker
 
**Two of four accounts cannot create a market or enter a position.** Both the
Android tester and account A get "account is still setting up. give it a second
and try again." The Android account was created more than an hour earlier and
account A more than twenty minutes earlier. Account B was created at roughly the
same time as account A and works normally.
 
An hour is not a transient delay, so a message telling people to wait describes a
state that will not resolve on its own. Either the wallet bootstrap failed
silently on those accounts and a generic transient error is covering a permanent
failure, or the check gating market creation reads something other than the
recorded wallet pair. After three more hours, both still return the same error.
 
Note for diagnosis: account A was on the installed PWA rather than a browser tab.
Worth checking whether both failing accounts share a runtime, since an installed
PWA has its own storage context.
 
This blocks the four-person market checkpoint.
 
### Structural findings
 
These are two symptoms of one thing.
 
**A group can only be joined from outside the app.** Someone already signed in
and looking at their home screen has no way to enter a group; they have to go
back to their messages and find the link. There is no join-by-code field and no
entry point on any screen after login.
 
**A group cannot be left, archived, or cleaned up.** Once joined, a group is
permanent in the interface. There is no answer to a group made for a one-time
occasion, or to a person who is no longer part of one.
 
Both follow from groups being the way into the product. The suggested rework is
to make the home screen event-first: creating or joining a market is the primary
action, groups form as a consequence of markets rather than as the route in, and
naming a group is what happens when an occasion recurs rather than a step at the
start. That matches the schema, where groups already form lazily from a member
set, and it matches the existing design intent that groups are secondary
navigation and squareness is computed rather than declared.
 
### What changed because of it

**The blocker was not setup, and it was not transient.** Diagnosed before
anything was changed (`docs/decisions.md`, 2026-09-19, Phase 2B). Every account
had both keys recorded and both existed with the login provider; nothing had
failed partway. The app has two sign-ins: its own session, a cookie that lasts
thirty days, and the login provider's, which lives in one browser's storage and
exists only where the person actually typed a code. The check in front of every
approval read the second and described its absence as "still setting up." Later
evidence settled which variant it was: on one account the installed app and the
phone's browser both failed identically while the desktop browser, where that
person had signed in, worked. So this is the ordinary path, not an edge: someone
opens the app on a second device, is signed in as far as the app can tell, and
cannot approve anything. Every approval that had ever worked, on any account,
was made within minutes of a sign-in in that same browser, which is why a
single-sitting test never saw it.

- The app now works out what a device can do when a screen loads, not when
  someone taps, so nobody finds out in the middle of a vote. A device that has
  not checked who is holding it says so at the top of every screen and offers
  the code step; everything stays readable.
- A tap to approve in that state opens the code step and carries on when it is
  done. A confirmed sign-in whose keys never arrive is called permanent, with
  "sign in again" offered. Nothing anywhere says to wait.
- Each of these states is logged once per page load, including whether the app
  was installed, because the database could not show any of it.
- The two sign-in lifetimes were two hours and thirty days. They are now both
  thirty days and recorded as a pair that must stay matched. That stops a
  working device from lapsing; it does nothing for a device that never signed
  in, which is why the code fix carries the weight.

**The structural finding became the home screen.** Home is event-first: Ask
something, then a field for a code someone reads out, then only what will not
move without this person (a vote, a question to enter, a cover to confirm, a
draft they never sent), then what just happened, then people, then groups as
chips that filter the screen. A question can be asked with no group at all; the
group is whoever joins, it is called by its latest question until somebody names
it, and naming is offered once it has been asked in twice. A signed-in person
holding a question's link sees an invitation that says who asked and what it is,
never what it could cost, and joins from there. A group can be hidden, for that
person only, and anything new in it brings it back.

**Leaving a group is not built, and the reason is a finding.** The ledger
contract can add a member and has no way to remove one, and a question's voters
are read from the contract. Someone who left would still count toward every
later question's threshold there. It needs a contract decision before it needs a
screen.

**Votes now travel.** Each vote tells the rest of the voters, with the count,
by push where the app is installed and by email where the person signed in with
one; the screen after a vote offers to relay it to the chat in the voter's own
words; and reaching the threshold sends the result, not a request, to everyone
who had not voted. Nothing is sent because time passed.

### Still to record
 
- Whether login survives in the installed PWA separately from a browser tab.
  (Session 3 says it does not carry over: the installed app and the browser
  each needed their own sign-in. Confirm on Android.)
- Whether the contact picker behaves the same in the installed PWA as in a tab,
  on each platform.
- Whether a shared link opens in the installed app or in a browser tab for
  someone who has it installed.
- Whether Open Graph cards render in a real messaging client.
- Whether the back gesture works in the installed PWA, which has no browser
  chrome.
 
## Session 4: three people, one screen, and no way back

**Date:** September 20-21, 2026
**Testers:** the author and two other people, on their own phones
**Build:** production, `dareful.app`, after the market-screen round

The first session on the rebuilt home, the same-people picker and the market screen as one object in two states. Three people asked, joined and entered questions in one sitting.

### What worked

Asking, joining by link, entering a number and seeing the weight line change as the others got in. The picker preselected the last set of people. Nothing needed a group to be made first.

### Findings

**No way back.** Taking the group list and sign-out off home removed most of the incidental ways back without putting a deliberate one in their place, and an installed app has no browser chrome. The back control at the top left is the hardest place on a phone to reach one-handed.

**"Needs you" put a cover to confirm above a vote closing that night.** The strip ordered by how long things had waited, so an old cover climbed over the one thing with a clock.

**On a question in voting, the ballot was below the picture.** The person who had come to vote scrolled past the thing they had come for.

### What changed because of it

Recorded in `docs/decisions.md` (2026-09-21, "Navigation"). A way home under the thumb on every screen but home, deliberately the smallest structure that fixed it because a navigation architecture was being designed in parallel; it was replaced by that architecture's three roots, Start and back control on 2026-09-24. "Needs you" ranks what is time-bound above what can sit, as priority and never as pressure: no countdown, no day count, no ageing. On a question in voting where this person has not voted, the ballot is the screen.

## Session 5: the settler, two accounts on the real chain

**Date:** September 21-24, 2026
**Testers:** the developer, with two test accounts: one on `dareful.app`, one on the development build, against the one database and the real chain
**Build:** development, alongside production

Not a session with people, and recorded as such: the two-account pattern the settler was verified with before it reached anyone. Each case below is a real signed-in session on each side, real signatures, and real chain writes.

### What was verified

- An interpersonal dispute ("I was right to be annoyed he bailed") declined, with a dare offered instead and the decline commenting on neither person.
- A contestable claim (hitting a fastball against returning a serve) given three criteria, one chosen, the terms written around it, the criterion on the invitation before the other side was in, and a soft ruling ("leans yes, 82 to 18").
- A deadlock: one yes, one no, a case stated by each side, "Let the app call it", and a ruling. The first real arbitration voided, because the written terms named two incompatible measures, which is the mechanism working. The stored ruling re-hashed to exactly what the contract and the indexer hold, and the asker's clean-resolution rate dropped to one of two.
- A checkable argument (the Holland Tunnel against the Lincoln) locked in about two seconds, ruled in about seven at 95, agreed by both, the loser's whole stake on both timelines.

### What broke

- **A display-only line was discarding whole write-ups.** The one-line reason beside the starting number sometimes ran past 140 characters, the parse refused it, and the terms that came with it were thrown away, which is why testers had sometimes seen their question "as typed". Display-only prose is now clipped, never a reason to reject; a ruling's lean is clamped rather than refused; a tool call cut off by the token limit is reported as that. The starting number itself was removed on 2026-09-24.
- **The first local call to the scheduler ran unscoped against the shared database** and locked two real questions that were a day past their time. What the scheduler is for, but an onchain write on real people's questions from a development machine before review. The tick now takes the ids it may touch, tests always pass them, and a mutant that opens the door is written so that even open it touches nothing.

### Still to record

- The second person's entry through the argument screen, careful mode from the questions to the terms, and expiry under the void rule, each through a real session rather than a script.
- Whether a push arrives on a phone for the deadline notice and the ruling.

## Session 6: the second half of the migration, in two real sessions

**When:** September 25, 2026. **Who:** the two test accounts, the creator on dareful.app (the deployed first-half build) and the second person on localhost (the second-half build), both in the development browser, both signed in by the author. The sheet, the odds line, the weight line, the call sheet, the settled sheet and the two tiles were each exercised against the real database and the real chain.

### What was exercised

- **Entering through the odds line.** On the second person's screen the sheet rested with "What are the odds?", "Slide to answer", ten empty segments and a disabled "Slide to pick your odds". A tap on the drawn line placed 70%, the sheet raised on that first touch to the three stake chips ($5, $10, $20) with $10 selected, the word band read "Probably", the riding percent sat over the chalk thumb and the seven segments filled in the person's hue. "I'm in at 70%, $10" signed and sent. The sheet lowered, the entry line and the weight line appeared with the person's share of the 70% column in their hue under the asker's $5 in the market's ink, and the sheet became "Anyone with the link can get in until it closes." over "Send it to the chat". The caption named the heavier stake and the group's number in percent.
- **Change.** From the entry line, Change reopened the odds line raised at the current value with "Save: 70%, $10" beside "Never mind", and the weight line followed the value while it moved.
- **Locking, the claim and the vote.** The asker locked from the deployed build. On localhost the band read "Resolving soon" with the locked mark and the sheet asked "When it's clear, say what happened." with the two wells. Yes raised the sheet to the "What happened?" line; "Say it: yes" saved the line, and the vote's own modal ("You're calling it / Yes. / Call it yes") signed with the governance key. The band moved to "Voting ends soon" with the in-voting mark, the claim card under it read "You say yes" with the line, and the sheet became "You said yes · 1 of 2 has said yes. One more and it settles." with Change.
- **Resolution and the result.** The asker agreed on the deployed build's ballot, which had the app's read ("The app leans yes, 88 to 12"). The chain resolved it; on localhost the screen showed "Yes.", the call line, closest first and "Nothing changes hands", and the settled sheet carried a thumbnail of the result tile, "Yes. Claude was closest, at 70%." and "Send how it ended".
- **The tiles.** `/m/<id>/opengraph-image` drew the asking tile (the asker's avatar and first name, "What are the odds?", the empty odds line, "Closes Sat, Sep 26, 9:39am UTC" for a row from before zones were kept) and, once settled, the result tile ("Yes.", the call line with the closest person ringed, "Claude called it at 70%.").
- **The type budget recount** with control labels out changed no screen's total; the eleven over four are still over.

### What broke

- **The sheet's room landed under the question band.** The first cut rendered the sheet's spacer in flow where the component sat, which on the market screen is right after the band: three hundred pixels of nothing, then the body. The room is now paid by the screen's own bottom padding through a custom property the sheet sets from its measured height.
- **The tile route took itself down at module load.** `fetch(new URL("…/font.ttf", import.meta.url))`, the documented way to load a font for the image renderer, resolves under Turbopack in development to a path `fetch` cannot parse, and a rejected promise at module level failed every request to the route. The fonts are read from disk instead, lazily, with the function traced into the deployment.
- **The renderer refuses `boxShadow: undefined`.** An avatar without a ring passed the key with no value and the whole tile was a 500. The key is now set only when there is a ring.
- **A fragment as the tile's children laid out as a row.** The renderer was handed a fragment inside a column and drew its children side by side, off both edges of the canvas. The rows are passed as an array and each gets its own flex row.
- **The settled sheet marked itself seen before anyone had seen it.** Development runs every effect twice; the cleanup that records "left the screen" ran on the synthetic unmount and the sheet never showed. A stay shorter than a second is no longer counted as leaving.
- **A formatting run mid-session remounted the call sheet** and lost a half-made claim (the line had saved, the vote had not been cast). Not a product fault; recorded so the next session does not read it as one.

### The three checks owed from 2C

- **The second person's entry through the argument screen.** The asker (deployed build) settled an argument ("Is Mount Whitney taller than Mount Rainier?") and took yes. On localhost the second person's sheet read "Claude says yes. You're taking the other side." with "No, all the way" already chosen, the odds line at 0% ("Not a chance") and "I'm in at 0%, $10". Entering locked it at once; the weight line showed the two columns at 0% and 100%; the sheet asked for what happened while the app was weighing it up, then carried the app's read ("The app thinks: yes.") as the claim with the rationale behind the grabber. The second person agreed, the asker agreed, and the whole $10 landed on the asker's side of the story.
- **Careful mode, from the questions to the terms.** "Ask me three things first" on a dare ("I finish reading the whole book by Sunday night") produced three yes-or-no questions (audiobooks, skipping the epilogue, the time zone) with "Who's in?" held in the sheet until all three were answered. The terms that came back carried every answer: audiobook does not count, skipping the epilogue still counts, any time zone. "Looks right" made the draft.
- **Expiry under the void rule, from the scheduler.** A question set to go unsettled, with a seven-minute deadline, both people in. The scheduler's `tick`, scoped to that one question, locked it at its time and expired it in the same run: `resolved_by = 'expired'`, no outcome, nothing minted, no proposal, and the screen on both origins reads "Never settled." with "Nothing changes hands, and it counts against nobody." Expiry itself works as 2C built it.

### What broke, on production

- **The production scheduler is not running any of its jobs.** Every minute pg_cron posts to `https://dareful.app/api/tick`, and every one of those calls has been answered 404 (the route's answer to a wrong or missing secret) for as far back as the runtime log shows. The secret in Supabase Vault matches the one on the development machine byte for byte; a call to production with that same secret is also refused; so the deployed function's `TICK_SECRET` is a different value, or unset. Until it is set to the Vault value (they rotate together, per the brief) nothing on production auto-locks at its time, no deadline notice goes out, nothing expires by itself and no deadlock reaches the backstop; every one of those is still reachable by a person, so nothing breaks, it waits. Read from the Vercel runtime log and the cron run history; the Vercel environment itself could not be read from here (the token is not allowed to list it), so which of the two it is (different or unset) is an assumption.
- **A market expired by the tick carries a `resolved_at` two seconds before its `locked_at`.** The tick's clock is taken once at the start of the run and stamped on the expiry, while the lock's stamp is the moment its receipt came back. Cosmetic today (nothing orders by these two against each other), recorded so it is not read as corruption later.

## Session 7: the installed app on an iPhone, and the scheduler on production

**When:** September 25, 2026. **Who:** the author, on the installed app on iOS, after the second half was deployed; the scheduler and the relayer checked from the development machine against production.

### Confirmed

- **The scheduler runs.** `net._http_response` shows 349 answers of 404 from 10:06 to 15:54 UTC and 200 from 15:55 on, every minute, each with the tick's report. The route lives at `/api/tick` and pg_cron posts to `https://dareful.app/api/tick`, so the path was never the cause; the deployed secret was.
- **The database suites pass on the refilled relayer:** 127 of 127, on 24.98 MON before the run and 24.51 after. A full run costs about half a MON.
- **The relayer is watched** from the tick from this build on: the balance in every tick's report, a warning in the log under 3 MON, and an email to `OPS_EMAIL` at the top of each hour while it lasts. `OPS_EMAIL` has to be set in Vercel for the email to go out; the unit test covers the rule and the tick on production carries the reading.

### Three findings from the phone

1. **On Now, the tab bar sometimes scrolled with the content.** The grain was the first suspect: a `filter` on an ancestor makes it the containing block of every fixed descendant. It is cleared: the grain's filter is inside the SVG that the background image is made of, not a CSS filter on the body, and the rendered page (read in the development browser) shows no ancestor of the bar (main, body, html) with a transform, filter, will-change, perspective, contain or backdrop-filter.
2. **On every other screen the tab bar and the sheet sat high, with a dark band beneath.** Read as the bottom inset paid twice. It is paid once in the code: the body pays top and sides, the bar and the sheet each pay their own bottom, nothing else pays it.
3. **Scrolled content ran under the translucent status bar** into the clock. The body's top padding only keeps content clear at rest.

The first reading of the two bottom findings attributed them to a regression in iOS 26.0 (Apple Developer Forums thread 800125): after the keyboard has been up and gone, `visualViewport.height` stays short of `window.innerHeight` and `offsetTop` does not return to 0, and fixed elements track that stale viewport for the life of the document. That attribution was withdrawn the same day: the phone that showed the drift runs iOS 26.6.2, past the 26.1 fix, so the 26.0 bug cannot be what it was. What survives is a mechanism and a repair that answers to it: if dismissing the keyboard leaves the visual viewport stuck on this phone for whatever reason, the fixed bar and sheet would sit high with the page beneath and drift on scroll, which is the shape of the report (Now clean on a cold start, the ask flow and everything after it wrong); the repair fires on that symptom, never on the version. Nothing here can run iOS, the simulator on this machine has no Xcode behind it, and the desktop browser's phone emulation neither pays insets nor has the bug, so the cause on 26.6.2 is unknown until the phone is read.

### What changed

- `Screen` paints a fixed band the height of the top inset behind the status bar: the ground with its grain, and on a market screen the market's ground, because the band is inside the inked root. Verified on localhost: the band is fixed, `z-20`, 0px tall on the desktop (no inset) and reads Sea's ground on a Sea market. A page test holds it on Now and inside the ink on a market screen.
- `ViewportRepair` in the root layout, iOS only: after a field loses focus or the visual viewport resizes, while the reading says the viewport is stuck (short or offset, nothing focused, no pinch zoom), it scrolls one pixel and back so Safari re-reads the viewport. The rule is `viewportStuck`, with three mutants. Kept, not reverted, until the cold-start check below says whether the mechanism holds.
- Nothing about the inset changed, because nothing about it was wrong in the code.

### What to check on the phone

All on the installed app. If the first check fails, the reading above is wrong and the cause is elsewhere.

1. **The deciding check, on iOS 26.6.2.** Cold start the installed app onto Now without touching any field, and scroll. Then tap the code field, dismiss the keyboard, and scroll again. If the bar is fine cold and drifts only after the keyboard, the mechanism holds and the repair either works (it settles within a second of the keyboard going) or needs a larger nudge. If it drifts on the cold start with no keyboard ever shown, the mechanism is wrong too and this needs a fresh diagnosis.
2. **Then the same after typing elsewhere.** Type in the ask flow, dismiss the keyboard, come back to Now: the same two outcomes, read the same way.
3. **Start, then the ask flow.** Type a question, dismiss the keyboard, then tap back to Now and over to People. The sheet on the ask flow and the bar on People should sit on the home indicator with no ground showing beneath.
4. **Scroll any long screen** (a market with several people in, or People). The clock and the status bar should sit on a solid band of the screen's ground, never over moving content; on a market screen the band is the market's ink.
5. **Pinch zoom on a market screen and let go.** Nothing should jiggle; the repair never runs under zoom.
6. **If the bar still sits high after the keyboard**, note whether it settles after a scroll of any size: that tells whether the one-pixel scroll is too small for Safari to re-read the viewport, which is the one part of the repair that could not be exercised here.

## Session 8: the lifecycle, in two real sessions

**When:** September 25, 2026. **Who:** the two test accounts: the creditor on localhost (the lifecycle build) and the other person on dareful.app (the deployed second-half build, which knows nothing of the new screens but reads the same chain), both in the development browser, both signed in by the author. Every chain write below is on the real relayer.

### Confirmed first

- **The last session's diagnosis was wrong about the version.** The phone that showed the drifting bar runs iOS 26.6.2, past the fix for the 26.0 regression it was blamed on; the entry is corrected in docs/decisions.md and the deciding check is item 1 under session 7. The repair stays until that check answers.
- **The design session's files are in their places**, the old ones gone, the emoji data with the app's other data and the script in `scripts/` with its running note. The repository has no Python tooling; the script stays Python (docs/decisions.md).

### What was exercised

- **Netting, on one signature, in one transaction.** The two accounts had $10 each way from two arguments in the same set of people, and $2.10 more one way. The creditor's person view read "Claude Code's got you $2.10" in the header, as it always nets for display, and under it the new row: "Cancel out the $10 each way", with "You've got Claude Code $10 and Claude Code's got you $12.10, in Claude and you." The sheet asked "Cancel out the $10 each way?" over "After this, Claude Code's got you $2.10." and "Cancel them out" signed with the ledger wallet from its own button, the relayer carried one `net`, the page refreshed, the row was gone and the header read the difference alone. On dareful.app the other account's header showed the same.
- **A cover, confirmed from the other origin, then settled.** "I got this one" on localhost against the other account ($18, "Lifecycle check: to settle"), confirmed on dareful.app with the deployed build's own "Yep, that's right", minted on the chain; back on localhost the covered card had become the move (its accessible name: "Claude Code's got you. Settle it, or call it even"), the sheet held the sentence, the memo, "Settled" in chalk and "Call it even" at the same size, and "Settled" signed the Close over the obligation's own counter. The card carries the Settled mark and is a control no longer; dareful.app shows the same mark from the indexer.
- **A second cover, called even.** $7, confirmed the same way, then "Call it even" from the sheet: Forgiven on both origins.
- **The photo row** did not appear in the sheet, because `SUPABASE_SECRET_KEY` is not set on the development machine; the sheet hides the camera rather than offering one that leads nowhere. The pipeline itself is exercised by its unit tests against a photo made by sharp's own EXIF writer: the fixture carries a GPS block, the stored frame carries no EXIF at all, orientation 6 turns a 1600 by 1200 input into an 810 by 1080 frame, and the capture time is read with the camera's offset.
- **The notices.** The other account's `notification_log` holds one `settled` and one `forgiven` notice, caused by the creditor, and one `netted` notice for the pair; no channel took them, since push and email are off here.
- **The type budget, counted in sizes**, against the build: twelve screens pass at four or under (eleven had failed the token count), three are held to a day-one baseline with their reasons in docs/decisions.md.

### What broke

- **A second close seconds after the first was refused by the contract.** `closeState` took what is open from the indexer, which runs seconds behind the chain, so a close signed for the full amount landed on a counter that had moved. It now takes the smaller of the indexer's figure and the chain's own `minted - closed`, and the chain test that found it passes.
- **The card handed a Buffer to the client.** The covered card's unit was the whole denomination row, onchain id included, and React warned that binary data was crossing as JSON. The page now sends the card the seven fields it reads.
- **The page test assumed a first name in an accessible name.** The sentence uses the display name the product uses everywhere ("Priya Raman's got you"); the test, not the product, was corrected.
- **The header on localhost still said $7 for a moment after the forgiveness**, because the header is read from the indexer and the refresh beat it by a second or two; the card itself showed Forgiven at once from its own state, and the next load agreed. Recorded, not changed: the header is derived from the chain and stays that way.

### What needs the operator, a phone or a second person

1. **Photos need `SUPABASE_SECRET_KEY`.** Create a secret key (`sb_secret_…`) in the project's API settings, put it in `.env.local` and Vercel, then on a phone: open a cover you are owed, tap it, "Add a photo of it", take one, "Settled". Expect the 84px thumbnail on the card within a second of the sheet closing, the same thumbnail on the other person's phone, and a 404 (a blank tab) if a third person pastes the photo's address. Then disable the legacy `service_role` and anon keys in the dashboard: nothing reads them.
2. **The email records**, for Cloudflare, all DNS-only, for approval before anything is entered. Values marked "from Resend" are shown when the domain is added there and cannot be written ahead.

   | Type | Name | Content | Notes |
   | --- | --- | --- | --- |
   | TXT | `send` | `v=spf1 include:amazonses.com ~all` | SPF for the sending subdomain Resend uses as the return path |
   | MX | `send` | `feedback-smtp.us-east-1.amazonses.com`, priority 10 | Bounces; the host depends on the region picked when the domain is added (from Resend) |
   | TXT | `resend._domainkey` | `p=…` | DKIM, from Resend; proxy off |
   | TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:<the operator address>; adkim=r; aspf=r; pct=100` | Reports first; after a week of clean reports, `p=quarantine` |

   With `EMAIL_FROM` as `Dareful <hello@dareful.app>` and DKIM signed by `dareful.app`, DMARC aligns on DKIM, which is what keeps a new domain out of Gmail's spam folder. Nothing else sends from the root today; a root `v=spf1 -all` would harden it further and is left out until that is confirmed. Then `RESEND_API_KEY` and `EMAIL_FROM` in Vercel turn the channel on for the relayer watch and for every user notice.
3. **On a phone, after the deploy**: the sheet from a covered card (tap the card, not a button), the two buttons at the same size, "Never mind" by dragging the handle down; the netting row and its sheet; the rally strip's dots under a person with four or more covers nobody expects to settle.
4. **The deciding check for the drifting bar** is still open: session 7, item 1.

### Still owed

- An obligation a market minted has no row of its own on the person view and cannot be closed from its story yet.
- "Just happened" does not list closed obligations; it needs a moment to order by (docs/decisions.md, "Settling and forgiving, from the row").
- Closing the books has no home in the specification; asked.

## Session 9: the photo path on production, the story's consequence, and the band

**When:** September 25, 2026, after the lifecycle build was deployed and the secret key set. **Who:** the two test accounts again, the creditor this time on dareful.app (the deployed lifecycle build) and the other person on localhost, both in the development browser, both signed in by the author; the settle-with-a-photo checkpoint on production, end to end.

### Exercised

- **Settled with a photo, on production.** A cover logged on dareful.app against the other account ($9, "Photo check"), confirmed by that account on localhost, then on dareful.app: the row, the sheet, "Add a photo of it" given a JPEG (a canvas-drawn one, handed to the file input the way a camera would hand one), the preview in the row and "Change the photo", then "Settled". The close went through, the photo went up after it, and the card came back with the Settled mark and its 84px thumbnail, loaded (256 by 256). The thumbnail's address, `/api/media/<id>?size=thumb`, answered a redirect into the private bucket's signed path and the bucket answered the image. **The other person sees it**: the debtor's person view on localhost carries the same thumbnail, loaded. **Nobody else does**: signed out, both the thumbnail and the frame answer 404; the bucket's public path answers 400, since it is not public. A third real account is not available in this browser; the page test covers the outsider with a temporary account (404) and the two people in it (302 to the signed path), against a thumbnail written to the real bucket for the test and removed after.
- **A market-minted obligation closed from its story.** On localhost the story "Is the Holland Tunnel longer than the Lincoln Tunnel?" carried its consequence as the move; the sheet showed the sentence and the question; "Settled" closed what the indexer said was still open on it after the morning's netting ($2.10 of the $10 the market minted), and the consequence came back with the Settled mark and is a control no longer.
- **The email channel.** One line through `sendOps` from the development machine with the sending key, accepted by Resend; the records that actually went in are in docs/decisions.md.
- **Just happened** carries the morning's settled and forgiven covers on the creditor's Now, at the moment they closed, with the mark the indexer gives them.

### What broke

- **The story's consequence refused to close: "That didn't go through."** Every obligation a market mints has an id the contract derived (a keccak folded to sixteen bytes) with no RFC version or variant bits, and the close and photo boundaries validated the id with `z.string().uuid()`, which refuses it. Every market loser's debt was unclosable at the boundary, which is exactly the gap this session was meant to close. The boundaries now take `isUuidLike` (five hex groups, nothing more), with a unit test that names the derived id and a mutant that puts the RFC bits back.
- **The page test's settled question was not a story on the person view** until both people had a position in it: the person view lists markets both are in. The fixture, not the product.
- **The media test met the real bucket.** With the secret key now set here, a fixture row whose object did not exist made the door answer 502. The fixture writes a real 8px thumbnail to the bucket and removes it after, and the test now insists on the 302 into the signed path for both people in it.

### The band under the tab bar, in the installed app

The cold start (the installed app fully closed, reopened, straight to People, no field touched) showed the band. That rules out the keyboard mechanism entirely, so the viewport repair is removed (docs/decisions.md). The reading offered, that the inset is paid as position rather than padding, was checked against the CSS the server actually sends: the tab bar is `bottom: 0` with `padding-bottom: env(safe-area-inset-bottom)`, the pinned sheet is `bottom: 0` with `padding-bottom: calc(24px + env(safe-area-inset-bottom))`, and the only thing positioned by the inset is the Start button, at `calc(80px + env(safe-area-inset-bottom))`, which has to clear the bar. So the shape is the standard one, and it would put the bar's own surface, not the ground, under the labels; a ground-coloured band means the bar's box ends above the screen's bottom edge, which the CSS does not do on its own. Two readings remain, and only the phone can pick: the layout viewport is shorter than the screen in the installed app (a `bottom: 0` box lands above the home indicator while `env()` still reports the inset), or the inset resolves to a different number than the screen's. Nothing here runs iOS, the simulator on this machine has no Xcode behind it, and the desktop browser's phone emulation pays no insets.

So there is an instrument: on You, "Measure the screen" prints the window's height against the screen's, the visual viewport, both insets as the browser resolves them, where a `position: fixed; bottom: 0` box actually lands, the tab bar's own box, and whether the page is standalone. It is behind a tertiary button rather than a query string because the installed app has no address bar.

### What to check in the installed app, and report

1. Cold start the installed app, go to You, tap "Measure the screen", and send the ten lines as they read. The band's cause is in them: if "fixed bottom:0 lands at" is less than the window's height, the viewport is short; if "inset top / bottom" reads 0 / 0 while the band shows, the inset is not what the app is paying; if the tab bar's bottom equals the window's height and the band still shows, the window itself is shorter than the screen.
2. Do the same in a Safari tab, for the pair of readings.
3. With the deployed build: open a cover you are owed, tap the card, add a photo from the camera, "Settled"; expect the thumbnail on the card within a second of the sheet closing and the same thumbnail on the other person's phone.
4. Then disable the legacy Supabase keys.

