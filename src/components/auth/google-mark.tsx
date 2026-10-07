/**
 * Google's "G" at the left of a Google button (the second-pass round, 2026-10-06; Google's branding guidelines for a
 * custom Sign in with Google button): the standard colour mark, unmodified, at Google's 20px with Google's 12px to the
 * words. It is Google's artwork in Google's colours, served as the file Google's own configurator draws
 * (`public/brand/google-g.svg`), never one of the app's colours and never redrawn. Decorative: the button's words
 * name it.
 */
export function GoogleMark() {
  // eslint-disable-next-line @next/next/no-img-element -- a 20px static mark needs none of next/image's work, and the file must reach the page as drawn.
  return <img src="/brand/google-g.svg" alt="" width={20} height={20} className="mr-1 h-5 w-5 shrink-0" data-google-mark="" />;
}
