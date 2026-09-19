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
 