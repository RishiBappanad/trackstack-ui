import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useTrackStackAuth, QualitativeFieldFilter } from "trackstack-ui";
import { Plus, X } from "lucide-react";
import { ApiError } from "../lib/api.js";
import { customApi, notifyPinnedTrackersChanged, RATING_MAX, type Entry, type EntryValues, type FieldDef, type TableDef, type TrackerMeta } from "../lib/customTrackers.js";
import { TrackerTable } from "../components/TrackerTable.js";
import { TrackerChart } from "../components/TrackerChart.js";
import { TrackerList } from "../components/TrackerList.js";
import { NumberRangeFilter, type NumberRange } from "../components/NumberRangeFilter.js";
import { FieldInput, type LinkOption } from "../components/FieldInput.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

/** Form state is always strings/booleans/string-arrays (what inputs
 * produce); `toValues` converts to the typed payload the API wants. A
 * rating is kept as a string here too, same as "number" -- only the
 * input widget differs, the string<->number conversion is identical. */
type FormState = Record<string, string | boolean | string[]>;

/** How a linked entry reads in a picker/display, for a table whose own
 * `label_field` may or may not be set -- `table` is undefined for a
 * cross-tracker target this app has no visibility into (link()'s own
 * fetch still succeeds, there's just no field metadata to pick a label
 * from), in which case every entry just falls back to its id. */
export function entryLabel(table: TableDef | undefined, entry: Entry): string {
  if (table?.label_field) {
    const v = entry.values[table.label_field];
    if (v !== undefined && v !== "") return String(v);
  }
  if (table) {
    for (const f of table.fields) {
      const v = entry.values[f.key];
      if (v !== undefined && v !== "" && (typeof v === "string" || typeof v === "number")) return String(v);
    }
  }
  return entry.id;
}

/** A link field's own value is array-shaped exactly when `multiple` is
 * set -- same array-vs-scalar split multi_select already has, just keyed
 * off a per-field flag instead of the type alone. */
function isArrayValued(f: FieldDef): boolean {
  return f.type === "multi_select" || (f.type === "link" && !!f.multiple);
}

function initialState(fields: FieldDef[], values?: EntryValues): FormState {
  const state: FormState = {};
  for (const f of fields) {
    const v = values?.[f.key];
    if (f.type === "boolean") state[f.key] = v === true;
    else if (isArrayValued(f)) state[f.key] = Array.isArray(v) ? v : [];
    else state[f.key] = v === undefined ? "" : String(v);
  }
  return state;
}

/** Empty inputs are omitted on create and sent as null on edit, which is
 * how the API clears an optional field -- an array-valued field's "empty"
 * is a zero-length array rather than an empty string, same rule otherwise. */
function toValues(fields: FieldDef[], state: FormState, editing: boolean): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = state[f.key];
    if (f.type === "boolean") {
      values[f.key] = raw === true;
      continue;
    }
    const empty = isArrayValued(f) ? !Array.isArray(raw) || raw.length === 0 : raw === "" || raw === undefined;
    if (empty) {
      if (editing) values[f.key] = null;
      continue;
    }
    values[f.key] = isArrayValued(f) ? raw : f.type === "number" || f.type === "rating" ? Number(raw) : raw;
  }
  return values;
}

/** One form for creating an entry and editing one in place -- generated
 * entirely from the table's field list. lookup/rollup fields are never
 * part of this (trackstack-custom computes and rejects setting either
 * directly); `linkOptionsByField` supplies each link field's pickable
 * target entries, fetched once per table load by the caller (TrackerView
 * -- this component has no network access of its own, same convention
 * as FieldInput). */
function EntryForm({ def, initial, linkOptionsByField, submitLabel, onSubmit, onCancel }: {
  def: TableDef;
  initial?: EntryValues;
  linkOptionsByField: Record<string, LinkOption[]>;
  submitLabel: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
}) {
  const fields = def.fields.filter((f) => f.type !== "lookup" && f.type !== "rollup");
  const [state, setState] = useState<FormState>(() => initialState(fields, initial));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(toValues(fields, state, !!initial));
    if (!initial) setState(initialState(fields));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={onCancel ? "flex flex-wrap items-end gap-2 px-4 py-3" : "flex flex-wrap items-end gap-2 mb-6 bg-card border border-border rounded-lg p-4"}
    >
      {fields.map((f) => (
        <FieldInput key={f.key} field={f} value={state[f.key] ?? ""} onChange={(v) => setState((s) => ({ ...s, [f.key]: v }))} linkOptions={f.type === "link" ? linkOptionsByField[f.key] ?? [] : undefined} />
      ))}
      <button type="submit" className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium">{submitLabel}</button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground px-2 py-2" aria-label="Cancel edit">
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}

