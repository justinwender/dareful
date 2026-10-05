/**
 * Layers (docs/design.md 9.3): the tab bar, the Start button, the pinned sheet, the modal sheets and the ask
 * layer are `position: fixed`, and any ancestor that carries one of the properties below becomes their
 * containing block, so they stop being fixed to the screen and ride along with it. That is the bug that made
 * the tab bar drift for weeks. So the fixed layers are portalled to the app root, never descendants of the page,
 * and none of these is ever set on the app root, on anything between it and a fixed layer, or on anything that
 * contains one. Pure: the rules here are read by the http suite over every screen's markup and by the browser
 * walk over the live tree.
 */
export const FIXED_LAYERS = ["tab-bar", "start", "sheet", "modal", "ask", "shell", "grain", "status-band", "guest-line", "tips"] as const;
export type FixedLayerName = (typeof FIXED_LAYERS)[number];

/** The properties that make an element the containing block of its fixed descendants, with any value but the one named. */
export const FORBIDDEN_ABOVE_FIXED: ReadonlyArray<{ property: string; allowed: string[] }> = [
  { property: "transform", allowed: ["none"] },
  { property: "translate", allowed: ["none"] },
  { property: "rotate", allowed: ["none"] },
  { property: "scale", allowed: ["none"] },
  { property: "perspective", allowed: ["none"] },
  { property: "filter", allowed: ["none"] },
  { property: "backdrop-filter", allowed: ["none"] },
  { property: "contain", allowed: ["none", "size", "inline-size", "style"] },
  { property: "content-visibility", allowed: ["visible", "hidden"] },
  { property: "will-change", allowed: ["auto"] },
];

/** A computed or declared style as a plain record: the value of each property, or nothing when it is not set. */
export type StyleRecord = Partial<Record<string, string | null | undefined>>;

/** The properties on this element that would capture a fixed descendant, as "property: value". */
export function forbiddenOn(style: StyleRecord): string[] {
  const out: string[] = [];
  for (const { property, allowed } of FORBIDDEN_ABOVE_FIXED) {
    const raw = style[property] ?? style[camel(property)];
    if (raw === null || raw === undefined) continue;
    const value = String(raw).trim().toLowerCase();
    if (value === "" || value === "initial" || value === "unset" || value === "normal") continue;
    if (property === "will-change") {
      // `will-change` captures only when it names one of the others.
      const names = value.split(",").map((s) => s.trim());
      if (!names.some((n) => FORBIDDEN_ABOVE_FIXED.some((f) => f.property !== "will-change" && f.property === n))) continue;
    } else if (allowed.includes(value)) continue;
    out.push(`${property}: ${value}`);
  }
  return out;
}

function camel(property: string): string {
  return property.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

/**
 * The Tailwind utilities that set one of those properties, read from a class attribute: `transform`, the
 * translate, rotate, scale and skew utilities, `perspective-*`, `filter` and its `blur-*` and friends,
 * `backdrop-*`, `contain-*`, `will-change-*` naming one of them, and an arbitrary property in brackets. The
 * `-none` forms are the allowed values and pass.
 */
const CLASS_RULES: ReadonlyArray<RegExp> = [
  /^-?transform(-gpu|-cpu)?$/,
  /^-?(translate|rotate|scale|skew)(-[xyz])?-(?!none$)\S+$/,
  /^-?perspective-(?!none$)\S+$/,
  /^filter$/,
  /^-?(blur|brightness|contrast|drop-shadow|grayscale|hue-rotate|invert|saturate|sepia)(-(?!none$)\S+)?$/,
  /^backdrop-(?!filter-none$)\S+$/,
  /^contain-(?!none$)(layout|paint|strict|content)$/,
  /^will-change-(transform|filter|scroll|contents)$/,
  /^\[(transform|translate|rotate|scale|perspective|filter|backdrop-filter|contain|content-visibility|will-change):(?!none\])\S+\]$/,
];

/** The classes on this element that would capture a fixed descendant. A variant prefix (`motion-safe:`, `hover:`) is stripped first. */
export function forbiddenClasses(className: string | null | undefined): string[] {
  if (!className) return [];
  const out: string[] = [];
  for (const raw of className.split(/\s+/)) {
    if (!raw) continue;
    const bare = raw.includes(":") && !raw.startsWith("[") ? (raw.split(":").pop() as string) : raw;
    if (CLASS_RULES.some((r) => r.test(bare))) out.push(raw);
  }
  return out;
}

/** An inline `style="…"` attribute as a record, for the markup walk. */
export function parseInlineStyle(style: string | null | undefined): StyleRecord {
  const out: StyleRecord = {};
  if (!style) return out;
  for (const part of style.split(";")) {
    const i = part.indexOf(":");
    if (i === -1) continue;
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim();
  }
  return out;
}

export type MarkupElement = { tag: string; attrs: Record<string, string> };

/**
 * The ancestors of the first element matching `match`, outermost first, from a server-rendered document. A small
 * tag walk that knows the void elements and self-closing tags, which is all React's markup needs: no parser
 * dependency, and no browser.
 */
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
export function ancestorsInMarkup(html: string, match: (el: MarkupElement) => boolean): MarkupElement[] | null {
  const stack: MarkupElement[] = [];
  const re = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[^\s=>/]+(?:=(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(\/?)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    const [, closing, tag, rawAttrs, selfClosing] = m;
    const name = (tag as string).toLowerCase();
    if (closing) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]?.tag === name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of (rawAttrs ?? "").matchAll(/([^\s=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[(a[1] as string).toLowerCase()] = a[2] ?? a[3] ?? a[4] ?? "";
    const el: MarkupElement = { tag: name, attrs };
    if (match(el)) return [...stack];
    if (selfClosing || VOID.has(name) || name === "script" || name === "style") continue;
    stack.push(el);
  }
  return null;
}

/** Every ancestor's captures, as "<tag class=…>: property" lines; empty when the fixed layer is safe. */
export function capturesAbove(ancestors: MarkupElement[]): string[] {
  const out: string[] = [];
  for (const a of ancestors) {
    const problems = [...forbiddenClasses(a.attrs["class"]).map((c) => `class ${c}`), ...forbiddenOn(parseInlineStyle(a.attrs["style"])).map((s) => `style ${s}`)];
    for (const p of problems) out.push(`<${a.tag}${a.attrs["class"] ? ` class="${a.attrs["class"].slice(0, 60)}"` : ""}>: ${p}`);
  }
  return out;
}
