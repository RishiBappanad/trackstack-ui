import { useEffect, useMemo, useState } from "react";
import { useTrackStackAuth, useAppRegistry } from "trackstack-ui";
import { Target, Trash2, CheckCircle2, AlertTriangle, Plus, ExternalLink } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

// Which trackers show up here is DISCOVERED, not listed: every app in the
// registry (GET /apps, the same one AppSwitcher uses) that has a configured
// API base (VITE_<ID>_API_BASE, the convention Home.tsx's sync list already
// uses) is probed for a goals endpoint, and the ones that answer with a goal
// list get cards. Goals is a cross-tracker STANDARD but each tracker keeps
// its own table and endpoint (Tenet #1), so this page fans out to each one
// itself rather than reading one central index the way Calendar's
// /api/calendar does -- a new tracker with Goals appears with no change here.
//
// TODO (workspace-notes/ACTION_ITEMS.md, "Goals card registration"): probing
// is the interim. Trackers should REGISTER their goal-card layout (label,
// units, what to show) through trackstack-ui, and this page should render
// from the registry instead of guessing endpoints and formatting generically.
interface GoalSource {
  id: string;
  label: string;
  apiBase: string;
  /** The endpoint that answered: "/api/goals" (Express trackers) or "/goals" (FastAPI). */
  goalsPath: string;
}

/** Where each candidate's goals API might live, tried in order. */
const GOALS_PROBE_PATHS = ["/api/goals", "/goals"];

/** Interim: the tracker's own page for creating/editing goals. Finance's is
 * /goals; nutrition folded Goals into its Targets page. Replaced by the
 * registered card layout (see the TODO above). */
const GOALS_PAGE_PATH: Record<string, string> = { nutrition: "/targets" };

function apiBaseFor(appId: string): string {
  const env = import.meta.env as Record<string, string | undefined>;
  return env[`VITE_${appId.toUpperCase()}_API_BASE`] ?? "";
}

// ── Types -- mirrors finance-tracker's own goals/index.tsx, which mirrors
// RECURRING_AND_GOALS_SPEC.md's Goal Query shape (the cross-tracker
// standard every tracker's Goals implementation follows). Kept as a
// separate copy rather than shared code, same reasoning CLAUDE.md gives
// for domain_events' shape being standardized without a shared table:
// each tracker's own frontend needs this shape regardless of whether this
// page also reads it, so there's no single owner to import it from.

type Comparator = "lte" | "gte" | "eq" | "within_tolerance_percent";
type Severity = "warning" | "target";
type Aggregation = "sum" | "mean" | "median" | "min" | "max" | "count" | "percentile" | "last";
type Period = "daily" | "weekly" | "monthly";
type TimeWindowKind = "current_period" | "trailing" | "same_period_last_year" | "fixed_range" | "all_time";

interface FilterCondition {
  field: string;
  operator: string;
  value: string | number | (string | number)[];
}

interface TimeWindow {
  kind: TimeWindowKind;
  period?: Period;
  count?: number;
  start?: string;
  end?: string;
}

interface GoalQuery {
  aggregation: Aggregation;
  percentile?: number;
  filters: FilterCondition[];
  timeWindow: TimeWindow;
}

interface Goal {
  id: number;
  label: string | null;
  severity: Severity;
  comparator: Comparator;
  tolerance_percent: number | null;
  measure_query: GoalQuery;
  reference_amount: number | null;
  reference_query: GoalQuery | null;
  inflation_adjusted: boolean;
  // Optional display fields a tracker may send (nutrition-insights does; finance
  // doesn't): the measure's own unit/name, its group, and whether the system
  // created it (presets can be edited in the tracker but not deleted here).
  unit?: string;
  measure_label?: string;
  group?: string;
  is_preset?: boolean;
  reference_scale?: number | null;
  reference_measure?: { label: string; unit: string } | null;
}

interface GoalStatus {
  measure_value: number | null; // null = nothing to measure yet (a vital with no readings)
  reference_value: number;
  percent: number;
  on_track: boolean;
  has_data?: boolean;
}

interface SourcedGoal {
  source: GoalSource;
  goal: Goal;
  status: GoalStatus | undefined;
}

function categoryFromQuery(query: GoalQuery | null | undefined): string | null {
  const filter = query?.filters.find((f) => f.field === "category" && (f.operator === "eq" || f.operator === "in"));
  if (!filter) return null;
  if (Array.isArray(filter.value)) return filter.value.join(" + ");
  return typeof filter.value === "string" ? filter.value : null;
}

function comparatorLabel(comparator: Comparator, tolerancePercent: number | null): string {
  switch (comparator) {
    case "lte":
      return "at most";
    case "gte":
      return "at least";
    case "eq":
      return "exactly";
    case "within_tolerance_percent":
      return `within ±${tolerancePercent ?? 0}% of`;
  }
}

function periodLabel(period?: Period): string {
  switch (period) {
    case "daily":
      return "day";
    case "weekly":
      return "week";
    case "monthly":
      return "month";
    default:
      return "period";
  }
}

