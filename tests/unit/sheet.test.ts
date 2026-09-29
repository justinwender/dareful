/**
 * The modal sheet's two modes (docs/design.md 1.5, 3.28 frame 2, 9.9): an ordinary sheet has a backdrop that takes
 * the touches and closes it without dimming anything (the page behind a sheet holds still; no scrim); the sticker
 * sheet over a photo (`clear`) has no backdrop at all and lets touches through everywhere but its own panel, since
 * the photo itself is what the person holds. Both rise on the move curve and close by their close. Rendered to
 * markup, so the rule has a check that can fail.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { dragCloses, FLICK_PX_PER_MS, Sheet } from "@/components/ui/sheet";

/** The sheet as a component whose children come as the third argument, which is how React wants them passed. */
const SheetEl = Sheet as unknown as FC<{ open: boolean; onClose: () => void; labelledBy: string; clear: boolean }>;
const render = (clear: boolean) => renderToStaticMarkup(createElement(SheetEl, { open: true, onClose: () => undefined, labelledBy: "t", clear }, createElement("p", { id: "t" }, "Hello")));

test("an ordinary sheet has a backdrop that closes it and dims nothing; a clear sheet has none, lets touches through around its panel, and still closes by its close", () => {
  const plain = render(false);
  assert.ok(plain.includes('aria-label="Never mind"') && plain.includes("data-sheet-backdrop"), "the backdrop, named");
  assert.ok(!plain.includes("--scrim") && plain.includes("bg-transparent"), "nothing behind a sheet dims (1.5)");
  assert.ok(!plain.includes("pointer-events-none"), "an ordinary sheet takes every touch");
  assert.ok(plain.includes("motion-rise"), "it rises from below on the move curve (9.9)");
  const clear = render(true);
  assert.ok(!clear.includes('aria-label="Never mind"') && !clear.includes("data-sheet-backdrop"), "no backdrop over the photo");
  assert.ok(clear.includes('data-sheet="clear"') && /class="fixed inset-0 z-50[^"]*pointer-events-none/.test(clear), "touches pass through around the panel");
  assert.ok(/role="dialog"[^>]*class="[^"]*pointer-events-auto/.test(clear) || /class="[^"]*pointer-events-auto[^"]*"[^>]*role="dialog"/.test(clear), "the panel itself still takes touches");
  assert.ok(clear.includes('aria-label="Close"'), "the close is the way out");
});

test("a drag on the handle closes the sheet past a third of its height, or on a downward flick, and never on a small pull (9.9)", () => {
  assert.equal(dragCloses(120, 300, 0.1), true, "past a third");
  assert.equal(dragCloses(100, 300, 0.1), false, "a third exactly is not past it");
  assert.equal(dragCloses(40, 300, FLICK_PX_PER_MS), true, "a flick, however short");
  assert.equal(dragCloses(40, 300, 0.2), false, "a slow short pull returns");
  assert.equal(dragCloses(0, 300, 5), false, "no pull is no close");
});
