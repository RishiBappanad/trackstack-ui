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
 * CLAUDE.md Tenet #1); the backend is the source of truth for validation.
 * `link`/`lookup`/`rollup` added Phase 6b (MULTI_TABLE_TRACKERS_SPEC.md) --
 * FIELD_TYPES/RAW_FIELD_TYPES split the same way the backend's is, since a
 * raw field's own type picker (TableForm) must never offer the three
 * computed/relational kinds a RAW field can't be. */
export const RAW_FIELD_TYPES = ["text", "long_text", "number", "boolean", "date", "select", "multi_select", "rating"] as const;
export type RawFieldType = (typeof RAW_FIELD_TYPES)[number];

export const FIELD_TYPES = [...RAW_FIELD_TYPES, "link", "lookup", "rollup"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Text", long_text: "Long text", number: "Number", boolean: "Yes/No",
  date: "Date", select: "Choice", multi_select: "Tags", rating: "Rating",
  link: "Link", lookup: "Lookup", rollup: "Rollup",
};

export const ROLLUP_AGGREGATES = ["sum", "count", "avg", "min", "max"] as const;
export type RollupAggregate = (typeof ROLLUP_AGGREGATES)[number];

export const ROLLUP_AGGREGATE_LABELS: Record<RollupAggregate, string> = {
  sum: "Sum", count: "Count", avg: "Average", min: "Minimum", max: "Maximum",
};

export const RATING_MAX = 5;

/** `tracker_slug` omitted means "a sibling table in this same tracker" --
 * the only option TableForm's builder offers for now (cross-tracker
 * targets are a later, "advanced" step -- see this file's `linkTargetLabel`). */
export interface LinkTarget {
  table_key: string;
  tracker_slug?: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  // Raw field types only:
  unit?: string;
  options?: string[];
  required?: boolean;
  // Link fields only:
  target?: LinkTarget;
  multiple?: boolean;
  // Lookup/Rollup fields only. `through` names a link field's key on this
  // same table; `target_field` names a field on that link's target table.
  through?: string;
  target_field?: string;
  aggregate?: RollupAggregate;
}

/** MULTI_TABLE_TRACKERS_SPEC.md's Tracker -> Table -> Entry model (Phase
 * 6, replacing the old single-table TrackerDefinition this app's pages
 * used before): a tracker is just its own identity/sidebar info; a
 * table is one object type within it, addable independently. Mirrors
 * trackstack-custom's definitions.ts TrackerMeta/TableDef exactly. */
export interface TrackerMeta {
  slug: string;
  name: string;
  description: string;
  icon: IconName | null;
  pinned: boolean;
}

