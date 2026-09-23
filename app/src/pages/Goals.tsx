import { useEffect, useMemo, useState } from "react";
import { useTrackStackAuth, useAppRegistry } from "trackstack-ui";
import { Target, Trash2, CheckCircle2, AlertTriangle, Plus, ExternalLink } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

// Every tracker that implements the standardized Goal Query contract
// (see workspace-notes/RECURRING_AND_GOALS_SPEC.md) gets one entry here --
// same shape as Calendar.tsx's TRACKER_STYLES map, for the same reason:
// Goals is a cross-tracker STANDARD but each tracker keeps its own table
// and its own /api/goals endpoint (Tenet #1), so this page has to fan out
// to each one itself rather than reading one central index the way
// Calendar's /api/calendar does. Finance is the only tracker with Goals
// built so far; add a "nutrition" entry here the day nutrition-insights'
// own Goals ships, and this page picks it up with no other changes.
interface GoalSource {
  id: string;
  label: string;
  apiBase: string;
}

const GOAL_SOURCES: GoalSource[] = [
  { id: "finance", label: "Finance Tracker", apiBase: import.meta.env.VITE_FINANCE_API_BASE ?? "" },
].filter((s) => s.apiBase);

// ── Types -- mirrors finance-tracker's own goals/index.tsx, which mirrors
// RECURRING_AND_GOALS_SPEC.md's Goal Query shape (the cross-tracker
// standard every tracker's Goals implementation follows). Kept as a
// separate copy rather than shared code, same reasoning CLAUDE.md gives
// for domain_events' shape being standardized without a shared table:
// each tracker's own frontend needs this shape regardless of whether this
// page also reads it, so there's no single owner to import it from.

type Comparator = "lte" | "gte" | "eq" | "within_tolerance_percent";
type Severity = "warning" | "target";
type Aggregation = "sum" | "mean" | "median" | "min" | "max" | "count" | "percentile";
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
}

interface GoalStatus {
  measure_value: number;
  reference_value: number;
  percent: number;
  on_track: boolean;
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

function goalSubtitle(goal: Goal): string {
  const period = goal.measure_query.timeWindow.period;
  if (goal.reference_query) {
    const ref = goal.reference_query;
    const baselineDesc =
      ref.timeWindow.kind === "trailing"
        ? `trailing ${ref.timeWindow.count}-${periodLabel(ref.timeWindow.period)} ${ref.aggregation}`
        : ref.timeWindow.kind === "same_period_last_year"
        ? `same ${periodLabel(ref.timeWindow.period)} ${ref.timeWindow.count === 1 ? "last year" : `${ref.timeWindow.count} years back`}`
        : ref.timeWindow.kind === "all_time"
        ? "all-time"
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
  const category = categoryFromQuery(goal.measure_query) ?? "Every category";
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
            <p className="font-medium text-sm truncate">{goal.label || category}</p>
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
          <button onClick={() => onDelete(item)} className="p-1 rounded hover:bg-secondary" aria-label="Delete goal">
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mt-3">
        {comparatorLabel(goal.comparator, goal.tolerance_percent)}{" "}
        {goal.reference_query ? "a computed baseline" : formatMoney(goal.reference_amount ?? 0)} — {goalSubtitle(goal)}
      </p>

      <div className="mt-3">
        {status === undefined ? (
          <div className="h-1.5 w-full bg-secondary rounded-full animate-pulse" />
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
                {formatMoney(status.measure_value)}{" "}
                <span className="text-muted-foreground">/ {formatMoney(status.reference_value)}</span>
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

export function Goals() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const apps = useAppRegistry(AUTH_BASE_URL);
  const [items, setItems] = useState<SourcedGoal[]>([]);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ source: string; error: string }[]>([]);

  const sources = useMemo(() => GOAL_SOURCES, []);

  // A source's own /goals page, not this page, is where creating and
  // editing actually happens (see GOAL_SOURCES' comment on why this page
  // doesn't rebuild finance's own Advanced-tab form) -- resolved from the
  // SAME app registry AppSwitcher/Home's own tracker links already use,
  // not a second hardcoded URL, so it can't drift from wherever that
  // tracker is actually reachable in this deployment.
  const trackerGoalsHref = useMemo(() => {
    const map: Record<string, string> = {};
    for (const source of sources) {
      const app = apps.find((a) => a.id === source.id);
      if (app) map[source.id] = `${app.href}/goals`;
    }
    return map;
  }, [sources, apps]);

  useEffect(() => {
    if (!token || sources.length === 0) return;
    let cancelled = false;
    setLoading(true);
    setErrors([]);

    Promise.all(
      sources.map(async (source) => {
        try {
          const goals = (await apiFetch(source.apiBase, "/api/goals?active=true", token)) as Goal[];
          const statuses = await Promise.all(
            goals.map((goal) =>
              apiFetch(source.apiBase, `/api/goals/${goal.id}/status`, token)
                .then((s) => s as GoalStatus)
                .catch(() => undefined)
            )
          );
          return goals.map((goal, i): SourcedGoal => ({ source, goal, status: statuses[i] }));
        } catch (e) {
          if (!cancelled) {
            setErrors((prev) => [...prev, { source: source.label, error: e instanceof ApiError ? e.message : "Failed to load" }]);
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
  }, [token, sources]);

  async function handleDelete(item: SourcedGoal) {
    setItems((prev) => prev.filter((i) => !(i.source.id === item.source.id && i.goal.id === item.goal.id)));
    try {
      await apiFetch(item.source.apiBase, `/api/goals/${item.goal.id}`, token, { method: "DELETE" });
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

      {sources.length === 0 && (
        <p className="text-sm text-muted-foreground">No tracker with Goals configured for this deployment yet.</p>
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
          Couldn't load: {errors.map((e) => e.source).join(", ")} — showing the rest.
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
