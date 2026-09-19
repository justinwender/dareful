# Testing log

Real-world testing: who tested (by role, never by name), what broke, and what changed because of it. Continuous from the first submittable build (end of Phase 2). This log is a submission deliverable.

## September 2026: cross-device passkey testing, before any code existed

Tested the passkey login flows the product will depend on, across devices and password managers, using stock sign-in pages rather than Dareful (which did not exist yet).

- iCloud Keychain passkeys worked across macOS and iOS, including in incognito windows.
- Google Password Manager passkeys worked across Android and macOS Chrome, including in incognito windows.
- With Dashlane set as the sole iOS AutoFill provider, iCloud Keychain passkeys were invisible in every browser, and Dashlane created a credential that did not function. This resolved once iCloud Keychain was re-enabled as an AutoFill provider.

Conclusion: default-configuration users on both platforms are fine. Third-party password manager users are the risk. The login flow needs a plain message when a passkey fails ("your password manager may be hiding your passkey; try email or phone instead"), never a generic error.

What changed: the Phase 1 login acceptance test includes a passkey failure path with a specific message, and email and phone OTP remain first-class alternatives rather than fallbacks buried behind passkeys.

## Session 2: first real use, two platforms
 
**Date:** September 19, 2026
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
 
### Still to record
 
- What the contact picker did on each platform, and whether behavior differed
  between an installed PWA and a browser tab.
- Whether registration time differed between iOS and Android.
 