function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

/** A goal's numbers in ITS unit (g, mg, kcal, lb...) when the tracker sends
 * one, dollars otherwise (finance's amounts). */
function formatAmount(n: number | null | undefined, unit?: string): string {
  if (n === null || n === undefined) return "—";
  if (!unit) return formatMoney(n);
  const value = Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 10) / 10;
  return `${value} ${unit}`;
}

function referenceText(goal: Goal): string {
  const scale = goal.reference_scale ?? 1;
  const ref = goal.reference_measure;
  if (ref && (ref.label !== goal.measure_label || scale !== 1)) return `${scale === 1 ? "" : `${scale} × `}${ref.label}`;
  return "a computed baseline";
}

function goalSubtitle(goal: Goal): string {
  const period = goal.measure_query.timeWindow.period;
  if (goal.measure_query.aggregation === "last" && !goal.reference_query) return "latest reading";
  if (goal.reference_query) {
    const ref = goal.reference_query;
    const baselineDesc =
      ref.timeWindow.kind === "trailing"
        ? `trailing ${ref.timeWindow.count}-${periodLabel(ref.timeWindow.period)} ${ref.aggregation}`
        : ref.timeWindow.kind === "same_period_last_year"
        ? `same ${periodLabel(ref.timeWindow.period)} ${ref.timeWindow.count === 1 ? "last year" : `${ref.timeWindow.count} years back`}`
        : ref.timeWindow.kind === "all_time"
        ? "all-time"
        : ref.timeWindow.kind === "current_period"
        ? `this same ${periodLabel(ref.timeWindow.period)}`
        : "a fixed range";
    return `${goal.measure_query.aggregation} per ${periodLabel(period)}, vs. ${baselineDesc}${goal.inflation_adjusted ? " (inflation-adjusted)" : ""}`;
  }
  return `${goal.measure_query.aggregation} per ${periodLabel(period)}`;
}

