/**
 * What the app's frame needs to know about the session, read once per load: whether the person has anything left
 * to set up, and the facts a device is checked against (`Me`). The root layout starts this and never waits for
 * it: the promise travels to the browser and whatever needs the answer waits where it is used, so no screen's
 * shell stands behind the account's row or the pass-the-phone read (docs/design.md 11.5; docs/decisions.md
 * 2026-09-29).
 */
import { cache } from "react";
import { nameSettled } from "@/lib/auth/login";
import { currentUser } from "@/lib/auth/session";
import type { Me } from "@/lib/auth/device";
import { passThePhoneStatus } from "@/lib/ledger/pass-the-phone";

export type SessionFacts = { /** Someone with a session and a name they gave (`nameSettled`: not the placeholder, not an identifier) has nothing to set up, so the login bootstrap stays out of their way. */ settled: boolean; me: Me | null };

export const sessionFacts = cache(async function sessionFacts(): Promise<SessionFacts> {
  const user = await currentUser();
  if (!user) return { settled: false, me: null };
  // Whether the server may sign for this person where the device cannot (3.45): read once per load, so a second device knows without asking.
  const passThePhone = (await passThePhoneStatus(user.id)).on;
  return { settled: nameSettled(user.displayName), me: { dynamicUserId: user.dynamicUserId, ledgerWallet: user.ledgerWallet, governanceWallet: user.governanceWallet, passThePhone } };
});
