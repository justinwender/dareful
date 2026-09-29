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


## Session 10: a number question in a real session, and the chain

**When:** September 25, 2026, the Phase 5 build, on localhost against the production database, the real chain and the hosted indexer. **Who:** the author's test account on localhost (signed in by the author); the second account's session lives on dareful.app, which runs the build before this one, so the second person's side of a number question waits for the deploy. A five-person market ran as temporary accounts on the real chain in `tests/db/numbers.test.ts`.

### Exercised

- **Asking a number question, with a mark.** The question step as 3.29 draws it: the mark row opened the picker; Food, 🍺; the room retinted to Ochre (the band, the ground, the sheet); the row read "Beer mug · tap to change"; the beer landed first in Recent; Done closed it. "A number", the line "how many shirts can Gabe wear at once", "Next: who's in": the model wrote the question, the terms, the unit ("shirt", "shirts") and a scale of 15 that passed the check; who's in kept the Ochre; the terms step showed the two unit fields and "Scored on" with "Set for you" as its placeholder; "Looks right" saved the draft under the id the step had made, with the mark, the ink from the table (`mark`) and the model's scale (`ai`).
- **Entering a number.** On the draft's screen the sheet held the number field, empty, with "Type your number" waiting; 14 typed, "Looks right. I'm in at 14 shirts, $10" signed Create (the scale inside it) and Enter (the number as the value); the screen came back with the 🍺 band on Ochre, "You're in at 14 shirts", "Where the stake sits" with three columns labelled 13, 14 and 15 shirts and the avatar over the middle one at full height, "1 of 2 in", the share sheet. "Scored on" absent, since the model set the scale.
- **The locked state.** With the question marked locked for a minute, the sheet read "When it's clear, say what it was." over the empty number field, "Nobody can tell", the "What happened?" line and "Type what it was"; the poll asked `/api/m/[id]/pulse` every six seconds once the screen counted as visible (the development browser's pane is hidden, so the visibility was set by hand for the check).
- **The far-off check**, on the same question once its most likely answer was set: Change, 2,400 typed, Save: the line "2,400 shirts is a lot of shirts." with "It's 2,400 shirts" and "Not quite" above the primary, nothing signed; "Not quite" put the sheet back; 14 saved as before.
- **Pull-to-refresh**, with touches synthesised on Now in the development browser (the pane has no touch of its own): the line under the status band filled with the pull (28, 69, 100 percent), ran on release, and was gone once the screen had re-read; a real finger on the installed app is the check that remains.
- **The chain.** Five temporary accounts, the shirts example, three votes for 14 and one for 15: locked with the scale in the struct, resolved at 14 by the third 14, scores and nets to the hand figures, ten edges to the cent, the chain's `obligationOf` agreeing row by row, the calibration record and the clean-resolution rate moved for the people in it. `verify-envio` then recomputed every market the indexer knows (75, one a number market) with no mismatch, and printed the number market's scale, answer, entries and the one floored. The deployed contract's own `scoreNumeric` agrees with the mirror across the example, its own test table and the edges of the scale. The gas survey's `number` mode measured `create` and `resolve` within three percent of the yes-or-no figures.

### What broke

- **The market screen crashed after the entry**: "A server error occurred" on the number question's own screen, because the axis serialiser lived in a client module and the server render called it. Moved to the pure axis module. Found in the real session, not by a test; the page test written after it would have.
- **The poll never resumed once a hidden screen's tick had fired**: the tick returned without clearing its timer, so the visibility handler thought one was pending. Found while watching the pulse in the hidden pane; fixed, and the two requests six seconds apart are the check.
- **A helper exported from the server-actions file was not async**, which the dev server refused at compile; moved beside the market module's other pure functions.
- **The page fixture**: the friend's Now grew a dot from open number questions the asker had not entered, and the fixture's blind question counted shirts while the test expected people. Both the fixture.

### What needs a phone, a second person, or the deploy

1. **The five-person checkpoint on production** needs three more real accounts: a number question in a five-person group, one entry far off, three votes for the same number and one dissent, the transfers matching the shirts example (the chain test is the same shape with temporary accounts). With the two real accounts, after the deploy: ask a number question on dareful.app with a mark, enter on both devices, lock, "It was 14 shirts" on one phone, "That's right, 14" on the other, and expect "14 shirts." with the ruler and closest first on both.
2. **A blind number question** on production: the second device sees "Numbers show when everyone's in" and no axis until lock; after lock, everyone's numbers.
3. **A vote cast on one device appearing on another** without a reload: open the locked question on both phones, vote on one, expect the other's count line to change within about six seconds with the screen on; then background the app on one phone for a few seconds and bring it back, and expect the screen re-read.
4. **Pull-to-refresh in the installed app**: from the top of Now, pull down until the line under the status bar fills, let go, and expect the line to run and the screen to re-read; a pull that stops short does nothing.
5. **The profiles** wait for the You tab's design.

## Session 11: photos, a sticker and a screenshot, in the real localhost session

**When:** September 25, 2026, the media build, on localhost against the production database and the real bucket. **Who:** the author's test account on localhost (signed in by the author) and the second account's session on dareful.app, which runs the build before this one. Nothing in this session was a forged session; the photos and the cutout were drawn by the browser, since the development pane has no camera and no clipboard of its own, and went through the real actions, the real pipeline and the real bucket.

### Exercised

- **A photo on a settled question.** On "Does the Running row show up on Now once you're in?" (settled today, both accounts in) the settled screen showed "Add yours from tonight" under the outcome; one photo through it and the frame appeared at 200px with "Photo 1 of 1, added by Claude", the credit chip with the 20px avatar on the scrim, and the counter; a second photo made it "1 / 2" with one 60px square in the strip, and tapping the square brought it into the frame ("2 / 2", "Photo 2 of 2"). On the person view for the other account the same story carried the frame at 180 with its counter, inside the card.
- **Seen by the other participant, through the deployed door.** From the dareful.app session (the asker of that question, on the build before this one) `/api/media/<id>?size=thumb` answered 302 to a signed URL in the private bucket and the thumbnail came back as JPEG: the door's rule for market media has been in production since the lifecycle, so the second participant sees the photo the moment this build is deployed.
- **A sticker, by paste.** On the question step the picker opened with "Your stickers" above Recent and the paste cell; a teal cutout on a transparent canvas pasted through the clipboard event went up through the action and came back as a cell, pressed, drawn from `/api/mark/<id>?size=stamp`; the row read "Your sticker · tap to change" and the whole ask screen retinted to Sea's ground, the ink measured from the disc alone. Balance then moved it to Slate on the who's-in step, as 1.8 rule 4 says it may.
- **A screenshot with what happened.** With the shirts question locked by hand, the sheet's "What happened?" gained "Attach a screenshot"; a drawn board ("SHIRT COUNT 14") went with the line and the number, and one proposal was written with the board in it. The app's read: "The attached board only repeats that same 14 and could have been typed by anyone, so this rests on that single report." The sheet moved to voting with the board in its attached list at 44px under the supplier's name; the frame stayed absent. The question was put back as it was afterward.
- **The tile.** The settled question's link tile rendered (200, PNG) with the line that says there are photos and no photo on it.

### What broke

- **"The app leans n:14, 75 to 25."** The sheet's line for a soft number proposal spelled the vote word instead of the number (Phase 5). Now "The app leans 14 shirts, 75 to 25."
- **The test fixture's cleanup** deleted a market before the photos hanging off it and a temporary user before their stickers; the sweep also lacked a market's number series and codes. The first failed run left seven temporary users on the production database until both were fixed and the sweep run.
- **Three of the new assertions were wrong about the geometry**, not the code: the die-cut rim is anti-aliased across the radius, the band reaches the derivative's edge exactly, and sRGB red measures hue 20 in OKLCH and folds to Rose by chroma. Corrected against the drawn pixels.

### What needs a phone, a second person, or the deploy

1. **Pasting a real cutout.** On an iPhone (iOS 16 and up): long-press a subject in a Photos picture, Copy Subject; on the question step open the picker and tap the paste cell (iOS shows its own Paste prompt), or long-press in the search field and Paste. Expect the cutout as a cell with its cream edge, the screen retinted to its colour, and, once the question is asked, the sticker in the band at 44px, on the Now rows at 40px, and on the asking tile when the link is sent. A grey or mostly white cutout should show the hueless line and hash. The development browser has no clipboard of its own, so only the synthetic paste was exercised.
2. **A photo added on production and seen by the other account**, after the deploy: on a settled question both are in, "Add yours from that night" on one phone, the frame on both, the counter and the strip after a second photo from the other phone, and `/api/media/<id>` a 404 from an account outside the group.
3. **A screenshot attached on production**: lock a question for real (both in, the asker locks), "What happened?" with "Attach a screenshot" of anything with a number on it, expect the app's read to mention the screenshot and who attached it, the claim card's 72px clip once the first vote is in, the attached list in the sheet, and no frame; after settling, no screenshot in the frame.
4. **A link tile for a question with photos**: send how it ended into a chat and expect "With photos from that night." on the preview and no photo.
5. **The memory screen** (board 15) waits for its design, as does the wording flagged in docs/decisions.md.

## Session 12: the settled screen, the memory view and the far-off block, in the real localhost session

**When:** September 26, 2026, the photos round built to the reconciled design, on localhost against the production database and the real bucket. **Who:** the author's test account on localhost (signed in by the author). The dev server was restarted for this round, which cost the browser's dareful.app tab; the session cookie there survived the restart, so the other account's session is still live on dareful.app, on the build before this one.

### Exercised

- **The memory it leaves.** Yesterday's settled question with two photos ("Does the Running row show up on Now once you're in?") opened as the memory view: "Fri, Sep 25" where the clock was, the frame at 260 with "1 / 2", the outcome "Yes." with the claim's line and "Claude was closest, at 70%.", the call line, "Nothing changed hands.", and "The rest of that day" (it closed at 10:34am) with five rows: an argument ("Ruled for Claude."), an expired question ("Never settled."), and three covers; the sheet read "Add yours from last night" over "Send how it ended". Closest first was gone.
- **The empty slot.** A question settled six days ago with no photos showed the dashed slot labelled "Add the first photo from Sunday" where the frame would be, no frame, and the sheet's chalk "Add a photo from Sunday" over "Send how it ended".
- **The far-off block.** On the open shirts question (most likely answer 10, limit 1,000): Change, 2,400, Save: the field's ring turned to ink and the line read "2,400 shirts is past the limit here. Try something under 1,000."; the entry stayed at 14; at 24 the line and the ring were gone and Save read "Save: 24 shirts, $10". The Save under the block was still enabled on the first try (the changing state has its own primary); fixed and re-read.
- **A claim with two photos, and the frame after.** With the shirts question locked by hand: 14 in the field, a line, and two drawn photos through "Add a photo or a screenshot", each a 44px square with its remove control before sending; "It was 14 shirts" stored the line and both, and the proposal read them ("The app leans 14 shirts, 80 to 20." with a rationale that judged the images by what they showed); the raised sheet listed both under "You" with the attach row for anyone voting, and "You added a note" while the vote was not cast. Settled by hand with that vote in, the settled screen led with the two clips ("Photo 1 of 2, added by Claude", the strip and the counter), the sentence "14 shirts, 14, then the fifteenth tore. Two photos from the couch.", "You were closest, dead on.", the ruler, "Closest first", "Who's got who" ("Nothing changes hands."), and the sheet "Add yours from tonight" over "Send how it ended"; the result tile rendered. The question was put back as it was afterward.
- **Outcome words on a new question.** The ask flow on localhost wrote "Does Gabe fall asleep during the movie on Friday?" with its terms, and the draft's row carried the four phrasings from the real write-up: "He fell asleep", "He stayed awake", "Gabe fell asleep during the movie.", "Gabe stayed awake the whole movie." (the draft was removed afterward). The settled line, the wells and the claim card read them on the page fixtures ("Priya says the kettle boiled dry", "It boiled dry.").
- **Now as rows, the claimant as rows, the ask flow within budget.** The type budget passes on all eighteen screens with the baseline file empty: Now at 13, 15, 17 and serif 17 (the settled cover "Cab home" as a row under Just happened with its settled mark), the claimant at 13, 15, 17 and serif 40 with its gone states counted on their own, the ask flow at four sizes with one serif.

### What broke

- **The far-off block left the changing state's Save enabled**: the sheet has a second primary for Change, and only the entering one was wired to the block. Found in the real session; fixed and re-read.
- **Two older page tests failed on the group count** once the new fixtures put a third member into the older fixtures' group; the ended-state markets now live in a set of their own. Two composite assertions had no messages, so the failing clause could not be read from the report; each clause now says what it checks.
- **A lowercase rule that ate names.** The first cut of the phrase after a name lowered any capital before a lowercase letter, which the real write-up ("Gabe fell asleep") would have turned into "Priya says gabe fell asleep". It now lowers only a pronoun or a function word.
- **The record behind More is not in the served HTML**, because More is a modal that renders nothing until opened; the page test asserts a voter's screenshot is out of the frame and the database test asserts it is on the record.

### What needs a phone, a second person, or the deploy

1. **A photo attached while saying what happened, seen on the ballot by the other account before they vote**: after the deploy, on a question both are in and one has locked, "What happened?" with "Add a photo or a screenshot" from the library on one phone, "Say it" and the vote; on the other phone expect the claim card with the 72px clip and the raised sheet's attached square with the claimant's first name, within six seconds of the poll, before voting.
2. **After settling, that photo leading the frame** on both phones, credited to the claimant, with "Add yours from tonight" as the chalk for both and "Send how it ended" under it.
3. **A settled question with no photos** on production: the dashed slot as the move for anyone who was in, sending still available; a group member who wasn't in sees no slot and "Send how it ended" alone.
4. **A photo added to a voided market** (vote "Nobody can tell" on both phones): "Nobody could tell." with "Nothing changes hands.", the slot, "Add a photo from tonight" with no tile to send.
5. **The settled screen on a new market with outcome words**: ask a yes-or-no question on production, lock, say it from a well in the market's words ("Say it: he fell asleep"), the other account "That's right, he fell asleep", and expect the settled line in those words with closest first and who's got who under the frame.
6. **A far-off number refused with the limit named**: on a number question with a most likely answer of 10, type 2,400 and Save; expect the line under the field and Save dead until a number under 1,000 is typed.
7. **The next day**, open a settled question with photos and expect the memory view: the date in the band, the frame at 260 first, no ranking, and "The rest of that night" when other events shared it.

## Session 13: a pick-one question in the real localhost session, and the chain

**When:** September 26, 2026, the categorical phase, on localhost against the production database and the real chain. **Who:** the author's test account on localhost (signed in by the author), with the other account's session on dareful.app still live on the deployed build, which has no pick-one questions until this is deployed. Before anything was built the deployed contract was asked, by read-only call, whether it takes a confidence of exactly 10000 and how it scores it: it does, a right one-hot pick scores 10000 and a wrong one 0 on two through six answers, and it refuses 10001 and a pick or an outcome past the last answer. Then the gas survey sent a real `create` with five picks at 10000, which the contract accepted (the figures are in `gas.ts`).

### Exercised

- **On the chain, by the harness** (`tests/db/pick-one.test.ts`, real signatures from temporary keys): the worked example, five people on "Who falls asleep first?" with unequal stakes, one atomic `create` carrying every pick at 10000 (the chain's `positionsOf` read back `0@10000 2@10000 0@10000 4@10000 1@10000`), Gabe's vote for himself landing as a dissent, the third vote for John settling it, six minted edges matching the hand figures to the cent (125, 125, 125, 250, 187, 225), nets +375, -375, +662, -312, -350; then a two-person question both picked right, `Resolved` on the contract with the outcome recorded, no edges, nets of zero and the asker's clean rate 1 of 1. `verify-envio` recomputed the three pick-one markets the indexer knew from the chain's positions, confidence and count of answers: 0 mismatches, and it names the ties.
- **Asking, in the real session.** "Pick one" as the third chip on the question step; the answers editor with two rows to start, "John" and "Nobody" typed, and the other account added as a person answer from "Add a person" (its avatar then at 0.35 opacity, "Claude, already an answer"); "Add You as an answer" offered last. Next: who's in, the set "Claude and you", Set the terms: the real write-up came back as "Who falls asleep first on movie night?" with terms naming both John and Claude and ending "If it happens some other way that doesn't match these options, this one can't be settled." Looks right, and the draft screen's sheet read "Pick one" over John, Nobody and Claude (with the avatar), the stake chips and a disabled "Pick an answer".
- **Entering, for real.** Tapping John made the primary "Looks right. I'm in: John, $10"; the tap signed `Create` and `Enter` (the entry carrying 10000 as its confidence) through the account's own keys, and the screen came back with "You're in: John", "$10 · yours to change until 10:54pm", "Where the stake sits" with John's bar at 100% in the market's ink under a fill in the person's hue behind the 2px gap, the avatar on that row, empty tracks under Nobody and Claude, and the sheet on "Send it to the chat".
- **Changing.** Change raised the rows with "Save: John, $10" beside "Never mind"; tapping Nobody moved the person's stake on the bars before anything was saved (John's bar to 0%, Nobody's to 100% in the hue) and the primary read "Save: Nobody, $10"; Save re-signed and the entry line read "You're in: Nobody".
- **Locked, by hand** (the second person is on the deployed build, so the question was locked in the database): "$10 · Locked at 2:45pm", "Where everyone landed", the roll of picks "You · Nobody · $10", and the sheet "When it's clear, say what happened." with John, Nobody and Claude as wells, "Nobody can tell", the line and the attach row under them. Tapping John and typing a line made the chalk "Say it: John"; it saved the line, the proposal ran against the answers, and the modal opened on "You're calling it / John." The vote itself was refused, as a hand-locked question must refuse it: the governance signature was made and the server answered "This one was locked before you joined the group, so it isn't yours to call.", since the chain holds no quorum for it.
- **Voting, with the vote inserted by hand**: the claim card "You say John" over the line, and the sheet "You said John" with "1 of 2 says John. One more and it settles." and Change; Change raised "What did you see?" with Nobody and Claude as rows, the dashed "I couldn't tell" and "Never mind".
- **Settled, by hand** (John, with the person's pick on Nobody): "John, out twenty minutes in, snoring." over "Nobody called it."; the empty slot; "Everyone's pick" with John washed and capped at 0% and no pickers, Nobody with the person's avatar at 100%, Claude at 0%; "Who's got who" reading "Nothing changes hands."; the sheet "Add a photo from tonight" over "Send how it ended". The result tile rendered (200, image/png): "John." at 72px, the three rows with the called one washed and the pickers' avatars, and "Nobody called it." Now's Just happened carried the question with "John" under it. The question was removed afterward.
- **The page fixtures** (tests/http/pages.test.ts): the rows in the sheet for someone not in, "You're in: John" for someone who is, a person answer reading "You" to that person and by name to everyone else, no shares under three entries, a blind question sending no bars, the wells and the count line "1 of 3 says Dev. One more and it settles.", the settled screen with the wash and no "Closest first", and both tiles with no share.

### What broke

- **A word answer lost its capital.** The chalk read "Say it: john": the rule for a word answer lowered every first letter, and an answer typed as a name is words too. It now uses the outcome words' rule, lowering only a pronoun or a function word ("A field goal" to "a field goal", "Nobody" to "nobody", "John" unchanged). Found in the real session, fixed and re-read on the open page.
- **The viewer's avatar read "Y".** Where the words say "You" the avatar took its initial from that word; the avatar now keeps the person's own name everywhere the words say You. Fixed and re-read.
- **A null in a uuid array reads back as the string "NULL".** The column holds a real null where an answer is words (asserted through SQL), but the driver hands the page the string, which reached a user lookup and broke every pick-one page with a 500 until `answersOf` counted only a well-formed id as a person.
- **A locked fixture lit the citron dot** on the asker's Now in an older test, because a locked question with a clock waits on everyone in its set who has not called it; the fixture now lives in a set the asker is not in.
- **The pooler timed out twice** (`CONNECT_TIMEOUT` on port 6543) during the gas survey and a page test run; both passed on a retry and nothing about this round touches the connection.

### What needs people, a phone, or the deploy

1. **A pick-one question with four or five people choosing different answers**, on production after the deploy: ask one in a set of four or five, each picks a different answer with unequal stakes, the asker locks, one person says what happened, the others confirm with one dissent picking another answer; expect the settled screen's "Everyone's pick" with the called row washed, "Who's got who" matching the worked example's shape (the wrong picks paying the right ones, capped by the smaller stake), and the notice "Decided." on the phones that had not voted. Check the transfers against `verify-envio`, which prints the market.
2. **A question everyone called** (all pick the same answer, and it happens): expect "Nothing changes hands.", the outcome still recorded, and no toll on the asker's record (`cleanResolution` counts it clean).
3. **A blind pick-one question**: on the phones of two people who are in, expect outlined tracks with only their own pick capped in their hue, the lock chip and the count, and nothing of the other's pick until the asker locks; then the bars.
4. **"I couldn't tell" voiding one**: from "Not how I saw it", the dashed row on two phones; expect "Nobody could tell." with "Nothing changes hands." and the void counted against the asker.
5. **Voting from a phone**: the wells two across at 48px with 24px avatars, the count line, "That's right, Priya", and the raised "What did you see?" list; the modal's "Say it: Priya".
6. **The link tile in a chat**: the asking tile with the answers as rows (a person's avatar on a person answer) and the close time under them, then the result tile after settling, with no share on either.

## Session 14: a photo while a question is open, in the real localhost session

**When:** September 26, 2026, the open-window photo (docs/design.md 3.39), on localhost against the production database and the real bucket. **Who:** the author's test account on localhost (signed in by the author); the other account's session on dareful.app is still live, on the deployed build, which has none of this until it is deployed. The development pane has no camera and no share sheet, so the photo was drawn by the browser and handed to the camera input, and saving took the browser's own file path; both are noted below as needing a phone.

### Exercised

- **The camera, only once you're in.** On the open shirts question (the account in at 14 shirts) the "Get people in" sheet carried the 56px camera at the end of the "Send it to the chat" row (radius 10, a 1px line, no fill, named "Take a photo"), and its input opened the camera itself: `capture="environment"`, one file at a time. The page fixtures confirm someone not yet in gets no camera and no input anywhere on the open screen.
- **Taking one.** A drawn photo through that input: the row "Yours from tonight" appeared under the participant stack at once with the square at 0.88 and the runner along its bottom edge, the camera's own runner ran, and three seconds later the stored square (60px, "Open your photo 1") stood in its place with the caption "Everyone sees these once it's over." The first cut let the square blink out between the upload finishing and the screen re-reading; the preview now stays until the stored copy is on the screen, and the second photo showed no gap.
- **Only you, at the door.** The page fixtures put nia's photo on an open question nia and the friend are both in: nia's page carried the row and the square, the friend's page carried the camera and nothing of nia's photo, and `/api/media/<id>` answered the friend and a stranger 404 and nia 302 to a signed URL. The database test does the same with the other participant and a group member, finds the photo in nobody's frame and not in what the model reads, ends the question by hand and finds it in the frame for both.
- **Full screen, saved, removed.** Tapping the square opened the photo full screen on the ground (the 640 by 480 frame, "Close", "Save to your phone", "Remove"). Save fetched the bytes through the door and, with no share sheet in the pane, handed the browser a file to save ("dareful-….jpg"), with no problem line. Remove asked once ("Remove this photo?", "Remove", "Keep it"); confirming closed the view, the row was gone, and the door answered 404 for that id from then on.

### What broke

- **The square blinked.** Between the upload finishing and the router's re-read the queued preview was dropped before the stored copy rendered, so the row vanished for a frame. A landed photo now keeps its preview until the screen shows the stored copy, and the row drops it then.
- **Two fixtures found the shared group too small.** The window fixture in the asker's two-person set put everyone in, which lit the asker's Now with a lock row and failed the older Now test; the fixture moved to a set of three (nia, the friend and a third person). The sticker test's market shared a set with the other fixtures and lost its ink to balance whenever another open question in the set hashed to Sea (a one-in-four chance each run, and this run took it); it now asks in a set of its own.
- **The claim's clip left the pre-end frame.** The first cut emptied the frame before the end, memories and evidence alike, which broke the older test that the claimant's clip leads the frame while voting; the rule now holds back the memories only, since evidence is everyone's from the moment it lands.

### What needs a phone or a second person

1. **The camera on an iPhone**: open a question you are in, tap the camera beside "Send it to the chat", expect the camera (not the library) to open, take one, and expect the square with the runner and then the stored square under "Yours from tonight"; nothing about it in any notice.
2. **"Save to your phone" through the share sheet**: tap the square, tap Save, expect the iOS share sheet with "Save Image", and the photo in Photos afterward; the photo the camera took is not in Photos until this is done, which is the point of the button.
3. **The other participant, before the end**, on two phones or from the second account: expect no camera unless they are in, the camera and no photo of yours if they are, and nothing of yours on their screen, in the frame or through the link, until the question ends; then the photo in the frame after the claim's clip, credited to you.
4. **Remove from the frame** after the end: open a settled question with a photo of yours, tap the frame, expect "Remove" for your own memory and only "Save to your phone" for someone else's; remove one and expect it gone for everyone.
5. **Lock with a photo going up**: take a photo and lock the question within the same seconds; expect the photo to land as a memory (in the frame once it ends), not as evidence, and the camera gone from the locked screen.

## Session 15: What's on underneath its screens, on the chain and in the real localhost session

**When:** September 26, 2026, the public-markets round, on localhost against the production database and the real chain. **Who:** the author's test account on localhost (signed in by the author); the other account's session on dareful.app is still live, on the deployed build, which has none of this until it is deployed. **Checked first:** the deployed contract, by read-only call and now as a permanent test beside the other cross-checks, refuses a yes-or-no outcome above 1 (`BadOutcome`) in scoring, in `resolve` and in `arbitrate`, so a tie cannot resolve to the middle on this contract; a football tie voids with no toll until the redeploy, and the middle is on the redeploy list. **Checked next**, with the real key and the real feeds, before anything rested on them (`tests/fixtures/sports`, recorded by `scripts/dev/record-sports.ts`): the scoreboard's `completed` flag, its string scores, `timeValid` and `playByPlayAvailable`, on a final, a scheduled slate, an empty day and today's baseball, which the recording caught with three games in progress and a rain delay; and the second source's free tier, which returns finals for football, baseball and basketball and refuses hockey with a 401.

### Exercised

- **On the chain, by the harness** (`tests/db/sports.test.ts`): three questions from a recorded game's templates, locked on the real chain with the close signed a minute ahead and waited out; the final placed a day and a bit back; then the three endings in turn. Both sources agreeing settled the who-wins question through `arbitrate` as `feed`, with the ruling "Decided by the final score, as the terms said." and the score, every position scored and settled, the asker's clean rate at 1 of 1, and the notice after claimed once for each person and refused a second time. Two different finals voided the margin question, its ruling naming the conflict, and the clean rate unmoved. With no second source the total waited at a day and settled on the scoreboard alone at three days, once its final had stood its re-read. Asked by hand by someone in it, the tiebreaker refused a question the score decides.
- **The finals and the proposal** (the same file): a market on a game the recording caught in progress read as no result whatever the scores said; the recorded final put the score's answer on all three locked questions (who wins as the home side's chance, the margin signed and shifted, the total); a corrected score moved the two it changed and restarted the game's clock; a re-read that matched confirmed it, and it was not read again. The final score's warning went once on each question nineteen hours after the final and never a second time, and the model was never asked.
- **The warning on ordinary questions** (`tests/db/settle.test.ts`): the tiebreaker's, nineteen hours after due and locked; the void rule's, five hours before its deadline and not at seven; each once.
- **The schedule, for real:** `scripts/dev/whats-on.ts nfl` read fifteen football games for the next days into the database with three questions each (the first drive nowhere, since the scoreboard reports play-by-play for no upcoming game), among them tomorrow's Titans at Giants.
- **Asking from a public question, in the real session:** `/m/new?template=<id>` for "Who wins, Titans or Giants?" opened on who's in with "From What's on · Titans at Giants" over the question and no question step; "Set the terms" showed the written rows in ink-2 with no field ("Yes if the Giants win, no if the Titans win, on the final score, overtime included. If it ends in a tie, this one is called off…", "If nobody votes, the final score decides.", "Closes: When the game starts, tomorrow at 1pm"), no tiebreaker chips and no close chips, the caption "What's on wrote the wording, so everyone reads the same terms.", and "Send it". The draft's screen carried the odds line with "Titans" and "Giants" at its ends, the details with "Question from: What's on, Titans at Giants", "Decided: By the final score, once the game is over" and "If it's unclear: If nobody votes, the final score decides.", and nothing that says spread or official. Setting the slider to 65 made the primary "Looks right. I'm in at 65%, $10"; the tap signed `Create` and `Enter` through the account's own keys and the screen came back with "You're in at 65%", the camera beside sending, and "Where the stake sits".
- **The signed margin, in the real session:** the same flow for "Titans at Giants: by how much?", whose written rows carried "Scored on: Off by 28 points or more scores nothing. Closer scores more."; the draft's sheet showed the side chooser ("Titans by", "Level", "Giants by") over the number field with "Pick a side first, or Level for a tie."; "Giants by" and 3 made the primary "Looks right. I'm in at Giants by 3, $10"; signed, the entry line read "You're in at Giants by 3" with the axis labelled "+2", "+3", "Giants by 4", and the stored figure (17) appeared nowhere. Both questions were removed afterward.
- **The page fixtures** (tests/http/pages.test.ts): the two sides at the odds line's ends in the right order, the margin's entry line in the sides' words and never the stored figure, the template's scale shown, the extra details row, the ask flow starting at who's in; the source card where the claim card stands ("From the final score", the two rows, "The terms said the final score decides."), no "says", the sheet's header naming the score and the chalk confirming it in the market's own words, no "Can't agree?"; and the final score's ruling on a settled screen.

### What broke

- **"The Giants's points."** The margin's terms took a possessive of the team's name, which is mostly plural. Found on the written rows in the real session; the wording now reads "Points for the Giants minus points for the Titans", and the unit test holds it.
- **The close is signed into the chain.** The first chain test moved the market's close into the past in the database after locking, and the contract answered "not yet due" from the copy it holds; the test now signs a close under a minute ahead and waits it out.
- **A refusal read as a page.** The second source's 401 body parsed as a page with no games until the page schema required its array; the same for a scoreboard's error answer, which now reads as a feed error rather than a day with no games.
- **New fixtures moved older rows.** Questions from a game two hours off sorted above the Now test's row and a locked one put a vote on the friend's Now; the asker's two now close in five days and the ballot and the settled screen live in a set of nia and rae.
- **Two mutants survived weak assertions.** Removing the kickoff check still passed, because the draft's own past-close refusal answered with the same code; the test now expects the game's refusal in its own words. A settled screen crediting the model still passed, because the ruling's own text carries the same sentence as the heading; the test now reads the heading itself. Both killed after.

### What needs a real game to finish, a phone, or a second person

The items are in the single checklist below (22 through 29): the warning and the notice by push and by email; a question from What's on asked on one phone and entered on another; a who-wins and a signed-margin question settled by a real final the feed proposed and the group confirmed; "Say it yourself" when the feed is late; the backstop at each of its three endings, exercised by hand; a game in progress settling nothing; and a tie, if football produces one.

## Session 16: What's on and the game page, in the real localhost session

**When:** September 26, 2026, the phase that built the held screens (docs/design.md 3.32, 3.33, 3.35, 3.40, 4.7, 4.10, the tenth design session), on localhost against the production database and the real chain. **Who:** the author's test account on localhost (signed in by the author); the other account's session on dareful.app is still live, on the deployed build, which has none of this until it is deployed. **Checked first:** the tenth session's files replaced the ninth's whole, since nothing had amended `design.md` since the last swap; the summary the first drive is read from was recorded from the Packers game (`tests/fixtures/sports/espn-nfl-summary-final.json`, 21 drives, the first an interception) and from a scheduled game (`espn-nfl-summary-scheduled.json`, no drives at all), before anything was built on either.

### Exercised

- **What's on, the tab, with the real schedule:** `/on` on the fourth tab bar (Now, What's on, People, You) listed the real games ahead by day, "Saturday, Sep 26" through "Wednesday, Sep 30", hockey and football, one row per game with the two 28px stamps in the teams' colours ("CBJ" and "DET", "TEN" light blue with graphite letters and "NYG" navy with cream), the game in body 600 and "Sun 1pm" under it, no Most asked (nothing near ten groups), no count, no percentage and nothing anyone picked. A game that has started leaves the list (the page fixture has one).
- **Starting a game, in the real session:** tapping "Titans at Giants" opened the start: the header band with the two 44px stamps, "Sun 1pm", the game in serif and "Everything closes at kickoff."; "What to ask" with the four rows (Who wins ticked as the page opened, then By how much ticked by hand; Total points; The first drive, since the re-synced row carries the regular season); "Your friends see only the ones you pick." and "Next: who's in". Who's in showed the header's caption become the chosen set's avatars and "Claude and you", the saved sets, the naming prompt for a set on its second question, "Someone else" and "Whoever I send it to", and "Set the terms" over "You can add anyone else right up until kickoff." The terms step: each chosen question in body 600 after its glyph over its written rows in ink-2 ("Counts if", "If it's a tie: It's void.", "If it's unclear: The final score. If the two results we check disagree, it's void.", "Closes: At kickoff, Sun 1pm"), one Stakes card "for all 2", "What's on wrote the wording, so everyone reads the same terms.", the consent line "If nobody votes, the final score settles it." after the ticket glyph directly above "Send it". "Send it" made the two markets and signed the two `Create`s through the account's own keys (a few seconds), and landed on the game page: "You asked Claude and you. Everything closes at kickoff.", "Questions" with the two cards ("Closes at kickoff · 0 of 2 in", each with the 20px stamps and the 6px line under it), "Add another" with Total points and The first drive as dashed rows, "Send it to the chat" with Copy, and More in the top bar.
- **Who wins, on the line between the two teams:** the card opened the ordinary market screen with "Part of Titans at Giants" under the band (the two 20px stamps and a chevron), "Who wins?" with "Slide to pick a side", the two stamps at 39px, "Titans", "Even" and "Giants" under the line, the consent line above "Slide to pick a side". At 65 the pill read "Giants 65%", the band "Leaning Giants", the stamps 33px and 45px, and the primary "I'm in: Giants 65%, $10"; the tap signed `Enter` through the account's keys and the screen came back with "You're in at Giants 65%" and the weight line labelled Titans, Even, Giants.
- **The margin, on the same line:** "By how much?" with the pill at "Giants by 3" once the slider sat at 3 (the native range from −35 to 35, one step a point), "Titans by 35+", "Tie" and "Giants by 35+" under it, "Any margin. Tap the number to type one."; "I'm in: Giants by 3, $10" signed and the entry line read "You're in at Giants by 3" with the axis "Titans by 3 · Tie · Giants by 3", centred on a tie, and the stored figure (17) nowhere on the screen.
- **Back on the game page** the cards read "You're in at Giants 65% · 1 of 2 in" and "You're in at Giants by 3 · 1 of 2 in" with the dot in the person's hue on each line, and Now carried the game as one row under Running, "Titans at Giants" with "2 questions", never one row per question. Both questions were removed afterward.
- **On the chain, by the harness** (`tests/db/sports.test.ts`): four questions from a recorded game's templates locked on the real chain; the score's three endings as before, each now writing its ending on the row; then the first drive: a summary with no play-by-play read as nothing, the Packers game's first drive proposed as a turnover, refused at three days until read again unchanged, then settled on the play-by-play alone as `feed` with the ending `drive`, counted clean. Starting a game made two drafts closing at kickoff in the menu's order and refused a question already running. The warning on a question the score answers asked the second source once and kept its answer on the row.
- **The tick's warning** (`tests/db/settle.test.ts`): once, six hours before the moment the tiebreaker or the void rule acts, naming that moment, in a zone chosen so the seven-hours-off case is daytime; never a second.
- **The page fixtures** (tests/http/pages.test.ts): the tab with the game row and no belief on it, the game page's cards with no number for someone not in and the person's own entry for someone in, the start with Who wins ticked for someone on it with nobody, adding one as the terms step alone, a pasted link signed out saying nothing about who is on it; the night with the final score as the title, the settled cards' lines and the photo move; Now's one row and the timeline's one story for a game with two questions; the consent line, the tie row, the team ends and the Part-of row on the market screen; the source card's stamps and the chalk "That's right, the Giants won"; the ending's line on the settled screen.

### What broke

- **The warning never reached a question locked yesterday.** The query's reach used the three-day window for every branch, so a question whose tiebreaker acts in five hours was not a candidate; caught by the settle test, and the reach is now the tiebreaker's own day.
- **A fixture drafted from a game that had started** was refused by the template's own rule; the night's questions are now drafted while the game is ahead and moved back with the game.
- **A timeline with two games on it counted two stories** and the test read that as one game twice; the assertion now counts the one game.
- **The margin's tie row** on the terms step was one the doc does not draw (3.38 gives "If it's a tie" to who wins alone); removed after the real session showed it.
- **The first drive was missing from the real game's menu** until the schedule was re-synced with the new code, which writes the season on the row; the deployed tick will do the same on its next read.

### What needs a real game to finish, a phone, or a second person

The items are in the single checklist below (30 through 40).

## Session 17: the delegation gate's first check, the chain suite's failure, and the consent line

**When:** September 27, 2026, the start of the delegation phase. **Who:** nobody in a real session yet: the browser's two sessions did not survive the previous session's end, and the gate's last three checks need the owner's console first. **Checked first:** what the chain suite actually hit last session, from the feed table and the Postgres log (docs/decisions.md 2026-09-27), before anything about the relayer was touched.

### Exercised

- **The chain suite's failure, run down to its cause:** the sports suite's game row was deleted by the settle suite's cleanup from a sibling process between two inserts (the foreign-key violation in the Postgres log at 23:22:19 UTC on September 26). Not the relayer. The fixture now removes only its own run's games; a test plants another run's game beside its own and expects it untouched. The settle and sports suites are run together again below.
- **The relayer's lock:** two senders against the real database, the second starting only after the first finished; the nonce retry on a fake sender.
- **The consent line on a game:** the three cases by rule; the mixed line is reachable only client-side on the terms step with two kinds chosen, so it is on the phone list below.
- **The gate's first check, from Dynamic's read-only API** (the users endpoint, wallet properties only, never a share). The baseline for check 3, to compare after the ledger wallet is delegated: the governance wallet's values must be exactly these.

  | Account | Wallet | Credential | Share set | Key share | Keygen |
  | --- | --- | --- | --- | --- | --- |
  | Claude Code (dareful.app) | ledger 0xf067…4504 | 6dabcc6f-0abd-4b75-8835-f98871769a1f | a6f74204-5e40-4496-9eaf-c665548bdc39 | 32fdcaca-f887-4314-8973-cff9e6d3c2a8 | Ft6th71NPnqisResiuvNPacXuBTy4DfP5TTkzoLRxQkZ |
  | Claude Code (dareful.app) | governance 0x274d…44b1 | f28f7804-8432-4afa-beb8-cd89b9d3a2a8 | e9882bad-2a48-460f-ac6d-0f0a6eff77f2 | 89b1816c-e285-4ed9-b6a5-d517d4c4e27e | Baec4dHQZkjaxkZUpqkcegtt4EU6RaX6vARnPfsTsRWP |
  | Claude Code (localhost) | ledger 0x716a…de15 | 7db99238-b772-43f3-b293-b2ca08b4724a | 7dbbd874-a518-4af9-b900-dc431a157727 | 94676d76-1a7e-4e42-b3b4-22a1bec7dc68 | 6abKXQtBDmtYvNn92eiwGQjv8rkSjqVKoZ4gtqZ2w1oF |
  | Claude Code (localhost) | governance 0x9c9a…dc7d | c4360b7c-139b-4530-9003-d4c1e0e99d8c | 962198bc-bf1b-46e8-bec7-39d61784bfb5 | 314140da-0613-4064-8539-1918dcdb4f6f | FBFJFrnkHXTq2EgAxxaJ6rj4N9qPjtEwLikj4WbD2D8K |

  Every wallet: `TWO_OF_TWO`, share set type `rootUser`, derivation path `m/44'/60'/0'/0/0`, no other share sets. Four wallets, four keygen ids.
- **The instrument, by the harness:** the webhook's signature over its bytes, the envelope Dynamic's own decrypt opens, the store sealed and bound to its row, the governance wallet refused before decrypting and by the database, replays and stale events, revocation wiping the material, the signer refusing the governance address before any lookup and degrading to a prompt (tests/unit/delegation.test.ts, tests/db/delegation.test.ts).

### What broke

- **The fixture's cleanup took every run's games**, not its own (above).
- **The relayer had nothing keeping two senders apart** on the nonce; found by inspection, not by the failure, and fixed with a lock and a retry.
- **The game's terms step read badly with two kinds chosen** ("and the play-by-play the first drive"); one rule now writes the line.

- **The gate's second check, first run, in the real localhost session** (later the same day): with the console set up and the door deployed, "Turn on for the ledger wallet" on `/dev/delegation` ran Dynamic's reshare with no Dynamic sheet on screen and the SDK reported ledger delegated, governance pending. Dynamic delivered the created event to production three times and got 400 each time: the real event carries the user id inside `data` and null at the top, where the documentation's example had it at the top. Fixed (the shape is recorded, `tests/fixtures/dynamic/delegation-created.json`); the fresh delivery needs the deploy. The tab's cached SDK settings had to be refreshed by hand before the SDK believed delegated access was on.

- **The gate's second check, second run, in the real localhost session** (later still): with the corrected door deployed, delegation was turned off (Dynamic's revocation reshare, no sheet, the event delivered and ignored as there was no row) and on again (no sheet; the SDK reported ledger delegated, governance pending). The fresh created event passed the door's shape and signature and stopped at the private key: production answered 500 three times, and a signed probe with junk envelopes named it, "no delegation private key configured". Dynamic's record meanwhile shows the ledger wallet with a delegated share set and the governance wallet exactly at its baseline (check 3's comparison, from Dynamic's side).
- **A send is never lost, on the real chain:** the close, net, lock, resolve and void suites ran through the new signing path (the relayer signing locally, the hash known before the broadcast), seventeen transactions, every one recorded in `chain_writes` as mined and completed in its own request; the reconciler's rules ran against the real table with the receipt read, the re-broadcast and the alert injected.

### What needs the owner, a phone or a second person

The gate's check 2 needs `DYNAMIC_DELEGATION_PRIVATE_KEY` readable in Vercel's production environment (the value that works here: the PEM, or its base64 on one line) and a redeploy, then one more off and on from `/dev/delegation` in the localhost session; checks 3 and 4 follow from `scripts/dev/delegation-gate.ts` once the row is stored. The rest of the phase is not built until they pass. The phone checks are in the single checklist (41 to 47).

## Session 18: the gate's third run, the failed-send row, and the governance wallet marked denied

**When:** September 27, 2026, later still. **Who:** the localhost test account in the real localhost session; nobody on a phone. **Checked first:** the gate, before anything was built.

### Exercised

- **The gate, checks 2 to 4, in the real localhost session:** delegation turned off and on again from `/dev/delegation` (no Dynamic sheet either time); Dynamic delivered the revocation (200, ignored) and the fresh created event (200 on the first delivery), and the row for the ledger wallet was stored with Dynamic's delegated share set id. `scripts/dev/delegation-gate.ts` then: the governance address refused here before any lookup; the ledger wallet's delegation signing a check message that recovers to the ledger wallet (recorded in `delegated_signatures`); Dynamic refusing the governance wallet's id with the ledger wallet's materials; export refused at authentication (401) through the only path the SDK has; Dynamic's record with the ledger wallet delegated and the governance wallet at its session 17 baseline. Passed; the limit is in docs/decisions.md.
- **The governance wallet marked denied**, from the development page in the real session: the SDK's status went to denied, and Dynamic's record shows `hasDeniedDelegatedAccess: true` on the governance wallet and `false` on the ledger wallet, whose delegation stayed as it was.
- **The failed-send row on Now**, in the real session, with one dropped and told cancelling-out send planted for the account and removed after: "Cancelling out with Claude Code", the open ring in the viewer's hue, "Didn't go through last time", "Try again", in the needs-you list under the locks and drafts. The rest of the rule (a dropped confirm on the yep row and the yep screen, a dropped lock, a superseded, untold, setup, week-old or since-closed send left out) ran against the real table in tests/db/again.test.ts.
- **The tick finishing a resolution**, on the real chain (tests/db/finish.test.ts): a question locked on Monad, both votes stored without the last request resolving it, the tick leaving it alone while a planted send for it was pending, and resolving it from the signatures once that send was dropped.

### What broke

- **The database fixture could not remove a temporary person once a write named them** (the new foreign key): the fixture and the sweep now unhook the relayer's record from the person first, and the record stays.
- **The window mutant survived once**: the test had aged its old write by the constant it was testing. It ages it by a literal week and a day now.
- **The development page's hydration note** (the SDK's answers exist only on the client): suppressed on that line; the page is development's.

