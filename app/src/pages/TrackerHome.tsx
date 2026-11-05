import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTrackStackAuth } from "trackstack-ui";
import { Plus } from "lucide-react";
import { ApiError } from "../lib/api.js";
import { ACCENT_HEX, ACCENT_NAMES, customApi, formatValue, type Entry, type FieldDef, type TableDef, type TrackerMeta } from "../lib/customTrackers.js";
import { FieldValue, type LinkTarget } from "../components/FieldInput.js";
import { usePinnedTrackerChrome } from "../lib/trackerChromeContext.js";
import { TableTabs, entryLabel } from "./TrackerView.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

export type Granularity = "day" | "week" | "month";

// Remembered per-viewer, per-tracker -- same "setup-time default lives on
// the table/tracker, viewing-time choice lives in THIS browser" split
// TrackerTable's column picker already established (see its own
// COLUMN_PREF_PREFIX doc comment). There's no setup-time default for this
// yet (every tracker starts on "week"); that's a deliberate, flagged
// follow-up -- see MULTI_TABLE_TRACKERS_SPEC.md -- not an oversight, since
// it needs a small backend addition (a column on TableDef) this pass
// doesn't touch.
const GRANULARITY_PREF_PREFIX = "trackstack:home-granularity:";

function loadGranularityPref(slug: string): Granularity | null {
  try {
    const raw = localStorage.getItem(GRANULARITY_PREF_PREFIX + slug);
    return raw === "day" || raw === "week" || raw === "month" ? raw : null;
  } catch {
    return null;
  }
}

function saveGranularityPref(slug: string, g: Granularity): void {
  try {
    localStorage.setItem(GRANULARITY_PREF_PREFIX + slug, g);
  } catch {
    // best-effort only
  }
}

function startOfWeek(d: Date): Date {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number): Date {
  const date = new Date(d);
  date.setDate(date.getDate() + n);
  return date;
}

/** The first instant of the period containing `d`, for a given
 * granularity -- the one thing day/week/month views disagree on; every
 * other calculation (end, prev/next, label) derives from this. */
function startOfPeriod(d: Date, granularity: Granularity): Date {
  if (granularity === "week") return startOfWeek(d);
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  if (granularity === "month") date.setDate(1);
  return date;
}

function endOfPeriod(start: Date, granularity: Granularity): Date {
  if (granularity === "day") return start;
  if (granularity === "week") return addDays(start, 6);
  return new Date(start.getFullYear(), start.getMonth() + 1, 0); // month's last day
}

function shiftPeriod(start: Date, granularity: Granularity, dir: 1 | -1): Date {
  const date = new Date(start);
  if (granularity === "day") date.setDate(date.getDate() + dir);
  else if (granularity === "week") date.setDate(date.getDate() + dir * 7);
  else date.setMonth(date.getMonth() + dir);
  return startOfPeriod(date, granularity);
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function periodLabel(start: Date, end: Date, granularity: Granularity): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (granularity === "day") return start.toLocaleDateString(undefined, { weekday: "short", ...opts });
  if (granularity === "month") return start.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
}

function currentPeriodLabel(granularity: Granularity): string {
  return granularity === "day" ? "Today" : granularity === "month" ? "This month" : "This week";
}

/** Sums an /aggregations/by_category response across every category --
 * exactly what "total for the period" means regardless of whether the
 * table even has a category_field (queryEvents' own by_category grouping
 * already buckets category-less rows under "uncategorized" rather than
 * dropping them, so this sum is never short). */
function sumAggregation(res: unknown): { total: number; unit: string } {
  const data = (res as { data: { total_amount: number; unit: string }[] }).data;
  const total = data.reduce((sum, row) => sum + row.total_amount, 0);
  return { total: Math.round(total * 100) / 100, unit: data[0]?.unit ?? "" };
}

/** Entries grouped by the primary table's own category_field -- a flat
 * single group (key "") when it doesn't have one, same "roles are all
 * optional" treatment the rest of this app already gives category_field. */
