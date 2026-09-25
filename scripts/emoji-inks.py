"""Derive a market ink for every emoji, per design.md 1.8.

Reference renderer: Noto Color Emoji (the same font the link-tile renderer loads), so the ink
is the same on every phone regardless of that phone's own emoji set.

Rule, in order (balance and the creator's pick happen later, at market creation):
  1. Template family -> null (the market falls back to a hash of its id):
     the yellow smiley faces, cat faces, and everything in People & Body. Skin never picks an ink;
     a skin-tone variant inherits its default form, which is template.
  2. Render at 109px. Keep pixels with alpha > 0.5. A pixel is chromatic when OKLCH chroma > 0.04.
     Fewer than 25% chromatic -> null (grey, black, white marks).
  3. Dominant hue: a 10-degree hue histogram of chromatic pixels weighted by chroma; take the
     heaviest bin and the chroma-weighted circular mean inside it (+/- 15 degrees).
  4. Snap to the nearest ink hue, with two folds: reds go to Rose (hue 345 to 20, or 20 to 40 when
     the dominant chroma is 0.14 or more; lower-chroma browns in that band go to Clay), and greens
     from 120 to 165 go to Olive.
Keys are normalised: U+FE0F and skin-tone modifiers (U+1F3FB..U+1F3FF) are stripped. Look up the
same way.
An emoji the reference font cannot draw (it renders no pixels) is left out of the table entirely, so
the table's keys are exactly the set the tile renderer can draw, and the picker offers only those.
Regenerate when the renderer's font is updated.
Output: src/lib/ui/emoji-inks.json {emoji: ink | null}, which the app reads (src/lib/ui/emoji-ink.ts), plus
emoji-inks-detail.json beside this script (hue, chroma and reason per emoji, not committed) and a summary line.

To regenerate, from the repository root (the repository has no Python tooling of its own; this is the one
script, kept in Python because no Node library rasterises Noto Color Emoji's bitmap font without a browser):
  npm i --no-save emojibase-data@17
  pip install pillow            (built with raqm, so ZWJ sequences shape)
  NOTO_COLOR_EMOJI=/path/to/NotoColorEmoji.ttf python3 scripts/emoji-inks.py
NOTO_COLOR_EMOJI is the same Noto Color Emoji the tile renderer draws with (Satori's `emoji: "noto"`); the
committed table was built from Noto Color Emoji 2.047 and emojibase 17. Takes about 20 seconds. Regenerate
only when that font changes, and commit the table with the change that updates the font.
"""
import json, math, os, sys
from PIL import Image, ImageDraw, ImageFont

FONT = ImageFont.truetype(os.environ.get('NOTO_COLOR_EMOJI', '/usr/share/fonts/truetype/noto/NotoColorEmoji.ttf'), 109)
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INKS = [("clay", 45), ("ochre", 85), ("olive", 112), ("sea", 192), ("slate", 248), ("iris", 288), ("plum", 330), ("rose", 8)]
TEMPLATE_SUBGROUPS = {"face-smiling", "face-affection", "face-tongue", "face-hand", "face-neutral-skeptical", "face-sleepy",
                      "face-unwell", "face-hat", "face-glasses", "face-concerned", "face-negative", "cat-face"}

def srgb_to_oklch(r, g, b):
    def lin(c):
        c /= 255.0
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = lin(r), lin(g), lin(b)
    l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b
    m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b
    s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b
    l_, m_, s_ = l ** (1 / 3), m ** (1 / 3), s ** (1 / 3)
    L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_
    a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_
    bb = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_
    C = math.hypot(a, bb)
    h = math.degrees(math.atan2(bb, a)) % 360
    return L, C, h

def snap(h, c=0.0):
    if h >= 345 or h < 20: return "rose"
    if 20 <= h < 40: return "rose" if c >= 0.14 else "clay"
    if 120 <= h < 165: return "olive"
    best = min(INKS, key=lambda kv: min(abs(h - kv[1]), 360 - abs(h - kv[1])))
    return best[0]

def opaque(e):
    im = Image.new('RGBA', (160, 136), (0, 0, 0, 0))
    ImageDraw.Draw(im).text((4, 4), e, font=FONT, embedded_color=True)
    return [p for p in im.get_flattened_data() if p[3] > 127] if hasattr(im, 'get_flattened_data') else [p for p in im.getdata() if p[3] > 127]

def measure(e):
    px = opaque(e)
    if not px: return 'undrawable', 0.0, None
    chrom = []
    for r, g, b, a in px[::2]:
        L, C, h = srgb_to_oklch(r, g, b)
        if C > 0.04: chrom.append((C, h))
    frac = len(chrom) / max(1, len(px[::2]))
    if frac < 0.25: return None, frac, None
    bins = [0.0] * 36
    for C, h in chrom: bins[int(h // 10) % 36] += C
    k = max(range(36), key=lambda i: bins[i])
    centre = k * 10 + 5
    sx = sy = 0.0; cs = 0.0; n = 0
    for C, h in chrom:
        d = min(abs(h - centre), 360 - abs(h - centre))
        if d <= 15:
            sx += C * math.cos(math.radians(h)); sy += C * math.sin(math.radians(h)); cs += C; n += 1
    hue = math.degrees(math.atan2(sy, sx)) % 360
    mc = cs / max(1, n)
    return snap(hue, mc), frac, (round(hue, 1), round(mc, 3))

def norm(e):
    return "".join(ch for ch in e if ch != "\ufe0f" and not (0x1F3FB <= ord(ch) <= 0x1F3FF))

def main():
    data = json.load(open(os.path.join(ROOT, 'node_modules/emojibase-data/en/data.json')))
    meta = json.load(open(os.path.join(ROOT, 'node_modules/emojibase-data/meta/groups.json')))
    subg = meta['subgroups']
    out, detail, skipped = {}, {}, []
    for d in data:
        if d.get('group') in (None, 2):  # components, regional indicators
            continue
        e = norm(d['emoji'])
        sg = subg.get(str(d.get('subgroup')), '')
        if not opaque(e):
            skipped.append(e); continue
        if d.get('group') == 1 or sg in TEMPLATE_SUBGROUPS:
            out[e] = None; detail[e] = ('template', sg); continue
        ink, frac, hue = measure(e)
        out[e] = ink
        detail[e] = (ink or 'hueless', f'{frac:.2f}', hue, d['label'])
    json.dump(out, open(os.path.join(ROOT, 'src/lib/ui/emoji-inks.json'), 'w'), ensure_ascii=False, indent=0)
    json.dump(detail, open(os.path.join(ROOT, 'scripts/emoji-inks-detail.json'), 'w'), ensure_ascii=False, indent=0)
    from collections import Counter
    c = Counter(v or 'hash' for v in out.values())
    print(len(out), dict(c), 'left out (not in the reference font):', len(skipped))

if __name__ == '__main__':
    main()