### What needs the owner, a phone or a second person

The creation-time mark on a fresh account (checklist 48), and a real dropped send, which cannot be caused on demand (49). The rest of the phase is not built; the table of what delegation would remove is in docs/decisions.md for the owner's decision.

## Session 19: the front door, in the real localhost session and at the loopback origin

**When:** September 27, 2026, after the gate. **Who:** the localhost test account signed in at `localhost:3000`, and a visitor with no session at `127.0.0.1:3000` in the same browser (the loopback origin keeps its own cookie jar; the dev server now allows it in development). Nobody on a phone. **Checked first:** whether entering without an account had ever been wired (it had not; docs/decisions.md 2026-09-27).

### Exercised

- **Arriving with no account** (docs/design.md 3.17), on the account's own open yes-or-no question: the wordmark, the band with the clock, "Claude asked", "One friend is in" over the stack, Decided, How it works, If it's unclear, "I have an account", and the sheet at rest with the line untouched and "Slide to pick your odds"; nothing about stakes, amounts, the terms, or anyone's name beyond the asker's.
- **Entering**: the line to 70% raised the sheet ("Probably", the name and number fields, the true caption, the stake chips), "Join at 70%, $10" with a name and a fictional 555 number put the entry in with no code and no sheet of anyone's: "One friend is in, and you", "You're in at 70%", "$10 · yours to change until 6:45pm", the weight line, and the line about signing in. The rows: one position on a ghost carrying the hash, acknowledged, entered by the asker; the ghost the asker's, with one token and a seat in the set.
- **Counted by someone else**: the asker's own screen at once showed the stack with the ghost, "2 of 2 in", "Lock it in with 2", and both at 70% on the weight line.
- **Changing it**: Change, the line to 20%, "Save: 20%, $10": "You're in at 20%", one position still, its value 2000.
- **A provisional lock, vote and settlement**: "Lock it in with 2" locked it with nothing sent to the chain (`onchain_id` null, threshold 1); "Where everyone landed" showed You 70% and Gabe (ghost check) 20%; Yes, "Say it: yes", the app's own sheet ("It's decided once 1 of you say the same thing"), "Call it yes"; the settled screen: "Yes.", closest first (off by 30, off by 80), and "Who's got who" with the ghost's $5.50 as a pending consequence. The rows: `resolved_by = 'provisional'`, one pending proposal from the ghost to the asker for 550 cents with `origin = 'dare'`, no obligation minted, scores 9100 and 3600, nets +550 and -550.
- **By the harness** (tests/db/ghost-entry.test.ts): the token and the phone number keeping one ghost across changes and browsers, the cap of ten, a locked question refusing, the provisional quorum and threshold over three account-holders, the six transfers of a four-person settlement with the ghost on its side and the nets summing to zero, the bind naming the account on the proposals and the position, a number question checking a ghost's number, an expiry with nothing on the chain, and a bound ghost's unsigned position signed by keeping it. The http suite's signed-out check was brought to the design (the asker's first name and the set's name, and no other name). The pages suite: 87 for 87 with 1 skipped after the first-name fix.

