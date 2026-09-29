/**
 * Appearance (docs/design.md 8.1): the app follows the phone through `prefers-color-scheme`, and a row on You
 * offers an override, "Match your phone" (the default), "Always dark" and "Always light". It is a device
 * preference kept on the device, like recents, and never a record about the person, so it lives in the browser's
 * storage and nowhere else. Before first paint an inline script in the document head reads it and sets
 * `data-theme` on `html`, so a cold start never flashes the wrong theme; the opening (11) is the one exception,
 * drawn in the phone's own scheme. Pure, so the choices and the script have tests.
 */
export const THEME_KEY = "dareful.theme";
export const THEME_CHOICES = [
  { value: "phone", label: "Match your phone" },
  { value: "dark", label: "Always dark" },
  { value: "light", label: "Always light" },
] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number]["value"];

export function isThemeChoice(v: unknown): v is ThemeChoice {
  return v === "phone" || v === "dark" || v === "light";
}

/** What `data-theme` on `html` reads for a choice: nothing for "phone", since the stylesheet follows the phone then. */
export function themeAttribute(choice: ThemeChoice): "dark" | "light" | null {
  return choice === "phone" ? null : choice;
}

/** The inline script for the head: the stored choice onto `html` before anything paints, and nothing when there is none or storage is blocked. */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(THEME_KEY)});if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;
