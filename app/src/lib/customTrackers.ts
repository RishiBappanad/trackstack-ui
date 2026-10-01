import { useCallback, useEffect, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity, BarChart3, Book, BookOpen, Calendar, Camera, Clipboard, Coffee,
  Dumbbell, Flame, Gauge, Heart, LayoutDashboard, ListChecks, Moon, Music,
  PiggyBank, Plane, Salad, Smile, Star, Sun, Target, Timer,
  TrendingUp, Trophy, Utensils, Wallet, Zap,
} from "lucide-react";
import { apiFetch } from "./api.js";

/** Mirrors trackstack-custom's definitions.ts -- the wire format of a
 * user-made tracker. Kept as plain types (no shared code across repos,
 * CLAUDE.md Tenet #1); the backend is the source of truth for validation. */
export const FIELD_TYPES = ["text", "number", "boolean", "date", "select"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

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

// Mirrors trackstack-custom's ICON_NAMES exactly (duplicated, not
// imported -- CLAUDE.md Tenet #1: no shared code across repos). The
// backend validates a tracker's icon against this same list server-side;
// keep both in sync if it ever changes.
export const ICON_NAMES = [
  "Activity", "BarChart3", "Book", "BookOpen", "Calendar", "Camera", "Clipboard", "Coffee",
  "Dumbbell", "Flame", "Gauge", "Heart", "LayoutDashboard", "ListChecks", "Moon", "Music",
  "PiggyBank", "Plane", "Salad", "Smile", "Star", "Sun", "Target", "Timer",
  "TrendingUp", "Trophy", "Utensils", "Wallet", "Zap",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

export const ICON_COMPONENTS: Record<IconName, LucideIcon> = {
  Activity, BarChart3, Book, BookOpen, Calendar, Camera, Clipboard, Coffee,
  Dumbbell, Flame, Gauge, Heart, LayoutDashboard, ListChecks, Moon, Music,
  PiggyBank, Plane, Salad, Smile, Star, Sun, Target, Timer,
  TrendingUp, Trophy, Utensils, Wallet, Zap,
};

/** The shape GET /trackers/pinned returns -- just enough to render a
 * sidebar link, not a full definition. */
export interface PinnedTracker {
  slug: string;
  name: string;
  icon: IconName;
}

export type EntryValues = Record<string, string | number | boolean>;

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

// The Shell (App.tsx) renders pinned trackers in its sidebar on every
// page, but only the tracker builder/view pages know when pinning
// changes -- a plain window event is the lightest way to tell Shell to
// refetch without threading a refresh callback through every route or
// standing up a context provider for one small list.
const PINNED_CHANGED_EVENT = "trackstack:pinned-trackers-changed";

export function notifyPinnedTrackersChanged(): void {
  window.dispatchEvent(new Event(PINNED_CHANGED_EVENT));
}

/** The caller's pinned trackers, refetched on token change and whenever
 * notifyPinnedTrackersChanged() fires elsewhere in the app. */
export function usePinnedTrackers(token: string | null): PinnedTracker[] {
  const [pinned, setPinned] = useState<PinnedTracker[]>([]);

  const load = useCallback(async () => {
    if (!CUSTOM_BASE_URL || !token) return;
    try {
      setPinned((await customApi("/trackers/pinned", token)) as PinnedTracker[]);
    } catch {
      // Non-fatal -- the rest of the sidebar still works without this.
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.addEventListener(PINNED_CHANGED_EVENT, load);
    return () => window.removeEventListener(PINNED_CHANGED_EVENT, load);
  }, [load]);

  return pinned;
}

/** How an entry's values read as one line of text in a list. */
export function formatValue(field: FieldDef, value: string | number | boolean | undefined): string {
  if (value === undefined) return "";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "number") return field.unit ? `${value} ${field.unit}` : String(value);
  return String(value);
}
