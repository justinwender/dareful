"use client";

import { useEffect } from "react";
import { useSessionFacts } from "@/components/auth/device";

/**
 * The session slides (the field round, 1.7): once per open of the app, a signed-in person's browser asks the
 * session door to issue the cookie again if it is a day old or more, so thirty days count from the last open and
 * never from the sign-in. Nothing is shown and nothing waits on it; the door answers 204 either way.
 */
export function SessionRefresh() {
  const facts = useSessionFacts();
  const signedIn = facts.me !== null;
  useEffect(() => {
    if (!signedIn || typeof fetch !== "function") return;
    fetch("/api/session", { method: "PATCH", credentials: "same-origin" }).catch(() => undefined);
  }, [signedIn]);
  return null;
}
