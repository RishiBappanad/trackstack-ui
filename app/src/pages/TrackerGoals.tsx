import { useCallback, useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTrackStackAuth } from "trackstack-ui";
import { Plus, Trash2 } from "lucide-react";
import { ApiError } from "../lib/api.js";
import {
  customApi, BASIC_GOAL_AGGREGATIONS, BASIC_GOAL_AGGREGATION_LABELS, GOAL_COMPARATOR_LABELS, GOAL_SEVERITIES,
  type BasicGoalAggregation, type Goal, type GoalComparator, type GoalSeverity, type GoalStatus, type TableDef, type TrackerMeta,
} from "../lib/customTrackers.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";
const inputClass = "bg-secondary border border-border rounded-md px-3 py-2 text-sm";

type Period = "daily" | "weekly" | "monthly";

/** The "basic goal" shorthand (RECURRING_AND_GOALS_SPEC.md's "Basic goals
 * stay simple") is the only creation form this page offers -- the tracker
 * builder's own ask was "create whatever goals might exist," which this
 * already covers for the ordinary case (a summable field, a period, a
 * target); the full GoalQuery builder (arbitrary filters, trailing/
 * same-period-last-year windows, a query as its own reference) is real,
 * shipped backend capability with no UI yet, built if a tracker ever
 * needs it rather than speculatively now (Tenet #2). */
interface NewGoalDraft {
  sourceTableKey: string;
  category: string;
  comparator: GoalComparator;
  aggregation: BasicGoalAggregation;
  targetAmount: string;
  period: Period;
  severity: GoalSeverity;
  label: string;
}

/** Whether `table` can back a goal using `aggregation` -- "count" needs
 * nothing but entries existing (true for every table), but sum/mean/min/
 * max read a real number off each entry, so they need a summable
 * amount_field the same way the table's own Home hero stat does. Table
 * eligibility is therefore a function of the CHOSEN aggregation, not a
 * fixed property of the table -- a table with no summable field (like
 * one whose only number is explicitly marked non-summable, e.g. a salary
 * field nobody wants added across job applications) is still a perfectly
 * good "count entries" goal target. */
function eligibleFor(table: TableDef, aggregation: BasicGoalAggregation): boolean {
  return aggregation === "count" || !!(table.amount_field && table.summable);
}

function emptyDraft(tables: TableDef[]): NewGoalDraft {
  const summable = tables.find((t) => t.amount_field && t.summable);
  const aggregation: BasicGoalAggregation = summable ? "sum" : "count";
  return { sourceTableKey: (summable ?? tables[0])?.table_key ?? "", category: "", comparator: "gte", aggregation, targetAmount: "", period: "weekly", severity: "target", label: "" };
}

/** `/trackers/:slug/goals` -- this TRACKER's own Goals management: define
 * whatever goals might exist (the tracker builder's own ask), enable the
 * ones you actually want tracked right now. Named TrackerGoals (not
 * "Goals") to stay distinct from the top-level `/goals` page, which is a
 * DIFFERENT thing -- a cross-tracker aggregate view that probes every
 * registered app's own goals endpoint and shows them all in one place.
 * This page is the tracker-scoped counterpart finance-tracker's own
 * /goals page already is for that aggregate view's "Add goal in Finance"
 * link; a trackstack-custom tracker showing up there too (by having this
 * page's own backend discovered the same way) is a natural next step,
 * not done here.
 *
 * Same "one settings page per concern" shape as Integrations.tsx, but
 * individual CRUD (POST/PATCH/DELETE per goal) rather than one whole-list
 * PUT: a goal has its own id, live status, and history, none of which fit
 * the "replace the whole list" model Integrations' bindings use.
 * `is_active` IS the "creator defines, a viewer chooses which to enable"
 * toggle -- a goal is created inactive by default (the backend's own
 * default), so nothing here needs a second, separate "enable" concept
 * beyond the checkbox each card already has. */
