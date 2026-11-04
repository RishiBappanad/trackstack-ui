import { apiFetch } from "./api.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

/** Home's account-wide UI theme: one accent hue and one background
 * lightness (drives the whole light-neutral family --
 * background/card/border/sidebar/switcher). Deliberately just these two
 * numbers, not a token-by-token palette: every other relationship below
 * is a FIXED offset from them, reverse-engineered from index.css's own
 * hardcoded :root values so that hue=DEFAULT_HUE,
 * backgroundLightness=DEFAULT_LIGHTNESS reproduces today's exact look,
 * pixel for pixel -- an account that never opens the Appearance page sees
 * zero change. Destructive/success stay fixed red/green regardless of
 * hue; they're semantic, not decorative.
 *
 * Light theme, decided 2026-11-04 (replacing the original dark-only
 * theme): unlike that original, the neutral family (background, card,
 * border, sidebar, switcher) does NOT track the user's chosen accent hue
 * -- it stays a fixed warm-neutral regardless of preset, and only
 * primary/ring/accent/switcher-active pick up `hue`. The old "one hue
 * tints everything" approach produced a background that shifted color
 * with every preset; the light redesign's reference look (see
 * workspace-notes/MULTI_TABLE_TRACKERS_SPEC.md's mockup discussion) keeps
 * chrome neutral and lets only the accent change, which is both closer to
 * that reference and simpler to reason about. */
export const DEFAULT_HUE = 231;
export const DEFAULT_LIGHTNESS = 95;

export const HUE_RANGE = { min: 0, max: 359 };
export const LIGHTNESS_RANGE = { min: 85, max: 99 };

/** Fixed warm-neutral hue for the background/card/border/sidebar/switcher
 * family -- independent of the user's chosen accent `hue` (see doc
 * comment above). Not configurable: picking a different accent should
 * never require also fighting a mismatched chrome tint. */
const NEUTRAL_HUE = 48;

export interface ThemePreset {
  key: string;
  label: string;
  hue: number;
  backgroundLightness: number;
}

export const THEME_PRESETS: ThemePreset[] = [
  { key: "daylight", label: "Daylight", hue: 231, backgroundLightness: 95 },
  { key: "meadow", label: "Meadow", hue: 165, backgroundLightness: 95 },
  { key: "amber", label: "Amber", hue: 28, backgroundLightness: 94 },
];

/** The exact --custom-property names index.css's own :root block
 * defines, so applyTheme can override them 1:1 via inline style
 * (inline styles win over the stylesheet's :root rule without needing
 * to touch or duplicate index.css itself). `l0` is backgroundLightness;
 * `h` is the accent hue, used only for primary/ring/accent/switcher-active
 * -- every neutral-family token below uses NEUTRAL_HUE instead. */
function cssVars(hue: number, l0: number): Record<string, string> {
  const h = hue;
  const n = NEUTRAL_HUE;
  const up = (v: number) => Math.min(v, 100);
  const down = (v: number) => Math.max(v, 0);
  return {
    "--background": `${n} 20% ${l0}%`,
    "--foreground": `${n} 15% 13%`,
    "--border": `${n} 15% ${down(l0 - 9)}%`,
    "--input": `${n} 15% ${down(l0 - 9)}%`,
    "--ring": `${h} 78% 57%`,
    "--card": `${n} 20% ${up(l0 + 4)}%`,
    "--card-foreground": `${n} 15% 13%`,
    "--primary": `${h} 78% 57%`,
    "--primary-foreground": "0 0% 100%",
    "--secondary": `${n} 15% ${down(l0 - 4)}%`,
    "--secondary-foreground": `${n} 15% 20%`,
    "--muted": `${n} 15% ${down(l0 - 3)}%`,
    "--muted-foreground": `${n} 8% 35%`,
    "--accent": `${h} 70% 94%`,
    "--accent-foreground": `${h} 70% 40%`,
    "--sidebar": `${n} 20% ${up(l0 + 4)}%`,
    "--sidebar-foreground": `${n} 15% 20%`,
    "--sidebar-border": `${n} 15% ${down(l0 - 9)}%`,
    "--sidebar-ring": `${h} 78% 57%`,
    "--switcher": `${n} 20% ${up(l0 + 4)}%`,
    "--switcher-foreground": `${n} 10% 35%`,
    "--switcher-border": `${n} 15% ${down(l0 - 9)}%`,
    "--switcher-active": `${h} 70% 94%`,
    "--switcher-active-foreground": `${h} 70% 40%`,
  };
}

/** Applies a (hue, backgroundLightness) pair to the live document by
 * setting each CSS variable as an inline style on :root -- overrides
 * index.css's hardcoded defaults without editing or duplicating them.
 * Safe to call with partial/null/out-of-range values (e.g. straight from
 * a fetched account whose theme was never set, or one saved under the
 * old dark-mode range before this redesign) -- clamps into
 * HUE_RANGE/LIGHTNESS_RANGE and falls back to the hardcoded default for
 * whichever half is missing, rather than feeding a stale dark-range
 * value into a formula that now assumes light-range input. */
export function applyTheme(hue: number | null | undefined, backgroundLightness: number | null | undefined): void {
  const clampedHue = Math.min(HUE_RANGE.max, Math.max(HUE_RANGE.min, hue ?? DEFAULT_HUE));
  const clampedLightness = Math.min(LIGHTNESS_RANGE.max, Math.max(LIGHTNESS_RANGE.min, backgroundLightness ?? DEFAULT_LIGHTNESS));
  const vars = cssVars(clampedHue, clampedLightness);
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