function GoalCard({
  item,
  trackerHref,
  onDelete,
}: {
  item: SourcedGoal;
  trackerHref: string | undefined;
  onDelete: (item: SourcedGoal) => void;
}) {
  const { source, goal, status } = item;
  const category = goal.group ?? categoryFromQuery(goal.measure_query) ?? "Every category";
  const title = goal.label || goal.measure_label || category;
  const noData = status !== undefined && status.has_data === false;
  const isWarning = goal.severity === "warning";

  return (
    <div className="bg-card border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={
              "h-8 w-8 rounded-full flex items-center justify-center shrink-0 " +
              (status === undefined
                ? "bg-secondary"
                : status.on_track
                ? "bg-emerald-500/10"
                : isWarning
                ? "bg-amber-500/10"
                : "bg-destructive/10")
            }
          >
            <Target
              className={
                "h-4 w-4 " +
                (status === undefined
                  ? "text-muted-foreground"
                  : status.on_track
                  ? "text-emerald-600"
                  : isWarning
                  ? "text-amber-600"
                  : "text-destructive")
              }
            />
          </div>
          <div className="min-w-0">
            <p className="font-medium text-sm truncate">{title}</p>
            <p className="text-xs text-muted-foreground truncate">
              {category} · {source.label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border text-muted-foreground">
            {isWarning ? "Warning" : "Target"}
          </span>
          {trackerHref && (
            <a
              href={trackerHref}
              className="p-1 rounded hover:bg-secondary"
              aria-label={`Open in ${source.label}`}
              title={`Open in ${source.label}`}
            >
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
            </a>
          )}
          {!goal.is_preset && (
            <button onClick={() => onDelete(item)} className="p-1 rounded hover:bg-secondary" aria-label="Delete goal">
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        {comparatorLabel(goal.comparator, goal.tolerance_percent)}{" "}
        {goal.reference_query ? referenceText(goal) : formatAmount(goal.reference_amount ?? 0, goal.unit)} — {goalSubtitle(goal)}
      </p>

      <div className="mt-3">
        {status === undefined ? (
          <div className="h-1.5 w-full bg-secondary rounded-full animate-pulse" />
        ) : noData ? (
          <p className="text-sm text-muted-foreground">No readings yet.</p>
        ) : (
          <>
            <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
              <div
                className={
                  "h-full rounded-full " +
                  (status.on_track ? "bg-emerald-500" : isWarning ? "bg-amber-500" : "bg-destructive")
                }
                style={{ width: `${Math.min(status.percent, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2">
              <span className="text-sm font-mono">
                {formatAmount(status.measure_value, goal.unit)}{" "}
                <span className="text-muted-foreground">/ {formatAmount(status.reference_value, goal.unit)}</span>
              </span>
              <span
                className={
                  "text-xs font-medium flex items-center gap-1 " +
                  (status.on_track ? "text-emerald-600" : isWarning ? "text-amber-600" : "text-destructive")
                }
              >
                {status.on_track ? (
                  <>
                    <CheckCircle2 className="h-3.5 w-3.5" /> On track
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3.5 w-3.5" /> {isWarning ? "Off track" : "Exceeded"}
                  </>
                )}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Probes one registry app for a goals endpoint. Returns its goals (and where
 * they were found) when the app has one; null when it doesn't (404, or a
 * response that isn't a goal list -- e.g. an SPA's index.html for an unknown
 * route); throws for a real failure (auth, server error, unreachable), which
 * is shown rather than silently treated as "no goals". */
async function probeForGoals(appId: string, label: string, token: string | null): Promise<{ source: GoalSource; goals: Goal[] } | null> {
  const apiBase = apiBaseFor(appId);
  if (!apiBase) return null;
  for (const goalsPath of GOALS_PROBE_PATHS) {
    try {
      const body = await apiFetch(apiBase, `${goalsPath}?active=true`, token);
      if (Array.isArray(body)) return { source: { id: appId, label, apiBase, goalsPath }, goals: body as Goal[] };
    } catch (e) {
      if (e instanceof ApiError && (e.status === 404 || e.status === 405)) continue;
      throw e;
    }
  }
  return null;
}

export function Goals() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const apps = useAppRegistry(AUTH_BASE_URL);
  const [items, setItems] = useState<SourcedGoal[]>([]);
  const [sources, setSources] = useState<GoalSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ source: string; error: string }[]>([]);

  // A source's own goals page, not this page, is where creating and editing
  // actually happens -- resolved from the SAME app registry AppSwitcher/Home's
  // own tracker links already use, so it can't drift from wherever that
  // tracker is actually reachable in this deployment.
  const trackerGoalsHref = useMemo(() => {
    const map: Record<string, string> = {};
    for (const source of sources) {
      const app = apps.find((a) => a.id === source.id);
      if (app) map[source.id] = `${app.href}${GOALS_PAGE_PATH[source.id] ?? "/goals"}`;
    }
    return map;
  }, [sources, apps]);

  useEffect(() => {
    // The registry lists Home itself too; it isn't a tracker.
    const candidates = apps.filter((a) => a.id !== "home");
    if (!token || candidates.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setErrors([]);
    setItems([]);
    setSources([]);

    Promise.all(
      candidates.map(async (app) => {
        try {
          const found = await probeForGoals(app.id, app.label, token);
          if (!found) return [];
          if (!cancelled) setSources((prev) => [...prev, found.source]);
          const statuses = await Promise.all(
            found.goals.map((goal) =>
              apiFetch(found.source.apiBase, `${found.source.goalsPath}/${goal.id}/status`, token)
                .then((s) => s as GoalStatus)
                .catch(() => undefined)
            )
          );
          return found.goals.map((goal, i): SourcedGoal => ({ source: found.source, goal, status: statuses[i] }));
        } catch (e) {
          if (!cancelled) {
            setErrors((prev) => [...prev, { source: app.label, error: e instanceof ApiError ? e.message : "Failed to load" }]);
          }
          return [];
        }
      })
    ).then((results) => {
      if (!cancelled) setItems(results.flat());
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [token, apps]);

  async function handleDelete(item: SourcedGoal) {
    setItems((prev) => prev.filter((i) => !(i.source.id === item.source.id && i.goal.id === item.goal.id)));
    try {
      await apiFetch(item.source.apiBase, `${item.source.goalsPath}/${item.goal.id}`, token, { method: "DELETE" });
    } catch {
      // Best-effort optimistic delete -- a failed DELETE just means the
      // goal reappears on next reload, same tradeoff Todos.tsx's own
      // delete already makes rather than re-inserting it back into place.
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl mb-1">Goals</h1>
      <p className="text-muted-foreground mb-4 text-sm">Every goal across your trackers, in one view.</p>

      {!loading && sources.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No tracker with a goals endpoint was found for this deployment (checked every registered tracker that has an API base configured).
        </p>
      )}

      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {sources.map((source) =>
            trackerGoalsHref[source.id] ? (
              <a
                key={source.id}
                href={trackerGoalsHref[source.id]}
                className="inline-flex items-center gap-1.5 text-sm bg-secondary hover:bg-secondary/70 rounded-md px-3 py-1.5 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" /> Add goal in {source.label}
              </a>
            ) : null
          )}
        </div>
      )}

      {errors.length > 0 && (
        <div className="mb-4 p-2 rounded-md bg-destructive/10 text-destructive text-xs">
          Couldn't load: {errors.map((e) => `${e.source} (${e.error})`).join(", ")} — showing the rest.
        </div>
      )}

      {loading && items.length === 0 && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!loading && items.length === 0 && sources.length > 0 && errors.length === 0 && (
        <p className="text-sm text-muted-foreground">No active goals yet.</p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => (
          <GoalCard
            key={`${item.source.id}:${item.goal.id}`}
            item={item}
            trackerHref={trackerGoalsHref[item.source.id]}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}
