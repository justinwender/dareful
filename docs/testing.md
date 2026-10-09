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

## Session 28: Round D, how it feels, in the real localhost session

**When:** September 28, 2026, after Round C part 2 was committed. **Who:** the localhost test account; nobody on a phone; the pane hidden, so taps were dispatched from the page's own script onto the real controls, and every timing is the DOM's arrival rather than the paint. **Checked first:** the merged design doc's sections 8 to 11 and the owner's two corrections.

### Exercised

- **The foundation:** on Now, People and You the tab bar lives in the layers host after the app root, sits at the viewport's bottom on both roots, the document scrolls, and nothing between the app root and the bar carries a transform (walked in the live tree and in every screen's markup by the http suite).
- **The four moments, measured before and after** (dev mode): switching tabs 280 to 608ms before, 8 to 13ms after within the router's hold and 191 to 433ms on a first visit; + to ask 358 to 466ms before, 25ms after with the layer rising over Now (the first tap of a load waits for the step's payload when the prefetch has not landed, 678ms in dev); opening a market from Now 495ms before, the shell in 8 to 16ms after with the screen landing at 550ms the first time and 29ms from the hold, back 35 to 50ms; the steps of asking 9ms before and 5 to 11ms after, with "Set the terms" opening in 10ms instead of the 3.0 to 3.8 seconds it waited on the write-up, the first words streaming in at 2.3 seconds and the whole write-up at 3.2.
- **The ask layer:** rises with the question step drawn whole, the root inert beneath, the sheet in flow at its foot, Close at the top left; the steps advance and return under the band; the terms stream in with the caret and "Send it" enables once written.
- **The shell:** the market's ground, band and sheet in the frame after the tap, the ink swapped on `html`, the tab bar hidden under it, the screen landing over it and the shell gone.
- **Appearance:** the row on You reads "Match your phone" (the pane prefers light, so the app drew light), "Always dark" puts `data-theme` on `html` at once and the ground reads the dark token; reset after.
- **Held by the suites, not the eyes:** the motion set and its stagger; the slow-load stages; the sheet's settling and overscroll; the layers' rules; presses; the theme's script and the two light blocks; the opening's images and first frame; a row's shell; the band's clock; the roots' hold; the half-written terms; whole dollars and the Mixed token; the call line's words, the annotated row and the stake default; every information sheet against 10.6 and the copy scan; the lint's two new rules against their fixtures.

### What broke

- The first frame's inline style kept `html`'s ground in the phone's scheme after the stylesheet loaded, so "Always dark" left a light ground behind a dark card. The style now holds only until the handoff marks the document dressed.
- The claimant screen's covers were pressed by default; the ballot's empty line hid behind the app's read; the tab bar's hiding rule under a shell lost to the layer's inline display. Each fixed and held by a test.

## Session 29: the logo round, in the real localhost session and in a browser that paints

**When:** September 29, 2026, after Round D was committed and deployed. **Who:** the localhost test account in the development browser, whose pane was hidden throughout and so painted nothing; Chrome, headless, a fresh profile and a phone's screen, for everything that needed a frame drawn (`scripts/dev/opening-check.ts`), signed out from the command line and signed in from the http suite with its own test account; nobody on a phone. **Checked first:** `docs/design/reference/LOGO.md` against section 11, and the design's own launch images against the script's, which are the same pixel for pixel.

### Exercised

- **The cold start, before.** Production, signed out, the first request after the server had slept: 2.87 seconds to the first byte, then 0.14 and 0.22. Production, the real session, the server awake: the page arrived at 1.21 and 1.97 seconds and first painted at 2.04 and 2.52. A local build of the same commit: 2.69 seconds on the server's first request, 0.66 to 1.89 after. The server's own steps, timed in a fresh process: a first connection 274ms, the account 56ms, pass the phone 314ms, Now 577 to 979ms, the indexer 5 to 39ms of that.
- **The cold start, after** (a local build; production cannot be read until this is deployed). In the real session the shell's piece (the header row, the tab bar, the +, the handoff) arrived at 18 to 26ms and Now's content at 620 to 1016ms; the server timed itself at 37 to 245ms for the account and 557 to 772ms for Now. Painted, in Chrome with the suite's test account: first byte 14 to 16ms, the shell at 60 to 83ms, the content at 869 to 899ms.
- **With the count and without it.** The shell painted at 43 to 82ms with and 22 to 85ms without, signed out; 61 to 83ms with and 60 to 82ms without, signed in; at a quarter of the speed 72 to 205ms with and 73 to 188ms without. No stroke had started at any handoff: every clip stood where the first frame leaves it.
- **The count itself**, with the first screen held back by hand so there was something to wait for: bare ground, then one stroke, two, and at 800ms the third stopped with 23% of it still to draw, the fades, and the screen; held 2000ms in light, all five strokes in the ink on the light ground, held, then the fades; with Reduce Motion the whole mark fading in and nothing drawn.
- **The app starting after the opening has gone**, with every request slowed: no error, the opening gone and staying gone, the document dressed, signed out and signed in. The same run against the deployed build: React's error 418, the opening back on the page at the end and the document undressed.
- **The logo's files:** the head's icons and the manifest's three, each served; the link preview; the share card with the lockup and a tile with the wordmark in the chalk, both fetched from the running build and looked at; the wordmark in the signed-out header.
- **Held by the suites, not the eyes:** the four values in one block and every stroke's start counted from them; the launch images as the flat ground at each device's size; the design's own link tags, recorded; the one handoff and its timer against the fade; the layout never waiting; Now's shell from the cookie alone and the stylesheet's rule for an empty Now; the icons as delivered; the wordmark's one colour; the visit that keeps Now warm; the sheets against the design's words and the cut phrases; the lint's new rule against its fixture.

### What broke

- **Round D's opening could come back and stay.** The handoff takes the opening off the page; an app that starts after that finds one of its own elements gone and rebuilds the page with the opening in it. Reproduced on the deployed build. The opening now sits in a box the app keeps, and a test watches the page in a real browser.
- Beyond the nine words the owner named, five more of the design's own were in the sheets (the count line, citron, the context chips, stone, the frame), in six entries; each is reworded and the lint refuses all fourteen.
- An old mutant of the share text no longer matched the line it broke (the phrase it quoted was cut in an earlier round), so it could not run; it is repointed.

### What needs a phone

Everything about the installed app: the time from the tap to Now, which only a recording can take from the tap; whether iOS holds the launch image until the page's first frame; the launch images and the icon, which iOS keeps from the moment the app was added; the count on a real network. Items 122 to 133.

## Session 31: the field round, part 0: the counting

**When:** October 2, 2026, after the QA round's push. **Who:** the real localhost session in the development browser; the http suite against the local server; the database suites against the shared database.

### Exercised

- The migration (0034) applied to production through the Supabase MCP before anything else, so the deployed build ran beside the new table and column; the advisors read afterward (nothing new beyond the project's own pattern: RLS with no policies by design, two unindexed foreign keys on the new table like every other table's).
- In the real localhost session: a market opened from an address carrying `?via=push&n=test-notice` left a `link_opened` row under the account (installed false, signed in true) and a `notification_opened` row with the push channel, and the address lost both parameters at once; the copy icon on an open question left a `share` row with its icon. The two reports a first paint sends at once were given two device ids by the door, so the browser now sends its reports one after another (the fix is in; item 152 reads it on a phone).
- The unit test over the rules (the client's four names, the properties' sets, the crawlers, a screen's shape, the once-key and the channel on a notice's link), the database test over the real paths (asking, entering as an account and as a guest, a guest bound by its token) and the http test at the door (a fetcher refused, a device's cookie set and honoured, the server's own names refused), each with its mutants.

### What broke

1. **Two reports at once, two devices.** The first page a phone opens sends a link opened and, from a notification, the tap, in the same instant; each arrived without the cookie and each was answered with a device of its own. The browser's reports are now a queue, one request after the previous has been answered.

## Session 32: the field round, part 1: the owner's nine findings

**When:** October 2, 2026, after part 0's commit. **Who:** the simulator's Safari (iPhone 18 Pro, iOS 27) against the local build as a visitor with no session; the real localhost session in the development browser at phone width; the suites against the shared database and the local server; the production database read through the Supabase MCP for the lists.

### Exercised