### What broke

- **The page rendered and never hydrated at the loopback origin**: Next.js 16 blocks dev resources from an origin other than localhost; `allowedDevOrigins` now names it (development only), and the dev server was restarted.
- **The avatars' accessible names carried full names** on the signed-out screen (the http suite caught "Raman"); first names now, as the only name on that screen is the asker's.
- **Three mutants were written with raw newlines** inside their strings and broke the audit file until rewritten.
- **Twelve database suites sending side by side failed three chain tests** with Monad's own words for a nonce collision ("An existing transaction had higher priority"), which the relayer's retry did not recognise (docs/decisions.md 2026-09-27). Recognised; the three suites pass together after it, and nothing was lost on the chain (a refused broadcast is dropped before anyone is told).

### What needs a phone or a second person

The owner's check as the brief states it: a market link opened on a real phone in a private tab, entered, counted on another account's phone, then signing in from that same tab and seeing the number become the account's (checklist 50 to 53). Phone-number binding in production (52) needs a number that later signs in with Dynamic, which nobody but the owner can do. The ghost "Gabe (ghost check)" and its settled question stay on the localhost account, as this session's evidence.

## Session 20: the bugs that needed no design, in the real localhost session

**When:** September 27, 2026, after the front-door check-in. **Who:** the localhost test account, and a session-less visitor at the loopback origin; nobody on a phone. **Checked first:** what each bug actually was, before touching it (docs/decisions.md 2026-09-27, "The bugs that needed no design").

