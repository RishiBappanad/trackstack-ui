import type { TrackStackApp } from "../types.js";

/**
 * Looks up the deployed URL of "TrackStack Home" -- the one app that now
 * owns login/registration (per-tracker login pages were scrapped in favor
 * of a single central login, 2026-09-20) -- from trackstack-auth's own
 * GET /apps registry, rather than a new hardcoded env var: the registry
 * is already the single source of truth for every app's public URL
 * (AppSwitcher, Google OAuth's `state`/`returnTo` origin allowlist), so
 * Home's URL shouldn't need a second, independently-configured copy of
 * the same fact.
 */
export async function getHomeAppUrl(authBaseUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`${authBaseUrl}/apps`);
    if (!res.ok) return null;
    const apps: TrackStackApp[] = await res.json();
    return apps.find((a) => a.id === "home")?.href ?? null;
  } catch {
    return null;
  }
}

/**
 * Sends the browser to TrackStack Home's login page -- the only login UI
 * in the whole system. `returnTo`, when given, is threaded through as a
 * query param so Home can send the browser back to exactly where it came
 * from once authenticated -- omit it (e.g. on an explicit logout) to land
 * the user on Home itself instead of immediately bouncing them back to
 * the app they just chose to leave.
 *
 * No-ops if Home's URL can't be resolved (registry unreachable) rather
 * than navigating to `undefined` -- the caller's existing "checking..."
 * state just persists, which is a safer failure mode than a broken nav.
 */
export async function redirectToLogin(authBaseUrl: string, returnTo?: string): Promise<void> {
  const homeUrl = await getHomeAppUrl(authBaseUrl);
  if (!homeUrl) return;
  window.location.href = returnTo ? `${homeUrl}?returnTo=${encodeURIComponent(returnTo)}` : homeUrl;
}
