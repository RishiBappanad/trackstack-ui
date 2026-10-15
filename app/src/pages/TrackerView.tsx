import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useTrackStackAuth, QualitativeFieldFilter } from "trackstack-ui";
import { X } from "lucide-react";
import { ApiError } from "../lib/api.js";
import { customApi, notifyPinnedTrackersChanged, RATING_MAX, type Entry, type EntryValues, type FieldDef, type TrackerDefinition } from "../lib/customTrackers.js";
import { TrackerTable } from "../components/TrackerTable.js";
import { TrackerChart } from "../components/TrackerChart.js";
import { TrackerList } from "../components/TrackerList.js";
import { NumberRangeFilter, type NumberRange } from "../components/NumberRangeFilter.js";
import { FieldInput } from "../components/FieldInput.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

/** Form state is always strings/booleans/string-arrays (what inputs
 * produce); `toValues` converts to the typed payload the API wants. A
 * rating is kept as a string here too, same as "number" -- only the
 * input widget differs, the string<->number conversion is identical. */
type FormState = Record<string, string | boolean | string[]>;

function initialState(fields: FieldDef[], values?: EntryValues): FormState {
  const state: FormState = {};
  for (const f of fields) {
    const v = values?.[f.key];
    if (f.type === "boolean") state[f.key] = v === true;
    else if (f.type === "multi_select") state[f.key] = Array.isArray(v) ? v : [];
    else state[f.key] = v === undefined ? "" : String(v);
  }
  return state;
}

/** Empty inputs are omitted on create and sent as null on edit, which is
 * how the API clears an optional field -- multi_select's "empty" is a
 * zero-length array rather than an empty string, same rule otherwise. */
function toValues(fields: FieldDef[], state: FormState, editing: boolean): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = state[f.key];
    if (f.type === "boolean") {
      values[f.key] = raw === true;
      continue;
    }
    const empty = f.type === "multi_select" ? !Array.isArray(raw) || raw.length === 0 : raw === "" || raw === undefined;
    if (empty) {
      if (editing) values[f.key] = null;
      continue;
    }
    values[f.key] = f.type === "multi_select" ? raw : f.type === "number" || f.type === "rating" ? Number(raw) : raw;
  }
  return values;
}

/** One form for creating an entry and editing one in place -- generated
 * entirely from the tracker's field list. */
function EntryForm({ def, initial, submitLabel, onSubmit, onCancel }: {
  def: TrackerDefinition;
  initial?: EntryValues;
  submitLabel: string;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  onCancel?: () => void;
}) {
  const [state, setState] = useState<FormState>(() => initialState(def.fields, initial));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await onSubmit(toValues(def.fields, state, !!initial));
    if (!initial) setState(initialState(def.fields));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={onCancel ? "flex flex-wrap items-end gap-2 px-4 py-3" : "flex flex-wrap items-end gap-2 mb-6 bg-card border border-border rounded-lg p-4"}
    >
      {def.fields.map((f) => (
        <FieldInput key={f.key} field={f} value={state[f.key] ?? ""} onChange={(v) => setState((s) => ({ ...s, [f.key]: v }))} />
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
 * synthesized here instead of asking the tracker definition for it. */
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

export function TrackerView() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [, params] = useRoute("/trackers/:slug");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  const [def, setDef] = useState<TrackerDefinition | null>(null);
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

  const load = useCallback(async () => {
    try {
      const [d, e] = await Promise.all([customApi(`/trackers/${slug}`, token), customApi(`/trackers/${slug}/entries`, token)]);
      setDef(d as TrackerDefinition);
      setEntries((e as Entry[]).slice().sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)));
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load the tracker");
    }
  }, [slug, token]);

  useEffect(() => {
    load();
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
    run(() => customApi(`/trackers/${slug}/entries`, token, { method: "POST", body: JSON.stringify({ values }) }), "Could not add the entry");
  const save = (id: string, values: Record<string, unknown>) =>
    run(async () => {
      await customApi(`/trackers/${slug}/entries/${id}`, token, { method: "PATCH", body: JSON.stringify({ values }) });
      setEditingId(null);
    }, "Could not save the entry");
  const remove = (id: string) => run(() => customApi(`/trackers/${slug}/entries/${id}`, token, { method: "DELETE" }), "Could not delete the entry");

  async function deleteTracker() {
    if (!def) return;
    if (!window.confirm(`Delete "${def.name}" and all ${entries.length} of its entries? This can't be undone.`)) return;
    try {
      await customApi(`/trackers/${slug}`, token, { method: "DELETE" });
      notifyPinnedTrackersChanged(); // a deleted pinned tracker must disappear from the sidebar too
      navigate("/trackers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the tracker");
    }
  }

  if (!def) return error ? <p className="text-destructive text-sm">{error}</p> : null;

  const editingEntry = entries.find((e) => e.id === editingId) ?? null;

  const qualFields = def.fields.filter((f) => QUAL_TYPES.includes(f.type));
  const numFields = def.fields.filter((f) => f.type === "number");

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
      <div className="flex items-start justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl">{def.name}</h1>
          {def.description && <p className="text-sm text-muted-foreground mt-1">{def.description}</p>}
        </div>
        <div className="flex items-center gap-3 text-sm text-muted-foreground flex-shrink-0">
          <Link href="/trackers" className="hover:text-foreground">All trackers</Link>
          <Link href={`/trackers/${slug}/edit`} className="hover:text-foreground">Edit</Link>
          <button onClick={deleteTracker} className="hover:text-destructive">Delete</button>
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
        // blank instead of pre-filled. Found 2026-10-10 (table view's Edit
        // visibly did nothing -- same bug in every view, table just made
        // it obvious since list/chart hadn't been exercised as hard).
        <EntryForm key={editingEntry.id} def={def} initial={editingEntry.values} submitLabel="Save" onCancel={() => setEditingId(null)} onSubmit={(v) => save(editingEntry.id, v)} />
      ) : (
        <EntryForm key="__create__" def={def} submitLabel="Add" onSubmit={create} />
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

      {renderView(def, filteredEntries, setEditingId, remove, emptyMessage)}
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
function renderView(def: TrackerDefinition, entries: Entry[], onEdit: (id: string) => void, onDelete: (id: string) => Promise<void>, emptyMessage: string) {
  const view = def.ui_config?.view ?? "list";

  if (view === "table") return <TrackerTable def={def} entries={entries} onEdit={onEdit} onDelete={onDelete} emptyMessage={emptyMessage} />;
  if (view === "chart") return <TrackerChart def={def} entries={entries} emptyMessage={emptyMessage} />;

  return <TrackerList def={def} entries={entries} onEdit={onEdit} onDelete={onDelete} emptyMessage={emptyMessage} />;
}
