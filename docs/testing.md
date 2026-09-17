# Testing log

Real-world testing: who tested (by role, never by name), what broke, and what changed because of it. Continuous from the first submittable build (end of Phase 2). This log is a submission deliverable.

## September 2026: cross-device passkey testing, before any code existed

Tested the passkey login flows the product will depend on, across devices and password managers, using stock sign-in pages rather than Dareful (which did not exist yet).

- iCloud Keychain passkeys worked across macOS and iOS, including in incognito windows.
- Google Password Manager passkeys worked across Android and macOS Chrome, including in incognito windows.
- With Dashlane set as the sole iOS AutoFill provider, iCloud Keychain passkeys were invisible in every browser, and Dashlane created a credential that did not function. This resolved once iCloud Keychain was re-enabled as an AutoFill provider.

Conclusion: default-configuration users on both platforms are fine. Third-party password manager users are the risk. The login flow needs a plain message when a passkey fails ("your password manager may be hiding your passkey; try email or phone instead"), never a generic error.

What changed: the Phase 1 login acceptance test includes a passkey failure path with a specific message, and email and phone OTP remain first-class alternatives rather than fallbacks buried behind passkeys.
