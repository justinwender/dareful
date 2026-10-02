"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { installedHere, report } from "@/lib/usage/client";
import { causeOf, screenOf, type EventProps } from "@/lib/usage/events";

/**
 * A page a person opened from a link, said once per page load (the field round, 2026-10-02): the server counts
 * it once per person or device per link. Rendered by the market screen, the game's link page, the claim link and
 * the code screen; a link-preview fetcher runs no script, so it never reaches here.
 */
export function LinkOpened({ link, dareId, gameId, signedIn }: { link: EventProps<"link_opened">["link"]; dareId?: string | null; gameId?: string | null; signedIn: boolean }) {
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    report("link_opened", { link, signedIn, installed: installedHere() }, { dareId: dareId ?? null, gameId: gameId ?? null });
  }, [link, dareId, gameId, signedIn]);
  return null;
}

/**
 * A notification's tap, read from the address it opened (`?n=<notice>&via=push|email`, put there by the sender)
 * and taken off it at once, so a reload or a share never carries it. Mounted once, under the providers.
 */
export function NotificationOpened() {
  const pathname = usePathname();
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const via = url.searchParams.get("via");
    if (via !== "push" && via !== "email") return;
    const dareId = /^\/m\/([0-9a-f-]{36})/.exec(url.pathname)?.[1] ?? null;
    report("notification_opened", { channel: via }, { dareId });
    url.searchParams.delete("via");
    url.searchParams.delete("n");
    window.history.replaceState(window.history.state, "", url.pathname + (url.searchParams.toString() ? `?${url.searchParams}` : "") + url.hash);
  }, [pathname]);
  return null;
}

/** An error a screen showed, counted by its cause and the screen's shape; rendered by the components that show one, and draws nothing. */
export function ErrorShown({ message }: { message: string | null | undefined }) {
  useErrorShown(message);
  return null;
}

function useErrorShown(message: string | null | undefined): void {
  const pathname = usePathname();
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!message || message === last.current) return;
    last.current = message;
    report("error_shown", { cause: causeOf(message, typeof navigator === "undefined" ? true : navigator.onLine), screen: screenOf(pathname) });
  }, [message, pathname]);
}
