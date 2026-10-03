"use client";

import { useSyncExternalStore } from "react";

/**
 * The address's fragment, read once a screen is on the client (the field round, 1.5): a row on Now opens a market
 * at its move, `#enter` with the entry sheet raised, `#ballot` with the ballot raised, `#close` at the close.
 * Nothing on the server reads it (a fragment never reaches the server), so the sheets read it here and open
 * raised on the first client render; a change of fragment while the screen is up is heard too.
 */
const subscribe = (onChange: () => void) => {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
};
const read = () => (typeof window === "undefined" ? "" : window.location.hash);
const onServer = () => "";

export function useHash(): string {
  return useSyncExternalStore(subscribe, read, onServer);
}

/** Whether the address asks for this move: the fragment names it. */
export function hashAsksFor(hash: string, move: "enter" | "ballot" | "close"): boolean {
  return hash === `#${move}`;
}