export interface TableDef {
  table_key: string;
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

// The dataviz skill's validated 8-hue categorical palette (LIGHT-mode
// column, references/palette.md) -- this app moved to a light theme
// 2026-11-04 (see index.css); these were the dark-mode column's values
// before that, tuned for contrast against a near-black surface, not
// this app's current near-white one. Fixed order, CVD-safe adjacent
// contrast; never reassign a name to a different hex or reorder the
// underlying set.
export const ACCENT_HEX: Record<AccentName, string> = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  yellow: "#eda100",
  magenta: "#e87ba4",
  green: "#008300",
  violet: "#6250d6",
  red: "#e34948",
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

/** MULTI_TABLE_TRACKERS_SPEC.md's Tracker Integrations (Phase 4b backend,
 * Phase 6c UI) -- the two ways a tracker's own writes can fire out to the
 * rest of TrackStack. Owned by the TRACKER, not the table: `source_table_key`
 * just says which of the tracker's own tables triggers this one binding,
 * since a tracker can bind the same type to several of its own tables
 * independently. Mirrors trackstack-custom's definitions.ts exactly. */
export const INTEGRATION_TYPES = ["todo_sync", "calendar_push"] as const;
export type IntegrationType = (typeof INTEGRATION_TYPES)[number];

export const INTEGRATION_TYPE_LABELS: Record<IntegrationType, string> = {
  todo_sync: "Todo sync",
  calendar_push: "Calendar push",
};

export interface TrackerIntegration {
  type: IntegrationType;
  source_table_key: string;
  /** todo_sync: { done_field: string }. calendar_push: always {}. */
  config: Record<string, unknown>;
  enabled: boolean;
}

/** RECURRING_AND_GOALS_SPEC.md's Goals, ported to trackstack-custom
 * (CLAUDE.md) -- mirrors trackstack-custom's own definitions.ts exactly,
 * minus the full advanced GoalQuery builder this app's own UI doesn't
 * offer yet (only the "basic goal" shorthand does, in Goals.tsx) --
 * these types still describe the FULL stored shape a goal comes back as,
 * since GET .../goals always returns one regardless of which form
 * created it. */
export const GOAL_AGGREGATIONS = ["sum", "mean", "median", "min", "max", "count", "percentile"] as const;
export type GoalAggregation = (typeof GOAL_AGGREGATIONS)[number];

export const GOAL_FILTER_OPERATORS = ["eq", "ne", "gt", "gte", "lt", "lte", "in", "contains"] as const;
export type GoalFilterOperator = (typeof GOAL_FILTER_OPERATORS)[number];

export interface GoalFilterCondition {
  field: string;
  operator: GoalFilterOperator;
  value: string | number | boolean | (string | number)[];
}

export const GOAL_QUERY_PERIODS = ["daily", "weekly", "monthly"] as const;
export type GoalQueryPeriod = (typeof GOAL_QUERY_PERIODS)[number];

export const GOAL_TIME_WINDOW_KINDS = ["current_period", "trailing", "same_period_last_year", "fixed_range", "all_time"] as const;
export type GoalTimeWindowKind = (typeof GOAL_TIME_WINDOW_KINDS)[number];

export interface GoalTimeWindow {
  kind: GoalTimeWindowKind;
  period?: GoalQueryPeriod;
  count?: number;
  start?: string;
  end?: string;
}

export interface GoalQuery {
  aggregation: GoalAggregation;
  percentile?: number;
  measureField?: string;
  filters: GoalFilterCondition[];
  timeWindow: GoalTimeWindow;
}

export const GOAL_COMPARATORS = ["gte", "lte", "eq", "within_tolerance_percent"] as const;
export type GoalComparator = (typeof GOAL_COMPARATORS)[number];

export const GOAL_COMPARATOR_LABELS: Record<GoalComparator, string> = {
  gte: "At least",
  lte: "At most",
  eq: "Exactly",
  within_tolerance_percent: "Within tolerance of",
};

export const GOAL_SEVERITIES = ["warning", "target"] as const;
export type GoalSeverity = (typeof GOAL_SEVERITIES)[number];

export interface Goal {
  id: number;
  source_table_key: string;
  label: string;
  severity: GoalSeverity;
  is_active: boolean;
  comparator: GoalComparator;
  tolerance_percent: number | null;
  measure_query: GoalQuery;
  reference_amount: number | null;
  reference_query: GoalQuery | null;
  scale: number | null;
  inflation_adjusted: boolean;
  notify_on_crossing: boolean;
  target_date: string | null;
  start_value: number | null;
  created_at: string;
  updated_at: string;
}

/** GET /trackers/:slug/goals/:id/status's live-computed response --
 * always fresh, never a value stored anywhere. */
export interface GoalStatus {
  measure: number;
  reference: number;
  compliant: boolean;
  /** null when reference is 0 -- percent-of-zero is meaningless. */
  percent: number | null;
  term: "everyday" | "long_term";
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

/** How an entry's values read as one line of text in a list. `linkLabels`
 * resolves a link field's stored id(s) to the linked entry's own label --
 * the caller (TrackerView) fetches the target table's current entries
 * once per load and builds this map; omitted/missing falls back to the
 * raw id, same as before this map existed. A lookup/rollup field's value
 * arrives already computed (trackstack-custom's own resolveComputedFields
 * merges it into the entry's `values` at read time), so there's nothing
 * extra to resolve for either -- they just print like any other value. */
export function formatValue(field: FieldDef, value: string | number | boolean | string[] | undefined, linkLabels?: Record<string, string>): string {
  if (value === undefined) return "";
  if (field.type === "boolean") return value ? "Yes" : "No";
  if (field.type === "number") return field.unit ? `${value} ${field.unit}` : String(value);
  if (field.type === "multi_select") return Array.isArray(value) ? value.join(", ") : "";
  if (field.type === "rating") return "★".repeat(Number(value)) + "☆".repeat(RATING_MAX - Number(value));
  if (field.type === "long_text") {
    const text = String(value);
    return text.length > 80 ? `${text.slice(0, 80)}…` : text;
  }
  if (field.type === "link") {
    const ids = Array.isArray(value) ? value : [String(value)];
    return ids.map((id) => linkLabels?.[id] ?? id).join(", ");
  }
  return String(value);
}