### Exercised

- **Back from a new question**: the ask flow in careful mode from Start, "Looks right", the new question's screen, then the browser's own back: Now, not the flow.
- **The identity question**: the line "Does Nova refuse to come inside when it rains this week" in careful mode brought "Who's Nova?" with three chips from a real model call; "A pet" brought three questions about a pet (a sitter's, the vet's, coming in on her own) and terms written the same way; the earlier question about John ("Does John fall asleep during the movie") never asks. The recorded calls are the fixtures.
- **The album**: a settled question with two photos opened full screen at the first ("1 / 2"), the arrow key moved to the second ("2 / 2") with the controls following.
- **"I got this one" off the Start sheet**: Start lists asking, arguing and joining; the move at the foot of a person's page opens the cover form with that person chosen and nothing to pick (the http suite reads the same).
- **A set nobody named**: the cover form names it by its people; the http suite refuses the word Group on the form.
- **The share text**: "Send it to the chat" composes the question and the link and nothing else (the html carries no "put your number on it"; the notice body and the preview line lost it too).
- **The asker's Remove**: a ghost entered the new question from the loopback tab, the asker's screen listed them under "In without an account" with Remove, and removing took the number out of the count; the harness covers the rest (only the asker, never after lock, and the ghost entering again).
- **The Fold**: Now, People and a settled question at 725 by 604 and 874 by 787 render as on a phone, centred; nothing failed here.

