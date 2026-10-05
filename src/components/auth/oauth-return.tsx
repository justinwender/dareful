"use client";

import { useEffect } from "react";
import { useDynamicEvents, useIsLoggedIn } from "@dynamic-labs/sdk-react-core";
import { OAUTH_PARAMS, withoutOauthParams } from "@/lib/auth/google";
import { report } from "@/lib/usage/client";
import { screenOf } from "@/lib/usage/events";

/**
 * Google's return, at the app's root (the first-contact round, 2026-10-04): Dynamic's provider, mounted at the root,
 * reads the code and the state off whatever address Google came back to and finishes the sign-in itself; it never
 * takes them off the address, so this does once the login holds, and never before (a component's own effect runs
 * before the provider's, and taking them first would lose the sign-in). A failed return is counted like any error
 * a screen showed; the screen it lands on reopens the step the person was on (`MarketStage`, from the handoff).
 */
export function OauthReturn() {
  const loggedIn = useIsLoggedIn();
  useEffect(() => {
    if (!loggedIn) return;
    const url = new URL(window.location.href);
    if (!OAUTH_PARAMS.some((p) => url.searchParams.has(p))) return;
    window.history.replaceState(window.history.state, "", withoutOauthParams(url.href));
  }, [loggedIn]);
  useDynamicEvents("authFailure", () => {
    report("error_shown", { cause: "failed", screen: screenOf(window.location.pathname) });
  });
  return null;
}
