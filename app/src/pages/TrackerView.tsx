import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useTrackStackAuth } from "trackstack-ui";
import { Pencil, Trash2, X } from "lucide-react";
import { ApiError } from "../lib/api.js";
import { customApi, formatValue, notifyPinnedTrackersChanged, RATING_MAX, type Entry, type EntryValues, type FieldDef, type TrackerDefinition } from "../lib/customTrackers.js";
import { TrackerTable } from "../components/TrackerTable.js";
import { TrackerChart } from "../components/TrackerChart.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

const inputClass = "bg-secondary border border-border rounded-md px-3 py-2 text-sm";

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

function FieldInput({ field, value, onChange }: { field: FieldDef; value: string | boolean | string[]; onChange: (v: string | boolean | string[]) => void }) {
  const label = field.unit ? `${field.label} (${field.unit})` : field.label;

  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {label}
      </label>
    );
  }

  if (field.type === "rating") {
    const current = Number(value) || 0;
    return (
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        {label}
        <div className="flex gap-0.5" role="radiogroup" aria-label={label}>
          {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={current === n}
              title={`${n}`}
              onClick={() => onChange(current === n ? "" : String(n))}
              className={"text-lg leading-none " + (n <= current ? "text-foreground" : "text-muted-foreground/40 hover:text-muted-foreground")}
            >
              {n <= current ? "★" : "☆"}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "multi_select") {
    const selected = Array.isArray(value) ? value : [];
    return (
      <div className="flex flex-col gap-1 text-xs text-muted-foreground min-w-[160px]">
        {label}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={selected.includes(o)}
                onChange={(e) => onChange(e.target.checked ? [...selected, o] : selected.filter((s) => s !== o))}
              />
              {o}
            </label>
          ))}
        </div>
      </div>
    );
  }

  const common = { required: field.required, title: label, className: inputClass };
  if (field.type === "long_text") {
    return (
      <label className="flex flex-col gap-1 text-xs text-muted-foreground min-w-[200px] flex-1 basis-full">
        {label}
        <textarea {...common} rows={3} value={String(value)} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground min-w-[140px] flex-1">
      {label}
      {field.type === "select" ? (
        <select {...common} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">—</option>}
          {field.required && value === "" && <option value="" disabled>Choose…</option>}
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      ) : (
        <input
          {...common}
          type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"}
          step={field.type === "number" ? "any" : undefined}
          value={String(value)}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
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

function EntryRow({ def, entry }: { def: TrackerDefinition; entry: Entry }) {
  const titleField = def.fields.find((f) => f.key === def.label_field);
  const title = titleField ? String(entry.values[titleField.key] ?? "") : "";
  const rest = def.fields.filter((f) => f.key !== def.label_field && entry.values[f.key] !== undefined);
  return (
    <div className="min-w-0 flex-1">
      {title && <div className="text-sm">{title}</div>}
      <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
        {rest.map((f) => (
          <span key={f.key}>
            <span className="opacity-70">{f.label}:</span> {formatValue(f, entry.values[f.key])}
          </span>
        ))}
        {!def.date_field && <span>{new Date(entry.occurred_at).toLocaleDateString()}</span>}
      </div>
    </div>
  );
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
        <EntryForm def={def} initial={editingEntry.values} submitLabel="Save" onCancel={() => setEditingId(null)} onSubmit={(v) => save(editingEntry.id, v)} />
      ) : (
        <EntryForm def={def} submitLabel="Add" onSubmit={create} />
      )}

      {renderView(def, entries, setEditingId, remove)}
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
function renderView(def: TrackerDefinition, entries: Entry[], onEdit: (id: string) => void, onDelete: (id: string) => Promise<void>) {
  const view = def.ui_config?.view ?? "list";

  if (view === "table") return <TrackerTable def={def} entries={entries} onEdit={onEdit} onDelete={onDelete} />;
  if (view === "chart") return <TrackerChart def={def} entries={entries} />;

  return (
    <div className="bg-card border border-border rounded-lg divide-y divide-border">
      {entries.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">No entries yet.</p>}
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
          <EntryRow def={def} entry={entry} />
          <button onClick={() => onEdit(entry.id)} className="text-muted-foreground hover:text-foreground flex-shrink-0" aria-label="Edit">
            <Pencil className="h-4 w-4" />
          </button>
          <button onClick={() => onDelete(entry.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0" aria-label="Delete">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
