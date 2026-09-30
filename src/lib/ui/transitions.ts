"use client";

import { flushSync } from "react-dom";
import { landingByTraversal } from "./traversal";
import { dropKeyboard } from "./viewport";

/**
 * View transitions (docs/design.md 9.3, 9.7, 9.8): the steps of asking, opening a market and going back use
 * `document.startViewTransition`, which never transforms the live page: the browser draws snapshots on a layer
 * of its own and animates those, so the fixed layers underneath stay fixed. The update callback draws the new
 * state synchronously and returns; it never awaits a fetch, since the old snapshot is held on screen while it
 * runs. A tap during a transition finishes it first. Where the API is missing (iOS before 18) there is no
 * transition: the update is simply applied. Direction travels as a class on `html` (`back`), never as
 * view-transition classes or types, which arrived only in Safari 18.2. A screen landing from a traversal (the
 * phone's swipe from the edge, which the phone animates itself) takes no transition either (`traversal.ts`).
 */
type Transition = { finished: Promise<void>; skipTransition: () => void };
type Doc = Document & { startViewTransition?: (update: () => void | Promise<void>) => Transition };

let current: Transition | null = null;

export function supportsViewTransitions(): boolean {
  return typeof document !== "undefined" && typeof (document as Doc).startViewTransition === "function";
}

/** Finish whatever is running, so the next tap acts on a settled page (9.3). */
export function skipCurrentTransition(): void {
  current?.skipTransition();
  current = null;
}

/**
 * Apply `update` inside a view transition, synchronously (React's work is flushed so the snapshot after the
 * callback is the new state). `back` marks the direction for the step keyframes.
 */
export function withViewTransition(update: () => void, opts: { back?: boolean } = {}): void {
  const doc = document as Doc;
  // A step or a screen changing takes its fields with it: the keyboard leaves first, by a blur (viewport.ts).
  dropKeyboard();
  if (!doc.startViewTransition || landingByTraversal(location.pathname)) {
    update();
    return;
  }
  skipCurrentTransition();
  doc.documentElement.classList.toggle("back", Boolean(opts.back));
  const vt = doc.startViewTransition(() => {
    flushSync(update);
  });
  current = vt;
  settle(vt, doc);
}

/** A skipped or aborted transition (a hidden document, a tap that finished it) rejects its promises; that is expected, never an error to surface. */
function settle(vt: Transition, doc: Doc): void {
  const quiet = vt as Transition & { ready?: Promise<void>; updateCallbackDone?: Promise<void> };
  quiet.ready?.catch(() => undefined);
  quiet.updateCallbackDone?.catch(() => undefined);
  vt.finished
    .catch(() => undefined)
    .finally(() => {
      if (current === vt) current = null;
      doc.documentElement.classList.remove("back");
    });
}

/**
 * Apply an update that lands on its own (a navigation the router commits), holding the old snapshot until
 * `landed` resolves or `timeoutMs` passes, whichever is first. Used only where the landing is known to be at
 * hand (a root held by the router, 9.7), never for a fetch: a callback that waits is exactly the freeze this
 * section is about.
 */
export function withLandingTransition(update: () => void, landed: Promise<void>, opts: { back?: boolean; timeoutMs?: number } = {}): void {
  const doc = document as Doc;
  dropKeyboard();
  if (!doc.startViewTransition || landingByTraversal(location.pathname)) {
    update();
    return;
  }
  skipCurrentTransition();
  doc.documentElement.classList.toggle("back", Boolean(opts.back));
  const vt = doc.startViewTransition(async () => {
    update();
    await Promise.race([landed, new Promise<void>((r) => setTimeout(r, opts.timeoutMs ?? 150))]);
  });
  current = vt;
  settle(vt, doc);
}