export function TrackerGoals() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [, params] = useRoute("/trackers/:slug/goals");
  const slug = params?.slug ?? "";
  const [meta, setMeta] = useState<TrackerMeta | null>(null);
  const [tables, setTables] = useState<TableDef[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [statuses, setStatuses] = useState<Record<number, GoalStatus>>({});
  const [draft, setDraft] = useState<NewGoalDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const [m, ts, gs] = await Promise.all([
        customApi(`/trackers/${slug}`, token),
        customApi(`/trackers/${slug}/tables`, token),
        customApi(`/trackers/${slug}/goals`, token),
      ]);
      const tablesData = ts as TableDef[];
      const goalsData = gs as Goal[];
      setMeta(m as TrackerMeta);
      setTables(tablesData);
      setGoals(goalsData);
      setDraft((prev) => prev ?? emptyDraft(tablesData));

      // One status fetch per goal -- a tracker's own goal list is small
      // (there's no bulk status endpoint, and none is needed yet).
      const entries = await Promise.all(
        goalsData.map(async (g) => [g.id, (await customApi(`/trackers/${slug}/goals/${g.id}/status`, token)) as GoalStatus] as const),
      );
      setStatuses(Object.fromEntries(entries));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load goals");
    }
  }, [slug, token]);

  useEffect(() => {
    load();
  }, [load]);

  function categoryOptionsFor(tableKey: string): string[] {
    const table = tables.find((t) => t.table_key === tableKey);
    if (!table?.category_field) return [];
    return table.fields.find((f) => f.key === table.category_field)?.options ?? [];
  }

  function unitFor(tableKey: string): string | undefined {
    const table = tables.find((t) => t.table_key === tableKey);
    return table?.fields.find((f) => f.key === table.amount_field)?.unit;
  }

  const PERIOD_NOUN: Record<string, string> = { daily: "day", weekly: "week", monthly: "month" };

  /** A count goal's measure/reference are bare entry counts, never the
   * table's own amount_field unit -- "0 / 3", not "0 min / 3 min". Every
   * other aggregation DOES read that unit (it's summing/averaging actual
   * values off the field), so this is the one place unit display has to
   * branch on aggregation rather than just following unitFor(). */
  function unitForDisplay(g: Goal): string | undefined {
    return g.measure_query.aggregation === "count" ? undefined : unitFor(g.source_table_key);
  }

  /** "at least 3 entries per day" (count, no unit to show) vs. "at least
   * 50 min per week" (sum, the amount field's own unit) vs. "average 20
   * per week" (mean/min/max named explicitly, since those read oddly as
   * a bare number the way "sum" always has). */
  function goalSummary(g: Goal): string {
    const unit = unitForDisplay(g);
    const amount = g.reference_amount ?? "a computed value";
    const period = PERIOD_NOUN[g.measure_query.timeWindow.period ?? ""] ?? g.measure_query.timeWindow.period ?? "period";
    const comparator = GOAL_COMPARATOR_LABELS[g.comparator];
    if (g.measure_query.aggregation === "count") return `${comparator} ${amount} ${amount === 1 ? "entry" : "entries"} per ${period}`;
    const aggLabel = g.measure_query.aggregation !== "sum" ? `${BASIC_GOAL_AGGREGATION_LABELS[g.measure_query.aggregation as BasicGoalAggregation] ?? g.measure_query.aggregation} · ` : "";
    return `${aggLabel}${comparator} ${amount}${unit ? ` ${unit}` : ""} per ${period}`;
  }

  async function createGoal() {
    if (!draft || !draft.sourceTableKey || !draft.targetAmount) return;
    setSaving(true);
    setError(null);
    try {
      await customApi(`/trackers/${slug}/goals`, token, {
        method: "POST",
        body: JSON.stringify({
          source_table_key: draft.sourceTableKey,
          comparator: draft.comparator,
          aggregation: draft.aggregation,
          target_amount: Number(draft.targetAmount),
          period: draft.period,
          severity: draft.severity,
          ...(draft.label ? { label: draft.label } : {}),
          ...(draft.category ? { category: draft.category } : {}),
        }),
      });
      setDraft(emptyDraft(tables));
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create goal");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(goal: Goal) {
    try {
      await customApi(`/trackers/${slug}/goals/${goal.id}`, token, { method: "PATCH", body: JSON.stringify({ is_active: !goal.is_active }) });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not update goal");
    }
  }

  async function removeGoal(id: number) {
    try {
      await customApi(`/trackers/${slug}/goals/${id}`, token, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete goal");
    }
  }

  if (!meta) return error ? <p className="text-destructive text-sm">{error}</p> : null;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl">{meta.name} — Goals</h1>
        <Link href={`/trackers/${slug}`} className="text-sm text-muted-foreground hover:text-foreground">Back to tracker</Link>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Define whatever goals make sense for this tracker, then enable the ones you actually want tracked right now.</p>

      {error && <div className="mb-4 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md px-3 py-2">{error}</div>}

      {tables.length === 0 ? (
        <p className="text-sm text-muted-foreground mb-6">This tracker doesn't have any tables yet -- a goal needs one to count or sum entries from.</p>
      ) : (
        <>
          <div className="grid gap-3 mb-4">
            {goals.length === 0 && <p className="text-sm text-muted-foreground">No goals yet.</p>}
            {goals.map((g) => {
              const table = tables.find((t) => t.table_key === g.source_table_key);
              const status = statuses[g.id];
              const unit = unitForDisplay(g);
              return (
                <div key={g.id} className="flex items-center justify-between gap-3 bg-card border border-border rounded-lg p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{g.label || `${table?.name ?? g.source_table_key} goal`}</div>
                    <div className="text-xs text-muted-foreground">
                      {table?.name ?? g.source_table_key} · {goalSummary(g)}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {status && (
                      <span className={"text-xs font-medium whitespace-nowrap " + (status.compliant ? "text-success" : "text-muted-foreground")}>
                        {Math.round(status.measure * 10) / 10}{unit ? ` ${unit}` : ""} / {status.reference}{unit ? ` ${unit}` : ""}
                      </span>
                    )}
                    <label className="flex items-center gap-1.5 text-sm text-muted-foreground whitespace-nowrap">
                      <input type="checkbox" checked={g.is_active} onChange={() => toggleActive(g)} />
                      Enabled
                    </label>
                    <button type="button" onClick={() => removeGoal(g.id)} className="text-muted-foreground hover:text-destructive" aria-label="Delete goal">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {draft && (() => {
            const selectedTable = tables.find((t) => t.table_key === draft.sourceTableKey);
            const eligible = !selectedTable || eligibleFor(selectedTable, draft.aggregation);
            return (
            <div className="bg-card border border-border rounded-lg p-4">
              <div className="text-sm font-medium mb-3">New goal</div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Table
                  <select value={draft.sourceTableKey} onChange={(e) => setDraft({ ...draft, sourceTableKey: e.target.value, category: "" })} className={inputClass}>
                    {tables.map((t) => (
                      <option key={t.table_key} value={t.table_key}>{t.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Aggregation
                  <select value={draft.aggregation} onChange={(e) => setDraft({ ...draft, aggregation: e.target.value as BasicGoalAggregation })} className={inputClass}>
                    {BASIC_GOAL_AGGREGATIONS.map((a) => (
                      <option key={a} value={a}>{BASIC_GOAL_AGGREGATION_LABELS[a]}</option>
                    ))}
                  </select>
                </label>
                {categoryOptionsFor(draft.sourceTableKey).length > 0 && (
                  <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                    Category
                    <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} className={inputClass}>
                      <option value="">Any</option>
                      {categoryOptionsFor(draft.sourceTableKey).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Comparator
                  <select value={draft.comparator} onChange={(e) => setDraft({ ...draft, comparator: e.target.value as GoalComparator })} className={inputClass}>
                    <option value="gte">At least</option>
                    <option value="lte">At most</option>
                    <option value="eq">Exactly</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Target{draft.aggregation === "count" ? " (count)" : unitFor(draft.sourceTableKey) ? ` (${unitFor(draft.sourceTableKey)})` : ""}
                  <input type="number" value={draft.targetAmount} onChange={(e) => setDraft({ ...draft, targetAmount: e.target.value })} className={inputClass + " w-24"} />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Per
                  <select value={draft.period} onChange={(e) => setDraft({ ...draft, period: e.target.value as Period })} className={inputClass}>
                    <option value="daily">Day</option>
                    <option value="weekly">Week</option>
                    <option value="monthly">Month</option>
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground flex-1 min-w-[140px]">
                  Label (optional)
                  <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} className={inputClass} placeholder="Weekly reps" />
                </label>
                <label className="flex flex-col gap-1 text-xs text-muted-foreground">
                  Severity
                  <select value={draft.severity} onChange={(e) => setDraft({ ...draft, severity: e.target.value as GoalSeverity })} className={inputClass}>
                    {GOAL_SEVERITIES.map((s) => (
                      <option key={s} value={s}>{s === "target" ? "Target" : "Warning"}</option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={createGoal} disabled={saving || !draft.targetAmount || !eligible} title={eligible ? undefined : "This table needs a summable amount field for sum/average/min/max -- pick Count instead, or set one under this table's own \"How other apps and AI read it\""} className="flex items-center gap-1 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
                  <Plus className="h-4 w-4" /> Add goal
                </button>
              </div>
              {!eligible && (
                <p className="text-xs text-muted-foreground mt-2">
                  "{selectedTable?.name}" has no summable amount field, so {BASIC_GOAL_AGGREGATION_LABELS[draft.aggregation].toLowerCase()} isn't available for it -- pick Count instead, or set one under this table's own "How other apps and AI read it".
                </p>
              )}
            </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
