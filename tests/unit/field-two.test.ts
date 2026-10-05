/**
 * The field round, part 2 (2026-10-02): the sheet's four positions, the count's second number, a pasted sticker
 * shown at once, the PIN as a masked numeric field, the photo input offering both camera and library, the
 * question as a field, and the token's face under a heading that names its owner.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { nextPosition, positionsOf, SNAP_PX, visibleAt, type SheetMeasure } from "@/components/ui/pinned-sheet";
import { inCount } from "@/lib/ledger/home";
import { stickerCell } from "@/components/markets/mark-picker";
import { ObligationToken } from "@/components/ledger/obligation-token";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

test("the sheet has four positions: tucked and resting always, raised when there is more than the move, full when raised cannot show it all, and each shows its own height", () => {
  const small: SheetMeasure = { handle: 40, rest: 140, natural: 140, raisedCap: 500, fullCap: 700, pad: 0 };
  assert.deepEqual(positionsOf(small), ["tucked", "resting"], "nothing more to show: no raised");
  const some: SheetMeasure = { ...small, natural: 360 };
  assert.deepEqual(positionsOf(some), ["tucked", "resting", "raised"]);
  const tall: SheetMeasure = { ...small, natural: 900 };
  assert.deepEqual(positionsOf(tall), ["tucked", "resting", "raised", "full"]);
  assert.deepEqual([visibleAt("tucked", tall), visibleAt("resting", tall), visibleAt("raised", tall), visibleAt("full", tall)], [40, 140, 500, 700], "the handle row alone, the move, three quarters, up to the band");
  assert.equal(visibleAt("raised", some), 360, "raised shows everything when it fits");
});

test("a drag moves the sheet one position by direction past 24px, a shorter one leaves it, and the ends hold", () => {
  const all = ["tucked", "resting", "raised", "full"] as const;
  assert.equal(nextPosition("resting", -(SNAP_PX + 1), [...all]), "raised");
  assert.equal(nextPosition("resting", SNAP_PX + 1, [...all]), "tucked");
  assert.equal(nextPosition("resting", -SNAP_PX, [...all]), "resting", "exactly the snap stays");
  assert.equal(nextPosition("raised", -100, [...all]), "full");
  assert.equal(nextPosition("full", -100, [...all]), "full", "the top holds");
  assert.equal(nextPosition("tucked", 100, [...all]), "tucked", "the bottom holds");
  assert.equal(nextPosition("raised", 100, [...all]), "resting", "one position when the positions' offsets are not given");
  assert.equal(nextPosition("full", 100, [...all]), "raised", "down from full is raised");
  assert.equal(nextPosition("raised", -100, ["tucked", "resting", "raised"]), "raised", "no full where raised shows it all");
});

test("a count names its second number only when it is real: someone named still out", () => {
  assert.equal(inCount(3, 6), "3 of 6 in");
  assert.equal(inCount(4, 4), "4 in");
  assert.equal(inCount(4, 1), "4 in", "nobody was named: the set is whoever joins");
});

test("a pasted sticker shows at once from the device's copy and is not pickable until it is stored", () => {
  assert.deepEqual(stickerCell({ id: "pending-1", ink: null, preview: "blob:x" }, (id) => `/api/mark/${id}`), { src: "blob:x", pending: true });
  assert.deepEqual(stickerCell({ id: "abc", ink: "clay" }, (id) => `/api/mark/${id}`), { src: "/api/mark/abc", pending: false });
});

test("the PIN is a masked numeric text field the password manager never takes, the photo input offers the camera and the library alike, and the question reads as a field", () => {
  const pin = read("src/components/you/pass-the-phone.tsx");
  for (const m of pin.matchAll(/data-pin(?:-again)?=""/g)) {
    const tag = pin.slice(pin.lastIndexOf("<input", m.index), m.index);
    assert.match(tag, /type="text"/, "a text field, drawn masked");
    assert.match(tag, /inputMode="numeric"/);
    assert.match(tag, /autoComplete="off"/, "never the password manager's");
    assert.match(tag, /pin-field/, "the mask");
  }
  assert.match(read("src/app/globals.css"), /\.pin-field \{\n  -webkit-text-security: disc;/);
  assert.ok(!/capture=/.test(read("src/components/ledger/close-obligation.tsx")), "the settlement photo: camera or library");
  assert.ok(!/capture=\{state === "open"\}/.test(read("src/app/m/[id]/page.tsx")), "a photo on an open market: camera or library");
  const ask = read("src/components/markets/ask-form.tsx");
  for (const id of ["ask-line", "ask-title"]) {
    const i = ask.indexOf(`id="${id}"`);
    const tag = ask.slice(i, ask.indexOf("/>", i));
    assert.match(tag, /border border-line bg-surface/, `${id} is drawn as a field`);
  }
});

test("under a heading that names its owner, a token wears the face of the one they have got", () => {
  const owner = { id: "jp", displayName: "JP", hue: "sand" as const };
  const other = { id: "gabe", displayName: "Gabe", hue: "sky" as const };
  const denomination = { label: "beer", pluralLabel: "beers", quantifiable: true, monetary: false, template: null, markKind: "none", markValue: null } as unknown as Parameters<typeof ObligationToken>[0]["denomination"];
  const faced = renderToStaticMarkup(createElement(ObligationToken, { owner, other, viewerId: "me", denomination, quantity: 2n, face: "other" }));
  assert.ok(/aria-label="Gabe"/.test(faced) && !/aria-label="JP"/.test(faced), "the other end's avatar");
  const plain = renderToStaticMarkup(createElement(ObligationToken, { owner, other, viewerId: "me", denomination, quantity: 2n }));
  assert.ok(/aria-label="JP"/.test(plain) && !/aria-label="Gabe"/.test(plain), "the owner's by default");
});