const QUAL_TYPES: FieldDef["type"][] = ["select", "multi_select", "boolean", "rating"];

/** The fixed vocabulary a qualitative filter's checkboxes offer for a
 * given field -- select/multi_select already have one (`options`);
 * boolean and rating don't carry a field-level list, so one is
 * synthesized here instead of asking the table definition for it. */
function qualOptions(f: FieldDef): string[] {
  if (f.type === "boolean") return ["Yes", "No"];
  if (f.type === "rating") return Array.from({ length: RATING_MAX }, (_, i) => String(i + 1));
  return f.options ?? [];
}

/** Normalizes one entry's value for field `f` to the same string
 * vocabulary qualOptions() uses, so a filter's selected Set<string> can
 * be compared directly regardless of the field's real value type. */
function qualValues(f: FieldDef, raw: string | number | boolean | string[] | undefined): string[] {
  if (raw === undefined) return [];
  if (f.type === "boolean") return [raw ? "Yes" : "No"];
  if (f.type === "multi_select") return Array.isArray(raw) ? raw : [];
  return [String(raw)];
}

/** The slider's travel range for a number field, derived from whatever
 * values are actually present across these entries -- null (no filter
 * control at all for this field) when none have one yet, since there's
 * nothing meaningful to narrow. */
function numberBounds(entries: Entry[], key: string): { min: number; max: number } | null {
  const values = entries.map((e) => e.values[key]).filter((v): v is number => typeof v === "number");
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}

/** Table-tabs navigation across this tracker's own tables -- shared
 * chrome between every `/trackers/:slug/tables/:tableKey` page and
 * TrackerHome.tsx's own snapshot. A leading "Home" tab is always shown
 * (active whenever `activeKey` is omitted, i.e. on the snapshot itself)
 * so the two feel like one navigation model, not two. */
