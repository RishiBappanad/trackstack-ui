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

/** How an entry's values read as one line of text in a list. */
export function formatValue(field: FieldDef, value: string | number | boolean | undefined): string {
  if (value === undefined) return "";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "number") return field.unit ? `${value} ${field.unit}` : String(value);
  return String(value);
}
