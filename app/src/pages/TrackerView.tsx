import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useTrackStackAuth } from "trackstack-ui";
import { Pencil, Trash2, X } from "lucide-react";
import { ApiError } from "../lib/api.js";
import { customApi, formatValue, type Entry, type EntryValues, type FieldDef, type TrackerDefinition } from "../lib/customTrackers.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

const inputClass = "bg-secondary border border-border rounded-md px-3 py-2 text-sm";

/** Form state is always strings/booleans (what inputs produce); `toValues`
 * converts to the typed payload the API wants. */
type FormState = Record<string, string | boolean>;

function initialState(fields: FieldDef[], values?: EntryValues): FormState {
  const state: FormState = {};
  for (const f of fields) {
    const v = values?.[f.key];
    state[f.key] = f.type === "boolean" ? v === true : v === undefined ? "" : String(v);
  }
  return state;
}

/** Empty inputs are omitted on create and sent as null on edit, which is
 * how the API clears an optional field. */
function toValues(fields: FieldDef[], state: FormState, editing: boolean): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  for (const f of fields) {
    const raw = state[f.key];
    if (f.type === "boolean") values[f.key] = raw === true;
    else if (raw === "" || raw === undefined) {
      if (editing) values[f.key] = null;
    } else values[f.key] = f.type === "number" ? Number(raw) : raw;
  }
  return values;
}

function FieldInput({ field, value, onChange }: { field: FieldDef; value: string | boolean; onChange: (v: string | boolean) => void }) {
  const label = field.unit ? `${field.label} (${field.unit})` : field.label;
  if (field.type === "boolean") {
    return (
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} /> {label}
      </label>
    );
  }
  const common = { required: field.required, title: label, className: inputClass };
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
      navigate("/trackers");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete the tracker");
    }
  }

  if (!def) return error ? <p className="text-destructive text-sm">{error}</p> : null;

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

      <EntryForm def={def} submitLabel="Add" onSubmit={create} />

      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {entries.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">No entries yet.</p>}
        {entries.map((entry) =>
          editingId === entry.id ? (
            <EntryForm key={entry.id} def={def} initial={entry.values} submitLabel="Save" onCancel={() => setEditingId(null)} onSubmit={(v) => save(entry.id, v)} />
          ) : (
            <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
              <EntryRow def={def} entry={entry} />
              <button onClick={() => setEditingId(entry.id)} className="text-muted-foreground hover:text-foreground flex-shrink-0" aria-label="Edit">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => remove(entry.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0" aria-label="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