export function TableTabs({ trackerSlug, tables, activeKey }: { trackerSlug: string; tables: { table_key: string; name: string }[]; activeKey?: string }) {
  return (
    <div className="flex items-center gap-1 border-b border-border mb-6 overflow-x-auto">
      <Link
        href={`/trackers/${trackerSlug}`}
        className={
          "px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px " +
          (!activeKey ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")
        }
      >
        Home
      </Link>
      {tables.map((t) => (
        <Link
          key={t.table_key}
          href={`/trackers/${trackerSlug}/tables/${t.table_key}`}
          className={
            "px-3 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px " +
            (t.table_key === activeKey ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground")
          }
        >
          {t.name}
        </Link>
      ))}
      <Link
        href={`/trackers/${trackerSlug}/tables/new`}
        className="flex items-center gap-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground whitespace-nowrap"
      >
        <Plus className="h-3.5 w-3.5" /> Add table
      </Link>
    </div>
  );
}

export function TrackerView() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [, params] = useRoute("/trackers/:slug/tables/:tableKey");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  const tableKey = params?.tableKey ?? "";
  const [meta, setMeta] = useState<TrackerMeta | null>(null);
  const [tables, setTables] = useState<{ table_key: string; name: string }[]>([]);
  const [table, setTable] = useState<TableDef | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Filtering on the actual data, "like there is in the other trackers"
  // (Todos' QualitativeFieldFilter) -- reused as-is for any field whose
  // value is drawn from a small fixed set (select/multi_select/boolean/
  // rating), and a slider+manual-input range filter (NumberRangeFilter)
  // for continuous number fields. Applies across every view, not just
  // table: filtering entries once, upstream of renderView, means list and
  // chart both narrow too (a chart of only the filtered rows is exactly
  // what "filter then chart" should mean), rather than reimplementing
  // filtering per view.
  const [qualFilters, setQualFilters] = useState<Record<string, Set<string>>>({});
  const [numFilters, setNumFilters] = useState<Record<string, NumberRange>>({});
  // Each link field's pickable target entries (EntryForm's own picker)
  // and a flat id->label map covering every link field's targets at once
  // (renderView's display -- one entry could in principle be linked from
  // more than one field, so this stays flat rather than per-field).
  const [linkOptionsByField, setLinkOptionsByField] = useState<Record<string, LinkOption[]>>({});
  const [linkLabels, setLinkLabels] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const [m, ts, t, e] = await Promise.all([
        customApi(`/trackers/${slug}`, token),
        customApi(`/trackers/${slug}/tables`, token),
        customApi(`/trackers/${slug}/tables/${tableKey}`, token),
        customApi(`/trackers/${slug}/tables/${tableKey}/entries`, token),
      ]);
      const loadedTable = t as TableDef;
      setMeta(m as TrackerMeta);
      setTables(ts as { table_key: string; name: string }[]);
      setTable(loadedTable);
      setEntries((e as Entry[]).slice().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
      setError(null);

      // A second pass, after the table's own fields are known: one fetch
      // per link field's target table (same-tracker only, per TableForm's
      // own builder -- a cross-tracker target.tracker_slug isn't offered
      // there yet, but resolved here all the same if one somehow exists).
      const linkFields = loadedTable.fields.filter((f) => f.type === "link" && f.target);
      const byField: Record<string, LinkOption[]> = {};
      const labels: Record<string, string> = {};
      await Promise.all(linkFields.map(async (f) => {
        const targetSlug = f.target!.tracker_slug ?? slug;
        try {
          const targetEntries = (await customApi(`/trackers/${targetSlug}/tables/${f.target!.table_key}/entries`, token)) as Entry[];
          const targetTable = targetSlug === slug ? (ts as TableDef[]).find((ot) => ot.table_key === f.target!.table_key) : undefined;
          const options = targetEntries.map((te) => ({ id: te.id, label: entryLabel(targetTable, te) }));
          byField[f.key] = options;
          for (const o of options) labels[o.id] = o.label;
        } catch {
          byField[f.key] = []; // that target table/tracker is unreachable -- this field just offers nothing to pick, rather than breaking the whole page
        }
      }));
      setLinkOptionsByField(byField);
      setLinkLabels(labels);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load this table");
    }
  }, [slug, tableKey, token]);

  useEffect(() => {
    load();
    setEditingId(null);
    setQualFilters({});
    setNumFilters({});
  }, [load]);

  async function run(action: () => Promise<unknown>, failure: string) {
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : failure);
    }
  }

  const create = (values: Record<string, unknown>) =>
    run(() => customApi(`/trackers/${slug}/tables/${tableKey}/entries`, token, { method: "POST", body: JSON.stringify({ values }) }), "Could not add the entry");
  const save = (id: string, values: Record<string, unknown>) =>
    run(async () => {
      await customApi(`/trackers/${slug}/tables/${tableKey}/entries/${id}`, token, { method: "PATCH", body: JSON.stringify({ values }) });
      setEditingId(null);
    }, "Could not save the entry");
  const remove = (id: string) => run(() => customApi(`/trackers/${slug}/tables/${tableKey}/entries/${id}`, token, { method: "DELETE" }), "Could not delete the entry");

  async function deleteTable() {
    if (!table) return;
    if (!window.confirm(`Delete "${table.name}" and all ${entries.length} of its entries? This can't be undone.`)) return;
    try {
      await customApi(`/trackers/${slug}/tables/${tableKey}`, token, { method: "DELETE" });
      const remaining = tables.filter((t) => t.table_key !== tableKey);
      navigate(remaining.length > 0 ? `/trackers/${slug}/tables/${remaining[0]!.table_key}` : `/trackers/${slug}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the table");
    }
  }

  async function deleteTracker() {
    if (!meta) return;
    if (!window.confirm(`Delete "${meta.name}" and all of its tables and entries? This can't be undone.`)) return;
    try {
      await customApi(`/trackers/${slug}`, token, { method: "DELETE" });
      notifyPinnedTrackersChanged(); // a deleted pinned tracker must disappear from the sidebar too
      navigate("/trackers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the tracker");
    }
  }

  if (!meta || !table) return error ? <p className="text-destructive text-sm">{error}</p> : null;

  const editingEntry = entries.find((e) => e.id === editingId) ?? null;

  const qualFields = table.fields.filter((f) => QUAL_TYPES.includes(f.type));
  const numFields = table.fields.filter((f) => f.type === "number");

  const filteredEntries = entries.filter((entry) => {
    for (const f of qualFields) {
      const selected = qualFilters[f.key];
      if (selected?.size && !qualValues(f, entry.values[f.key]).some((v) => selected.has(v))) return false;
    }
    for (const f of numFields) {
      const range = numFilters[f.key];
      if (!range || (range.min === null && range.max === null)) continue;
      const v = entry.values[f.key];
      if (typeof v !== "number") return false;
      if (range.min !== null && v < range.min) return false;
      if (range.max !== null && v > range.max) return false;
    }
    return true;
  });
  const emptyMessage = entries.length > 0 && filteredEntries.length === 0 ? "No entries match the current filters." : "No entries yet.";

  return (
    <div className="max-w-3xl">
      <div className="flex items-start justify-between mb-2 gap-4">
        <div>
          <h1 className="text-2xl">{meta.name}</h1>
          {meta.description && <p className="text-sm text-muted-foreground mt-1">{meta.description}</p>}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-shrink-0">
          <Link href="/trackers" className="hover:text-foreground">All trackers</Link>
          <Link href={`/trackers/${slug}/integrations`} className="hover:text-foreground">Integrations</Link>
          <Link href={`/trackers/${slug}/edit`} className="hover:text-foreground">Edit tracker</Link>
          <button onClick={deleteTracker} className="hover:text-destructive">Delete tracker</button>
        </div>
      </div>

      <TableTabs trackerSlug={slug} tables={tables} activeKey={tableKey} />

      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          {table.description && <p className="text-sm text-muted-foreground">{table.description}</p>}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-shrink-0">
          <Link href={`/trackers/${slug}/tables/${tableKey}/edit`} className="hover:text-foreground">Edit table</Link>
          {tables.length > 1 && <button onClick={deleteTable} className="hover:text-destructive">Delete table</button>}
        </div>
      </div>

      {error && <div className="mb-4 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md px-3 py-2">{error}</div>}

      {editingEntry ? (
        // `key` forces a fresh mount per entity being edited -- EntryForm's
        // state is seeded once, in useState's lazy initializer, which only
        // ever runs on mount; without a key tied to *which* entry this is,
        // switching from "create" to "edit" (or from editing one entry to
        // another) re-rendered the SAME mounted instance with a new
        // `initial` prop that nothing ever re-read, leaving every field
        // blank instead of pre-filled.
        <EntryForm key={editingEntry.id} def={table} initial={editingEntry.values} linkOptionsByField={linkOptionsByField} submitLabel="Save" onCancel={() => setEditingId(null)} onSubmit={(v) => save(editingEntry.id, v)} />
      ) : (
        <EntryForm key="__create__" def={table} linkOptionsByField={linkOptionsByField} submitLabel="Add" onSubmit={create} />
      )}

      {(qualFields.length > 0 || numFields.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {qualFields.map((f) => (
            <QualitativeFieldFilter
              key={f.key}
              label={f.label}
              options={qualOptions(f)}
              selected={qualFilters[f.key] ?? new Set()}
              onToggle={(value) =>
                setQualFilters((prev) => {
                  const next = new Set(prev[f.key] ?? []);
                  if (next.has(value)) next.delete(value);
                  else next.add(value);
                  return { ...prev, [f.key]: next };
                })
              }
              onClear={() => setQualFilters((prev) => ({ ...prev, [f.key]: new Set() }))}
            />
          ))}
          {numFields.map((f) => {
            const bounds = numberBounds(entries, f.key);
            if (!bounds) return null; // nothing logged for this field yet -- nothing to filter
            return (
              <NumberRangeFilter
                key={f.key}
                label={f.label}
                unit={f.unit}
                bounds={bounds}
                value={numFilters[f.key] ?? { min: null, max: null }}
                onChange={(value) => setNumFilters((prev) => ({ ...prev, [f.key]: value }))}
                onClear={() => setNumFilters((prev) => ({ ...prev, [f.key]: { min: null, max: null } }))}
              />
            );
          })}
        </div>
      )}

      {renderView(table, slug, tableKey, filteredEntries, linkLabels, setEditingId, remove, emptyMessage)}
    </div>
  );
}

/** Tier A (ui_config absent/"list") is the original card list; "table"/
 * "chart" are Tier B, declarative config TrackStack itself renders --
 * see APP_INTERFACE_SPEC.md §3 and trackstack-custom's UiConfig. Entries
 * are already loaded for the list view, so table/chart reuse that same
 * fetch rather than querying again. Editing happens in the top form slot
 * (above), uniformly across all three views, rather than inline per row
 * -- a table row swapped for a wrapping form reads as broken, and a
 * chart has no row to swap in the first place. */
function renderView(table: TableDef, trackerSlug: string, tableKey: string, entries: Entry[], linkLabels: Record<string, string>, onEdit: (id: string) => void, onDelete: (id: string) => Promise<void>, emptyMessage: string) {
  const view = table.ui_config?.view ?? "list";

  if (view === "table") return <TrackerTable def={table} storageKey={`${trackerSlug}:${tableKey}`} entries={entries} linkLabels={linkLabels} onEdit={onEdit} onDelete={onDelete} emptyMessage={emptyMessage} />;
  if (view === "chart") return <TrackerChart def={table} entries={entries} emptyMessage={emptyMessage} />;

  return <TrackerList def={table} entries={entries} linkLabels={linkLabels} onEdit={onEdit} onDelete={onDelete} emptyMessage={emptyMessage} />;
}
