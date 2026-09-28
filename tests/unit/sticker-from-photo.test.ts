/**
 * The guided sticker path (docs/design.md 3.28, frames 1 to 3; 3.38): "Make a sticker" in the full-screen photo
 * when a cutout can be stored, the see-through sheet with its two steps and the chalk "Paste", the result with
 * "In your stickers", "Ask something with it" opening the question step with the sticker as its mark, and "Done";
 * and the photo itself left to the phone's long-press, which the whole path depends on. Rendered to markup
 * inside a stub router, so each rule has a check that can fail.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PhotoView } from "@/components/ledger/photo-view";
import { StickerMade, StickerSheet } from "@/components/ledger/sticker-from-photo";

// A stub with the six moves a screen may make; nothing here navigates.
const router = { push: () => undefined, replace: () => undefined, refresh: () => undefined, back: () => undefined, forward: () => undefined, prefetch: () => undefined } as unknown as AppRouterInstance;
const inRouter = (el: React.ReactElement) => renderToStaticMarkup(createElement(AppRouterContext.Provider, { value: router }, el));
const items = [{ id: "3f2b5c1e-9d7a-4b8c-8e2f-1a2b3c4d5e6f", alt: "Photo 1 of 1, added by Nia", removable: false }];

test("the viewer offers Make a sticker only when a cutout can be stored, beside Save, as icon buttons with their words, and leaves the photo's long-press to the phone", () => {
  const withStickers = inRouter(createElement(PhotoView, { items, onClose: () => undefined, stickers: true }));
  assert.ok(withStickers.includes('data-make-sticker=""') && withStickers.includes("Make a sticker") && withStickers.includes('data-save-photo=""') && withStickers.includes('aria-label="Save to your phone"'), "the entry beside Save (3.38)");
  const without = inRouter(createElement(PhotoView, { items, onClose: () => undefined, stickers: false }));
  assert.ok(!without.includes("Make a sticker") && without.includes('data-save-photo=""'), "no entry where nothing can be stored: nothing points at a path that fails");
  const img = /<img[^>]*data-photo-image=""[^>]*>/.exec(withStickers)?.[0] ?? "";
  assert.ok(img && !/touch-callout|pointer-events-none|select-none|user-drag/.test(img), "the phone's own hold-and-copy stays on the photo (3.28)");
});

test("the sheet is see-through with two named steps and the chalk Paste; the result says In your stickers with the chalk to ask with it and Done", () => {
  const sheet = inRouter(createElement(StickerSheet, { open: true, pasting: false, problem: null, onPaste: () => undefined, onClose: () => undefined }));
  assert.ok(sheet.includes('data-sheet="clear"'), "over the photo, which can still be held");
  assert.ok(sheet.includes("Make a sticker") && sheet.includes("Hold what you want, then tap Copy") && sheet.includes("Then paste it here"), "the two steps, in the doc's words");
  assert.ok(/data-paste-cutout=""[^>]*>[\s\S]*?Paste</.test(sheet) || /<button[^>]*data-paste-cutout=""[^>]*>[\s\S]*?Paste/.test(sheet), "the chalk Paste");
  const made = inRouter(createElement(StickerMade, { id: items[0]!.id, onDone: () => undefined, onClose: () => undefined }));
  assert.ok(made.includes("In your stickers") && made.includes(`/api/mark/${items[0]!.id}?size=stamp`), "the sticker where the photo was");
  assert.ok(new RegExp(`href="/m/new\\?sticker=${items[0]!.id}"[^>]*data-ask-with-sticker=""|data-ask-with-sticker=""[^>]*href="/m/new\\?sticker=${items[0]!.id}"`).test(made) && made.includes("Ask something with it"), "the chalk opens the question step with the sticker as its mark");
  assert.ok(made.includes(">Done<"), "and Done");
});