function groupByCategory(entries: Entry[], table: TableDef): { category: string; entries: Entry[] }[] {
  if (!table.category_field) return entries.length ? [{ category: "", entries }] : [];
  const order: string[] = [];
  const groups = new Map<string, Entry[]>();
  for (const e of entries) {
    const v = e.values[table.category_field];
    const key = v === undefined || v === "" ? "Uncategorized" : String(v);
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)!.push(e);
  }
  return order.map((category) => ({ category, entries: groups.get(category)! }));
}

/** Which of this table's fields show on a Home entry row beyond the
 * title/amount/date it already shows separately. `ui_config.columns` is
 * the SAME per-table config TrackerTable's Tier B view reads (set from
 * TableForm's "edit tracker" UI) -- reused here rather than inventing a
 * second config surface, per the user's own ask to control this "on the
 * edit tracker feature." Unset shows every other field; set respects it
 * as a whitelist, in field-definition order (not the configured order --
 * see TrackerTable's own identical choice and its doc comment for why). */
function extraFields(table: TableDef): FieldDef[] {
  const roleKeys = new Set([table.label_field, table.amount_field, table.date_field].filter((k): k is string => !!k));
  const configured = table.ui_config?.columns;
  const allowed = configured?.length ? new Set(configured) : null;
  return table.fields.filter((f) => !roleKeys.has(f.key) && (!allowed || allowed.has(f.key)));
}

interface PeriodStats {
  total: number;
  unit: string;
  prevTotal: number;
}

/** `/trackers/:slug` -- the tracker's own daily/weekly/monthly snapshot:
 * the default layout's "Home" (MULTI_TABLE_TRACKERS_SPEC.md's mockup
 * discussion). Scoped to the tracker's FIRST table (there's no explicit
 * "default table" flag on TrackerMeta -- adding one is deferred until a
 * tracker with a real need for picking a different one shows up, Tenet
 * #2); every other table stays one click away via the same TableTabs row
 * `/trackers/:slug/tables/:tableKey` pages use, with a leading "Home" tab
 * of its own so the two feel like one navigation model, not two. */