### What broke

- **The settle suite failed once at the file level** when eight database suites ran side by side (its message was lost to the filter that kept only the verdicts); alone, and again with the same eight together, it passed. Not reproduced, recorded as seen. Twelve suites earlier in the day did reproduce a real relayer gap (session 19), so a repeat of this one gets the full output kept.
- The identity card's look is the existing question card and waits for the design session.

### What needs a phone, or the owner

The notification tap on iOS (55), the keyboard staying on a new answer (56), the band under the tab bar as an iOS 26.0 bug with 26.1 the fix (57), what fails on the unfolded Fold (58), lifting a subject in the installed app (59), and the judges' test account on the console (60).

## Session 21: the eleventh design session's looks, in the real localhost session

**When:** September 27, 2026, after the bugs round was committed. **Who:** the localhost test account against the other test account ("Claude Code"); nobody on a phone. **Checked first:** the four roots compared for the band (docs/decisions.md 2026-09-27, "The band under the tab bar is not the 26.0 bug"), the eleventh session's files swapped in, and the design's items read with their boards' cut list.

### Exercised

- **A market you asked, alone in it:** no sheet once in; the who's-in row with "Just you so far", share as the chalk circle, copy and the code to scan; the code sheet with the question, the 216px code and the six characters ("C 6 Q U 7 3"), closed with Escape; the photo slot last on the screen under the details, with "Everyone sees these once it's over."; the entry line and the weight line above the row.
- **Copy:** the first tap did nothing visible, because the development browser refuses a clipboard write to a page without focus and the fallback (`prompt()`) threw where the browser does not support it. Fixed to a read-only field of the link under the row; the second tap showed the field with the link. On a phone the write succeeds and the glyph becomes a check (item 62).
- **A draft:** the band with the dashed edge, "Not sent yet" after the dotted ring, "For Claude and you" after the people glyph, the entry's own sheet, and no paragraph.
- **A settled question:** the outcome, the empty slot, the call line, the who's-in row with share and copy (no code, since it ended), closest first; no sheet anywhere, and "Send how it ended" gone.
- **"I got this one" on a person's page:** the chalk at rest; raised, the units (Beer, Round, Coffee, Next time, $, Something else), "$" selected with "How much" and the amount field, then Beer with "How many" reading "1 beer", the token "Claude Code's got you a beer" on the selected row, "Nobody's paying it back" under it, and the primary "I got Claude a beer"; logged, the page re-read with the sheet lowered and the new "Covered" card in today with the proposed token. That cover is real and waits for the other account's yep.
- **The join screen:** "Got a code?", six boxes, the one caption, "Got a link instead?" with "Paste a link", Join in the sheet.
- **The named subject:** "Will Nova refuse to come inside when it rains this week" in careful mode brought "Who's Nova?" from a real model call; "A pet" brought three pet questions under the line "Nova is a pet" with Change; Change reopened the three choices, and "A person" brought three different questions (nothing survived the rewrite, so nothing was kept); the flow was left there, unsaved.
- **Now:** the Start button is a link to the question step named "Ask something"; "Measure the screen" at the bottom; the tab bar pinned at `--viewport-gap`, which is zero here.

### What broke

- The copy fallback, above.
- The cover sheet's token showed "$0.01" with "$" chosen and no amount typed; it now shows "The amount, once typed" until there is one.
- Three http expectations were the old design's (the caption before you're in, the Start button's name, the photos' place measured against the streamed payload rather than the text).

### What needs a phone

The band with the probe on both roots (61), the icons and the code sheet (62), photos while open (63), the pick-one sheet's bar (65), "I got this one" on the phone (66), the two marks (67, 68), the heads-up (69) and the named subject (70). The heads-up cannot be seen in the development browser: its permission is refused there, and the sheet asks nothing where a push is impossible.

## Session 22: Round A, the rulings and the rules half, in the real localhost session

**When:** September 27, 2026, after the looks were committed. **Who:** the localhost test account against the other test account ("Claude Code") and a session-less visitor at the loopback origin; nobody on a phone. **Checked first:** the owner's readings on the band (docs/decisions.md 2026-09-27, "Round A, the rulings"), then the four rulings and the rules half built to the eleventh session's 3.15, 3.17, 3.22, 3.31, 3.38 and 3.42, with migration 0030 applied before anything was built on it.

### Exercised

- **Now:** "Got a code?" on the date's line; every root's page at least a pixel taller than the large viewport and the bar pinned at zero (the desktop only proves it is a no-op there; the phone decides, item 61); the running row for a question the account alone is in wrapped for Remove and the finished ones for Archive, and a row someone else is in not wrapped.
- **The swipe, with a mouse:** the first drag became the browser's own drag of the link, and the second ended with the click a mouse drag sends, which the "tap while open closes it" rule caught and snapped the row shut before the square could be tapped; touch sends neither. Fixed (the link's drag prevented, the click that ends a drag ignored, no text selection while sliding), the row slid over the archive square, the tap opened "Archive this?" with "It leaves Now. You can still find it from the people in it.", and "Keep it" closed it. Removing a real question was not tried here: the sheet's "Remove it" ends the owner's market, and the database suite holds the rule.
- **Who's in:** on the owner's open question, "Just you so far" with share as the chalk and the stack a button; the sheet with one row, "Asked it".
- **The link page, session-less:** the name and number fields with no example text, "Join as Dani" once a name was typed, and joining without a number; the entry landed as this browser's existing ghost from an earlier session (the same browser is the same ghost, docs/decisions.md 2026-09-18), with the stone avatar and its dashed ring on the entry line, "$10 · yours to change until Oct 4", and "2 of you in".
- **Holdouts and the close, from the asker's side:** with the ghost in, "2 of you in" and the tertiary "Close it with 2"; who's in listed the ghost as "From the link, no account" with Remove; Remove asked inside the sheet ("Remove Gabe's entry? It comes out before anything is decided, and nothing changes hands."), "Remove it" took the entry out, the sheet closed and the count read "Just you so far" again.
- **The cover's notes:** on a person's page the raised sheet ends with "Optional", "What was it", and, once a unit other than "$" is picked, "What it cost" with "Only you see this."; no example text in either field.
- **The album:** the frame on an open question for the other participant and the group, the door serving the other participant, and the link page showing none, through the http and database suites (the pane cannot add a photo from a file).

### What broke

- The swipe with a mouse, above.
- The link page's "Is one of these you?" chips in the localhost session could not be reached: this browser already holds a ghost, so the name field is not shown to it; the suggestions and the number check are held by the database and http suites and by item 78.
- Four http expectations were the old blind rule's and the memory window's (the lock chip, "your own photos alone").

### What needs a phone

The band with the probe closed (61), the album on two phones (71), "Got a code?" (72), the cover's notes (73), the swipes (74), holdouts and the close (75), who's in (76), blind (77), the link page's names and the number check (78), entries at sign-in (79), stone everywhere (80).

## Session 23: Round B, part 0, in the real localhost session

**When:** September 27, 2026, after Round A's check-in was committed. **Who:** the localhost test account against the other test account ("Claude Code"); nobody on a phone. The Browser pane was hidden for this session, so taps were dispatched from the page's own script (a click on the real button; the real handlers and the real server actions ran); nothing was faked past the tap. **Checked first:** the owner's four rulings (docs/decisions.md 2026-09-27, "Round B, part 0"), 3.28's frames 1 to 3, 3.34 and the `YouEarly` board.

### Exercised

- **The count and the nudge:** on the account's own open question with one person asked and not in, "1 of 2 in" with the dashed avatar (not "Just you so far"), share the chalk, and under the row "Waiting on Claude." with "Nudge Claude". Who's in: the row "Asked it", then "Not in yet" with the other account and "Nudge Claude" beside them; the tap told them once ("No device of theirs takes messages from here", since the test account has no push and no email that takes it) and the row offered "Say it yourself", the relay. The suites hold the rest: one person per window, never the nudger, never someone done, the locked state's "Still to call it".
- **You, with real figures:** "In 11 markets since last week"; "Your picture draws at 10 resolved calls. 5 so far." over the frame with only the diagonal, and the five calls as rows ("You said 70% · it happened" with the question under each); "2 of the 3 questions you asked ended cleanly." with two marks and the caption naming the voided one and "One other expired, which counts against nobody."; Account with "Your units" ("Dollars"), "Your marks", "Your number" with its caption, and "Sign out"; "Measure the screen" under it. A fresh account's "Joined today" and "Nothing has resolved yet." are held by the http suite; the plot past ten calls by the unit tests (no account here has ten).
- **A sticker from a photo, end to end:** on a finished question with two photos, the full-screen view with "Make a sticker", "Save" (named "Save to your phone") and "Remove" as icon buttons with their words; "Make a sticker" raised the sheet over the photo with no scrim (the wrapper passes touches, the panel takes them), "Hold what you want, then tap Copy", "Then paste it here" and the chalk "Paste"; a cutout with alpha pasted as the page's paste event (a drawn disc, since the pane cannot reach the phone's Copy Subject) went through the real sticker action, and the viewer became "In your stickers" over the sticker on the field, with "Ask something with it" and "Done"; the link opened the question step with the sticker as its mark.
- **The game rows and the red square:** not exercised here (no game on this account's Now, and a real removal ends a market); held by the unit, database and http suites (a game's row removable only when nobody else is in any of its questions, several removed or archived all or nothing, the rows wrapped on Now) and by items 81 and 82.

### What broke

- Nothing in the build. The dev server's client manifest kept a reference to the deleted sign-out button until it was restarted, which is the pane's, not the app's.

### What needs a phone

The red square (81), a game swiping as one row (82), the count while alone (83), the nudge and the relay with a real notice arriving (84), a sticker from a real Copy Subject (85), You in each state on the installed app (86).

## Session 24: Round B, part 2, in the real localhost session

**When:** September 28, 2026, after part 0 was committed. **Who:** the localhost test account, whose Dynamic login this browser holds (the device state `ready`); nobody on a phone; the pane hidden, so taps were dispatched from the page's own script onto the real controls. **Checked first:** the owner's brief for part 2 and the amended 3.41 and 3.45; migrations 0031 and 0032 applied before anything was built on them.

### Exercised

- **The row on You:** "Pass the phone" between "Your number" and "Sign out", `body` 600 over "Get into a market from a friend's phone, with your PIN. Voting always asks.", the switch off and enabled on the phone that holds the login; no "One tap" anywhere and no "Skip this step next time?".
- **Turning it on, end to end:** the switch opened the sheet: "Pass the phone", "It allows" with "Getting into a market from a friend's phone, with your PIN.", "It never allows" with "Saying what happened, voting, settling, or calling it even.", "Turn it off any time, here.", "Your PIN" and "Again"; "Turn it on" stayed disabled until both PINs were typed; the tap ran the SDK's own delegation of the ledger wallet with no screen of Dynamic's, set the PIN, waited for the webhook, and the switch read on within nine seconds with the caption "On. Get into a market from a friend's phone, with your PIN. Voting always asks." The database then held one active delegation with a fresh event id and one `pass_the_phone` row with no failed tries.
- **Turning it off:** one tap on the switch; the switch read off at once, the sheet stayed closed; the database then held the delegation row with its material wiped and `revoked_at` set, and no `pass_the_phone` row.
- **A second device signing from the server** could not be exercised here: this browser holds the login, so the device signs, which is the rule. The database suite holds the server's path (the typed data rebuilt from the ids, the signature passing the action's own check, the refusals), and item 88 is the phone's.
- **The PIN's lockout and its notice** are held by the database suite (five wrong tries, the notice logged once naming the host); the phone check is item 89.

