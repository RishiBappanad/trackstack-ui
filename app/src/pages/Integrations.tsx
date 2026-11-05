import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { useTrackStackAuth } from "trackstack-ui";
import { Plus, X } from "lucide-react";
import { ApiError } from "../lib/api.js";
import {
  customApi, INTEGRATION_TYPES, INTEGRATION_TYPE_LABELS,
  type FieldDef, type IntegrationType, type TableDef, type TrackerIntegration, type TrackerMeta,
} from "../lib/customTrackers.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";
const inputClass = "bg-secondary border border-border rounded-md px-3 py-2 text-sm";

/** One binding as edited in the form -- `config.done_field` flattened to
 * its own field, same shape-flattening TrackerBuilder's own FieldDraft
 * already does for its type-specific sub-fields. */
interface BindingDraft {
  type: IntegrationType;
  sourceTableKey: string;
  doneField: string;
  enabled: boolean;
}

function draftFromIntegration(i: TrackerIntegration): BindingDraft {
  return { type: i.type, sourceTableKey: i.source_table_key, doneField: typeof i.config.done_field === "string" ? i.config.done_field : "", enabled: i.enabled };
}

function integrationFromDraft(d: BindingDraft): TrackerIntegration {
  return {
    type: d.type,
    source_table_key: d.sourceTableKey,
    config: d.type === "todo_sync" && d.doneField ? { done_field: d.doneField } : {},
    enabled: d.enabled,
  };
}

/** Every table a tracker owns, each independently bindable to either
 * integration type (MULTI_TABLE_TRACKERS_SPEC.md's Tracker Integrations --
 * owned by the tracker, not the table, so the same type can bind to
 * several of the tracker's own tables at once). `PUT` replaces the WHOLE
 * list in one call, matching the backend's own API surface -- there's no
 * per-binding PATCH to call instead. */
export function Integrations() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [, params] = useRoute("/trackers/:slug/integrations");
  const slug = params?.slug ?? "";
  const [meta, setMeta] = useState<TrackerMeta | null>(null);
  const [tables, setTables] = useState<TableDef[]>([]);
  const [drafts, setDrafts] = useState<BindingDraft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!slug) return;
    Promise.all([
      customApi(`/trackers/${slug}`, token),
      customApi(`/trackers/${slug}/tables`, token),
      customApi(`/trackers/${slug}/integrations`, token),
    ])
      .then(([m, ts, ints]) => {
        setMeta(m as TrackerMeta);
        setTables(ts as TableDef[]);
        setDrafts((ints as TrackerIntegration[]).map(draftFromIntegration));
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load integrations"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, token]);

  function tableFor(key: string): TableDef | undefined {
    return tables.find((t) => t.table_key === key);
  }

  function booleanFields(key: string): FieldDef[] {
    return tableFor(key)?.fields.filter((f) => f.type === "boolean") ?? [];
  }

  // Mirrors the backend's own validateIntegration guardrails (definitions.ts)
  // client-side, so a binding that can't be enabled yet shows why instead
  // of just rejecting the save with a 400 after the fact.
  function calendarEligible(key: string): boolean {
    return !!tableFor(key)?.date_field;
  }

  function updateDraft(i: number, patch: Partial<BindingDraft>) {
    setDrafts((prev) => prev.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
    setSaved(false);
  }

  function addBinding() {
    const firstTable = tables[0];
    if (!firstTable) return;
    setDrafts((prev) => [...prev, { type: "calendar_push", sourceTableKey: firstTable.table_key, doneField: "", enabled: false }]);
    setSaved(false);
  }

  function removeBinding(i: number) {
    setDrafts((prev) => prev.filter((_, idx) => idx !== i));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const result = await customApi(`/trackers/${slug}/integrations`, token, { method: "PUT", body: JSON.stringify(drafts.map(integrationFromDraft)) });
      setDrafts((result as TrackerIntegration[]).map(draftFromIntegration));
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save integrations");
    } finally {
      setSaving(false);
    }
  }

  if (!meta) return error ? <p className="text-destructive text-sm">{error}</p> : null;

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-2xl">{meta.name} — Integrations</h1>
        <Link href={`/trackers/${slug}`} className="text-sm text-muted-foreground hover:text-foreground">Back to tracker</Link>
      </div>
      <p className="text-sm text-muted-foreground mb-6">Every table can push to the calendar and sync to your todos, independently of any other table.</p>

      {error && <div className="mb-4 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md px-3 py-2">{error}</div>}

      <div className="grid gap-3 mb-4">
        {drafts.length === 0 && <p className="text-sm text-muted-foreground">No integrations yet.</p>}
        {drafts.map((d, i) => {
          const eligible = d.type === "calendar_push" ? calendarEligible(d.sourceTableKey) : booleanFields(d.sourceTableKey).length > 0;
          const hint = eligible
            ? undefined
            : d.type === "calendar_push"
              ? "This table needs a date field (set one under its own “How other apps and AI read it”) before it can push to the calendar."
              : "This table needs a Yes/No field to use as the done field before it can sync to todos.";
          return (
            <div key={i} className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg p-3">
              <select value={d.type} onChange={(e) => updateDraft(i, { type: e.target.value as IntegrationType, doneField: "" })} className={inputClass}>
                {INTEGRATION_TYPES.map((t) => (
                  <option key={t} value={t}>{INTEGRATION_TYPE_LABELS[t]}</option>
                ))}
              </select>
              <select value={d.sourceTableKey} onChange={(e) => updateDraft(i, { sourceTableKey: e.target.value, doneField: "" })} className={inputClass}>
                {tables.map((t) => (
                  <option key={t.table_key} value={t.table_key}>{t.name}</option>
                ))}
              </select>
              {d.type === "todo_sync" && (
                <select value={d.doneField} onChange={(e) => updateDraft(i, { doneField: e.target.value })} className={inputClass} title="Which Yes/No field on this table marks a row done">
                  <option value="">Done field…</option>
                  {booleanFields(d.sourceTableKey).map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
              )}
              <label className="flex items-center gap-1.5 text-sm text-muted-foreground ml-auto" title={hint}>
                <input
                  type="checkbox"
                  checked={d.enabled}
                  disabled={!eligible || (d.type === "todo_sync" && !d.doneField)}
                  onChange={(e) => updateDraft(i, { enabled: e.target.checked })}
                />
                Enabled
              </label>
              <button type="button" onClick={() => removeBinding(i)} className="text-muted-foreground hover:text-destructive" aria-label="Remove binding">
                <X className="h-4 w-4" />
              </button>
              {hint && <p className="text-xs text-muted-foreground basis-full">{hint}</p>}
            </div>
          );
        })}
      </div>

      <button type="button" onClick={addBinding} disabled={tables.length === 0} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6 disabled:opacity-50">
        <Plus className="h-4 w-4" /> Add binding
      </button>

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving} className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
          Save
        </button>
        {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
      </div>
    </div>
  );
}
