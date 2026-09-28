/**
 * The sheet's see-through mode (docs/design.md 3.28, frame 2): the sticker sheet sits over a photo the person
 * still has to hold, so it has no scrim and lets touches through everywhere but its own panel; the ordinary
 * sheet keeps its scrim, which is what takes the touches (docs/decisions.md 2026-09-20). Rendered to markup, so
 * the rule has a check that can fail.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type FC } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Sheet } from "@/components/ui/sheet";

/** The sheet as a component whose children come as the third argument, which is how React wants them passed. */
const SheetEl = Sheet as unknown as FC<{ open: boolean; onClose: () => void; labelledBy: string; clear: boolean }>;
const render = (clear: boolean) => renderToStaticMarkup(createElement(SheetEl, { open: true, onClose: () => undefined, labelledBy: "t", clear }, createElement("p", { id: "t" }, "Hello")));

test("an ordinary sheet has a scrim that closes it; a clear sheet has none, lets touches through around its panel, and still closes by its close", () => {
  const plain = render(false);
  assert.ok(plain.includes('aria-label="Never mind"') && plain.includes("bg-[var(--scrim)]"), "the scrim, named");
  assert.ok(!plain.includes("pointer-events-none"), "an ordinary sheet takes every touch");
  const clear = render(true);
  assert.ok(!clear.includes('aria-label="Never mind"') && !clear.includes("bg-[var(--scrim)]"), "no scrim over the photo");
  assert.ok(clear.includes('data-sheet="clear"') && /class="fixed inset-0 z-50[^"]*pointer-events-none/.test(clear), "touches pass through around the panel");
  assert.ok(/role="dialog"[^>]*class="[^"]*pointer-events-auto/.test(clear) || /class="[^"]*pointer-events-auto[^"]*"[^>]*role="dialog"/.test(clear), "the panel itself still takes touches");
  assert.ok(clear.includes('aria-label="Close"'), "the close is the way out");
});
