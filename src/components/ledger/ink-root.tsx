import { inkStyleText, type InkName } from "@/lib/ui/ink";

/**
 * A market's ink on the document root (docs/design.md 1.8, 9.3): one style element that swaps `--ground`,
 * `--surface`, `--line` and `--field` on `html` for the market's layers in both themes, so the page, the band
 * behind the status bar, the grain and every portalled sheet read the same place. It leaves with the page.
 */
export function InkRoot({ ink }: { ink: InkName }) {
  return <style data-ink-root={ink} dangerouslySetInnerHTML={{ __html: inkStyleText(ink) }} />;
}
