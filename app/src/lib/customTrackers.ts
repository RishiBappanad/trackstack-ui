import { apiFetch } from "./api.js";

// Icons and pinned-trackers fetching moved into the shared trackstack-ui
// library (2026-10-02) -- any TrackStack app's AppSwitcher needs these to
// render a pinned tracker, not just Home's own builder pages. Re-exported
// here so every existing import in this app (TrackerBuilder.tsx etc.)
// keeps working unchanged.
export { ICON_NAMES, ICON_COMPONENTS, usePinnedTrackers, notifyPinnedTrackersChanged } from "trackstack-ui";
export type { IconName, PinnedTracker } from "trackstack-ui";
import type { IconName } from "trackstack-ui";

/** Mirrors trackstack-custom's definitions.ts -- the wire format of a
 * user-made tracker. Kept as plain types (no shared code across repos,
 * CLAUDE.md Tenet #1); the backend is the source of truth for validation. */
export const FIELD_TYPES = ["text", "long_text", "number", "boolean", "date", "select", "multi_select", "rating"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text", long_text: "Long text", number: "Number", boolean: "Yes/No",
  date: "Date", select: "Choice", multi_select: "Tags", rating: "Rating",
};

export const RATING_MAX = 5;

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  unit?: string;
  options?: string[];
  required?: boolean;
}

export interface TrackerDefinition {
  slug: string;
  name: string;
  description: string;
  background: string;
  fields: FieldDef[];
  amount_field: string | null;
  amount_meaning: string | null;
  summable: boolean;
  category_field: string | null;
  label_field: string | null;
  date_field: string | null;
  icon: IconName | null;
  pinned: boolean;
  ui_config: UiConfig | null;
}

// APP_INTERFACE_SPEC.md §3's Tier A/B UI contract, applied to a
// trackstack-custom tracker: `ui_config: null` is Tier A (the default
// generic list, what every tracker had before this); a populated one is
// Tier B -- a constrained, TrackStack-rendered config, never executable
// code. Mirrors trackstack-custom's definitions.ts exactly.
export const VIEW_TYPES = ["list", "table", "chart"] as const;
export type ViewType = (typeof VIEW_TYPES)[number];

export const ACCENT_NAMES = ["blue", "orange", "aqua", "yellow", "magenta", "green", "violet", "red"] as const;
export type AccentName = (typeof ACCENT_NAMES)[number];

export interface UiConfig {
  view: ViewType;
  accent: AccentName | null;
  columns: string[] | null;
}

// The dataviz skill's validated 8-hue categorical palette (dark-mode
// column, references/palette.md) -- this app is dark-theme-only (see
// index.css), so there's no separate light variant to carry here. Fixed
// order, CVD-safe adjacent contrast; never reassign a name to a
// different hex or reorder the underlying set.
export const ACCENT_HEX: Record<AccentName, string> = {
  blue: "#3987e5",
  orange: "#d95926",
  aqua: "#199e70",
  yellow: "#c98500",
  magenta: "#d55181",
  green: "#008300",
  violet: "#9085e9",
  red: "#e66767",
};

export type EntryValues = Record<string, string | number | boolean | string[]>;

export interface Entry {
  id: string;
  tracker: string;
  values: EntryValues;
  occurred_at: string;
  updated_at: string;
}

export const CUSTOM_BASE_URL = import.meta.env.VITE_CUSTOM_API_BASE ?? "";

export const customApi = (path: string, token: string | null, options?: RequestInit) => apiFetch(CUSTOM_BASE_URL, path, token, options);

/** "Distance (km)" -> "distance_km": the backend's key/slug format is
 * lowercase letters, digits and underscores, starting with a letter. */
export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/, "");
  return /^[a-z]/.test(s) ? s : s ? `f_${s}`.slice(0, 40) : "";
}

/** A slug derived from `text` that isn't already in `taken`. */
export function uniqueSlug(text: string, taken: string[]): string {
  const base = slugify(text) || "field";
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) {
    const candidate = `${base.slice(0, 37)}_${i}`;
    if (!taken.includes(candidate)) return candidate;
  }
}

/** How an entry's values read as one line of text in a list. */
export function formatValue(field: FieldDef, value: string | number | boolean | string[] | undefined): string {
  if (value === undefined) return "";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "number") return field.unit ? `${value} ${field.unit}` : String(value);
  if (field.type === "multi_select") return Array.isArray(value) ? value.join(", ") : "";
  if (field.type === "rating") return "★".repeat(Number(value)) + "☆".repeat(RATING_MAX - Number(value));
  if (field.type === "long_text") {
    const text = String(value);
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }
  return String(value);
}
