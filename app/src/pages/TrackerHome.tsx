import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTrackStackAuth } from "trackstack-ui";
import { Plus } from "lucide-react";
import { ApiError } from "../lib/api.js";
import { customApi, formatValue, type Entry, type TableDef, type TrackerMeta } from "../lib/customTrackers.js";
import { TableTabs, entryLabel } from "./TrackerView.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

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

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekLabel(mon: Date, sun: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${mon.toLocaleDateString(undefined, opts)} – ${sun.toLocaleDateString(undefined, opts)}`;
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

interface PeriodStats {
  total: number;
  unit: string;
  prevTotal: number;
}

/** `/trackers/:slug` -- the tracker's own daily/weekly snapshot: the
 * default layout's "Home" (MULTI_TABLE_TRACKERS_SPEC.md's mockup
 * discussion). Scoped to the tracker's FIRST table (there's no explicit
 * "default table" flag on TrackerMeta -- adding one is deferred until a
 * tracker with a real need for picking a different one shows up, Tenet
 * #2); every other table stays one click away via the same TableTabs row
 * `/trackers/:slug/tables/:tableKey` pages use, with a leading "Home" tab
 * of its own so the two feel like one navigation model, not two. */
export function TrackerHome() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [, params] = useRoute("/trackers/:slug");
  const slug = params?.slug ?? "";
  const [meta, setMeta] = useState<TrackerMeta | null>(null);
  const [tables, setTables] = useState<TableDef[]>([]);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<Entry[]>([]);
  const [stats, setStats] = useState<PeriodStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const weekEnd = useMemo(() => addDays(weekStart, 6), [weekStart]);
  const primary = tables[0];

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
        setStats(null);
        setLoaded(true);
        setError(null);
        return;
      }

      const start = isoDate(weekStart);
      const end = isoDate(weekEnd);
      const eligibleForStats = !!table.amount_field && table.summable;

      // The aggregations endpoint 400s outright for a non-summable
      // owner_type (not just "empty data") -- found live, not by reading
      // the code -- so the two calls below are only made at all when this
      // table is actually eligible, same "roles are all optional" rule
      // every other role-gated feature in this app already follows.
      const [entriesRes, curAgg, prevAgg] = await Promise.all([
        customApi(`/trackers/${slug}/tables/${table.table_key}/entries?start=${start}&end=${end}`, token),
        eligibleForStats ? customApi(`/aggregations/by_category?start=${start}&end=${end}&owner_type=custom_${slug}_${table.table_key}`, token) : Promise.resolve(null),
        eligibleForStats ? customApi(`/aggregations/by_category?start=${isoDate(addDays(weekStart, -7))}&end=${isoDate(addDays(weekEnd, -7))}&owner_type=custom_${slug}_${table.table_key}`, token) : Promise.resolve(null),
      ]);
      setEntries((entriesRes as Entry[]).slice().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
      if (eligibleForStats) {
        const cur = sumAggregation(curAgg);
        setStats({ total: cur.total, unit: cur.unit, prevTotal: sumAggregation(prevAgg).total });
      } else {
        setStats(null);
      }
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this tracker");
    } finally {
      setLoaded(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token, weekStart]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!meta || !loaded) return null;

  if (!primary) {
    return (
      <div className="max-w-xl">
        <h1 className="text-2xl mb-2">{meta.name}</h1>
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
  const groups = groupByCategory(entries, primary);
  const delta = stats && stats.prevTotal > 0 ? Math.round(((stats.total - stats.prevTotal) / stats.prevTotal) * 100) : null;

  return (
    <div className="max-w-3xl relative pb-24">
      <div className="mb-2">
        <h1 className="text-2xl">{meta.name}</h1>
        {meta.description && <p className="text-sm text-muted-foreground mt-1">{meta.description}</p>}
      </div>

      <TableTabs trackerSlug={slug} tables={tables} />

      {/* Week nav -- day-level navigation and a jump-to-any-date calendar
          are both deferred; this is the week-only slice of the mockup's
          design, not the full thing yet. */}
      <div className="flex items-center gap-3 mb-6">
        <button type="button" onClick={() => setWeekStart((w) => addDays(w, -7))} className="w-8 h-8 rounded-md border border-border text-sm hover:bg-secondary" aria-label="Previous week">
          ‹
        </button>
        <div className="text-sm font-medium">{weekLabel(weekStart, weekEnd)}</div>
        <button type="button" onClick={() => setWeekStart((w) => addDays(w, 7))} className="w-8 h-8 rounded-md border border-border text-sm hover:bg-secondary" aria-label="Next week">
          ›
        </button>
        <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="text-xs text-muted-foreground hover:text-foreground ml-1">
          This week
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs text-muted-foreground mb-1">Total this period</div>
            <div className="text-2xl">{stats.total}{stats.unit !== "none" && stats.unit ? ` ${stats.unit}` : ""}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs text-muted-foreground mb-1">Entries</div>
            <div className="text-2xl">{entries.length}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-4">
            <div className="text-xs text-muted-foreground mb-1">vs last period</div>
            <div className="text-2xl">{delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta}%`}</div>
          </div>
        </div>
      )}

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        {groups.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">No entries this period.</p>}
        {groups.map((g) => (
          <div key={g.category}>
            {g.category && <div className="px-4 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wide">{g.category}</div>}
            {g.entries.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between px-4 py-2.5 border-b border-border last:border-0">
                <div className="text-sm">{entryLabel(primary, entry)}</div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  {amountField && <span>{formatValue(amountField, entry.values[amountField.key])}</span>}
                  <span>{new Date(entry.occurred_at).toLocaleDateString()}</span>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* The real cross-table quick-add (pick which of this tracker's own
          tables, then a form shaped by its fields) isn't built yet -- this
          links straight to the primary table's own, already-working Add
          form rather than stub a button that does nothing. */}
      <Link
        href={`/trackers/${slug}/tables/${primary.table_key}`}
        className="fixed bottom-8 right-8 flex items-center gap-2 bg-primary text-primary-foreground rounded-full pl-4 pr-5 py-3 shadow-lg hover:opacity-90"
      >
        <Plus className="h-4 w-4" /> Log entry
      </Link>
    </div>
  );
}