export function TrackerHome() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const pinned = usePinnedTrackerChrome();
  const [, params] = useRoute("/trackers/:slug");
  const slug = params?.slug ?? "";
  const [meta, setMeta] = useState<TrackerMeta | null>(null);
  const [tables, setTables] = useState<TableDef[]>([]);
  const [granularity, setGranularity] = useState<Granularity>(() => loadGranularityPref(slug) ?? "week");
  const [periodStart, setPeriodStart] = useState(() => startOfPeriod(new Date(), loadGranularityPref(slug) ?? "week"));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [linkTargets, setLinkTargets] = useState<Record<string, LinkTarget>>({});
  const [stats, setStats] = useState<PeriodStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const periodEnd = useMemo(() => endOfPeriod(periodStart, granularity), [periodStart, granularity]);
  const primary = tables[0];

  function changeGranularity(g: Granularity) {
    setGranularity(g);
    saveGranularityPref(slug, g);
    setPeriodStart(startOfPeriod(new Date(), g));
  }

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const [m, ts] = await Promise.all([customApi(`/trackers/${slug}`, token), customApi(`/trackers/${slug}/tables`, token)]);
      const metaData = m as TrackerMeta;
      const tablesData = ts as TableDef[];
      setMeta(metaData);
      setTables(tablesData);

      const table = tablesData[0];
      if (!table) {
        setEntries([]);
        setLinkTargets({});
        setStats(null);
        setLoaded(true);
        setError(null);
        return;
      }

      const start = isoDate(periodStart);
      const end = isoDate(periodEnd);
      const prevStart = shiftPeriod(periodStart, granularity, -1);
      const prevEnd = endOfPeriod(prevStart, granularity);
      const eligibleForStats = !!table.amount_field && table.summable;

      // The aggregations endpoint 400s outright for a non-summable
      // owner_type (not just "empty data") -- found live, not by reading
      // the code -- so the two calls below are only made at all when this
      // table is actually eligible, same "roles are all optional" rule
      // every other role-gated feature in this app already follows.
      const [entriesRes, curAgg, prevAgg] = await Promise.all([
        customApi(`/trackers/${slug}/tables/${table.table_key}/entries?start=${start}&end=${end}`, token),
        eligibleForStats ? customApi(`/aggregations/by_category?start=${start}&end=${end}&owner_type=custom_${slug}_${table.table_key}`, token) : Promise.resolve(null),
        eligibleForStats ? customApi(`/aggregations/by_category?start=${isoDate(prevStart)}&end=${isoDate(prevEnd)}&owner_type=custom_${slug}_${table.table_key}`, token) : Promise.resolve(null),
      ]);
      const loadedEntries = (entriesRes as Entry[]).slice().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
      setEntries(loadedEntries);
      if (eligibleForStats) {
        const cur = sumAggregation(curAgg);
        setStats({ total: cur.total, unit: cur.unit, prevTotal: sumAggregation(prevAgg).total });
      } else {
        setStats(null);
      }

      // Link-field resolution for this table's own entries -- same
      // per-id target map TrackerView builds for its table/list views, so
      // a link field's value on Home is just as clickable there as
      // anywhere else (FieldValue's own doc comment covers the mechanism).
      // Scoped to only the fields Home actually renders (extraFields),
      // not every link field this table has, since lookup/rollup-through
      // fields that never show here need nothing resolved.
      const linkFields = extraFields(table).filter((f) => f.type === "link" && f.target);
      const targets: Record<string, LinkTarget> = {};
      await Promise.all(linkFields.map(async (f) => {
        const targetSlug = f.target!.tracker_slug ?? slug;
        const targetTableKey = f.target!.table_key;
        try {
          const targetEntries = (await customApi(`/trackers/${targetSlug}/tables/${targetTableKey}/entries`, token)) as Entry[];
          const targetTable = targetSlug === slug ? tablesData.find((ot) => ot.table_key === targetTableKey) : undefined;
          for (const te of targetEntries) {
            targets[te.id] = { label: entryLabel(targetTable, te), trackerSlug: targetSlug, tableKey: targetTableKey };
          }
        } catch {
          // that target table/tracker is unreachable -- this field's
          // values just fall back to their raw id, same as TrackerView.
        }
      }));
      setLinkTargets(targets);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this tracker");
    } finally {
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token, periodStart, granularity]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!meta || !loaded) return null;

  if (!primary) {
    return (
      <div className="max-w-xl">
        {!pinned && <h1 className="text-2xl mb-2">{meta.name}</h1>}
        {meta.description && <p className="text-sm text-muted-foreground mb-6">{meta.description}</p>}
        <div className="bg-card border border-border rounded-lg p-6 text-center">
          <p className="text-sm text-muted-foreground mb-4">This tracker doesn't have any tables yet. A table is one kind of thing you log here (e.g. "Log", "Notes").</p>
          <Link href={`/trackers/${slug}/tables/new`} className="inline-flex items-center gap-1 bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium">
            <Plus className="h-4 w-4" /> Add a table
          </Link>
        </div>
      </div>
    );
  }

  const amountField = primary.fields.find((f) => f.key === primary.amount_field);
  const rowFields = extraFields(primary);
  const groups = groupByCategory(entries, primary);
  const delta = stats && stats.prevTotal > 0 ? Math.round(((stats.total - stats.prevTotal) / stats.prevTotal) * 100) : null;

  return (
    <div className="max-w-3xl relative pb-24">
      {!pinned && (
        <div className="mb-2">
          <h1 className="text-2xl">{meta.name}</h1>
          {meta.description && <p className="text-sm text-muted-foreground mt-1">{meta.description}</p>}
        </div>
      )}

      <TableTabs trackerSlug={slug} tables={tables} />

      {/* Day-level navigation lives inside the granularity toggle itself
          now (switching to "Day" re-bases the period to today); a
          jump-to-any-date calendar is still deferred. */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <button type="button" onClick={() => setPeriodStart((s) => shiftPeriod(s, granularity, -1))} className="w-8 h-8 rounded-md border border-border text-sm hover:bg-secondary" aria-label="Previous period">
          ‹
        </button>
        <div className="text-sm font-medium">{periodLabel(periodStart, periodEnd, granularity)}</div>
        <button type="button" onClick={() => setPeriodStart((s) => shiftPeriod(s, granularity, 1))} className="w-8 h-8 rounded-md border border-border text-sm hover:bg-secondary" aria-label="Next period">
          ›
        </button>
        <button type="button" onClick={() => setPeriodStart(startOfPeriod(new Date(), granularity))} className="text-xs text-muted-foreground hover:text-foreground ml-1">
          {currentPeriodLabel(granularity)}
        </button>

        <div className="flex items-center gap-0.5 ml-auto bg-secondary rounded-md p-0.5">
          {(["day", "week", "month"] as const).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => changeGranularity(g)}
              className={"px-2.5 py-1 text-xs rounded capitalize " + (g === granularity ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      {/* Hero stat card, Cronometer-style hierarchy: the period total is
          the headline (bigger, accent-tinted), "Entries"/"vs last period"
          flank it as smaller secondary numbers, rather than three equal
          boxes competing for attention. */}
      {stats && (
        <div className="bg-card border border-border rounded-xl p-6 mb-6 flex items-center gap-8 flex-wrap">
          <div className="bg-accent rounded-lg px-5 py-4 flex-shrink-0">
            <div className="text-xs text-accent-foreground/70 mb-1">Total this period</div>
            <div className="text-3xl font-semibold text-accent-foreground">{stats.total}{stats.unit !== "none" && stats.unit ? ` ${stats.unit}` : ""}</div>
          </div>
          <div className="flex gap-8 flex-wrap">
            <div>
              <div className="text-xl font-semibold">{entries.length}</div>
              <div className="text-xs text-muted-foreground">entries logged</div>
            </div>
            <div>
              <div className={"text-xl font-semibold " + (delta !== null && delta > 0 ? "text-success" : delta !== null && delta < 0 ? "text-destructive" : "")}>
                {delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}
              </div>
              <div className="text-xs text-muted-foreground">vs last period</div>
            </div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {groups.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">No entries this period.</p>}
        {groups.map((g, i) => {
          const dotColor = g.category ? ACCENT_HEX[ACCENT_NAMES[i % ACCENT_NAMES.length]!] : null;
          return (
          <div key={g.category}>
            {g.category && (
              <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor ?? undefined }} />
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: dotColor ?? undefined }}>{g.category}</span>
              </div>
            )}
            {g.entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0 gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-sm">
                    {dotColor && <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />}
                    {entryLabel(primary, entry)}
                  </div>
                  {rowFields.length > 0 && (
                    <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {rowFields.map((f) => (
                        <span key={f.key}>
                          <span className="opacity-70">{f.label}:</span> <FieldValue field={f} value={entry.values[f.key]} linkTargets={linkTargets} />
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground flex-shrink-0">
                  {amountField && <span>{formatValue(amountField, entry.values[amountField.key])}</span>}
                  <span>{new Date(entry.occurred_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
          );
        })}
      </div>

      {/* The real cross-table quick-add (pick which of this tracker's own
          tables, then a form shaped by its fields) isn't built yet -- this
          links straight to the primary table's own, already-working Add
          form rather than stub a button that does nothing. Bigger and
          glowing (a blurred primary-colored copy behind the real pill)
          for the same "this is the one thing to press" prominence the
          mockup gives it, not a plain small FAB. */}
      <div className="fixed bottom-8 right-8 z-10">
        <div className="absolute inset-1 rounded-full bg-primary opacity-30 blur-md" aria-hidden="true" />
        <Link
          href={`/trackers/${slug}/tables/${primary.table_key}`}
          className="relative flex items-center gap-2 bg-primary text-primary-foreground rounded-full pl-4 pr-5 py-3.5 shadow-lg hover:opacity-90 font-medium"
        >
          <span className="w-7 h-7 rounded-full bg-primary-foreground/20 flex items-center justify-center flex-shrink-0">
            <Plus className="h-4 w-4" />
          </span>
          Log entry
        </Link>
      </div>
    </div>
  );
}
