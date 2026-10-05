/**
 * Google through Dynamic (the first-contact round, 2026-10-04): set up in Dynamic's dashboard for signing in and for
 * linking. The installed app is a separate question, since Google's return lands wherever iOS opens it; the
 * simulator check (docs/testing.md session 38) decides `GOOGLE_IN_INSTALLED_APP`, and with it off Google is offered
 * only in the browser.
 */
export const GOOGLE_SIGN_IN = true;
export const GOOGLE_IN_INSTALLED_APP = true;

/** Whether this screen offers Google at all. */
export function googleOffered(installed: boolean): boolean {
  return GOOGLE_SIGN_IN && (!installed || GOOGLE_IN_INSTALLED_APP);
}

/** The parameters Dynamic's return from Google can carry, as its SDK reads them (`getDynamicRedirectDataFromUrl`: the code, the state, and an SSO provider's id); the SDK reads them at the root and never takes them off the address. */
export const OAUTH_PARAMS = ["dynamicOauthCode", "dynamicOauthState", "dynamicOauthSsoProviderId"] as const;

/** The address without Google's return parameters, once the sign-in they carried has finished. */
export function withoutOauthParams(href: string): string {
  const url = new URL(href);
  for (const p of OAUTH_PARAMS) url.searchParams.delete(p);
  const query = url.searchParams.toString();
  return `${url.pathname}${query ? `?${query}` : ""}${url.hash}`;
}