### What broke

- The `notification_log` check constraint refused a notice about neither a question nor an obligation except a netting; migration 0032 admits the PIN lockout too.
- The design audit (part 1) found a called-off market's band reading "Called off soon", since the closes label says "soon" of any past moment; fixed with a past-tense label ("Called off at 6:52pm", "Called off Sun at 6:52pm"), tested.
- The see-through sticker sheet from part 0 carried a drop shadow, which 1.5 admits nowhere; removed.

### What needs a phone

Pass the phone on and off (87), a second device signing from the server (88), wrong PINs locking with the owner told (89).

## Session 25: Round B, part 3, in the real localhost session

**When:** September 28, 2026, after part 2 was committed. **Who:** the localhost test account as the host, with the other test account ("Claude Code") asked and not in and without pass the phone; nobody on a phone; the pane hidden, so taps were dispatched from the page's own script onto the real controls. **Checked first:** 3.45's six steps and 3.17's shared steps, with migration 0033 applied before anything was built on it.

### Exercised

- **The fourth icon:** on the account's own open question, the who's-in row ends with four icons, "Share", "Copy the link", "Show a code to scan", "Pass the phone"; the first tap opened the explainer ("Pass the phone", "A friend who set this up on their own phone gets in here with their PIN. Nothing of theirs stays on yours.", "Hand it over", "Not now").
- **The friend's screen:** "Hand it over" replaced the screen with the hand-over page ("On Claude's phone" with the close, the band with the open mark and the question, the two facts, the entry sheet "Your number"); nothing of the host's own number anywhere on the page (the host's "14 shirts" absent, no weight line, no who's-in row).
- **The steps:** a number typed and "I'm in at 15 shirts, $10" raised "Who's joining?" with the summary on the right, "Pick yourself", and the other account at 0.45 and not tappable with "Not set up for this yet" (it has no pass the phone); "No account? Scan the code with your own phone" opened the code sheet.
- **The PIN, the entry and the handback** could not be exercised here: no second account in this browser has pass the phone on, and setting one's PIN needs its own phone. The database suite holds the order (the PIN first, then the friend's share signing the server-built entry, the host recorded, the notice once) and the refusals; the render test holds the PIN step's shape; items 90 to 92 are the phones'.
- **The link page's steps and the dead link:** held by the http suite ("Joining as … · Not you?" for a member not in, two facts, the code screen with its line signed in and out); item 93 is the phone's.

### What broke

- A render prop crossed the server-client boundary on the hand-over page (a function cannot); the entry stage's props travel as data now.
- The two steps lived beside an import of the SDK, which the render test could not load under Node; they have their own file.

### What needs a phone

Handing over on two phones (90), the friend's own phone (91), wrong PINs (92), the link page's steps (93).

## Session 26: Round C, in the real localhost session

**When:** September 28, 2026, after Round B's part 3 was committed. **Who:** the localhost test account; nobody on a phone; the pane hidden, so taps were dispatched from the page's own script onto the real controls. **Checked first:** the fourth group of the audit, sorted by direction (docs/decisions.md 2026-09-28, "Round C").

### Exercised

