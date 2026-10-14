import { apiFetch } from "./api.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

/** Home's account-wide UI theme: one hue (drives every "brand" color --
 * primary/ring/accent/switcher-active) and one background lightness
 * (drives the whole dark-neutral family -- background/card/border/
 * sidebar/switcher). Deliberately just these two numbers, not a token-
 * by-token palette: every other relationship below is a FIXED offset
 * from them, reverse-engineered from index.css's own hardcoded :root
 * values so that hue=DEFAULT_HUE, backgroundLightness=DEFAULT_LIGHTNESS
 * reproduces today's exact look, pixel for pixel -- an account that never
 * opens the Appearance page sees zero change. Destructive/success stay
 * fixed red/green regardless of hue; they're semantic, not decorative. */
export const DEFAULT_HUE = 258;
export const DEFAULT_LIGHTNESS = 9;

export const HUE_RANGE = { min: 0, max: 359 };
export const LIGHTNESS_RANGE = { min: 4, max: 32 };

export interface ThemePreset {
  key: string;
  label: string;
  hue: number;
  backgroundLightness: number;
}

export const THEME_PRESETS: ThemePreset[] = [
  { key: "midnight", label: "Midnight", hue: 258, backgroundLightness: 9 },
  { key: "slate", label: "Slate", hue: 220, backgroundLightness: 16 },
  { key: "twilight", label: "Twilight", hue: 280, backgroundLightness: 13 },
];

/** The exact --custom-property names index.css's own :root block
 * defines, so applyTheme can override them 1:1 via inline style
 * (inline styles win over the stylesheet's :root rule without needing
 * to touch or duplicate index.css itself). */
function cssVars(hue: number, l0: number): Record<string, string> {
  const h = hue;
  return {
    "--background": `${h} 22% ${l0}%`,
    "--foreground": `${h} 15% 92%`,
    "--border": `${h} 15% ${l0 + 9}%`,
    "--input": `${h} 15% ${l0 + 9}%`,
    "--ring": `${h} 85% 66%`,
    "--card": `${h} 20% ${l0 + 3}%`,
    "--card-foreground": `${h} 15% 92%`,
    "--primary": `${h} 85% 66%`,
    "--primary-foreground": "0 0% 100%",
    "--secondary": `${h} 15% ${l0 + 9}%`,
    "--secondary-foreground": `${h} 15% 85%`,
    "--muted": `${h} 15% ${l0 + 7}%`,
    "--muted-foreground": `${h} 10% 58%`,
    "--accent": `${h} 55% 22%`,
    "--accent-foreground": `${h} 80% 88%`,
    "--sidebar": `${h} 25% ${l0 - 2}%`,
    "--sidebar-foreground": `${h} 12% 78%`,
    "--sidebar-border": `${h} 20% ${l0 + 5}%`,
    "--sidebar-ring": `${h} 85% 66%`,
    "--switcher": `${h} 28% ${l0 - 3}%`,
    "--switcher-foreground": `${h} 12% 60%`,
    "--switcher-border": `${h} 22% ${l0 + 2}%`,
    "--switcher-active": `${h} 55% 20%`,
    "--switcher-active-foreground": `${h} 80% 88%`,
  };
}

/** Applies a (hue, backgroundLightness) pair to the live document by
 * setting each CSS variable as an inline style on :root -- overrides
 * index.css's hardcoded defaults without editing or duplicating them.
 * Safe to call with partial/null values (e.g. straight from a fetched
 * account whose theme was never set): falls back to the hardcoded
 * default for whichever half is missing. */
export function applyTheme(hue: number | null | undefined, backgroundLightness: number | null | undefined): void {
  const vars = cssVars(hue ?? DEFAULT_HUE, backgroundLightness ?? DEFAULT_LIGHTNESS);
  for (const [name, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(name, value);
  }
}

export interface AccountTheme {
  hue: number | null;
  backgroundLightness: number | null;
}

/** PATCHes trackstack-auth's /me/theme. Either field may be omitted to
 * leave that half untouched, or passed as `null` to reset just that half
 * back to the default -- see trackstack-auth/src/routes.ts's own doc
 * comment on the same endpoint. */
export async function saveAccountTheme(token: string | null, patch: Partial<AccountTheme>): Promise<{ theme: AccountTheme }> {
  return (await apiFetch(AUTH_BASE_URL, "/me/theme", token, { method: "PATCH", body: JSON.stringify(patch) })) as { theme: AccountTheme };
}