- **The shell under a keyboard (1.1).** On the simulator's Safari, a visitor opened a question's link, slid a number, tapped "I’m in" and then the name field. With the keyboard up: the window's scroll read 226 and the visual viewport's offset 226 of a 714-point viewport, the app's own scrolling box stayed at 0, and the pinned sheet's bottom edge sat exactly at the keyboard's top (the layout viewport's 488). With the keyboard dismissed: every number back at 0 and the sheet at 253 to 714 where it started. Then the app sent to the background with Home, Safari reopened from the dock (the sheet still at the name step), the field tapped again: the same numbers under the keyboard, and the same return. The owner's finding was on iOS 26, which the simulator cannot run; item 154.
- **Game questions (1.2).** The scoreboard day keyed by UTC, found by asking both sources for a known 8pm Eastern game and getting nothing; the lock queue's starvation, found by reading the ten rows the tick selected on production (eight with nobody in ahead of the one with five). The stuck questions listed with a query (eleven under counted askers); nothing changed.
- **The split game (1.3).** The two sets on "Red Sox at Yankees" read with their people: the owner alone (three questions) and the two-person set carrying three people (one question); the join path reproduced in the database test.
- **Getting lost (1.4).** In the development browser at phone width: What's on reached by its tab (one entry), a game row (one), a game with the owner's set (one); the set chips did not draw for the one set, so the replace is held by the code and item 164.
- **Now's verbs (1.5).** The draft "Was Trajan the greatest Roman emperor?" opened from Now: its own screen with the asker's number and "Looks right. I’m in at 50%, $5" as the chalk, which is the step; the stake chips drew as three columns unclipped at 375 points (the owner's screenshot of them clipped is item 155).
- **The suites.** The unit suites of the round (66 passing in the four files touched), the three database suites (38 passing: the tick's two voting jobs, the close's two rules, the guest's fold, the third joiner), the http suite's session door, the static mutant check at 0 stale, `tsc` and `eslint` clean, the type budget held, and the full run and the audit (below).

### What broke

1. **A sheet raised from an effect.** The lint's rule against a synchronous set-state in an effect refused the first version of the address-raised sheets; the raise is the next frame's now, which also reads as the sheet travelling up after the screen lands.
2. **One phrase shared by two notices.** The reminder borrowed the vote request's "has/have" and made a mutant ambiguous; it has its own wording.
3. **A title's question mark.** The notices shorten a title and drop its question mark; the test expected it kept.
4. **A duplicate constant** in the mutant list (`SETTLE`) stopped the static check; removed.

### Not verified here

The ten-times sequence on iOS 26 in the installed app; the stake chips on the owner's phone; a slow write, an offline tap and a signed-out tap on a phone; the three voting notices arriving by push and by email; the session cookie's expiry moving; the set chips' replace. Items 154 to 164.

## Session 33: the field round, part 2, in the development browser

**When:** October 2, 2026, after part 1 was staged. **Who:** the real localhost session in the development browser at phone width; the suites against the shared database and the local server.

### Exercised

- **The sheet's positions (2.1).** On the draft "Was Trajan the greatest Roman emperor?", the sheet rested at its move with the page's room at 305px; dragged down past the snap it tucked to the handle row; dragged up it rested and then raised; the positions read from the sheet's own attribute (`data-pinned-sheet`: tucked, low, raised, full). The grabber at 48 by 6. Where the raised content fits, no full position exists.
- **The stuck market (2.1).** The http test across three accounts: the asker and the friend in it are offered the close in the sheet, the stranger in the set is not.
- **The inputs (2.3 to 2.6).** Held by source scans in the unit suite: the PIN fields numeric text, masked, autocomplete off; no `capture` on either photo input; the question and the title drawn as fields.
- **The rows (2.7).** The token's face by a static render; the count's rule and the one row per game as pure tests with their mutants; the static mutant check at 0 stale.

### Not verified here

The four positions under a thumb on a phone (the snap, the full position scrolling under its handle row, the tucked sheet's handle still reachable above the tab bar); the PIN fields on an iPhone (no password manager, no focus moving on its own); the photo input's two choices; a pasted sticker appearing before its upload returns; the team stamps on a game row. Items 165 to 170.



## Session 34: the field round, part 3, the numbers

**When:** October 2 and 3, 2026. **Who:** the unit and database suites against the shared database; the http suite's door check against the local server.

### Exercised

- The owner check, the two windows, Eastern days (an evening that crosses midnight UTC is one day; the day the clocks go back is twenty-five hours and still one) and the definitions, as pure tests; the counts against the real database with a counted account, an excluded account and a guest; people with a channel in a window nobody else has events in; a day written twice as one row, replaced.
- The page as a non-owner over http: the code screen, exactly as for an address with no screen.

### What broke

1. **A moment bound as a Date.** The driver refuses a `Date` as a parameter of a raw query; each bound of a window is ISO text cast back.
2. **A day written twice.** The first test passed whether the second take replaced the row or was ignored; it now reads the take's time before and after.

### Not verified here

The page as the owner (the variable is not set on the local server during the suites); the two buttons on a phone; the chain's counts against the indexer in production. Items 171 to 173 and 184.

## Session 42: the final round, on the iOS 26 and iOS 27 simulators, in Safari, installed copies and a test app

**When:** October 9, 2026, after midnight, Eastern. **Who:** the "iPhone 17 Pro iOS 26" simulator (iOS 26.0) and the "iPhone 18 Pro" simulator (iOS 27.0), each in Safari (on iOS 27 a private tab), in an installed copy ("Dareful local" on iOS 26, "Dareful dev" on iOS 27), and in a minimal test app built for this round that hosts the page in WebKit the way Brave and Chrome do on an iPhone (`WebShell`: Brave's layout, where the page ends above a bar riding on the keyboard and so shrinks when the keyboard shows, and Chrome's, where the keyboard covers a page that keeps its size); all as visitors with no session at the loopback origin or the forwarded port, against the development server; and the development browser's own session on `localhost:3000` (the excluded development account) for what needs an account. The walk's own rows are the development account's three questions and eight guests (Wren, Fern, Gale, Hazel, Iris, Juno, Kai and Lark Test), listed for the sweep. Readings through the simulators' Web Inspector; touches through the simulator tool.

### Exercised

- **The join step's field, in every browser.** A guest's "I'm in" on a question, then a tap on Your name. Brave's layout (iOS 26 and 27): the page shrank to 339 and 356 points, the sheet rose and its content scrolled the field to the middle of what showed (191 to 239 of 339), the caret in it, and typing a name kept it there. Chrome's layout (iOS 27; iOS 26 earlier in the round) and Safari (iOS 26, and iOS 27 in a private tab): WebKit panned the page and the field sat above the keyboard with its caret. Installed copies (iOS 26 and 27): the same. Before the fix, Brave's layout left the field under the sheet's foot, out of reach, and the sheet dropped 35 points while typing.
- **Join with the keyboard up.** In Brave's layout one tap on "Join as Gale Test" did nothing but drop the keyboard: the sheet's return to its place ran on the field's blur, between the press and the click, and moved the button out from under the finger. Fixed (the return waits until the tap has landed); one tap then joined on iOS 26 and 27, and in Chrome's layout, Safari and the installed copies.
- **Tips, as a guest.** On the iOS 27 installed copy, joining as Wren showed the share tip over "Keep your calls in an account". Fixed (tips wait for the account step and any open sheet, then show); on iOS 26 in Brave's layout and in an iOS 27 private tab, no tip while the step stood, and once "Not now" closed it, Share (1 of 2) ringed on the share button with the rest blurred, then Copy the link, each remembered on the phone once shown. In the development browser for the account: the ask flow's tips one at a time (What kind of thing, Market type, AI market setup), and on a game page Copy the link and Show a code to scan, the second brought clear of the raised sheet first. Found and fixed: a tip measured under the opening's fade dropped every tip; a control under the raised sheet dropped every tip instead of its own.
- **Nothing pans sideways.** On every screen walked the scrolling box was exactly the screen's width (402 of 402).
- **Asking** (the development browser): the 🫖 mark suggested by the write-up beside "Your question", Decided on Tonight with "A date" beside it (no second chip for the same day), Stakes reading Dollars, beers, rounds, "pizzas" (the account's own) and "One of your own", and no next time; "One of your own" made "pizzas", saved it to You and picked it.
- **A question of your own on a game page** (the development browser): "Your own question" under Add another on the Rays at Yankees game, the ask flow with the game's close in place of Decided and no pace chips, terms written about that game alone ("…in the Rays at Yankees game that started Thursday…"), sent, and landing on the game page with it open; entering it brought the page's one photo slot, "Add the first photo", with the open card drawing none. The deployed build's tick closed the lonely question five minutes after its first call as an expiry, so the build already running reads the new kind of question.
- **Every link is read** (the development browser): a game's link with words around it on the joining screen opened the game's page.
- **The guest line's "Sign up"** (iOS 26 Safari, as Kai): the app's own "Sign in" sheet (Continue with Google, Email, Continue, "Use a phone number", "Not now"), no longer the sign-in library's modal; "Not now" closed it.
- **The code screen, signed out** (iOS 26 installed copy): six letters of a live question's code answer "You've been signed out. Sign in to finish this.", since a code joins accounts only; listed for the owner.

### What broke

1. **A field under the sheet's foot in Brave's layout**, and the sheet dropping while typing. Fixed (section 1).
2. **A tap on Join with the keyboard up went nowhere** in Brave's layout. Fixed.
3. **Every tip dropped**: the tips' own layer read as covering every control; a tip measured under the opening; a control under the raised sheet. Fixed.
4. **A tip over the account step.** Fixed.
5. **The guest line's "Sign up" opened the sign-in library's modal.** Fixed.
6. **The clean-resolution rate** counted only counted people toward its "two or more in" in the first version of this round's exclusions; the stats suite caught it, and the rate keeps the profile's own rule.
7. **The Web Inspector client's files** were pruned from the scratch folder overnight; reinstalled.

### The suites and the audit

Every suite: 849 tests, 846 passing on the first run and one skipped (deployed-app only); the stats suite's clean rate and the opening's timing test failed and pass after the fix and the rerun. The scoped audit: 398 mutants (182 unit, 207 database, 9 http), 395 killed on the first run; the three that survived (two of this round's, the stakes test reading two rows as one, and the guest late-close test racing production's scheduler) are killed after the tests were strengthened.

### Not verified here

A real phone: Brave and Chrome themselves (the test app stands in for their layouts), an account's first visit and its tips, the blank top of Now and What's on after a sign-up, which no simulator reproduced without an account, pasting a link from Messages, and a game's photos on a real night. Items 253 to 266.

## Session 41: the touch-ups round, on the iOS 26 and iOS 27 simulators

**When:** October 8, 2026, in the evening, Eastern. **Who:** the "iPhone 17 Pro iOS 26" simulator (iOS 26.0) and the "iPhone 18 Pro" simulator (iOS 27.0), in Safari at the loopback origin as a visitor with no session, against the development server; the development browser's own session on `localhost:3000` (the excluded development account) for what needs an account; and a headless Chrome for the owner's `/stats` and the tiles. The walk's own questions belong to the development account and a guest, Dana; they are listed for the sweep. Touches through the simulator tool.

### Exercised

- **The app's ruling, end to end.** The development account asked "Is Mount Everest taller than K2?" as an argument; the check found facts settle it, and the draft came back sealed in 3.5 seconds: the verdict, three sentences in the app's voice, and the seal's line at the end of the terms, with nothing of the ruling on any screen. On iOS 26 the guest took the other side, joined as Dana, and the argument closed: the band read "The app has ruled", the sheet "The app's ruling: yes." with its reasons, **Agree**, and **I see it differently** under it, and "How to check it". "I see it differently" opened "What did it get wrong?" with its field and Send it, and no photo row for a guest. Dana agreed; the asker's sheet read "Dana agrees." and, once the asker agreed, it settled at once: "Settled", "Yes.", Dana's $5, "Settled by the ruling everyone agreed to" with the reasons and "How to check it", one pending proposal from Dana's claim to the asker. Found and fixed: "You agree." said twice; "On the permanent record, word for word." on a question decided here.
- **The join step's caret.** On both simulators, a tap on the name field put the caret in the field, before and after the root now moves at the touch; typing "Sam" and "Dana" kept it after the last letter. The owner's caret above "What are the odds?" did not reproduce in Safari, so it is a phone check.
- **The PIN.** In the development browser, with the old sheet effect put back for one run: four digits into the PIN moved the focus to "Again" and the next render sent it back; tapping "Again" and typing sent the focus back to the PIN after each digit. With the fix, the focus moved to "Again" and stayed there through every digit. On the iOS 26 simulator a field that calls `focus()` on itself after each digit kept "1234" in order, so a plain refocus is not the cause; the cause is the focus going back to the field the sheet captured.
- **Pull to refresh.** On iOS 26 (dark) and iOS 27 (light): a pull drew all five strokes, the crossing fifth last, the release read the screen again, and the tally settled and left.
- **Every sheet.** On iOS 27 the information sheet opened raised at about three quarters of the screen, went to full on a drag up, and closed on one long drag down. On iOS 26 the dispute sheet rose at its content's height. In the development browser the units sheet opened raised.
- **Decided holds.** With a written write-up and with the plain fallback the owner got (sent to the page as production sent it), "This week" stored a close seven days out to the millisecond.
- **The terms.** A question typed and left for a moment started its write-up once, after 1.2 seconds; Next showed words 0.3 seconds later and the whole terms at 0.7, where they had taken 2.7 to 6.5. Help define's questions came back with their own two answers where one offered two ways; one more either-or form was found ("…count, or only if…") and caught.
- **Your own units.** "Pizza" added on You read "pizza", "beers" was refused with "That one's offered already.", "pizza" stood after a next time when asking and selected alone, and came off again. A name that reads as an address was refused at the field.
- **Signing in.** On iOS 27 Safari at `localhost:3000`, signed out, "Get started" opened the app's own sheet: "Sign in", Continue with Google, the email field, Continue, "Use a phone number" and "Not now", risen to its content; "Not now" closed it. (At the loopback origin the button stays disabled, since Dynamic's SDK cannot load there.) Nothing was signed in.
- **The tiles**, rendered from the development server at Messages' size: yes or no with and without a mark, a number, pick one, a game's question and a game page, open and settled; the yes-or-no track spans the tile with 0% and 100% at its ends.

### What broke

1. **"You agree." twice** on the ruling sheet. Fixed.
2. **"On the permanent record"** on a question the chain never carried. Fixed.
3. **The seal's hash threw** (a hex string concatenated with raw bytes), caught by its unit test before anything ran. Fixed.
4. **`resolved_by` refused `ruling`** at the database's check, caught by the database test. Migration 0046 widened it.
5. **Five http tests failed** on the first full run: three read questions being called whose fixtures never said it had happened (the last round's run passed only because the build then deployed opened the vote at every lock) or dated what was said after the app's read of it; two asserted the old design (the final score's ballot without Agree, the game page's row without the code). Fixtures and assertions brought to this round's rules; all 121 pass.

### Not verified here

A real phone: the join step's caret in the installed copy, the PIN on the owner's iPhone, signing in through the app's own sheet (Dynamic's code is the owner's), and the tips' ring and card on a phone. Items 238 to 252.

## Session 40: games and the reveal, on the iOS 26 and iOS 27 simulators

**When:** October 7, 2026, in the evening, Eastern. **Who:** the "iPhone 17 Pro iOS 26" simulator (iOS 26.0), in Safari and in the development build installed from Safari ("Dareful local"), and the "iPhone 18 Pro" simulator (iOS 27.0) in Safari, against the development server. The people were temporary accounts (Rae asking, Sol, Tam and Uma) with sessions made for them on `localhost:3000`, and a guest, Gabe, joined from a tab with no session. The walk's own questions: a yes-or-no question with all four in, a number question and a pick-one question already closed, one waiting for it to happen, three questions on a test game across two of Rae's sets, and one question started on each of two real games being played that night (Timberwolves at Pacers, Dodgers at Braves) in the walk's own set. The deployed tick still opens the vote at every lock, so for ninety minutes a script cleared that mark on the walk's own questions and nothing else. Every account, question and game made for it went with the test sweep afterwards. Touches through the simulator tool; readings through the simulators' Web Inspector.

### Exercised

- **Calls are in, by name.** On q1 with four in: Sol (iOS 27) tapped "Calls are in" and read "You say calls are in. It closes when two of Tam and Gabe say so too.", which was wrong in its count; fixed to "when Tam and Gabe say so too" and held by a test. Rae, the asker (iOS 26), read "Sol says calls are in. Whoever isn't in yet can't get in after." over her close. Tam read "Sol says calls are in. It closes when Gabe and you say so too.", tapped, and read "You and Sol say calls are in. It closes when Gabe says so too." with "Take it back" in its place. The guest read "Sol and Tam say calls are in. It closes when you say so too.", tapped, and the question closed.
- **The reveal, three kinds.** Closed, the guest's screen read "Calls are in" in the band, "Who said what" over the line with every share in its owner's colour, and the roll call: Rae 70%, Sol 30%, Tam 55%, You 80%. "Voting opens once it's happened." with "It's happened" under it. The number question showed each column under its owner with the roll call (Rae 4, Sol 6, You 3, Gabe 5); the pick-one question showed John (Rae, Tam) 50%, Maya (Sol) 25%, Theo (Gabe) 25%. Found and fixed: the viewer's own avatar read "Y" for "You"; the guest's share was in a person's colour while their avatar was stone; the revealed avatars covered the group's number's pill.
- **It's happened.** The guest tapped it; the band read "It's happened", and Sol's ballot read "Gabe says it's happened." over "Say what happened", with "Waiting on Tam and Rae." and the nudge.
- **One page per game.** Rae's page held the game's three questions across her two sets, each card naming its set ("You asked the Movie night (sim)", "You asked the Office (sim)"). A tap opened the first card in place (`?q=`), with its sheet the page's one; a tap on its head closed it; the second card opened with its own sheet and the first closed; the history's length did not change. Sol's page (one set) carried the header's line "Rae asked the Movie night (sim). Everything closes at kickoff." and "1 in", and "Add another" listed the menu; "Who wins" offered "Rae already asked who wins." with "Go to that one", which opened Rae's question with Sol's entry sheet.
- **What's on, live.** Every game being played was listed as "Live", the two with the walk's questions as "Live · You're on this with the Movie night (sim)".
- **A question during a game.** The question started on Timberwolves at Pacers read "Closes 5 minutes after the first call · nobody's in yet", with the live score beside it ("Timberwolves 65, Pacers 61 · Halftime"). The guest entered at Even; their entry read "yours to change until 8:23pm" and the asker's card "Closes at 8:23pm · 1 in". At 8:23pm, with one in, it ended as an expiry. The header's "Everything closed at tip-off." was dropped while the game is on.
- **The offer.** Rae typed "Will the Pacers beat the Timberwolves tonight?"; the terms step offered "Timberwolves at Pacers, on now." with "Let the final score settle it" and "Keep it as it is". Taking it made the game's question; with no sign-in code on that simulator the signing could not finish, and the draft then opened on the game page as "This one is over, so it's too late to ask.", fixed so the asker's own draft opens there with "Share it first" and "Discard it".
- **The live score on iOS 27.** Polling while the page was open: "Q3 · 0.0" between quarters, fixed to the score alone, and later "Q4 · 10:47".
- **The guest's ended question.** The expired question's card showed share and copy and "Just you so far"; now it shows "Never settled." alone, and the member's screen drops the void rule's caption for a question that ended with too few in.
- **The device notice.** One line, 44 points, on iOS 26 (Now, in the installed copy) and iOS 27 (the game page).
- **The tally.** Sampled in iOS 26 Safari on Now: pulling drew the uprights with the finger; it crossed while held (fixed, it crosses on the release); it blinked out for a frame between the count and the settle (fixed); after the fixes, pulling, crossing, counting and settling in order. On iOS 27, once let go, it drew over the device notice's words; it now sits on its own patch of ground. Ten frames a pull, in both, confirmed it. The first build drew the tally on the re-read after a return to the app as well; now, in iOS 27 Safari, a return after fourteen seconds away ran the 2px line for half a second and no tally, and a pull drew the tally through pulling, crossing, counting and settling with no line.
- **1.1's two sequences, in the installed copy on iOS 26**, on the current build, with a temporary account's session: Now, People, You, the code screen and a market (the call sheet's "What happened?" field), in dark and in light.

| | `innerHeight` | `visualViewport.height` | `offsetTop` | pinned bottom |
|---|---|---|---|---|
| At rest (every root and the market) | 874 | 806 or 874 | 0 | tab bar 775 to 874, sheet to 874 |
| The code screen's own focus, no keyboard | 874 | 874 | 0 | sheet 731 to 874 |
| Keyboard up on the code screen | 812 | 488 | 0 | 812 (under the keyboard) |
| Keyboard up on the market's field | 461 | 461 | 351 | 461 |
| Reopened from the home screen with it up | 461 | 461 | 351 | 461 |
| After each run | 874 | 806 | 0 | 874 |

  Sequence (a), the field, the keyboard dismissed, the page scrolled: three runs on the market (two dark, one light) and one through the code screen from Now in each; sequence (b), the keyboard up, the home screen, the copy reopened, the keyboard dismissed: three runs on the market. Now, People and You afterwards in both appearances: the tab bar at 775 to 874 every time. Forty readings, none drifting.

### What broke

1. **The words for the close counted everyone left** ("two of Tam and Gabe"). Fixed.
2. **The reveal's avatars**: the viewer's "Y", the guest's colour, the avatars over the pill. Fixed.
3. **The attach flow's draft hidden from its asker** on the game page. Fixed and held by an http test.
4. **"Q3 · 0.0" between quarters.** Fixed, held by recorded scoreboards.
5. **A guest's expired question with share and copy**, and the void rule's caption on an expiry with too few in. Fixed and held by an http test.
6. **The tally**: crossing while held, a blink, and its strokes over the notice. Fixed.
7. **The installed copy opened blank white** after three days in the background; closing that copy from the app switcher and opening it again cleared it.
8. **Taps that did not land**, four in about a hundred: two were mine (the page had scrolled the back control away under the finger), and two tab taps came while the development server was compiling a route for the first time. None recurred with the page's touches logged.
9. **One database test lost a race with production's minute tick** in the full run (the feed queues' test, whose game the deployed tick reached first); it passes alone, as the second pass recorded.

### Not verified here

A real phone at all. Signing anything on the simulators, since a session made for a temporary account has no sign-in code: entering, the asker's own close and the votes were exercised by the database suite on the real chain, not by finger. The live score in overtime or a shootout, which no recording has caught. Items 223 to 237.

## Session 39: first contact, second pass, on the iOS 26 and iOS 27 simulators

**When:** October 6, 2026. **Who:** the "iPhone 17 Pro iOS 26" simulator (iOS 26.0) and the "iPhone 18 Pro" simulator (iOS 27.0), in Safari, against the development server. Askers were temporary accounts (Rae, Sol, Tam) through sessions made for them on `localhost:3000`; guests were in private tabs and on the loopback address (`127.0.0.1:3000`). Touches through the simulator tool, readings through the simulators' Web Inspector, in points from the top of the page. Every account, question and game made for the runs was a fixture's, removed by the sweep. The account paths were not run (below).

### Exercised

- **The join step** (a game's question, both simulators): "Who's joining?" at 436, the votes line at 470, "Your name" at 502, the main action at 580 and "I already have an account" at 646. "Justin incognito" typed on iOS 27: "Join as Justin incognito" at the field's width (370). "Rachel Okafor-Lindqvist the Second" on iOS 26: the button grew from 56 to 68 and wrapped the whole name onto two lines, "I already have an account" 10 under it. On a question that is not a game's there is no votes line ("Join as Pat Quinn", iOS 26).
- **The account step after a new guest's first entry** (both): "Keep your calls in an account" at 344, "Continue with Google" at 378 as the chalk with Google's mark at 20 by 20, "Email" at 446, its Continue at 526, "Use a phone number" at 586, "Not now" at 646. "Not now" closed it and the entry stayed.
- **A remembered guest** (both): on the next question, "Joining as Justin incognito · Not you?" (iOS 27) and "Joining as Pat Quinn · Not you?" (iOS 26), each with "I already have an account" 30 under it. Where the phone had shown the account step already, the entry saved with no step. Where the phone remembered its guest from before this build (the phone's own mark cleared by hand to stand for one), the step came after the next entry, Google first, and not after the one after.
- **Who's in** (both): "Whoever I send it to (chosen)" at 448, the set at 522, "Someone else" at 596, for an asker with a set (Sol); "Whoever I send it to" alone for an asker with none (Tam).
- **"Share it first" in view** (both, Safari's 714-point screen): on a draft, "Share it first" at 438 to 482 above the sheet's top at 484 (before the change, 856 to 900, under the screen's edge); on a new game's page the share row at 398 to 442 (before, 842 to 886); on the game's question its asker had not entered, the share row at 340 to 384 above the resting sheet (before, under the raised sheet). That last was read without the notice a test session carries at the top ("This device hasn't checked it's you yet", 154 tall), which an asker's own phone does not show; with it the row sits at 494 to 538, under the sheet. The game's cards read "Closes at kickoff · nobody's in yet" (before, "0 of 1 in").
- **A question too far out** (both): "Will people be living on Mars by 2060?" left the decided chips unpicked, with "That can't be known until December 31, 2059, and the furthest a question can run is October 6, 2029." on iOS 27 and "… January 1, 2060 …" on iOS 26 (the model's date each time) and a nearer version under it; "Send it" before choosing was refused with "Pick when it's decided."; "Ask this instead" put the nearer title and terms in the step with its date picked. Once on iOS 26 the write-up first asked which of three readings was meant, which is where the readings below were found.

### Found and fixed during the session

- A draft's moves sat under its terms, below the screen; they come first, under the question.
- A new game's share row sat under its questions, below the screen; it sits under the header.
- An asker's own game question opened its sheet raised over its share row; the asker's sheet rests until they are in.
- A game's cards read "0 of 1 in" for an asker who was not in; the asker is left out of the count until in, and none in reads "nobody's in yet".
- Terms that name a year were compared without it, so the line could read "The terms say October 6, and it's decided October 6"; the year is read, and the line names it.
- Safari 26.0 has no `field-sizing` (Safari 27 does): the echoed question showed two of its three lines (82 of 112) and terms past three lines scrolled inside their box. A field is sized from its content where the browser cannot do it (the same question then at 114, whole); on iOS 27 nothing changes.
- A long reading was cut off at both ends of its button; readings wrap. Read in iOS 26's WebKit with the button's own classes at the box's width: 44 tall and cut before, 86 and whole after. The model did not ask for readings again in two more runs, so the fix itself was not seen in the flow.

### The account paths

Not run. Each signs in through Dynamic, an identity provider that does not run on this machine, which the rules this work runs under do not allow, test account or not. They are items 213 to 215, with what to count. The test account is out of every count, and its code was never printed.

### Not verified here

Everything past Dynamic's step: keeping a guest's calls, signing in from the join step, the one card's link, Google's return (items 211 to 215). A tiebreaker ruling made by Opus in production (220). The quorum on a real question in a set where someone not in it was registered before (221). Everything on a phone.

## Session 38: first contact, on the iOS 26 and iOS 27 simulators

**When:** October 4 to 5, 2026. **Who:** the "iPhone 17 Pro iOS 26" simulator (iOS 26.0) and the "iPhone 18 Pro" simulator (iOS 27.0), in Safari's private tabs, and the development build installed from Safari on iOS 26 ("Dareful local"); the production copy installed on iOS 26 for 1.1. Touches through the simulator tool, readings through the simulators' Web Inspector. Every account and question made for the runs was a fixture's, removed by the sweep; production was read, never written, for the model comparison and the lists.

### Exercised

- **1.1's two sequences** in the production copy, ten valid runs each in light and in dark on Now, People and You: with a keyboard up the visible part 488 of 812; after it, 874 tall with the tab bar at 775 to 874 every time. The run found the code screen's own focus dropping the root with no keyboard, fixed by `data-typing` and confirmed on the development build in the installed copy: arriving on the code screen by a tap from Now, its own focus left the root 875 tall with the sheet at the bottom edge and no keyboard; a tap on the boxes raised the keyboard and the flag (the root 812, the sheet above the keyboard); dismissing it returned the root to 875 and the sheet to the edge.
- **Joining from a link as a guest, thirty runs**: ten each in an iOS 26 private tab, an iOS 27 private tab and the installed copy, against the development server. The first run on each surface was cold (a new private tab, a fresh install); runs two to ten forgot the guest in the same tab through the product's own "Not you?" and "Forget them" and cleared the phone's storage, so the page and the tip were a first visit each time but the browser's cache was warm. Taps are counted by the page: the primary ("I’m in at 50%, $5"), the name field and "Join as", with the tip's Done first on a first visit. Page load is the navigation's load event; "saved" is from the tap on "Join as" to the keeping step on screen, which follows the stored entry. The last column is the whole run from opening the link, paced by the simulator tool at several seconds an action, not by a person.

| Surface | Run | Tip first | Taps to the entry | Page load (ms) | Saved after "Join as" (ms) | Link to saved, tool-paced (s) |
| --- | --- | --- | --- | --- | --- | --- |
| iOS 26, Safari private | 1 | yes | 3 and the name | 1780 | 1574 | 79 |
| iOS 26, Safari private | 2 | no | 3 and the name | 1537 | 1439 | 117 |
| iOS 26, Safari private | 3 | yes | 3 and the name | 924 | 1375 | 149 |
| iOS 26, Safari private | 4 | yes | 3 and the name | 950 | 1431 | 110 |
| iOS 26, Safari private | 5 | yes | 3 and the name | 911 | 1434 | 99 |
| iOS 26, Safari private | 6 | yes | 3 and the name | 884 | 1493 | 99 |
| iOS 26, Safari private | 7 | yes | 3 and the name | 771 | 1579 | 98 |
| iOS 26, Safari private | 8 | yes | 3 and the name | 1001 | 1612 | 98 |
| iOS 26, Safari private | 9 | yes | 3 and the name | 790 | 1365 | 108 |
| iOS 26, Safari private | 10 | yes | 3 and the name | 798 | 1399 | 89 |
| iOS 27, Safari private | 1 | yes | 3 and the name | 2232 | 1615 | 122 |
| iOS 27, Safari private | 2 | yes | 3 and the name | 889 | 1506 | 76 |
| iOS 27, Safari private | 3 | yes | 3 and the name | 1577 | 1855 | 80 |
| iOS 27, Safari private | 4 | yes | 3 and the name | 1936 | 1830 | 80 |
| iOS 27, Safari private | 5 | yes | 3 and the name | 1536 | 1827 | 79 |
| iOS 27, Safari private | 6 | yes | 3 and the name | 1496 | 1637 | 80 |
| iOS 27, Safari private | 7 | yes | 3 and the name | 1425 | 1507 | 80 |
| iOS 27, Safari private | 8 | yes | 3 and the name | 1361 | 1547 | 80 |
| iOS 27, Safari private | 9 | yes | 3 and the name | 1296 | 1381 | 79 |
| iOS 27, Safari private | 10 | yes | 3 and the name | 1265 | 1428 | 80 |
| iOS 26, installed copy | 1 | yes | 3 and the name | 1859 | 1502 | 91 |
| iOS 26, installed copy | 2 | yes | 3 and the name | 1316 | 1468 | 135 |
| iOS 26, installed copy | 3 | yes | 3 and the name | 1246 | 1427 | 129 |
| iOS 26, installed copy | 4 | yes | 3 and the name | 1463 | 1425 | 111 |
| iOS 26, installed copy | 5 | yes | 3 and the name | 1472 | 1341 | 120 |
| iOS 26, installed copy | 6 | yes | 3 and the name | 1600 | 1773 | 111 |
| iOS 26, installed copy | 7 | yes | 3 and the name | 1346 | 1342 | 120 |
| iOS 26, installed copy | 8 | yes | 3 and the name | 1347 | 1406 | 110 |
| iOS 26, installed copy | 9 | yes | 3 and the name | 1508 | 1578 | 111 |
| iOS 26, installed copy | 10 | yes | 3 and the name | 1277 | 2100 | 121 |

  Medians: page load 0.92 seconds in iOS 26 Safari, 1.46 in iOS 27 Safari and 1.41 in the installed copy; the entry saved 1.44, 1.58 and 1.45 seconds after "Join as".
- **Sign in at the first step**, in the installed copy: "Sign in" sits directly under "Your name" at the same width (370 points); it opens "Sign in" with Email and Continue, "Continue with Google", "Use a phone number" (switching the field to a phone number and back) and Back, which returns to the name with nothing carried. Stopped there: no address, code or Google account was entered.
- **Google in the installed copy**: from Dynamic's sheet, Google's sign-in page opened inside the app's own window, with the app's close at the top, and closing it returned to the app. Not signed in.
- **The sheet by finger**, in iOS 26 Safari and the installed copy: raised to resting to tucked by two drags, then one long drag from raised straight to tucked; tucked, the handle row sat above Safari's toolbar and above the home indicator, and a tap on it raised the sheet; the page's room followed each position (485, 251 and 99 points in Safari; 549, 285 and 133 installed). In iOS 27 Safari one long drag tucked the draft's sheet.
- **The last row**: Now with ten questions running in the installed copy, scrolled to the end, its last row ended at 621 against a tab bar from 775; in iOS 27 Safari the same, clear of the Start button. In starting a game with three questions, "Stakes, for all 3", its chips and "Back to who’s in" sat clear of the sheet.
- **Asking**, in iOS 27 Safari: "Market type" and "AI market setup" with their chips; "How many slices will Sam eat?" switched the type to Pick a number; who's in started at "Whoever I send it to" (and in starting a game on iOS 26); the terms step showed the write-up's date picked as "Oct 5" with Tonight, This week and This month beside it, and a tap on Tonight picked it. An idea with a blank opened with "Who?" and the one person the account knew, the primary waiting, and a tap filled "Will Rae win the pong game?".
- **A draft and a withdrawal**, in iOS 27 Safari: the draft on Now under Needs you ("You never sent this one", Finish), its page at rest with the terms on screen, "Discard it" on the page: the draft gone and Now without it. "Withdraw it" on a question nobody else was in asked once and called it off; Now was empty after.
- **First-visit tips** on the link page, Now, What's on, the question step and a draft: one to three, a tap anywhere moving on, never over a sheet that was open.

### Found and fixed during the session

- The guest's page remounted the entry stage when the entry arrived, so the keeping step vanished after "Join as"; it now has one place while open.
- The iOS 27 simulator says the browser is offline with the network up, so the offline bar stood on every screen and every tap was refused; the word is settled by a request first.
- The first entry's primary was under the line at rest; a first entry opens raised.
- The sheet took two drags to tuck from raised, which read as not tucking; a drag lands where the finger let it go.
- Now's tenth row sat under the tab bar, and the start flow's stakes row under the sheet, because the page was held at its minimum height in the scrolling column; it grows with its content.
- The draft's raised sheet ended short of "Share it first" and "Discard it" on a 714-point Safari screen (they sat at 695 to 739); they are on the page under the terms, and a draft rests.
- A tip's ring slid while its cut-out jumped; they move together.
- The chain backstop test failed once with the page suite running beside it: production's tick, which reads every game in the shared database once a minute, had marked the test's made-up game read; the test clears the mark before it reads, as it already did for the finals.

### Not verified here

Anything past Dynamic's step: making an account by email, by phone or with Google, signing in at the first step and the entry arriving under the account, and Google's return inside the installed app (items 190 to 194). The one card (195), which needs a Dynamic login on the device. "Share it first" (198), which signs. Everything on a phone.

## Session 37: the two feed queues and the four pitch numbers

**When:** October 3, 2026. **Who:** the suites against the shared database, in windows and rows of their own; production read once through the page's own function.

### Exercised

- **The backstop's one place** going to the question that can settle while an older one waits on its second source, and **a failed listing** giving its games' places up for ten minutes, both against the real database with recorded games under this run's prefix and no chain write.
- **The four numbers** in a day in 2003 nobody else has rows in: one person who was in a friend's question before asking (not the one who asked first, not an excluded account), one set with two questions (not the set with a called-off one, not the set whose two were one game's), a rate of 50 from a vote's answer and the tiebreaker's void (the final score's void and an expiry in neither), two of photos and stickers (not the excluded account's photo, not a plain picture); the day before reads zero for all four.
- **Production, read once** on October 3: since launch 3 people, 3 sets, 63 percent (5 of 8) and 11; in the last seven days 1, 1, 50 percent and 8.

### Not verified here

The four on the page itself: `/stats` answers the code screen locally, since `OWNER_USER_IDS` is not set on the development machine (item 188).

## Session 36: the field round, 1.1 in installed copies on the iOS 26 simulator

**When:** October 3, 2026. **Who:** the "iPhone 17 Pro iOS 26" simulator (iOS 26.0), which the owner let Claude use: the deployed build installed from dareful.app with the owner's own session, and the current build installed from the local server as a visitor. Touches through the simulator tool; readings through the simulator's Web Inspector. The real localhost session in the development browser for the pace row.

### Exercised

- **The old build, Now, one keyboard.** Fresh launch: `innerHeight` 874, `visualViewport.height` 874, `offsetTop` 0, the tab bar at 775 to 874. A code box focused and the keyboard dismissed: `innerHeight` 874, `visualViewport.height` 806, `offsetTop` 0, the tab bar at 707 to 806 with a band under it. The owner's finding, reproduced.
- **The current build, a market, both sequences, light and dark, ten runs each.**

| | `innerHeight` | `visualViewport.height` | `visualViewport.offsetTop` | pinned bottom |
|---|---|---|---|---|
| Fresh launch | 874 | 874 | 0 | 874 |
| Before each run (after the first keyboard) | 874 | 806 | 0 | 874 |
| Keyboard up, from rest | 498 | 461 | 313.7 | 498 |
| Reopened with the keyboard up | 560 | 461 | 251.7 | 560 |
| After each run | 874 | 806 | 0 | 874 |

  Sequence (a), the field focused, the keyboard dismissed, the page scrolled up: light, ten after-readings of ten the same; dark, six of ten came back, the same. Sequence (b), sent to the background with the keyboard up and reopened onto the market: light, ten reopened readings and eight after-readings the same; dark, ten and ten. The readings that did not come back were the inspector timing out. 806 is what iOS 26 leaves in `visualViewport.height` after any keyboard; the app no longer reads it.
- **Safari on the same simulator**, the same question: `innerHeight` 714, the pinned bottom at 714, the picture as before the change.
- **The pace row**, in the real session: under the Yes or no chip with no heading, gone when A number is chosen.

### What broke

1. **The new shell stood 62 points short in an installed copy on iOS 26** (`innerHeight` 812 of 874, a band under the sheet at rest). A root one pixel taller than the large viewport is laid out whole; confirmed from a cold load.
2. **The taller root left a pixel behind after a keyboard** (the window scrolled by 1, everything pinned at 873). The root is the plain height while a field is focused; after that, 0 and 874 in every run.
3. **The installed copy kept an old stylesheet** across reloads of the development server's unchanging address, which made the first fix read as not working; the copy's cache was refreshed before each measurement after that.
4. **The inspector stalled twice** and two runs of sequence (b) in light were recorded out of step; they were thrown out and run again.

### Not verified here

Now, People and You on the current build in an installed copy: they need a session at the local address on that simulator, which is the owner's to make, or the deploy (item 185). The caret on a real phone (item 186). A real phone at all: every reading here is a simulator's.

## Session 35: the field round, the owner's follow-ups

**When:** October 3, 2026. **Who:** the real localhost session in the development browser; the suites against the shared database and the local server; production read through the Supabase MCP; the iOS 26.0 simulator runtime, installed.

### Exercised

- **What the data says about late changes.** The positions on the friend's Red Sox question (five, the last entered at 10:10am Eastern on September 30) and on the Lightning question (two, entered at 8:48pm and 8:49pm on October 1), and the group's-number series for both, which gets a point at every entry and change: five points and two, each one a first entry, none after either game began.
- **The close time ending editing**, against the real database: an entry and a change each stamped; three in with one changed after the close time, closed with the two that count and the third left out; two in with one changed late, ended as an expiry by a person's close and by the tick; an entry and a change refused past the time.
- **The close in the sheet**, over http across three accounts: the asker's secondary with "Close it now and … can’t get in." while it runs, nothing for the friend who is in, and for both the main action once it is stuck; nothing for someone in the set who is not in it.
- **The reminder's night**, against the real database with three voters in two zones: two told and one waiting, the question unmarked; the third's morning, and all three told once.
- **The queues**: a split question out of the votes-decided list at a limit of one; the final score's questions out of the tiebreaker's list (inside the chain suite's backstop test); a chain write that could not be finished touched and sorted behind one not yet tried.
- **The session door** keeping `America/Chicago` from the zone cookie and ignoring a name that is not a zone.
- **The sticker's two legs**, with a stand-in cutout the size of a lifted subject: 46 to 75ms to shrink in the development browser (11.6MB to 1.3MB, transparency kept), 0.43 to 0.69 seconds for the server's part from this machine.
- **iOS 26.** The 26.0 runtime downloaded and installed in about five minutes; a simulator made and booted; the build from before the shell served on a second port beside the current one, each with its installed copy pointed at a test question for the check.

### What broke

1. **The stage went with the close.** Part 2 drew the stuck market's close in place of the stage, which took the entry line of someone in with it; the close is a slot inside the stage now.
2. **An older test's order.** The reconciler's test expected the write left unfinished last minute to come first; least recently tried first puts it after one not yet tried, which is the point, and the test says so.
3. **Four older mutants and six of this round's** went stale under the edits and were pointed at the new lines; the static check reads them all.

### Not verified here

The two sequences of 1.1 in an installed copy on iOS 26: the simulator tool needs the owner to let Claude use the new simulator, and the request was not answered. A vote thirty-one days in (it needs a session with no Dynamic login). The stacked stamps, the close's sheet and the give-up at a minute on a phone. Items 174 to 184.

## Session 30: the QA round, on the simulator and across four accounts

**When:** September 29, 2026, after the logo round was deployed. **Who:** four accounts. The real sessions on `localhost:3000` (the development browser, whose pane stayed hidden, so it was driven by script and read by script) and `dareful.app`; Xcode's iPhone 18 Pro simulator (iOS 27) with Dareful added to the home screen and signed in to production as one test account, and its Safari signed in as another; a private tab in that Safari as the visitor with no session. The simulator's web views were read and driven through its Web Inspector (a scratch tool over `appium-remote-debugger`), so every reading of a layer, a viewport or a tap is real WebKit's, and every tap is the simulator's own; its screenshots lag a tap by a second or two. The local build could not be run signed in inside the installed app: putting a test session's cookie into the simulator's browser by hand is materialising a credential and was refused, so what a fix changes there is confirmed on the local build in Safari signed out, or in the real localhost session, and listed below as a phone check where the installed app is the only place it shows.

### Exercised

- **The owner's ten findings**, each reproduced first and confirmed fixed where the simulator could reach the fixed build. The fixed layers: the drift measured on real WebKit as the visual viewport out of step after a keyboard (every fixed box, the status band included, off by the same distance), the page left scrolled under the header after typing an amount (production, the installed app), and the guard exercised by forcing the keyboard's pan to count (the top layers written 304 down, the status band back at the top, cleared when the keyboard went). Transitions: the swipe-back picture read as the market's shell, `hasUAVisualTransition` true on the installed app, and the duplicate `market-ink` name on a game page. The entry sheet's timer. The information sheet dragged by its handle with the page holding still. The pinned sheet dragged up and down with `scrollY` at 0 and no re-read. Measure the screen: the tab bar's bottom at 874 of 874 on People and You with nothing open, then removed. The argument flow: "That didn't come back." reproduced as the ten-second block over a seven-second triage with a dead Try again, "Couldn't save that." as the ask layer standing over the draft after Send it (production, the installed app); on the local build an argument was asked in the real session (the triage landed at 7.0 seconds with "Still going." at three and no block), sent with the layer gone, the other side taken by a ghost from Safari, locked at once, proposed by the model, called by the asker's vote, and settled ("Wisp's got $5").
- **The multi-person flow on production**, start to finish, between the installed app, Safari and the private tab: a question asked and entered; the friend's invitation card and entry; a ghost's entry with a name and no number; the asker's early close; the claim from a well; the vote sheet and two votes; the provisional settlement with its two proposals of 102 cents from the ghost's claim (read from the table and checked against the scoring rule); the result tile fetched and looked at; a cover of $12 logged from the person view, its yep row and confirm screen on the other account, the open $12 on both sides, settled from the creditor's card; then $8 one way and $5 the other, confirmed, cancelled out ("After this, Claude Safari's got you $3."), the emptied card reading settled, and the $3 called even, with "Nothing open between you." once the indexer caught up.
- **What the simulator found on its own, on production:** one tap on the odds line entering a person (the click recorded landing on the primary that rose into the spot; both accounts); the pinned sheet's box swallowing every tap below its top on the person view (the creditor's card and the netting's button unreachable by a finger; `elementFromPoint` gave the section); the person view's cover sheet fully raised after a hard load in Safari and in the installed app (no translate on its panel); the entry line still under the claim card once voting opened; "Tomorrow" reading "Closes Thursday" at 8:26pm; every server-drawn clock in UTC for a browser that had never drawn a relative time; a ghost's screen once in ordered as no member's is, the "Closed" sheet over their entry once locked, and "This one's finished." once settled; the call sheet's wells clipping "Finished before midnight"; a ghost's avatar in a hue under "Who's got who"; "1 of you say the same thing" for a quorum of one; taking a side on an argument leaving the sheet low; a phone that remembers a ghost asking for a name it then ignored.
- **On the local build in Safari, signed out** (dark, then light): the ghost's three states (in, locked with the clock, settled with the outcome); the closings ("Closes tonight", "yours to change until 11:59pm"); the zone cookie written on the first screen; the tap rule refusing a held tap on the line and, with Reduce Motion on (the sheet jumping), a quick one; "Joining as Wisp · Not you?" and "Forget them".
- **Appearance and motion:** the installed app followed the phone from light to dark live; the local screens in both; Reduce Motion read by the page (`prefers-reduced-motion` matching) with the pinned sheet's transition at none.
- **The cold start** of the installed app after it was terminated: the bare ground, then Now; the count itself was not captured (the screenshots lag).
- **Link previews:** the question's tags and its result tile, a game link's tags and tile (the plain card on production, which the round rebuilds), and a dead link's plain card, all fetched directly.
- **Production's logs** for the keep-warm visit: `GET /` beside every `/api/tick`, and Now's first byte at 0.11 to 0.25 seconds.
- **What the round left in the database**, all under the two test accounts and their ghost, none deleted: on production the walk's question (79ee79cb…, settled by the contract's rule with the ghost's claim 60422d1a…), its three covers (2e581ae1…, ba3d2ac3… and the $5 the other way, settled, cancelled out and forgiven in turn); on the local build, which shares the database, the argument and the ghost's questions (cc4d1c35…, 7b74eb44…), the Islanders at Maple Leafs set (0f332303… on game c1e2a855…) and a draft never sent (e854ce80…, "Will the QA slot test question get sent cleanly?", left as a Finish row on the owner's Now since the development browser holds no Dynamic login).

### What broke

Each with what was wrong, what changed, and how it was confirmed; the decisions and their alternatives are in docs/decisions.md ("The QA round").

1. **The entry sheet lingered** (finding c): a 1.8-second timer kept the sheet after the entry line arrived. The sheet now stands only while entering is the move (`sheetPresent`). Confirmed on the local build in Safari: a ghost's entry landed with no sheet beside the entry line; unit test and mutants.
2. **The information sheet** (finding e): capped at 560px, its name and fixed line pinned over a padded scroller, its icon above the ask layer (the second icon). Now `Sheet full`, nothing sticky, the icon part of its page. Confirmed on the simulator's Safari (the local build): the sheet at content height, dragged by its handle with the page holding still and no re-read.
3. **A drag on a sheet's handle scrolled the page** (finding d): pull-to-refresh started on the sheet, the handle's claim was CSS alone, the modal's rise animation overrode the drag, the close sat inside the captured row, the pinned sheet's box took touches over the page, a parent-driven raise had no transition, and after a hard load the sheet measured detached nodes. All changed (`handle.ts`, `pullStartsHere`, the sheets). Confirmed on the simulator's Safari (the local build): the pinned sheet dragged up and down with `scrollY` at 0 and no runner; `--sheet-room` 195px after a hard load. On production, seen in both browsers: the person view's cover sheet fully raised after a hard load, and the sheet's box swallowing every tap below its top (the covered card and the netting's button unreachable by a finger; reached through the inspector).
4. **The fixed layers** (finding a): the phone's viewport out of step after a keyboard, every fixed box off by the same distance; a task screen that fits laid out short (the sheet 62pt above the edge); the page left scrolled under the header after typing (seen on production in the installed app). `ViewportGuard`, `[data-fixed]` on every layer, the min-height on every document screen, the keyboard dropped before its field goes. Confirmed on real WebKit with the keyboard's pan forced to count; the stuck state itself could not be reproduced on iOS 27.
5. **Transitions** (finding b): the phone's swipe back animated by the browser with the app's transition on top; a market opening as its band alone; two elements named `market-ink` on a game page. A traversal known in one place, arrivals held still, fetching on the touch, the history's entry at the tap. Confirmed in the real localhost session (the address and the entry at the tap, back returning to Now) and on the simulator (`hasUAVisualTransition` true, the swipe picture the shell); the full feel needs the installed app on the fixed build.
6. **Measure the screen** (finding f): confirmed gone on the simulator first (the bar at 874 of 874), then removed with the instrument.
7. **The argument flow** (finding g): the ten-second block over a six-to-nine-second triage with a dead Try again, and the ask layer standing over the draft after Send it (the second tap inserting the same id). Reproduced on production in the installed app; fixed and walked end to end in the real localhost session with a ghost as the other side.
8. **A close chip's word** ("Tomorrow" reading "Closes Thursday" at 8:26pm): the chips are days in the asker's zone (`closings.ts`).
9. **Every server-drawn clock in UTC** on a browser that had never drawn a relative time: the zone reported from the root (`ZoneReporter`).
10. **One tap on the odds line entered a person** (production, both accounts, recorded): a tap counts only on the control it began on (`taps.ts`); confirmed on the local build with a held tap and, under Reduce Motion, a quick one.
11. **A ghost's screen once in** (production): the order, the Closed sheet over their entry once locked, "This one's finished." once settled, and no poll. Now the market as anyone in sees it through every state; confirmed on the local build in Safari.
12. **Taking a side on an argument** left the sheet low; the side raises it. Confirmed on the local build.
13. **A phone that remembers a ghost** asked a name it then ignored; now "Joining as Wisp · Not you?" and "Forget them". Confirmed on the local build.
14. **"1 of you say the same thing"** for a quorum of one; now "the moment you say it".
15. **The wells clipped** "Finished before midnight"; they wrap.
16. **The entry line under the claim card** once voting opened (production, both accounts), marked closed in Round C and back: `MarketStage claimed`, held by a test.
17. **A ghost in a hue under "Who's got who"** (production): stone and dashed there too, held by the ghost test.
18. **A database test that could not pass** (`pick-one.test.ts`, the tie): it counted one resolved pick-one for Maya where the file gives her two; it fails at HEAD the same way (checked in a throwaway worktree). The expectation is corrected.
19. **The seven areas** (What's on as one flow, the game tile, the names, the words, the styles, the screens, the sheets), each with its tests and mutants, and their requests of the shell applied (the presses on the who's-in row, the team line and the market page's rows; the More sheet's median on a signed margin, which threw; careful mode with yes-or-no alone; the "down" glyph; the app's description).
20. **An address with no screen got Next's own page**: the ask slot's catch-all (the first way out for the layer standing over a sent question) made every address a matched one, so `/new` answered 404 with the framework's empty shell; the http suite caught it. The slot now names the addresses it holds nothing at (`src/app/@ask/nothing.tsx`), and the code screen is served for a mistyped address again. Confirmed by curl on the local build and in the real localhost session (Start, Close, Start again, a question sent and its screen reloaded, with nothing of asking over it).
21. **Found under it, not fixed:** `notFound()` from a page (someone else's draft, a cover that is not yours) answers 404 with the same empty shell in Next 16.3.5, dev and production alike, reproduced in a bare app with a bare layout; the code screen is drawn on the client once the scripts run, after a first paint of the browser's canvas. Production has done this since the code screen was made. Listed for the owner (docs/decisions.md), with item 150 for the phone.
22. **The audit believed a dead server** (2026-09-30): the dev server's compiler crashed forty-five minutes into the audit and every later http mutant was counted killed. The runner now asks the server before and after each one, voids a kill it cannot vouch for, stops, and says where to resume; the http layer was run again with a live server throughout (218 mutants in three stretches). Seven mutants survived across the layers, each a weak assertion or an equivalent mutant, none a fault in the app; each is fixed and killed alone (docs/decisions.md 2026-09-30).

### What needs a phone

The QA items in the checklist below (134 onward), above all the four that only the installed app can show once it runs the fixed build: the fixed layers after a keyboard, the swipe back with no second transition, the person view after a cold open, and a tap on the odds line.

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
8. ~~**Pull to refresh in the installed app** (10)~~: superseded on 2026-10-07 by item 235 (the tally draws with the pull; the 2px line stays for the re-read on return).
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
50. **A market link with no account, on a phone, in a private tab** (19): open a yes-or-no question's link, slide, see the sheet ask for a name and a number, join; expect "You're in at 70%" and "One friend is in, and you", no sign-in, no code, and the other account's phone showing the entry in the stack and on the weight line within a refresh. **Covered on the simulator (30):** a private tab on production joined as a ghost with a name and no number, "3 of you in", the picture; the copy has moved on since this item was written.
51. **The same for a pick-one question and a What's on question** (19): "Join: Priya, $10" on a pick; the two teams on a who-wins question from the game page's rows, which a signed-out visitor sees listed under the game. **The What's on half covered on the simulator (30):** a who-wins question opened signed out with the two teams, and the game page's list for a signed-out visitor.
52. **Phone-number claiming in production** (19): join with your real number in the private tab, then sign in with that number on another phone; expect the position on the account, unsigned, with "This was you before you signed in. Keep it, or change it." on the question, and "Confirm at 70%, $10" making it signed; expect a pending consequence from a settled provisional question to name the account.
53. **Signing in from the tab that joined** (19): tap "Sign in" under the facts in the same private tab; expect the same bind by the browser's token, and the ghost gone from the set's members.
54. **The tiebreaker on a provisional question** (19): a question with a ghost in it, locked, nobody agreeing, "Let the tiebreaker call it"; expect the ruling recorded and pending consequences, nothing on the chain.
55. **A notification opening its target on iOS** (20): with the installed app in the background on another screen, tap a notification; expect the question it names, not the last screen; then with the app closed; then with it open on Now while the banner arrives.
56. **The keyboard on a new answer** (20): on a pick-one question's answers, tap "Add an answer"; expect the keyboard to stay up with the new row focused.
57. **The band under the tab bar** (20): read the phone's iOS version; on 26.0 or 26.0.1 the band is the known WebKit bug and nothing in the app; on 26.1 expect the bar at the very bottom with no band. Run "Measure the screen" on You and expect the window's height to equal the screen's.
58. **The unfolded Fold** (20): open Now, a question and the ask flow on the inner screen; say which screen fails and what is on it (a screenshot), since two Fold-sized viewports here rendered as a phone does.
59. **Lifting a subject in the installed app** (20): long-press a photo in a question's frame; expect either the iOS callout with "Copy Subject", or nothing, and say which. The sticker entry point waits for the answer.
60. **A judge's account** (20): on the console's Test Accounts page, set the static code; sign in on a phone with an email of the form name+dynamic_test@yourdomain and that code; expect the name question and two wallets as any account gets, then the ordinary app.
61. **The band on People and You, with the probe closed** (21, 22): cold start the installed app and open People, then You, without opening "Measure the screen". Expect the bar at the very bottom on both, as on Now and What's on. The owner's readings settled the cause: a page that scrolls is laid out right, and the band appeared only on a page that fit the screen, so every root is now at least one pixel taller than the large viewport and the gap adjustment is gone (it overcorrected on the short pages). If the band is back, open the probe on You and send the reading: "document scroll height" should say "(scrolls)" and be above the window's height; if it does, the one-pixel margin was not enough for this iOS and the next step is a taller minimum; if it does not, `100lvh` is reading short here and the readings decide the next one. **Covered on the simulator (30):** the tab bar's bottom at 874 of 874 on People and You in the installed app with nothing open; the probe is gone.
62. **Sharing in one place** (21): on a question you are in, the three icons at the end of the who's-in row; share opens the phone's share sheet with the question and the link; copy turns to a check for a moment; the code opens the sheet with the mark in the middle of the code and the six characters, and a second phone's camera opens the link page from it. **Seen on the simulator (30):** the three icons at the end of the who's-in row; the share sheet itself needs a phone.
63. **Photos while it is open** (21): the slot last on the screen opens the camera itself; the photo lands in the frame with the add tile and the caption; the other participant sees their own slot and nothing of yours; once it ends, your photo joins the frame for everyone.
64. **The cuts** (21): read the draft, the ask flow, joining, first run, What's on and a game's start for any sentence the cut list removed; expect none, and no example inside any field.
65. **The pick-one sheet** (21): on a pick-one question you are not in, the sheet opens raised with the answers; swipe it down to the bar ("Pick one" and "3 answers"), touch the bar to raise it, pick one, lower it again and expect your pick's name and a check on the bar with nothing lost.
66. **"I got this one" on a phone** (21): on a person's page, the chalk at the foot; raised, the units, how many, the two rows with the token, the primary in words; log one and expect the card in today and the other phone's yep row. **Covered on the simulator (30):** the sheet from the foot of a person's page, $12 logged, the card in today, the other account's yep row and confirm screen.
67. **On its way** (21): with the network slow, settle a cover you are owed; expect the card to wear the on-its-way mark with "Settled · on its way" and Now to carry it in Just happened with the mark, then the ordinary card within a minute of the tick, and never a sentence about it.
68. **Didn't go through** (21): when a told send is dropped, expect the row on Now with the didn't-go-through mark, "Didn't go through" and "Try again", and the same line above the card on the person view; tapping Try again sends it again.
69. **The heads-up** (21): on the installed app with notifications not yet decided, get into a question; about two seconds after the columns grow, expect "Want a heads-up?" with the two rows, "Turn on notifications" raising the phone's prompt and subscribing, or "No thanks"; then never again, on this phone or another.
70. **The named subject on a phone** (21): careful mode with a bare name; expect "Who's Nova?" with three choices, then "Nova is a pet" with Change over the questions.
71. **The album is open the whole time** (22): on a question two phones are in, take a photo from the slot on one; on the other, pull to refresh and expect the photo in the frame at once, credited by first name, last on the screen under the details, with the add tile after it; then on a third phone signed in to an account in the group but not in the question, expect the frame and no add tile; then open the link with no session (a private window) and expect no photos at all. Lock it and expect the photo still there through the vote, with the claim's screenshot on the claim card and not in the frame.
72. **"Got a code?" on Now** (22): on Now, the tertiary at the top right on the date's line; tap it and expect the joining screen with the six boxes. An empty Now keeps the boxes themselves.
73. **The cover's notes** (22): raise "I got this one" on a person's page; expect the sheet to open short, with "Optional" under who picks up next, "What was it" and, with a unit other than "$", "What it cost" with "Only you see this."; log one with both filled and expect the memo on the card and on Now, and the cost nowhere, on either page.
74. **The swipes on Now** (22): on a question you asked that nobody else is in, swipe its Running row left; expect the row to slide over the remove square, the tap to ask "Remove this market?", "Remove it" to collapse the row with no toast, and the question's link to read "Called off." with "Nobody else got in."; then on a finished question in Just happened, swipe and expect the archive square, "Archive this?", and the row gone from your Now and still on a friend's. A row someone else is in should not slide.
75. ~~**Holdouts and the close** (22)~~: superseded on 2026-10-07 by items 223, 225 and 226 (nobody is asked by name, so there are no holdouts and every count is "N in").
76. **Who's in** (22): tap the stack; expect the sheet with a row per person, "Asked it" on yours, "From the link, no account" in stone on a ghost's, and as the asker a Remove that asks "Remove Alex's entry?" inside the sheet.
77. **Blind is final** (22): ask a blind question; before entering expect "You see everyone's once you're in. Yours is final then." after the lock glyph above the primary; once in expect everyone's columns so far, "final" in the caption and no Change; a second phone in it sees the same; nothing with "Numbers show when everyone's in" anywhere.
78. **The link page's names** (22): from a phone with no session, open a question's link in a set where someone joined an earlier question by link with their number; type the first letter and expect no names; the second letter and expect at most three, in stone; pick one and expect the check in the field; join with the wrong number and expect "That isn't the number Dani joined with. If you're not Dani, type your own name." at the number field; five wrong and expect "Too many tries for Dani. Give it an hour, or type your own name."; the right number joins as them. Join another question with a name and no number and expect it to work, and that name never to be suggested.
79. **Entries at sign-in** (22): sign in on a phone with the number an entry was made with; expect the claimant screen with "From a link", the entry as a row ("You're in at 70% · $5.00"), pressed; unpress it and tap Yep; expect it gone from your Now and still on the question under the typed name in stone.
80. **Stone everywhere** (22): with a ghost in a question, expect the stone avatar with the dashed ring on the call line, the leaderboard once settled, the pick rows, who's in, and the ghost's own entry line on their phone. **Covered on the simulator (30)** on the stack, the leaderboard and the ghost's own entry line; under "Who's got who" the ghost wore a hue, fixed this round (fix 17).
81. **The red square** (23): swipe a question you asked that nobody else is in; expect the red square behind the trash glyph there, and no red anywhere else in the app.
82. **A game swipes as one row** (23): on a game with two questions you started that nobody else joined, swipe its Running row; expect "Remove this game?" with "Its questions leave Now, and they count against nobody.", and after "Remove it" both questions reading "Called off."; once a game is over, swipe its Just happened row and expect "Archive this?" and the row gone from your Now with every question of it, and still on a friend's.
83. **The count while alone** (23): ask a question of people; expect "1 of 3 in" with two dashed avatars from the moment you are in, share as the chalk; ask one of nobody (a set of one) and expect "Just you so far". **"Just you so far" covered on the simulator (30)** on a question of nobody; "1 of 3 in" needs a question with people named.
84. ~~**The nudge and the relay** (23)~~: superseded on 2026-10-07 for entering by item 223 (nobody is asked by name); the nudge to vote stands, item 227.
85. **A sticker from a photo, end to end** (23): open a question's photo full screen; expect the three icons with their words, "Make a sticker", "Save", and "Remove" on your own; tap "Make a sticker" and expect the sheet with "Hold what you want, then tap Copy" and "Then paste it here" over the photo, still holdable; hold the photo, tap Copy Subject, tap "Paste" (iOS shows its own Paste prompt); expect the sticker on the field with "In your stickers", "Ask something with it" opening the question step with the sticker as the mark, and "Done" back to the photo; expect the sticker in the picker's "Your stickers" row afterward. A plain photo pasted should say "That's a photo, not a cutout."
86. **You, in each state** (23): on a fresh account expect "Joined today" and "Nothing has resolved yet." with no chart; on an account with a few resolved calls expect "In N markets since <when>", the frame with the diagonal alone, "Your picture draws at 10 resolved calls. N so far." and the calls as rows; on an account past ten expect the plot with dots and whiskers and the headline in counts ("When you say about 70%, it happened 7 of the 10 times."); "Questions you asked" in counts with a mark per question and the void named; the Account rows, "Your units" and "Your marks" opening their sheets, "Your number" with its caption and nothing to open, and "Sign out" asking once.
87. **Pass the phone, on and off** (24): on your own phone, on You, tap the switch; expect the sheet with "It allows" and "It never allows", the PIN twice, "Turn it on" delegating without any screen of Dynamic's and the switch reading on within a few seconds; on a second phone signed in to the same account without the code step, expect the switch on and the caption saying to turn it on from the phone you signed in on; tap it off on your own phone and expect the switch off at once, `delegations` wiped with `revoked_at` set, and `pass_the_phone` empty.
88. **A second device signing from the server** (24): with pass the phone on, on a phone that holds the Dareful session but not the Dynamic login (the installed app after the browser's storage was cleared, or a second phone that never typed a code), get into a question; expect no code step, the entry landing, and one row in `delegated_signatures` naming the action and `signFromThisDeviceAction`; then vote and expect the code step or the vote's own sheet, never a server signature.
89. **Wrong PINs locking** (24): on a friend's phone (part 3), type a wrong PIN five times; expect the third to end the handoff, the fifth to lock the PIN for an hour, and the owner's phone to get "Your PIN is locked for an hour" naming the friend's phone.
90. **Handing the phone over, on two phones** (25): with a friend's pass the phone on, on a question you are both sent to and only you are in, expect the fourth icon at the end of the who's-in row; the first tap the explainer ("A friend who set this up on their own phone gets in here with their PIN. Nothing of theirs stays on yours.", "Hand it over", "Not now"), never again after; then "On Sam's phone" with a close, the band, the two facts and the entry sheet, and nothing of your own number on the screen (blind or open); slide, "I'm in at 60%, $10", then "Who's joining?" with the friend ready and anyone not set up at 0.45 with "Not set up for this yet", and "No account? Scan the code with your own phone" opening the code; pick the friend, expect their avatar, "Your PIN", the dots and the keypad; the fourth digit sends; expect "You're in, Maya.", "Change it on your own phone until 10:40pm." and "Hand it back to Sam"; after the handback expect your own screen with the friend in, and back never returning to their entry.
91. **On the friend's phone** (25): expect the notice with the question as its title and "You entered this from Sam's phone." (push, or email with push off); the entry line "$10 · from Sam's phone · yours to change until 10:40pm"; change it and expect the change; on a blind question expect "· final" with "Withdraw it", the ask, the entry gone, and no way back in from either phone.
92. **Wrong PINs on the friend's phone** (25): type a wrong PIN; expect the dots to clear and "That's not it."; three wrong and expect the host's own screen back with nothing said; five wrong in an hour across handoffs and expect the owner's "Your PIN is locked for an hour".
93. **The link page's steps on a phone** (25): open a question's link with no session; slide, "I'm in at 70%, $10" raises "Who's joining?" with the summary on the right, the two fields, "Join" disabled until a name is typed, and "Have an account? Sign in" under it; two facts only; signed in on the same link expect "Joining as Sam · Not you?" under the primary and "Not you?" asking before it signs out; open a dead link and expect the code boxes with "That link doesn't open anything. Ask for it again, or type the code they read you." **Covered on the simulator (30)** in a private tab on production: the slide, "I'm in at 32%, $5" raising "Who's joining?" with the summary, the two fields, Join dead until a name, "Have an account? Sign in".

### Round C

94. **Cutting a sticker on the phone** (26): open a question's photo full screen and tap "Make a sticker"; expect "Tap what to keep" over the photo, still holdable; wait, and report how long the line "Model loaded in …" says the first time (the runtime is 11MB and the model 6MB, on your own network) and the second time on the same phone; tap the subject and expect the dashed cream outline around it within a second or two, and the line's "cut in …" number; tap "Keep it" and expect "In your stickers" with the cutout on the field; "Start over" clears the outline; a tap on the background expects "Nothing there to keep. Tap the thing itself." Then the same on an Android phone or a laptop, where there is no lift. The instrument line leaves once these numbers are in.
95. **The lift as the fallback** (26): with the phone offline after the app has opened (airplane mode), open a photo and tap "Make a sticker"; expect the sheet to become "Hold what you want, then tap Copy" and "Then paste it here" with "Paste", and the lift to work as before.
96. **The one dot, and the Running row's words** (26): with two questions needing you that both have a clock, expect the citron dot on the sooner one alone, none on the other, none on the tab bar on any root; under Running expect "You’re in at 70% · three of you", "just you so far" on one nobody else is in, and once locked "Resolving tonight" or "Voting ends tonight" and nothing else.
97. **A claim to accept as a row** (26): on an account whose first name matches a ghost a friend added in a set you share, expect under Needs you "Is that you?" over "Gabe has things with a Sam" with "That’s me" as the verb, and no section of its own; tap it and expect the claimant screen.
98. **A dead address in the installed app** (26): open a mistyped address; expect the code boxes with "That link doesn’t open anything…" and the back control, never a framework page. **Covered in the simulator's Safari (30):** a mistyped address gave the code boxes with the line; the installed app itself still needs the check.
99. **Focus outlines on a keyboard** (26): on a laptop, tab through the question step; expect the 2px cream outline 2px outside the question, each answer field, the number entry and the margin's field, and around Start on a root, never flush with the edge and never a colour change of the border.
100. **Who's joining, when nobody was named** (26): ask a question of nobody (a set of one) and get in; hand the phone over to a friend who has pass the phone on and shares any set with you; expect them listed under "Pick yourself" and their PIN to get them in.
101. **The voting screen** (26): once a question you are in closes, expect the claim card (or the source card) directly under the band, no entry line, "Where everyone landed" over the picture, and no list of each person's number. **Covered on the simulator (30),** and found wrong: the entry line stood under the claim card on production; fixed this round (fix 16) and held by a test.

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

### Round D

112. **The tab bar through every transition** (28): open a market from Now, go back, switch every tab twice, open the ask layer and close it, raise and lower a sheet; expect the bar pinned at the very bottom throughout, never drifting with a page, and the Start button with it.
113. **The band still gone on People and You** (28, with 61): cold start the installed app and open People, then You; expect the bar at the very bottom on both, with no band beneath it, now that the bar lives outside the page. **Covered on the simulator (30):** see 61.
114. **No white on a cold open, either appearance** (28): with the phone in light, then in dark, open the installed app cold; expect the launch image's ground with the logo box, the same frame from the page, then the fade into Now; never a white flash. Reload a market's link the same way.
115. **The launch images by appearance** (28): with the phone in light, cold start; expect the light launch image; in dark, the dark one. If iOS shows the dark image in light, say so: the layout then lists the dark set only and the light phone's handoff fades from dark into light (11.3).
116. **The market opening out of its row** (28): on Now, tap a question row; expect the stamp's colour opening into the band over 320ms with the mark riding into it, the words fading in, the tab bar fading out, and the sheet fading in; Back shrinks it into the row where it now sits. With Reduce Motion on, expect a crossfade with nothing travelling.
117. **The ask layer** (28): tap +; expect the question step rising from the bottom over 320ms with Now holding still under it; Close sinks it and Now is exactly where it was, scrolled the same. Next moves the content 24px left under a band that holds; Back 24px right.
118. **The terms written in front of you** (28): on the terms step, expect the caret at the start of "Counts if", the words arriving as they're written, "Still writing." after three seconds without new words, and "Send it" enabling when they finish; with the network slow, expect "The terms stopped partway." with "Try again" at ten.
119. **Presses and tabs on the touch** (28): touch a row and hold; expect it to go to the ground after a moment, and nothing to flash while scrolling; touch a tab; expect it selected on the touch, not the release, and the root drawn in the next frame when it was visited within thirty seconds.
120. **Light mode on a phone** (28): with the phone in light, expect paper, the graphite primary, the citron dot with its edge, avatars with their edge, the light grain, and a market's light layers; on You, "Always dark" and back. **Partly covered on the simulator (30):** the installed app followed the phone from light to dark live, both appearances on every screen walked; "Always dark" on You still needs the phone.
121. **The information icon** (28): on every screen it lists, expect the icon at the top right, "Got a code?" and More directly left of it, the sheet opening to the screen's name, the fixed line and the groups, closing from its close, a drag on its handle and the icon again; on the full-screen photo, the close at the top left and the counter centred.

### The logo round

122. **Add the app again first** (29): iOS keeps a home-screen app's icon and launch images from the moment it was added, so the only way to see the new ones is to remove the app from the home screen and add it again from Safari. Do this before any check below, in the appearance you want to check first.
123. **The icon** (29): on the home screen expect the tally in the chalk on the dark ground, full-bleed, nothing cropped. On an Android phone, install it and expect the whole tally inside whatever shape the phone crops icons to, with none of the strokes' ends cut.
124. **The cold start, timed** (29): with the app closed for ten minutes, start a screen recording, tap the icon, and stop once Now's rows are there. Count from the tap to the first frame with the header row and the tab bar, and to the rows. Then on Now open "Measure the screen" and read the second box: first byte, shell painted, content arrived, screen answers, sign-in ready, and the server's two figures. Report both. Before this round it was about five seconds to Now.
125. **With the count and without it** (29, with 124): in "Measure the screen" tap "Open without the count", close the app, wait, and repeat 124; then "Open with the count" and repeat. The two "shell painted" figures should agree to within a frame or two. If they do not, report both. **Retired (30):** "Measure the screen" and "Open without the count" are gone; 124's timing from a recording stands on its own.
126. **What the opening looks like** (29): on a cold start expect the bare ground from the tap, then Now fading in over it; never white, never the old dashed square. On a fast start no stroke is drawn, which is as designed: the count stops the moment Now's shell has painted. On a slow network (one bar, or the phone's own network limiter), expect the tally counted a stroke at a time and stopped wherever it is when Now arrives.
127. **The opening never comes back** (29): on the slowest network you can find, cold start and wait twenty seconds; expect Now, and never the ground covering it again. This was a fault of Round D's.
128. **The launch images by appearance** (29, replaces 115): add the app in light and cold start: expect the light ground from the tap. Add it in dark: the dark ground. If a light phone shows the dark ground first, say so, and the layout lists the dark set only (11.3).
129. **Reduce Motion** (29): with Reduce Motion on and a slow network, expect the whole tally to fade in and hold, never drawn a stroke at a time, then the same fade into Now.
130. **An empty Now's shell** (29): on an account with nothing yet, cold start twice; the second time expect no + and no "Got a code?" from the first frame, with the six boxes arriving under the date.
131. **The wordmark** (29): signed out on Now, on a question's link, on a cover's link and on the claimant screen, expect "dareful" in the logo's own letters at the top left, in the chalk on dark and the ink on light, with no back beside it; on the claimant screen expect no back at all.
132. **The link previews** (29): paste `https://dareful.app` into a chat and expect the lockup on the dark ground; paste a question's link and expect its tile with "dareful" at the bottom left in the chalk; paste a dead link and expect the plain card with the lockup at its top left. A chat keeps a preview it has already fetched, so use a chat that has not seen the link. **Covered by fetching (30):** a question's tags and result tile, a game link's tags and tile (the plain card on production, the game tile on the local build), a dead link's plain card; pasting into a chat needs a phone.
133. **Now's door kept warm** (29, after the deploy): leave the app alone for fifteen minutes, then from a laptop run `curl -s -o /dev/null -w "%{time_starttransfer}\n" https://dareful.app/`; expect under half a second, where it was 2.9. The favicon in that laptop's tab should be the tally drawn to the grid, in the browser's own scheme.

### The QA round

Items the simulator covered are marked in place above (61, 66, 93, 98, 101, 113, 120, 132 and the parts of 50, 51, 62, 75, 80, 83, 84 it reached); 124 and 125 lose their second halves with the instrument. What follows needs the owner's phone, and the four marked "installed app" need the fixed build inside it: either after the deploy, or by signing in at `http://localhost:3000` on the simulator (the local build runs there, and the two accounts the simulator holds can sign in to it as they did to production).

134. **The fixed layers after a keyboard, installed app** (30): on a person's page, raise "I got this one", type an amount, dismiss the keyboard. Expect the back control and the icon still at the top (the page not left scrolled), the sheet at the very bottom and the status band behind the clock; then scroll: nothing fixed rides with the page. If a layer still sits off its place, note whether the top ones, the bottom ones or both, and by how much: the guard moves each on itself and can be read from `html`'s `data-viewport-shift`.
135. **The swipe back with no second transition, installed app** (30): open a market from Now, swipe back from the left edge. Expect the phone's own slide and nothing over it: no ink shrinking into the row after the slide, no Now fading in a second time. Tap Back instead and expect the app's transition as before.
136. **A market opening whole from its row, installed app** (30): touch a row on Now, hold a moment, release. Expect the band and the screen together, never the band alone over an empty page for longer than a blink.
137. **The person view on a cold open, installed app** (30): from a notification or the app's own memory, land on a person's page cold. Expect "I got this one" as a low bar at the bottom, never the whole form standing raised over the page (production does this today after any hard load).
138. **A tap on the odds line** (30): on a question you are not in, tap the line once, anywhere. Expect the number set and the sheet raised, and nothing entered; the entry is the primary's alone. Try it with Reduce Motion on, where the sheet jumps.
139. **The entry sheet going as the entry lands** (30): enter; expect the sheet gone in the same moment the entry line appears, never both on screen.
140. **The information sheet to the top** (30): on Now, open the sheet, pull its handle up. Expect it to reach the status bar, the screen's name and the fixed line scrolling with the entries, and the close staying put; drag it down by the handle with the page holding still.
141. **The handle's drag** (30): with a market's sheet resting low and the page at its top, drag the handle up and down. Expect the sheet alone to move: the page never scrolls, and no pull-to-refresh runner appears.
142. **The argument flow** (30): Settle an argument with a real line ("The Eiffel Tower is taller than the Chrysler Building"); expect "Still going." at three seconds and the next step by ten without the block; Send it, expect the draft's own screen with no ask layer over it; the other person takes the side from the link; expect the lock at once and the ballot. On a cold function the triage can still pass ten seconds: if the block appears, tap Try again and expect the same call again, not a dead button.
143. **A ghost through every state** (30): join a question from a link with no account; expect your entry line and the picture above who's in and the facts; once the asker closes it, "You're in at 26% · $5 · locked at 9:26pm" and "Where everyone landed", the screen following the votes without a reload; once settled, the outcome in the question's words. Open a second question's link from the same phone: expect "Joining as <the name you typed> · Not you?" and no name field; "Forget them" and expect the name field back.
144. **The close chips** (30): after 6pm, ask a question and choose Tomorrow; expect "Closes tomorrow" in the band, and "Decided by <tomorrow's date>". Choose Tonight after 4pm; expect "Closes tonight" and "yours to change until 11:59pm".
145. **A clock on a fresh browser** (30): on a phone that has never opened the app, open a question's link; expect every clock in your own zone from the first screen (the band's "Closes …", the invitation card's "Decided …"), never UTC.
146. **The claim card in place of the entry line** (30): once someone has said what happened, expect the claim card directly under the band and no "You're in at …" line under it, on the claimant's phone and on a voter's.
147. **The wells with long words** (30): on a question whose write-up gave long outcome phrasings, expect each well to wrap to a second line, never clipped at both ends.
148. **The game page as one flow** (30): start a game with three questions, send the game's link to a friend not in your set; on their phone expect the questions listed with Back and nothing that says sign in, a tap on one joining them to your set, and "Part of <the game>" opening your set's cards; the share and copy icons at the end of the who's-in row; the game's link previewing as the game tile (the asker's first name, the game's name on two lines, the questions by their short names, the close time).
149. **The name people see** (30): sign up with an email whose local part is an identifier; expect to be asked once what your friends call you, and your first name alone on every card and tile that travels.
150. **A dead link's first paint, light mode** (30): with the phone in light mode, open a cover link that is not yours (or someone else's draft). Expect the code screen; note whether the screen is white before it, and for how long. The server answers such a `notFound()` with the framework's empty shell and the code screen is drawn once the scripts run (docs/decisions.md 2026-09-29); an address with no screen at all (a mistyped one) paints the code screen at once. The reading decides the owner's call on 5.3 against the flash.
151. **The ask layer's way out** (30): ask a question and send it; expect its own screen with nothing of asking over it, the same after pulling to refresh; Close from the question step on each of the four roots and from a photo's "Ask something with it"; expect the place it rose from, with nothing of asking left.
152. **A device counted once** (31): on a phone that has never opened the app, open a question's link from Messages, then open it again. Expect one `link_opened` row for the device (the owner reads the table), with `installed` false in Safari and true from the home screen, and the preview Messages drew to have left no row at all.
153. **A notification's tap counted** (31): tap a push and an email for the same question. Expect two `notification_opened` rows, one per channel, and the address bar clean of `via` and `n` once the screen is up.
154. **The shell after a background and a keyboard** (32): on the owner's iPhone, open a question, send the app to the background, come back, tap the name or stake field, dismiss the keyboard; ten times, on Now, a question, People and You, in light and in dark. Expect the tab bar and the sheet in place every time, and the page the only thing that scrolled.
155. **The stake chips** (32): the Roman emperor question's sheet on the owner's phone. Expect three chips unclipped; note the phone's width and the text size setting if one is clipped.
156. **Enter, Vote and Close from Now** (32): tap each verb. Expect the entry sheet raised, the ballot raised, and the close's ask open ("Close it with 4?"), with Back landing on Now.
157. **A slow write** (32): with the network throttled in Settings, tap "I’m in". Expect the runner and "Still going. This one takes a few seconds." past three seconds, never "Try again"; once the network is back, one entry.
158. **Offline words** (32): in airplane mode, tap "I’m in". Expect "You’re offline. Try again once you’re back." and the offline bar; nothing sent twice once back.
159. **Signed-out words** (32): in a browser whose Dareful cookie has been cleared, with a question still open on screen, tap "I’m in". Expect "You’ve been signed out. Sign in to finish this."
160. **Voting opened** (32): close a question by hand with two in. Expect everyone else in it to hear "JP closed “…”" by push where allowed and by email, the tap landing with the ballot raised; the asker hears nothing of their own close. Let another close by its time: everyone but the asker hears "Time’s up on JP’s “…”" within a minute, the asker the deadline notice as before.
161. **The reminder** (32): leave a question in voting with a call still open for twelve hours. Expect one reminder by push and by email to each person still out, none between 11pm and 9am in the asker's zone (it arrives at 9am), and never a second.
162. ~~**Everyone asked is in** (32)~~: superseded on 2026-10-07: the notice is gone, since nobody is asked by name.
163. **The session slides** (32): a day after signing in, open the app; in Safari's Web Inspector expect the `dareful_session` cookie's expiry moved to thirty days from now; over the following weeks, no sign-out after weekly opens.
164. **A game question past the start** (32): a game question with two in at the start. Expect it closed by the first tick after the start and the voting notice; one with one in gone from Now as an expiry with no toll. And on the game page, switch sets twice and press Back once; expect the game left, not the previous set.
165. **The sheet's four positions** (33): on a question you are not in, drag the handle down past 24px; expect the handle row alone above the tab bar, still draggable. Drag up: the move; up again: the stake and the chalk; where the sheet is taller than three quarters of the screen (a pick-one with six answers, the ballot with attachments), up again: the sheet to the status band, its content scrolling under a handle row that stays. A short drag leaves it where it was.
166. **A stuck question** (33): a question whose close passed while it stayed open with two in. Expect the sheet resting on "Time’s up, and nothing closed it. Anyone in it can." and "Close it with N" for the asker and for anyone in; nothing for someone in the set who is not in it.
167. **The PIN fields** (33): on You, turn pass the phone on. Expect a numeric keyboard, digits drawn as dots, no password manager offered, the focus moving to "Again" only once the first field holds four digits, and never back on its own.
168. **The photo input** (33): on an open question you are in, tap the add tile. Expect the phone's choice of camera and library; the same on a settlement's photo.
169. **A pasted sticker** (33): paste a cutout in the mark picker on a slow network. Expect it in "Your stickers" at once, dimmed, not pickable, then picked by itself when the upload returns.
170. **Games and tokens on Now and the story** (33): a game with questions in two of your sets; expect one row on Now naming the game with the count across both. Open a settled question's who's got who; expect the tokens under "JP’s got" to wear the faces of the people JP has got. Send the screenshot of the clipped team stamps again if it recurs: the slot is 40px with the two 28px stamps overlapping by 16px.
171. **The numbers page** (34): with `OWNER_USER_IDS` set in Vercel, open `/stats` signed in as the owner; expect the two columns with a definition under every number, and the code screen from any other account and signed out.
172. **A snapshot and the backfill** (34): tap "Snapshot today"; expect today's row. Tap "Backfill the days"; expect one row per day since the first event, and the days already taken unchanged.
173. **The numbers against the week** (34): compare accounts, askers and questions with two in against the owner's own count of the week; the definitions say what each one counts.
174. **A change after the close time** (35): on a question whose close time has passed and that is still open, try to change your number. Expect "Numbers are locked." and nothing changed; then close it, and expect everyone's entry as it stood at the close time.
175. ~~**The close in the sheet** (35)~~: superseded on 2026-10-07 by item 226.
176. **Both teams in Now's mark** (35): a game with more than one question on Now. Expect the two abbreviations whole, the away team over the home team, in the 40px mark.
177. **A reminder at night** (35): with a question in voting for twelve hours at 11pm or later on the recipient's phone, expect nothing until 9am there; a recipient in another zone hears at their own 9am, or at once if it is daytime for them.
178. **A pasted sticker, timed** (35): lift a subject out of a photo on the phone, paste it in the mark picker on cellular, and time from the paste to the sticker showing (expect well under a second) and to it being picked. Then paste another and close the picker at once: expect it picked when the upload lands; paste and leave the ask flow: expect it in "Your stickers" next time.
179. **A write with no answer** (35): with the network cut after the tap (airplane mode a second after tapping "I’m in"), expect "Still going. This one takes a few seconds." and, a minute on, "Something broke on our end. Try again in a minute." with Try again; with airplane mode on before the tap, "You’re offline. Try again once you’re back." and nothing sent.
180. **A vote thirty-one days in** (35): on a phone whose Dynamic login has ended while Dareful still shows you signed in (thirty-one days after first signing in, or after clearing the site's storage but not its cookies), tap a vote. Expect the code step in the vote's place, and the vote sent once the code is in; close the step instead and expect "You’ve been signed out. Sign in to finish this." within a couple of seconds.
181. **1.1 in an installed copy on iOS 26** (35, 36): the owner's phone, as item 154. Run on the simulator for a market on the current build and for Now on the old one (session 36); the roots on the current build are item 185.
182. **The stuck questions after the deploy** (35): within a minute of the deploy, expect the friend's Red Sox question and the Lightning question closed with voting opened, and the game questions with fewer than two in gone from Now as expiries.
183. **A zone kept** (35): open the app signed in, then read `users.zone` for your account; expect your phone's zone. Travel, or change the phone's zone, open the app again: expect the new one.
184. **The chain's counts** (34): on `/stats` in production, expect the four counts and the two links opening the ledger and the questions contract on the explorer.
185. **The roots in an installed copy on iOS 26** (36): after the deploy, in the installed app, on Now, People and You: the tab bar at the very bottom with no band at rest; focus a field, dismiss the keyboard, scroll: the tab bar where it was. Then with the keyboard up, go to the home screen and reopen from a notification onto a market: its sheet at the bottom edge. On the simulator the same after the deploy, with the readings.
186. **The caret in a sheet's field** (36): in the installed app on iOS 26, open a question's link signed out, slide, tap the main button, tap "Your name". Expect the caret in the field. On the simulator it stood about 62 points above the empty field until the first letter; say which the phone does.
187. ~~**The pace row** (36)~~: superseded on 2026-10-04 by "AI market setup" for every type (item 196).
188. **The four pitch numbers** (37): on `/stats` in production, at the end of the table: "Came by a link, then asked", "Sets with two or more questions", "Clean resolutions" as a percent and "Photos and stickers added", each with its definition, in both windows.
189. ~~**Joining from a link as a guest** (38)~~: superseded on 2026-10-06 by items 211 and 212 (the votes line above the name, "Join as" with the whole name, "I already have an account" under it, and Google first in keeping the entry).
190. **Keeping it in an account by email** (38): from 189's step, an email address with no account, its code, Continue. Expect a new account under the name typed, no welcome screen, and the entry yours (your own avatar on the question, not the dashed one).
191. **By phone** (38): the same with "Use a phone number" and a US number.
192. **By Google, in Safari** (38): the same with "Continue with Google". Expect to come back to the question signed in with the entry yours, and nothing of Google's left in the address.
193. **By Google, in the installed app** (38): the same inside the installed app. Expect Google's page inside the app and the return signed in. If it comes back signed out, or in Safari, say so: `GOOGLE_IN_INSTALLED_APP` takes Google out of the installed app.
194. ~~**Signing in at the first step** (38)~~: superseded on 2026-10-06 by item 213 ("I already have an account" under "Join as").
195. **The one card** (38): an account signed in by phone with no push and no email, on the phone that holds the login: the card at the top of Now once. "Add an email": a code to the address, then "Added."; reopen Now: no card. "Link Google": Google's page after Dynamic's check.
196. **The question step** (38): "How many slices will Sam eat?" picks Pick a number; "Who wins tonight?" Pick one; "Will it rain?" Yes or no; a type you tapped yourself stays as you type. "AI market setup" under every type; Help define asks a number about its unit, source and rounding.
197. **Decided** (38): on the terms step the date chip shows the write-up's date; tap Tonight and the date in the terms changes with it; edit the terms to name another date and Send it: refused at the field naming both dates.
198. **A draft** (38): leave asking at the terms step. Expect a Needs you row "You never sent this one" with Finish for a day, then the draft on You under Drafts. Open it: the sheet at rest with the terms on screen; "Share it first" signs once and the question opens with nobody in and share, copy and the code there; on another draft "Discard it": gone from Now and You.
199. **Withdraw** (38): a question you sent that nobody joined: "Withdraw it" under who's in asks once, and the question leaves Now; its link says it was called off.
200. **The last row** (38): Now with more running than fit, scrolled to the end: the last row clear of the tab bar and the Start button. In starting a game with three questions, "Stakes, for all 3" and "Back to who’s in" clear of the sheet, at rest and raised.
201. **Tucked** (38): on a question you are not in, one long drag down from raised: tucked, the handle row above the home indicator (in Safari, above the toolbar); a tap on it raises it.
202. **Only the people in call it** (38): a question in a set of five with two in, past its close: the ballot for those two only; the others see where everyone landed and no vote, and Now gives the vote row to the two alone; the two agreeing decides it.
203. **Add another** (38): on a game page with a question already sent, "Add another", pick one, Send it. Expect the game page with both, never the error card.
204. **One set per pair** (38): People shows one row per set of people, and a pair reads "Rachel and you".
205. **First-visit tips** (38): a screen opened for the first time on the account: up to three tips, a tap anywhere moving on, the ring staying on its control while the tip moves; never again on that screen.
206. **Ideas** (38): What's on starts with Ideas; Now shows it under Running while fewer than three are running; an idea with a blank waits for a name.
207. **The guest line** (38): as a guest in a question, the line at the top with the page starting under it, nothing behind it.
208. **The write-ups after the switch** (38): ask three questions on production. Expect write-ups as good as before, each with a date matching its terms, and `model_escalated` in the usage table rarely.
209. **Offline, really** (38): airplane mode on, tap something: the offline bar within a few seconds and "You’re offline. Try again once you’re back."; airplane mode off: the tap goes.
210. **The Red Sox question after its correction** (38, on the owner's go-ahead): after `scripts/ops/resettle-feed.ts --apply`, the question settled for the Yankees, a confirmation waiting for each person who owes, and no new notice.
211. **The join step** (39): open a game question's link in Safari with no Dareful sign-in and tap "I’m in". Expect "Who’s joining?", the line "If nobody votes, the final score settles it.", "Your name", then "Join as" with exactly what you typed, and "I already have an account" as plain text under it. Type a long name: the button wraps and names all of it; join, and the question shows the whole name.
212. **Keeping it, Google first** (39): after 211's entry, "Keep your calls in an account" with "Continue with Google" first, the main button, with Google's coloured G at its left; then Email with Continue, "Use a phone number" and "Not now". Tap Google: Google's page, then back on the question signed in with the entry yours.
213. **Signing in from the join step, ten runs** (39): with Dynamic's test account, in iOS 26 Safari, iOS 27 Safari and the installed copy: open a question's link signed out, tap "I’m in", "I already have an account", the test email, its code. For each run count the taps from opening the link to signed in with the entry yours, and time it; note any code send Dynamic refuses, and space the runs when one is refused.
214. **Keeping a guest's calls, ten runs** (39): on the same surfaces, join as a guest, then "Keep your calls in an account" with the test email and its code. Count the taps and time from "Join as" to the entry under the account.
215. **Linking from the one card, once** (39): an account signed in by phone with no email and no push, on the phone that holds the login: the card at the top of Now, "Link Google or add an email". Link one; count the taps and time to "Added.", and reopen Now: no card.
216. **A remembered guest** (39): on a phone that joined a question as a guest before this build, open another question's link. Expect "Joining as … · Not you?" with "I already have an account" under it; after the entry, the keeping step once, and not after the next entry.
217. ~~**Who's in** (39)~~: superseded on 2026-10-07 by items 223 and 224 (asking has no who's-in step).
218. **Share it first, in view** (39): leave asking at the terms step and open the draft from Now: "Share it first" and "Discard it" under the question with no scrolling. Start a game: the share row under the game's header with no scrolling. Open one of its questions before you're in: the sheet at rest and the share row above it.
219. **A question too far out** (39): ask "Which country grows its economy the most over the next 30 years?". Expect nothing picked under Decided, the line naming the date it could be known and the furthest date, and a nearer version with "Ask this instead"; tap it and send it. The date picker stops at the furthest date.
220. **The tiebreaker on Opus** (39): after the deploy, the next question the tiebreaker rules. Expect the ruling within the minute, naming its outcome when it rules one and void when nothing clearly supports one, and `claude-opus-5-5` in Vercel's logs for it; `AI_MODEL_TIEBREAKER` unset in Vercel, or set to it.
221. **Only the people in** (39): in a set where someone not in a question was in an earlier one, close a question with three of you in: two agreeing decide it, and what it leaves comes as confirmations to tap. A new pair's first question with both in settles at once, as before.
222. **Long fields on an older Safari** (39): on a phone whose Safari is older than 27 (Settings, General, About), a question that runs to three lines shows whole on the terms step, and terms of five lines show whole without scrolling inside their box.
223. **Asking without who's in** (40): from Now, tap +, type a question, Set the terms, Send it. Expect no step asking who; the question opens as sent, with share, copy and the code in view without scrolling, and "Just you so far" once you're in. Send the link to two friends; as each gets in, the count reads "2 in", "3 in", never a second number.
224. **Starting a game without who's in** (40): from What's on, open a game, Start, tick two questions, Send it. Expect the terms step straight after the menu, then the game page with its share row under the header.
225. **Calls are in, by name** (40): a question with four of you in, three on their own phones. One taps "Calls are in": the others read "Sol says calls are in. It closes when Gabe or you say so too."-style lines, the names after "when" being those who could close it, never a count. One taps "Take it back" and the line drops their name. When as many as it takes have said it, it closes for everyone.
226. **The asker's close** (40): as the asker with two or more in before the close time, the close is the secondary under the sheet's line; past the close time with nothing closing it, it is the main action, and anyone in sees it.
227. **It's happened** (40): on a closed question nobody can vote ("Voting opens once it's happened."). One person taps "It's happened": everyone in gets the voting notice, and the ballot reads "Maya says it's happened." On a question the final score answers, the vote opens on the final instead; on one with a date, on the date.
228. **The reveal** (40): close a yes-or-no question, a number question and a pick-one question with four in each. Before the close nobody's number shows but your own; at the close each share takes its owner's colour and avatar where it sits, under "Who said what", with a row per person saying what they said, a guest in stone.
229. **The live score** (40): during a real game, open a question on it. Expect the score and where the game is in the sport's words, changing within a minute of the game; between quarters of a basketball or football game the score alone; nothing at all if the feed is down; and no reads once the final is in (Vercel's logs for `/api/live`).
230. **One page per game** (40): with questions on one game in two of your sets, open the game: one page, each card naming its people; tap a card to open it in place with its sheet, tap another to switch, tap its head to close; Back leaves the page, not the card. Open a link to one of the questions from Messages: it lands on the game page with that question open. Type its six letters on the code screen: the same.
231. **Already asked** (40): on a game where a friend asked who wins in another set of yours, tap "Who wins" under "Add another". Expect "Maya already asked who wins." with "Go to that one", which opens hers, and "Ask your own", which starts yours.
232. **A question during a game** (40): after a game has started, start a question on it from What's on (it is listed as "Live"). Expect "Closes 5 minutes after the first call"; after the first entry, a close five minutes on, entries refused after it and after the final; the first drive not offered once the game has started.
233. **The offer** (40): ask "Will the Pacers beat the Timberwolves tonight?" on a night they play. Expect, once, on the terms step, the game with "Let the final score settle it" and "Keep it as it is"; take it and the game's question opens on the game page; keep it and nothing changes.
234. **The device notice** (40): on a second phone signed in without its code, open a game question. Expect one line at the top, 44 points, "This device hasn't checked it's you." with "Get a code", and the share row clear of the sheet.
235. **The tally** (40): in the installed app, pull down from the top of Now. Expect the strokes drawn one at a time with the pull, the fifth crossing when you let go past the threshold (not while you hold it), the count looping while it reads, then the tally rising away; on its own patch of ground, never over a line of text. With Reduce Motion on, a still mark that fades. Leaving the app and coming back re-reads with the 2px line, not the tally.
236. **On the chain** (40): after the deploy, in a set where someone not in a question was in an earlier one, close a question with three of you in, all with accounts. Expect it decided by two of the three and settled at once, with the explorer showing its own group registered with exactly the three of you; Who's got who as usual, and the person view's cancelling-out unchanged for the set's other questions.
237. **1.1 on a phone** (40): in the installed app on iOS 26, focus a field, dismiss the keyboard, scroll: the tab bar where it was. With the keyboard up, go to the home screen and reopen onto a market: its sheet at the bottom edge.

238. **Relayer** (41): after the deploy, the owner's `OPS_EMAIL` gets one email the first hour the relayer covers under three days at the past week's rate, and none while it covers more. Top it up to at least 45 MON before the next full audit, which spends about fifteen.
239. **A close while the chain fails** (41): if a close ever answers "Sent, and still going through", the market is closed for everyone at once, and it settles on its own within the hour.
240. **/stats** (41): open `/stats` on the iPhone signed in as the owner: every section draws, each with its own line if it is slow, and the relayer's balance and days covered at the top.
241. **The app's ruling** (41): ask an argument facts can settle with a friend; neither of you sees the ruling until you are both in; then Agree from both phones settles it at once, and "How to check it" shows the seal from the terms.
242. **I see it differently** (41): on another such argument, dispute with a line and a screenshot; both phones show who disputed and why, and the tiebreaker's ruling arrives as a notice.
243. **A day of quiet** (41): on a third, agree from one phone only and wait a day: it settles as the app ruled, with a notice to both.
244. **Every tap holds** (41): tap Join, Close, Agree and Send it on a slow connection: each shows the tally at once and sends once.
245. **The terms** (41): type a question and wait a second before Next: the terms are there or arriving, never an empty field with a caret.
246. **Decided** (41): ask with "This week" after a slow write-up; the tile says a close a week out.
247. **The mark picker** (41): every category in one scroll, the chips jumping to each; the sheet raised, then full on a drag up, closed below raised.
248. **The game page** (41): one share row under the header with share, copy and the code; the code opens the page with that question open; the open card has no row of its own.
249. **The join step** (41): in the installed app, a link, "I'm in", a tap on Your name: the caret in the field, not above "What are the odds?".
250. **The PIN** (41): Pass the phone, four digits in Your PIN, four in Again: the cursor stays in Again after every digit, and it turns on.
251. **Pull to refresh** (41): pull Now until all five strokes are drawn, let go: it reloads, the fifth redrawing, then the tally settles.
252. **Signing in and the settings** (41): signed out, Get started opens the app's own sheet; sign in. On You change your name, add a unit and see it when asking, and paste a sticker into Your marks.
253. **Brave** (42): in Brave on the iPhone, open a question's link, tap "I'm in", tap Your name. Expect the field above the keyboard with the caret in it, typing that keeps it there, and one tap on "Join as …" joining with the keyboard still up.
254. **Chrome** (42): the same in Chrome on the iPhone.
255. **The installed app and Safari** (42): the same in Safari and the installed app.
256. **After sign-up** (42): sign up from a link as a new account, then open Now and What's on. Expect each to start at its top, with nothing blank above the first line; an empty Now leads with the ideas tile, and the code boxes are headed "Someone sent you a code?" with "Got a link instead?" under them.
257. **Sideways** (42): on the terms step and the market, drag left and right. Expect nothing to move sideways and no scrollbar along the bottom.
258. **Tips for a new account** (42): as a new account, open Now, What's on, People, a market, asking and a person's page. Expect "Ask something" once on the first tab and never again; on a market Share, Copy the link and Show a code to scan, then on a later visit Pass the phone and Photos; when asking the mark, stickers and each choice; People's who's got who; a person's I got this one; one at a time, the rest blurred, the control ringed, each once.
259. **Tips for a guest** (42): in a private tab, join a question from its link. Expect no tip over "Keep your calls in an account"; after "Not now", Share and Copy the link, each once.
260. **Paste a link** (42): copy a question's link, a game's link and a link with the chat's words around it from Messages; on the joining screen tap "Paste a link" for each. Expect each to open; with a link on the clipboard that is not the app's, "There's no Dareful link on your clipboard."; with the clipboard refused, the field takes the paste.
261. **A game's photos** (42): on a game page with two of its questions, add a photo from the page's slot while it is on, and another after it is over. Expect one strip for the whole game, before and after, and no slot inside an open card.
262. **A question of your own** (42): on a game page, "Your own question", ask "Will Crosby score?". Expect the game's close on the terms step, the question on the page with the others, closing with them, and its people asked what happened once the game is over.
263. **A unit of your own** (42): when asking, "One of your own", type "push-ups", Add. Expect it picked, on You under Your units, and offered next time; no "a next time" anywhere in the stakes.
264. **Marks** (42): open Ideas. Expect a mark on every idea, each its own. Type a question without a mark and Set the terms: a mark beside "Your question" that taps open the picker to change or remove; the picker's categories in one row of icons that stays as the emoji scroll.
265. **Decided** (42): ask something the write-up dates today. Expect Tonight picked and "A date" beside it, never the same day twice.
266. **The penalty-kick argument** (42): after the deploy, its people open it. Expect Agree and "I see it differently"; nobody agreeing a day after its ruling showed, the tiebreaker hears it; it never settles by silence.