- **Now:** the three sections and nothing above or between them; one citron dot on the page, on the soonest needs-you row (the asker's two time's-up rows, the first dotted), none on the tab bar; the asker's verb "Close" beside "Time's up on this one"; the Running row reading "You’re in at 60% · just you so far" with no clock.
- **The ask flow:** the kind chips as a `radiogroup` with no caption under them; no example inside any field; "Optional" once; the picker opening on Food with its first cell reading "None" and no sticker caption.
- **Nothing to see:** an address the app has no screen for, and the old cover form's address, both answered the code screen with "That link doesn’t open anything. Ask for it again, or type the code they read you." and the boxes.
- **Cutting a sticker inside the app:** on a finished question's photo, "Make a sticker" opened the see-through sheet reading "Tap what to keep"; a tap at the photo's middle drew the dashed cream outline around the subject and armed "Keep it", with the instrument line reading "Model loaded in 0.1s · cut in 0.2s" (the runtime and the model were already in this browser's cache; the cut is on a 1080 by 810 photo, on the development machine); "Keep it" sent the cutout through the real sticker action, and the viewer became "In your stickers" with "Ask something with it" and "Done". The cold load, on a phone over its own network, is item 94's number to report.
- **Held by the suites, not the eyes:** the voting screen with the claim card under the band and no entry line, the asker line's words, the feed's ending as one line, the tile's comma, the who's-joining fallback (the database suite), the not-found and error pages' shapes (the http suite), the focus outlines (the classes; a focused window is a phone's or a laptop's to see).

### What broke

- The legacy interactive segmenter in `@mediapipe/tasks-vision` 1.0.1 refused the model given as bytes ("ExternalFile must specify at least one of file_content…") and fell back to the lift at once; the cached bytes now go in as a blob URL, and the model loads.
- The viewer reset the cut in an effect, which the hooks lint refuses; the cut is now read by the photo it belongs to and cleared in the handlers.
- The first check of "no dot on the tab" matched the whole document after the nav; it reads the nav element alone now.

### What needs a phone

Cutting a sticker on the phone with its timings (94), the lift as the fallback (95), the one dot and the Running row's words (96), a claim to accept as a row (97), the code screen for a dead address in the installed app (98), the focus outlines on a keyboard (99), the who's-joining fallback (100), the voting screen without the entry line (101).

## Session 27: Round C, part 2, in the real localhost session

**When:** September 28, 2026, after Round C was committed. **Who:** the localhost test account; nobody on a phone; the pane hidden, so taps were dispatched from the page's own script onto the real controls. **Checked first:** the owner's rulings on the additions (docs/decisions.md 2026-09-28, "Round C, part 2").

### Exercised

- **The ask flow:** "How people answer" in `label` over the three kind chips, once.
- **The person view:** with an account that shares nothing still open, no "Coming up" and no "Show earlier" under eleven cards; the split and the fold are held by the unit suite, and the http suite reads "Coming up" over the kettle question between the asker and the friend, the past starting after it, and a voided story keeping its frame.
- **A market from Friday** opens as the memory view with its date in the band, as before; the band's clock after the end ("Settled …", "Voided …") is held by the http suite on markets ended today, and the words by the unit suite.
- **Held by the suites, not the eyes:** the stake step's one fact in the sheet before you are in and nowhere once in; the ballot's "Nobody has said yet. Two of you and it settles." on the score's question; "What was it?" over the number field; the claimant screen's headline, line, groups, check rows and the chalk counting the pressed rows; the who's-got-who fold; the offline bar's words and its absence online; "Try again" inside the block for a failure a retry could put right and never for a refusal; the wait's stages; the cut sheet's first-load words with the lift in the meantime on an iPhone.

### What broke

- The band-clock test named the wrong weekdays for its dates (Sep 20, 2026 is a Sunday); the fixture now reads from Monday the 28th.
- The fold's caption used a curly apostrophe where the heading above it uses the straight one from `possessive`; the caption follows the heading.

### What needs a phone

The stake fact on a phone (102), the ballot before anyone has said (103), the number vote's heading (104), the band after the end (105), the claimant screen (106), Coming up and Show earlier (107), the offline bar (108), Try again and the ten-second step (109), the cutter's first load with the lift meanwhile (110), a voided story's frame (111).

## The final test: one checklist

Everything from sessions 11 through 15 that needs a phone, a second person or a real game, in one place, grouped by what it needs, so the final pass on real phones is one document to walk through. Each item says exactly what to check; the session it came from has the detail. Tick them in order within a group; the two-phone items want both phones signed in to two accounts that share a set.

### One phone

1. **A real cutout pasted as a mark** (11): long-press a subject in Photos, Copy Subject, open the picker on the question step, tap the paste cell (iOS shows its Paste prompt). Expect the cutout as a cell with its cream edge, the screen retinted to its colour, the sticker in the band at 44px once asked, on Now at 40px, and on the asking tile when the link is sent. A grey cutout shows the hueless line and hashes.
2. **The camera on an open question** (14): on a question you are in, tap the camera beside "Send it to the chat". Expect the camera itself, not the library; one photo; the square with the runner, then the stored square under "Yours from tonight" with "Everyone sees these once it's over."; nothing about it in any notice.
3. **"Save to your phone"** (14): tap that square, tap Save. Expect the iOS share sheet with "Save Image", and the photo in Photos afterward.
4. **Remove from the frame** (14): on a settled question with a photo of yours, tap the frame. Expect "Remove" for your own memory and "Save to your phone" alone for someone else's; remove one and expect it gone for everyone.
5. **Lock with a photo going up** (14): take a photo and lock the question within the same seconds. Expect the photo as a memory once it ends, never as evidence, and the camera gone from the locked screen.
6. **A far-off number refused** (12): on a number question with a most likely answer of 10, type 2,400 and Save. Expect the line under the field naming the limit and Save dead until a number under 1,000 is typed.
7. **Voting from a phone on a pick-one question** (13): the wells two across at 48px with 24px avatars, the count line, "That's right, Priya", the raised "What did you see?" list, the modal's "Say it: Priya".
8. **Pull to refresh in the installed app** (10): from the top of any screen, the 72px pull and the 2px runner under the status band, then the screen re-read.
9. **A signed margin from a phone** (15): on a "by how much?" question, tap a side, type the figure. Expect the side chooser (the away side, Level, the home side), "I'm in at Giants by 3", never a shifted number or the word spread anywhere, and the away side refusing a figure past half the scale.

### Two phones, or a second person

10. **A photo added on production and seen by the other account** (11): on a settled question both are in, "Add yours from that night" on one phone, the frame on both, the counter and the strip after a second photo from the other phone, and `/api/media/<id>` a 404 from an account outside the group.
11. **A screenshot attached with a call, seen on the other phone before it votes** (12): "What happened?" with "Add a photo or a screenshot" on one phone, "Say it" and the vote; on the other, the claim card's 72px clip and the attached square with the claimant's first name within six seconds, before voting; after settling, that photo leading the frame on both, credited to the claimant.
12. **A settled question with no photos** (12): the dashed slot as the move for anyone who was in; a group member who wasn't in sees no slot and "Send how it ended" alone.
13. **A photo on a voided question** (12): vote "Nobody can tell" on both phones; expect "Nobody could tell." with "Nothing changes hands.", the slot, "Add a photo from tonight", no tile to send.
14. **The settled screen in the market's own words** (12): a yes-or-no question asked on production, locked, said from a well ("Say it: he fell asleep"), confirmed on the other phone ("That's right, he fell asleep"); expect the settled line in those words, closest first and who's got who under the frame.
15. **The other participant, before the end, on a photo taken while open** (14): no camera unless they are in; the camera and none of your photos if they are; nothing of yours on their screen, in the frame or through the link until the question ends; then the photo in the frame after the claim's clip, credited to you.
16. **A pick-one question with four or five people** (13): each picks a different answer with unequal stakes, the asker locks, one says what happened, the others confirm with one dissent. Expect "Everyone's pick" with the called row washed, "Who's got who" matching the worked example's shape, and "Decided." on the phones that had not voted; `verify-envio` prints the transfers.
17. **A pick-one question everyone called** (13): all pick the answer that happens; expect "Nothing changes hands.", the outcome recorded, and no toll on the asker's record.
18. **A blind pick-one question on two phones** (13): outlined tracks with only each person's own pick capped in their hue, the lock chip and the count, nothing of the other's pick until the asker locks; then the bars.
19. **"I couldn't tell" voiding a pick-one question** (13): from "Not how I saw it", the dashed row on two phones; expect "Nobody could tell." with "Nothing changes hands." and the void counted against the asker.
20. **A number question with five people and a dissent** (10): three more accounts; a vote landing on a second device.
21. **The link tiles in a chat** (11, 13): a result tile for a question with photos says "With photos from that night." and carries no photo; a pick-one question's asking tile shows the answers as rows and its result tile the called row washed, with no share on either.
22. **The backstop's warning and notice, by push and by email** (15): on a question in a set of two, locked and left unvoted, expect one warning six hours before the tiebreaker's day is up ("Nobody's called … yet") on both phones and in both inboxes, and one notice after it settles; never a second.
23. **A question from What's on, asked and confirmed** (15): one phone opens `/m/new?template=<id>` for a game a few hours off (the operator script lists the ids until the tab exists), expects "From What's on · Titans at Giants" over the question, the written rows with "If nobody votes, the final score decides.", "Send it"; the other phone enters from the link with the two teams at the slider's ends; the asker locks or kickoff locks it.

### A real game finishing

(30 through 34 and 37 need a real game too; 35, 36, 38, 39 and 40 need a phone or a chat.)

24. **A who-wins question settled by the final score** (15): after the game, the source card ("From the final score", the two rows, "Final, Sun 4:12pm. The terms said the final score decides.") on both phones within ten minutes of the final, the sheet's header naming the score, "The Giants won, that's right" confirmed on one phone and the other's "That's right" settling it; the settled screen in the market's own words, closest first, who's got who.
25. **A signed-margin question settled the same way** (15): the proposal reading "Giants by 7" (never a shifted figure), confirmed in a tap, the settled answer in the sides' words and the ruler's labels signed.
26. **"Say it yourself" when the feed is late** (15): two hours past a game's expected end with no score in, expect the tertiary on the ballot opening the ordinary claim; before that, "The final score will propose what happened." alone.
27. **The backstop at each ending** (15), which the operator exercises by hand as earlier rounds did: on a question nobody votes on, move the game's `final_seen_at` a day back and expect the settle as `feed` with "Decided by the final score, as the terms said" on the screen and the notice; set the second source's score to differ and expect the void with "counts against nobody"; a hockey question, or the check nulled, waiting at a day and settling alone at three days once the final was read twice.
28. **A game in progress settles nothing** (15): open a question on a game while it is being played; expect no proposal, no source card and no settlement until the scoreboard says complete; the recorded live games in `tests/fixtures/sports` are the automated check of the same.
29. **A tie, if football produces one** (15): expect "A tie." on the ballot with nothing to vote on, the void a day later as `feed`, "The final score couldn't settle it. Nothing changes hands, and it counts against nobody.", and no toll on the asker's record.
30. **A who-wins question settled by a real final, on the line between the two teams** (16): after the game, the settled screen's outcome line in the market's words ("The Giants won."), the final score as its caption, the ending's line after the ticket glyph ("Decided by the final score, as the terms said. Nobody voted within a day." once nobody voted, or closest first once someone did), the call line with the winner's half washed and the winner's name in ink under its stamp, and closest first saying a side ("said Giants 65%").
31. **A margin settled by a real final** (16): "Giants by 7." as the outcome, the score and who was closest as its caption, the ruler centred on a tie with "Tie" in the middle and the real margin as the cream tick labelled under it, and "off by 2" in the list.
32. **The game page's cards after a real final** (16): "The Giants won · you were closest", "Giants by 7 · Theo was off by 2", "41 · you were off by 6", the resolved mark in each question's ink, and the game as one row in Just happened with "Final: Giants 24, Titans 17".
33. **A game's night** (16), the day after a real game with two or more questions: the page as the night, the final score as the title, the photos from every question in one frame, "Questions" with the settled cards, who's got who summed across the game, "The rest of that night" without the game's own questions, and "Add yours from Sunday" as the only move; a photo added there in the first question's frame too.
34. **A game as one story on a person view** (16): between two people in two or more of a game's questions, one story with the kicker "What's on · Titans at Giants", the score in serif, one line per question with what each said, and the consequences summed across the game; each open one the viewer is owed settleable from its own row under the sum; a pair who owe each other within the game cancelled out through the row under the person view's header.
35. **The warning by push, or by email only if push is off, never both** (16): on a phone with push allowed, the warning arrives as a push and no email; with push off, an email whose subject is the sentence and whose body is the question, the sentence, "Open it" and the one line; a warning due between 11pm and 8am arriving at 8pm the evening before.
36. **The notice after replacing the result notice** (16): once the backstop settles a question nobody voted on, one notice ("Decided by the final score, as everyone agreed.") and no "is decided" notice beside it.
37. **The first drive on an NFL game** (16): on a regular-season game's start, "The first drive" offered as the fourth row and nowhere in the preseason; after kickoff, within forty minutes, the ballot's source card "From the play-by-play" with the drive's answer, "That's right, Turnover" confirmed on one phone; on a game whose play-by-play is absent or names something the adapter does not know, no proposal and "Say it yourself" two hours past the expected end.
38. **The margin typed past the reach, from a phone** (16): tap the pill, expect the numeric field with the keypad and the two-team choice under it, type 40, "Use it", and the pill "Giants by 40"; the line's thumb on its end.
39. **The stamps on a phone** (16): the two stamps on the tab's rows, the header, the line's ends growing and shrinking under a thumb, the story's kicker and the tiles, with each team's colour in its stamp and nowhere else, and no logo anywhere.
40. **The tiles in a chat** (16): the game page's link sent from "Send it to the chat" previewing "Priya asks" with the two stamps either side of "Titans at Giants", the chosen questions as rows and the close time; a who-wins question's asking tile with the two 88px stamps at the ends of the empty line and "Who wins?"; its result tile with the winner over the washed half.

### Delegation (after the gate passes and the rest is built)

41. **Approving delegation once, then routine actions with no prompt** (17): on a phone, approve at the moment the design rules, then confirm an obligation, enter a question, close one you are owed and cancel out a pair; expect no signing sheet on any of them and the app's own button to be the whole act; then `delegated_signatures` holds one row per act naming the action, the subject and the request.
42. **A vote still prompting, every time** (17): with delegation on, vote on a question; expect the app's own short sheet and a signature from the governance wallet; the row in `delegated_signatures` never appears for a vote, and the Dynamic record of the governance wallet shows no delegated share set.
43. **Revoking turns prompts back on** (17): turn it off where the design puts it; expect the next confirm to prompt, the row's material wiped and `revoked_at` set, and nothing signed silently after.
44. **Declining** (17): a second account that never approves uses the app as before, every act prompting; nothing is stored for it.
45. **The mixed consent line on a phone** (17): start a game with Who wins and The first drive both ticked; on the terms step expect "If nobody votes, the final score settles the others and the play-by-play settles the first drive." above Send it, and the play-by-play's line alone when only the first drive is ticked.
46. **Dynamic's own sheet, if the reshare shows one** (17): note every word on it; the app's framing has to carry the explanation if those words cannot be changed.
47. **A send that outlives its request** (17): with the network slow, confirm an obligation; expect the button to keep working past a few seconds ("Still going."), then either the confirm shown as usual or the one line "Sent, and still going through. Nothing more to do here; it will show in a minute.", never "That didn't go through" for something that went through; a minute later the obligation on the screen, written by the tick.
48. **A fresh account's governance wallet marked denied** (18): sign up on a phone with a number or an email that has no account; expect nothing on screen about it, then `npx tsx --env-file=.env.local scripts/dev/delegation-gate.ts "<the name typed>"` printing `hasDeniedDelegatedAccess: true` in the governance wallet's settings and `false` in the ledger wallet's.
49. **A send that was dropped after "Sent, and still going through"** (18), when it happens: within the hour, Now carries the thing again with "Didn't go through last time" as its reason line ("Try again" for a settlement, a forgiveness or a cancelling out; the yep row and the yep screen's line for a cover; the asker's lock row for a lock), the owner has one email, and doing it again goes through; a question whose votes already decided it is decided by the tick within a minute with no row for anyone.
50. **A market link with no account, on a phone, in a private tab** (19): open a yes-or-no question's link, slide, see the sheet ask for a name and a number, join; expect "You're in at 70%" and "One friend is in, and you", no sign-in, no code, and the other account's phone showing the entry in the stack and on the weight line within a refresh.
51. **The same for a pick-one question and a What's on question** (19): "Join: Priya, $10" on a pick; the two teams on a who-wins question from the game page's rows, which a signed-out visitor sees listed under the game.
52. **Phone-number claiming in production** (19): join with your real number in the private tab, then sign in with that number on another phone; expect the position on the account, unsigned, with "This was you before you signed in. Keep it, or change it." on the question, and "Confirm at 70%, $10" making it signed; expect a pending consequence from a settled provisional question to name the account.
53. **Signing in from the tab that joined** (19): tap "Sign in" under the facts in the same private tab; expect the same bind by the browser's token, and the ghost gone from the set's members.
54. **The tiebreaker on a provisional question** (19): a question with a ghost in it, locked, nobody agreeing, "Let the tiebreaker call it"; expect the ruling recorded and pending consequences, nothing on the chain.
55. **A notification opening its target on iOS** (20): with the installed app in the background on another screen, tap a notification; expect the question it names, not the last screen; then with the app closed; then with it open on Now while the banner arrives.
56. **The keyboard on a new answer** (20): on a pick-one question's answers, tap "Add an answer"; expect the keyboard to stay up with the new row focused.
57. **The band under the tab bar** (20): read the phone's iOS version; on 26.0 or 26.0.1 the band is the known WebKit bug and nothing in the app; on 26.1 expect the bar at the very bottom with no band. Run "Measure the screen" on You and expect the window's height to equal the screen's.
58. **The unfolded Fold** (20): open Now, a question and the ask flow on the inner screen; say which screen fails and what is on it (a screenshot), since two Fold-sized viewports here rendered as a phone does.
59. **Lifting a subject in the installed app** (20): long-press a photo in a question's frame; expect either the iOS callout with "Copy Subject", or nothing, and say which. The sticker entry point waits for the answer.
60. **A judge's account** (20): on the console's Test Accounts page, set the static code; sign in on a phone with an email of the form name+dynamic_test@yourdomain and that code; expect the name question and two wallets as any account gets, then the ordinary app.
61. **The band on People and You, with the probe closed** (21, 22): cold start the installed app and open People, then You, without opening "Measure the screen". Expect the bar at the very bottom on both, as on Now and What's on. The owner's readings settled the cause: a page that scrolls is laid out right, and the band appeared only on a page that fit the screen, so every root is now at least one pixel taller than the large viewport and the gap adjustment is gone (it overcorrected on the short pages). If the band is back, open the probe on You and send the reading: "document scroll height" should say "(scrolls)" and be above the window's height; if it does, the one-pixel margin was not enough for this iOS and the next step is a taller minimum; if it does not, `100lvh` is reading short here and the readings decide the next one.
62. **Sharing in one place** (21): on a question you are in, the three icons at the end of the who's-in row; share opens the phone's share sheet with the question and the link; copy turns to a check for a moment; the code opens the sheet with the mark in the middle of the code and the six characters, and a second phone's camera opens the link page from it.
63. **Photos while it is open** (21): the slot last on the screen opens the camera itself; the photo lands in the frame with the add tile and the caption; the other participant sees their own slot and nothing of yours; once it ends, your photo joins the frame for everyone.
64. **The cuts** (21): read the draft, the ask flow, joining, first run, What's on and a game's start for any sentence the cut list removed; expect none, and no example inside any field.
65. **The pick-one sheet** (21): on a pick-one question you are not in, the sheet opens raised with the answers; swipe it down to the bar ("Pick one" and "3 answers"), touch the bar to raise it, pick one, lower it again and expect your pick's name and a check on the bar with nothing lost.
66. **"I got this one" on a phone** (21): on a person's page, the chalk at the foot; raised, the units, how many, the two rows with the token, the primary in words; log one and expect the card in today and the other phone's yep row.
67. **On its way** (21): with the network slow, settle a cover you are owed; expect the card to wear the on-its-way mark with "Settled · on its way" and Now to carry it in Just happened with the mark, then the ordinary card within a minute of the tick, and never a sentence about it.
68. **Didn't go through** (21): when a told send is dropped, expect the row on Now with the didn't-go-through mark, "Didn't go through" and "Try again", and the same line above the card on the person view; tapping Try again sends it again.
69. **The heads-up** (21): on the installed app with notifications not yet decided, get into a question; about two seconds after the columns grow, expect "Want a heads-up?" with the two rows, "Turn on notifications" raising the phone's prompt and subscribing, or "No thanks"; then never again, on this phone or another.
70. **The named subject on a phone** (21): careful mode with a bare name; expect "Who's Nova?" with three choices, then "Nova is a pet" with Change over the questions.
71. **The album is open the whole time** (22): on a question two phones are in, take a photo from the slot on one; on the other, pull to refresh and expect the photo in the frame at once, credited by first name, last on the screen under the details, with the add tile after it; then on a third phone signed in to an account in the group but not in the question, expect the frame and no add tile; then open the link with no session (a private window) and expect no photos at all. Lock it and expect the photo still there through the vote, with the claim's screenshot on the claim card and not in the frame.
72. **"Got a code?" on Now** (22): on Now, the tertiary at the top right on the date's line; tap it and expect the joining screen with the six boxes. An empty Now keeps the boxes themselves.
73. **The cover's notes** (22): raise "I got this one" on a person's page; expect the sheet to open short, with "Optional" under who picks up next, "What was it" and, with a unit other than "$", "What it cost" with "Only you see this."; log one with both filled and expect the memo on the card and on Now, and the cost nowhere, on either page.
74. **The swipes on Now** (22): on a question you asked that nobody else is in, swipe its Running row left; expect the row to slide over the remove square, the tap to ask "Remove this market?", "Remove it" to collapse the row with no toast, and the question's link to read "Called off." with "Nobody else got in."; then on a finished question in Just happened, swipe and expect the archive square, "Archive this?", and the row gone from your Now and still on a friend's. A row someone else is in should not slide.
75. **Holdouts and the close** (22): on a question with others in and someone asked still out, expect the dashed avatar after the stack and "2 of 3 in"; as the asker, "Close it with 2" under the row; tap it and expect the sheet with the dashed avatar, "Rae can't get in after this.", "Close it now" and "Keep it open".
76. **Who's in** (22): tap the stack; expect the sheet with a row per person, "Asked it" on yours, "From the link, no account" in stone on a ghost's, and as the asker a Remove that asks "Remove Alex's entry?" inside the sheet.
77. **Blind is final** (22): ask a blind question; before entering expect "You see everyone's once you're in. Yours is final then." after the lock glyph above the primary; once in expect everyone's columns so far, "final" in the caption and no Change; a second phone in it sees the same; nothing with "Numbers show when everyone's in" anywhere.
78. **The link page's names** (22): from a phone with no session, open a question's link in a set where someone joined an earlier question by link with their number; type the first letter and expect no names; the second letter and expect at most three, in stone; pick one and expect the check in the field; join with the wrong number and expect "That isn't the number Dani joined with. If you're not Dani, type your own name." at the number field; five wrong and expect "Too many tries for Dani. Give it an hour, or type your own name."; the right number joins as them. Join another question with a name and no number and expect it to work, and that name never to be suggested.
79. **Entries at sign-in** (22): sign in on a phone with the number an entry was made with; expect the claimant screen with "From a link", the entry as a row ("You're in at 70% · $5.00"), pressed; unpress it and tap Yep; expect it gone from your Now and still on the question under the typed name in stone.
80. **Stone everywhere** (22): with a ghost in a question, expect the stone avatar with the dashed ring on the call line, the leaderboard once settled, the pick rows, who's in, and the ghost's own entry line on their phone.
81. **The red square** (23): swipe a question you asked that nobody else is in; expect the red square behind the trash glyph there, and no red anywhere else in the app.
82. **A game swipes as one row** (23): on a game with two questions you started that nobody else joined, swipe its Running row; expect "Remove this game?" with "Its questions leave Now, and they count against nobody.", and after "Remove it" both questions reading "Called off."; once a game is over, swipe its Just happened row and expect "Archive this?" and the row gone from your Now with every question of it, and still on a friend's.
83. **The count while alone** (23): ask a question of people; expect "1 of 3 in" with two dashed avatars from the moment you are in, share as the chalk; ask one of nobody (a set of one) and expect "Just you so far".
84. **The nudge and the relay** (23): on a question with someone asked and not in, expect "Waiting on Maya." with "Nudge Maya" under the who's-in row; tap it and expect "Told them." and her phone's notice "Claude is waiting on you"; tap the stack and expect her under "Not in yet" with "Nudge Maya" beside her, "Told in the last few hours" after; on an account with no device that takes messages, expect "Say it yourself" opening your own composer with "We're waiting on you: <the question>" and the link. Once locked with someone not voted, the same under "Still to call it", and the notice opening on the ballot.
85. **A sticker from a photo, end to end** (23): open a question's photo full screen; expect the three icons with their words, "Make a sticker", "Save", and "Remove" on your own; tap "Make a sticker" and expect the sheet with "Hold what you want, then tap Copy" and "Then paste it here" over the photo, still holdable; hold the photo, tap Copy Subject, tap "Paste" (iOS shows its own Paste prompt); expect the sticker on the field with "In your stickers", "Ask something with it" opening the question step with the sticker as the mark, and "Done" back to the photo; expect the sticker in the picker's "Your stickers" row afterward. A plain photo pasted should say "That's a photo, not a cutout."
86. **You, in each state** (23): on a fresh account expect "Joined today" and "Nothing has resolved yet." with no chart; on an account with a few resolved calls expect "In N markets since <when>", the frame with the diagonal alone, "Your picture draws at 10 resolved calls. N so far." and the calls as rows; on an account past ten expect the plot with dots and whiskers and the headline in counts ("When you say about 70%, it happened 7 of the 10 times."); "Questions you asked" in counts with a mark per question and the void named; the Account rows, "Your units" and "Your marks" opening their sheets, "Your number" with its caption and nothing to open, and "Sign out" asking once.
87. **Pass the phone, on and off** (24): on your own phone, on You, tap the switch; expect the sheet with "It allows" and "It never allows", the PIN twice, "Turn it on" delegating without any screen of Dynamic's and the switch reading on within a few seconds; on a second phone signed in to the same account without the code step, expect the switch on and the caption saying to turn it on from the phone you signed in on; tap it off on your own phone and expect the switch off at once, `delegations` wiped with `revoked_at` set, and `pass_the_phone` empty.
88. **A second device signing from the server** (24): with pass the phone on, on a phone that holds the Dareful session but not the Dynamic login (the installed app after the browser's storage was cleared, or a second phone that never typed a code), get into a question; expect no code step, the entry landing, and one row in `delegated_signatures` naming the action and `signFromThisDeviceAction`; then vote and expect the code step or the vote's own sheet, never a server signature.
89. **Wrong PINs locking** (24): on a friend's phone (part 3), type a wrong PIN five times; expect the third to end the handoff, the fifth to lock the PIN for an hour, and the owner's phone to get "Your PIN is locked for an hour" naming the friend's phone.
90. **Handing the phone over, on two phones** (25): with a friend's pass the phone on, on a question you are both sent to and only you are in, expect the fourth icon at the end of the who's-in row; the first tap the explainer ("A friend who set this up on their own phone gets in here with their PIN. Nothing of theirs stays on yours.", "Hand it over", "Not now"), never again after; then "On Sam's phone" with a close, the band, the two facts and the entry sheet, and nothing of your own number on the screen (blind or open); slide, "I'm in at 60%, $10", then "Who's joining?" with the friend ready and anyone not set up at 0.45 with "Not set up for this yet", and "No account? Scan the code with your own phone" opening the code; pick the friend, expect their avatar, "Your PIN", the dots and the keypad; the fourth digit sends; expect "You're in, Maya.", "Change it on your own phone until 10:40pm." and "Hand it back to Sam"; after the handback expect your own screen with the friend in, and back never returning to their entry.
91. **On the friend's phone** (25): expect the notice with the question as its title and "You entered this from Sam's phone." (push, or email with push off); the entry line "$10 · from Sam's phone · yours to change until 10:40pm"; change it and expect the change; on a blind question expect "· final" with "Withdraw it", the ask, the entry gone, and no way back in from either phone.
92. **Wrong PINs on the friend's phone** (25): type a wrong PIN; expect the dots to clear and "That's not it."; three wrong and expect the host's own screen back with nothing said; five wrong in an hour across handoffs and expect the owner's "Your PIN is locked for an hour".
93. **The link page's steps on a phone** (25): open a question's link with no session; slide, "I'm in at 70%, $10" raises "Who's joining?" with the summary on the right, the two fields, "Join" disabled until a name is typed, and "Have an account? Sign in" under it; two facts only; signed in on the same link expect "Joining as Sam · Not you?" under the primary and "Not you?" asking before it signs out; open a dead link and expect the code boxes with "That link doesn't open anything. Ask for it again, or type the code they read you."

### Round C

94. **Cutting a sticker on the phone** (26): open a question's photo full screen and tap "Make a sticker"; expect "Tap what to keep" over the photo, still holdable; wait, and report how long the line "Model loaded in …" says the first time (the runtime is 11MB and the model 6MB, on your own network) and the second time on the same phone; tap the subject and expect the dashed cream outline around it within a second or two, and the line's "cut in …" number; tap "Keep it" and expect "In your stickers" with the cutout on the field; "Start over" clears the outline; a tap on the background expects "Nothing there to keep. Tap the thing itself." Then the same on an Android phone or a laptop, where there is no lift. The instrument line leaves once these numbers are in.
95. **The lift as the fallback** (26): with the phone offline after the app has opened (airplane mode), open a photo and tap "Make a sticker"; expect the sheet to become "Hold what you want, then tap Copy" and "Then paste it here" with "Paste", and the lift to work as before.
96. **The one dot, and the Running row's words** (26): with two questions needing you that both have a clock, expect the citron dot on the sooner one alone, none on the other, none on the tab bar on any root; under Running expect "You’re in at 70% · three of you", "just you so far" on one nobody else is in, and once locked "Resolving tonight" or "Voting ends tonight" and nothing else.
97. **A claim to accept as a row** (26): on an account whose first name matches a ghost a friend added in a set you share, expect under Needs you "Is that you?" over "Gabe has things with a Sam" with "That’s me" as the verb, and no section of its own; tap it and expect the claimant screen.
98. **A dead address in the installed app** (26): open a mistyped address; expect the code boxes with "That link doesn’t open anything…" and the back control, never a framework page.
99. **Focus outlines on a keyboard** (26): on a laptop, tab through the question step; expect the 2px cream outline 2px outside the question, each answer field, the number entry and the margin's field, and around Start on a root, never flush with the edge and never a colour change of the border.
100. **Who's joining, when nobody was named** (26): ask a question of nobody (a set of one) and get in; hand the phone over to a friend who has pass the phone on and shares any set with you; expect them listed under "Pick yourself" and their PIN to get them in.
101. **The voting screen** (26): once a question you are in closes, expect the claim card (or the source card) directly under the band, no entry line, "Where everyone landed" over the picture, and no list of each person's number.

### Round C, part 2

102. **The stake fact** (27): open a question you are not in and slide; in the raised sheet under the stake chips expect "The most you can be out is what you put on it." once; once in, expect it nowhere.
103. **The ballot before anyone has said** (27): on a What's on question the score has answered and nobody has confirmed, expect the sheet's header "Nobody has said yet. Two of you and it settles." (the count in words for your set), the source card above it, and "That's right, the Giants won" as the chalk.
104. **What was it?** (27): on a number question in voting, tap "Not how I saw it"; expect "What was it?" over the number field, then "What happened?" and the line.
105. **The band after the end** (27): on a question that settled today expect "Settled at 10:14pm" in the band; on one voided today "Voided at …"; on one called off "Called off at …"; on one that closed for good "Closed for good at …"; from the next day the date alone, as before; while closed and not yet called, "Resolving tonight".
106. **The claimant screen** (27): sign up on a number a friend logged three covers against; expect "You were already in 3 stories." over "A few days with your friends, kept under your name, Sam.", one group per friend with the count, each row with "Covered · Sep 5", the memo, the token and a chalk check; unpress one and expect the chalk to read "Yep, these 2 are right" and, after the tap, the unpressed cover still pending under the typed name.
107. **Coming up and Show earlier** (27): on a person view with an open question between you, expect "Coming up" over it and the past under; with more than twelve past events expect "Show earlier" as a tertiary opening the rest on the same screen.
108. **The offline bar** (27): with the installed app open, turn on airplane mode; expect the 28px bar "Offline. You can still look around." under the header on every screen, and gone the moment the connection is back.
109. **Try again, and the ten-second step** (27): with the network slow, get into a question; expect the runner, "Still going." at three seconds, and at ten the block "That didn't come back." with "Try again" under the chalk, the chalk tappable again; when a send fails outright, expect "Try again" inside the block under "That didn't go through".
110. **The cutter's first load on a phone** (27, with item 94): on an iPhone with the runtime and model not yet cached, tap "Make a sticker"; expect "Getting the cutter ready. It's about 17 MB the first time, and your phone keeps it after." with "Or, in the meantime: hold what you want, tap Copy Subject, then paste it here." and "Paste"; paste a lifted subject meanwhile and expect the sticker; or wait, and expect the line and the lift offer to go once the cutter is ready. On Android expect the loading line alone.
111. **A voided story's frame** (27): on a person view with a voided question that has a photo between you, expect its story to carry the frame at 180, drawn without controls.
