import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useTrackStackAuth } from "trackstack-ui";
import { ChevronDown, ChevronUp, GripVertical, Plus, X } from "lucide-react";
import { ApiError } from "../lib/api.js";
import {
  ACCENT_HEX, ACCENT_NAMES, FIELD_TYPES, FIELD_TYPE_LABELS, ICON_COMPONENTS, ICON_NAMES, ROLLUP_AGGREGATES, ROLLUP_AGGREGATE_LABELS, VIEW_TYPES, customApi, notifyPinnedTrackersChanged, slugify, uniqueSlug,
  type AccentName, type Entry, type EntryValues, type FieldDef, type FieldType, type IconName, type RollupAggregate, type TableDef, type TrackerMeta, type ViewType,
} from "../lib/customTrackers.js";
import { FieldInput } from "../components/FieldInput.js";
import { TrackerTable } from "../components/TrackerTable.js";
import { TrackerChart } from "../components/TrackerChart.js";
import { TrackerList } from "../components/TrackerList.js";
import { TRACKER_TEMPLATES, type TrackerTemplate } from "../lib/trackerTemplates.js";

const SAMPLE_ROWS = 4;

/** Fabricated entries for Display's live preview -- enough variety (4
 * rows, cycling through each select/multi_select field's own options,
 * staggered dates, varied numbers) that a Chart shows multiple bars and
 * a Table/List reads like it already has data, without the table needing
 * to exist yet. Fields with no key (a brand new, not-yet-labeled draft)
 * are left out -- nothing meaningful to fabricate for a field that isn't
 * done being defined, same reasoning as the entry-form preview above
 * skipping nothing but rendering blanks as-is; here an incomplete field
 * would also collide on the same empty key across rows, so it's excluded
 * instead of risking that. */
function sampleEntries(fields: FieldDef[]): Entry[] {
  const usable = fields.filter((f) => f.key);
  return Array.from({ length: SAMPLE_ROWS }, (_, i) => {
    const values: EntryValues = {};
    for (const f of usable) {
      if (f.type === "boolean") values[f.key] = i % 2 === 0;
      else if (f.type === "number") values[f.key] = [12, 28, 19, 35][i % 4]!;
      else if (f.type === "rating") values[f.key] = (i % 5) + 1;
      else if (f.type === "select") values[f.key] = f.options?.length ? f.options[i % f.options.length]! : "Sample";
      else if (f.type === "multi_select") values[f.key] = f.options?.length ? [f.options[i % f.options.length]!] : [];
      else if (f.type === "date") values[f.key] = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      else if (f.type === "long_text") values[f.key] = `Sample notes for entry ${i + 1}.`;
      // link/lookup/rollup have no real target entries to sample from in
      // a not-yet-saved preview -- link gets a placeholder label (its own
      // FieldInput already renders as a disabled picker regardless, this
      // only affects the Table/List/Chart preview below it); lookup/
      // rollup get a plausible number, since that's what they usually are.
      else if (f.type === "link") values[f.key] = f.multiple ? [`Linked ${i + 1}`] : `Linked ${i + 1}`;
      else if (f.type === "lookup" || f.type === "rollup") values[f.key] = [12, 28, 19, 35][i % 4]!;
      else values[f.key] = `Sample ${i + 1}`;
    }
    const occurredAt = new Date(Date.now() - i * 86400000).toISOString();
    return { id: `preview-${i}`, tracker: "preview", values, occurred_at: occurredAt, updated_at: occurredAt };
  });
}

const VIEW_LABELS: Record<ViewType, string> = { list: "List", table: "Table", chart: "Chart" };

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

/** A field row as edited in the form: `optionsText` is the comma-separated
 * string a person types; `locked` marks a field that already exists on the
 * server (its key and type can't change, and it can't be removed --
 * entries already store values under it). */
interface FieldDraft {
  key: string;
  label: string;
  type: FieldType;
  unit: string;
  optionsText: string;
  required: boolean;
  locked: boolean;
  // Link fields only.
  targetTableKey: string;
  multiple: boolean;
  // Lookup/Rollup fields only. `through` is another draft's `key` (a link
  // field on this same table); `targetField` is a field key on THAT link's
  // target table.
  through: string;
  targetField: string;
  aggregate: RollupAggregate;
}

const inputClass = "bg-secondary border border-border rounded-md px-3 py-2 text-sm";

/** `locked: false` for a template's fields -- unlike a saved field, a
 * template's is just a prefilled starting point, as editable/removable
 * as one typed in by hand (nothing's actually saved yet). */
function draftFromField(f: FieldDef, locked = true): FieldDraft {
  return {
    key: f.key, label: f.label, type: f.type, unit: f.unit ?? "", optionsText: (f.options ?? []).join(", "), required: !!f.required, locked,
    targetTableKey: f.target?.table_key ?? "", multiple: !!f.multiple,
    through: f.through ?? "", targetField: f.target_field ?? "", aggregate: f.aggregate ?? "sum",
  };
}

function fieldFromDraft(d: FieldDraft): FieldDef {
  const field: FieldDef = { key: d.key, label: d.label.trim(), type: d.type };
  if (d.required) field.required = true;
  if (d.type === "number" && d.unit.trim()) field.unit = d.unit.trim();
  if (d.type === "select" || d.type === "multi_select") field.options = d.optionsText.split(",").map((o) => o.trim()).filter(Boolean);
  if (d.type === "link") {
    field.target = { table_key: d.targetTableKey };
    // Unlike `required` elsewhere in this function, the backend's own
    // validateLinkField requires `multiple` to be an actual boolean on
    // every link field, not omitted-and-defaulted -- found live, via the
    // real "fields[1].multiple must be a boolean" 400 this produced when
    // this line only set it for `true`.
    field.multiple = d.multiple;
  }
  if (d.type === "lookup") {
    field.through = d.through;
    field.target_field = d.targetField;
  }
  if (d.type === "rollup") {
    field.through = d.through;
    field.target_field = d.targetField;
    field.aggregate = d.aggregate;
  }
  return field;
}

// ── Tracker (identity/sidebar) ──────────────────────────────────────────
//
// MULTI_TABLE_TRACKERS_SPEC.md's split: a tracker is just its own name/
// description/icon/pinned -- no fields, no display config, no roles.
// Those all moved to the TABLE level (TableForm, below), addable
// independently of tracker creation.

/** One form for both creating a tracker and editing an existing one's
 * identity. `template` (create-only) prefills name/icon the same way
 * `existing` would, just from a starter template instead of a saved
 * tracker -- its fields/roles/display go to TableForm instead, once this
 * step is saved. */
function TrackerMetaForm({ existing, template, onSaved }: { existing?: TrackerMeta; template?: TrackerTemplate; onSaved: (slug: string) => void }) {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [name, setName] = useState(existing?.name ?? template?.name ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? (template ? slugify(template.name) : ""));
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [icon, setIcon] = useState<IconName | "">(existing?.icon ?? template?.icon ?? "");
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const body = { name: name.trim(), description: description.trim(), icon: icon || null, pinned };
    try {
      if (existing) {
        await customApi(`/trackers/${existing.slug}`, token, { method: "PATCH", body: JSON.stringify(body) });
        onSaved(existing.slug);
      } else {
        await customApi("/trackers", token, { method: "POST", body: JSON.stringify({ ...body, slug }) });
        onSaved(slug);
      }
      // Whether pinned itself changed, or just the name/icon of an
      // already-pinned tracker, the sidebar's cheap way to notice is to
      // just always ask it to recheck rather than tracking what changed.
      notifyPinnedTrackersChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the tracker");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-2xl grid gap-6">
      {error && <div className="bg-destructive/10 border border-destructive text-destructive text-sm rounded-md px-3 py-2">{error}</div>}

      <section className="grid gap-3">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (!existing && !slugTouched) setSlug(slugify(e.target.value));
          }}
          placeholder="Tracker name (e.g. Runs)"
          required
          autoFocus={!existing}
          className={inputClass}
        />
        {!existing && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            ID
            <input
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value);
                setSlugTouched(true);
              }}
              required
              className={inputClass + " py-1 flex-1"}
            />
            <span>fixed once created</span>
          </label>
        )}
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this for? (optional)" className={inputClass} />
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg">Sidebar</h2>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
          {ICON_NAMES.map((n) => {
            const Icon = ICON_COMPONENTS[n];
            const selected = icon === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={selected}
                title={n}
                onClick={() => {
                  // Clearing the icon while pinned would be rejected
                  // server-side (a pinned tracker must have one) -- unpin
                  // here too, rather than surfacing that as a save error.
                  if (selected) setPinned(false);
                  setIcon(selected ? "" : n);
                }}
                className={
                  "w-9 h-9 rounded-md flex items-center justify-center border " +
                  (selected ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground")
                }
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pinned} disabled={!icon} onChange={(e) => setPinned(e.target.checked)} />
          Pin to the sidebar
        </label>
        {!icon && <p className="text-xs text-muted-foreground">Pick an icon to pin this tracker to the sidebar.</p>}
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving} className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
          {existing ? "Save changes" : "Continue"}
        </button>
        <Link href={existing ? `/trackers/${existing.slug}` : "/trackers"} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
      </div>
    </form>
  );
}

// ── Table (one object type within a tracker) ────────────────────────────
//
// Everything a tracker used to hold directly before the multi-table
// split: fields, their Event Contract role mapping (amount/category/
// label/date), and Display (Tier A/B view/accent/columns) -- now
// addressable per table, independently of which tracker it lives in or
// what else that tracker holds. Used both for a brand new tracker's
// first table (via `prefill`, carrying a template's table-shaped fields
// forward from NewTracker's first step) and for adding/editing any later
// table on an existing tracker (via `existing`).

/** The table-shaped half of a TrackerTemplate -- what NewTracker's first
 * step hands to TableForm for its first table, once the tracker itself
 * (name/icon) is saved. */
interface TablePrefill {
  tableKey?: string;
  name?: string;
  fields: FieldDef[];
  amountField?: string;
  amountMeaning?: string;
  summable?: boolean;
  categoryField?: string;
  labelField?: string;
  dateField?: string;
  view?: ViewType;
  accent?: AccentName;
}

function TableForm({ trackerSlug, existing, prefill, onSaved }: {
  trackerSlug: string;
  existing?: TableDef & { table_key: string };
  prefill?: TablePrefill;
  onSaved: (tableKey: string) => void;
}) {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [name, setName] = useState(existing?.name ?? prefill?.name ?? "");
  const [tableKey, setTableKey] = useState(existing?.table_key ?? (prefill?.tableKey ? slugify(prefill.tableKey) : "primary"));
  const [keyTouched, setKeyTouched] = useState(false);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [background, setBackground] = useState(existing?.background ?? "");
  const [drafts, setDrafts] = useState<FieldDraft[]>(
    existing ? existing.fields.map((f) => draftFromField(f)) : prefill ? prefill.fields.map((f) => draftFromField(f, false)) : [],
  );
  const [amountField, setAmountField] = useState(existing?.amount_field ?? prefill?.amountField ?? "");
  const [amountMeaning, setAmountMeaning] = useState(existing?.amount_meaning ?? prefill?.amountMeaning ?? "");
  const [summable, setSummable] = useState(existing?.summable ?? prefill?.summable ?? true);
  const [categoryField, setCategoryField] = useState(existing?.category_field ?? prefill?.categoryField ?? "");
  const [labelField, setLabelField] = useState(existing?.label_field ?? prefill?.labelField ?? "");
  const [dateField, setDateField] = useState(existing?.date_field ?? prefill?.dateField ?? "");
  const [view, setView] = useState<ViewType>(existing?.ui_config?.view ?? prefill?.view ?? "list");
  const [accent, setAccent] = useState<AccentName | "">(existing?.ui_config?.accent ?? prefill?.accent ?? "");
  const [columns, setColumns] = useState<string[]>(existing?.ui_config?.columns ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // This tracker's OTHER tables -- a link field's only valid targets for
  // now (cross-tracker targets are a later, "advanced" step the backend
  // already supports but this builder doesn't expose yet). Fetched once;
  // listTables already returns each table's full field list, which is
  // also what a lookup/rollup's target-field picker needs, so one fetch
  // covers both.
  const [otherTables, setOtherTables] = useState<TableDef[]>([]);
  useEffect(() => {
    customApi(`/trackers/${trackerSlug}/tables`, token)
      .then((ts) => setOtherTables(ts as TableDef[]))
      .catch(() => {}); // link/lookup/rollup fields just show no targets yet; every other section of this form still works
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackerSlug, token]);

  const fields = drafts.map(fieldFromDraft);
  const ofType = (...types: FieldType[]) => fields.filter((f) => types.includes(f.type) && f.label);

  // Every valid link target, INCLUDING this table itself (self-links are
  // allowed -- a Tasks table's own "subtasks" field). The server's own
  // copy of this table (if any) is replaced with the live draft so a
  // field just added above is immediately linkable/rollup-able without
  // saving first; a brand new table that isn't in otherTables yet gets a
  // synthetic entry built the same way.
  const liveSelf: TableDef = { table_key: tableKey || "primary", name: name || "This table", description, background, fields, amount_field: null, amount_meaning: null, summable: false, category_field: null, label_field: null, date_field: null, ui_config: null };
  const linkableTables: TableDef[] = otherTables.some((t) => t.table_key === liveSelf.table_key)
    ? otherTables.map((t) => (t.table_key === liveSelf.table_key ? liveSelf : t))
    : [...otherTables, liveSelf];

  /** The target table of lookup/rollup draft `d`'s chosen `through` link
   * field -- resolved from the CURRENT drafts (not the saved fields), so
   * picking a link's target and then adding a lookup through it works in
   * one pass without saving in between. */
  function throughTargetFields(through: string): FieldDef[] {
    const linkField = drafts.find((d) => d.key === through && d.type === "link");
    if (!linkField?.targetTableKey) return [];
    return linkableTables.find((t) => t.table_key === linkField.targetTableKey)?.fields ?? [];
  }

  // Live preview of the entry form -- reuses FieldInput, the same
  // component the real "Add entry" form renders, so this is a faithful
  // 1:1 preview rather than a second guess at the real UI. Keyed off the
  // CURRENT draft (not a saved field list), so editing a label, type, or
  // options updates it immediately.
  const [previewState, setPreviewState] = useState<Record<string, string | boolean | string[]>>({});
  function previewValue(f: FieldDef): string | boolean | string[] {
    const v = previewState[f.key];
    if (v !== undefined) return v;
    return f.type === "boolean" ? false : f.type === "multi_select" ? [] : "";
  }

  function updateDraft(index: number, patch: Partial<FieldDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function addField() {
    setDrafts((prev) => [...prev, { key: "", label: "", type: "text", unit: "", optionsText: "", required: false, locked: false, targetTableKey: "", multiple: false, through: "", targetField: "", aggregate: "sum" }]);
  }

  const [dragIndex, setDragIndex] = useState<number | null>(null);

  function moveDraft(from: number, to: number) {
    if (to < 0 || to >= drafts.length || from === to) return;
    setDrafts((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });
  }

  // A new field's key follows its label (until saved) so the person never
  // has to think about keys; a saved field's key is fixed.
  function relabel(index: number, label: string) {
    const d = drafts[index]!;
    if (d.locked) return updateDraft(index, { label });
    const taken = drafts.filter((_, i) => i !== index).map((x) => x.key);
    updateDraft(index, { label, key: uniqueSlug(label, taken) });
  }

  // Deleting a field that another role still points at would leave a
  // dangling role, so clear any role that referenced it.
  function removeDraft(index: number) {
    const key = drafts[index]!.key;
    setDrafts((prev) => prev.filter((_, i) => i !== index));
    if (amountField === key) setAmountField("");
    if (categoryField === key) setCategoryField("");
    if (labelField === key) setLabelField("");
    if (dateField === key) setDateField("");
  }

  const chartEligible = !!amountField && summable;
  const previewView = view === "chart" && !chartEligible ? "list" : view;
  const previewFields = fields.filter((f) => f.key);
  const previewDef: TableDef = {
    table_key: "__preview__",
    name: name || "Preview",
    description,
    background,
    fields: previewFields,
    amount_field: amountField || null,
    amount_meaning: amountField ? amountMeaning.trim() : null,
    summable: amountField ? summable : false,
    category_field: categoryField || null,
    label_field: labelField || null,
    date_field: dateField || null,
    ui_config: { view: previewView, accent: accent || null, columns: previewView === "table" ? columns : [] },
  };
  const previewEntries = sampleEntries(previewFields);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    const effectiveView = view === "chart" && !chartEligible ? "list" : view;
    const uiConfig = effectiveView !== "list" || accent || columns.length ? { view: effectiveView, accent: accent || null, columns: effectiveView === "table" ? columns : [] } : null;
    const body = {
      name: name.trim(),
      description: description.trim(),
      background: background.trim(),
      fields,
      amount_field: amountField || null,
      amount_meaning: amountField ? amountMeaning.trim() : null,
      summable: amountField ? summable : false,
      category_field: categoryField || null,
      label_field: labelField || null,
      date_field: dateField || null,
      ui_config: uiConfig,
    };
    try {
      if (existing) {
        await customApi(`/trackers/${trackerSlug}/tables/${existing.table_key}`, token, { method: "PATCH", body: JSON.stringify(body) });
        onSaved(existing.table_key);
      } else {
        await customApi(`/trackers/${trackerSlug}/tables`, token, { method: "POST", body: JSON.stringify({ ...body, table_key: tableKey }) });
        onSaved(tableKey);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save the table");
      setSaving(false);
    }
  }

  const roleSelect = (label: string, value: string, set: (v: string) => void, options: FieldDef[], hint: string) => (
    <label className="flex flex-col gap-1 text-sm">
      <span>{label}</span>
      <select value={value} onChange={(e) => set(e.target.value)} className={inputClass}>
        <option value="">None</option>
        {options.map((f) => (
          <option key={f.key} value={f.key}>{f.label}</option>
        ))}
      </select>
      <span className="text-xs text-muted-foreground">{hint}</span>
    </label>
  );

  return (
    <form onSubmit={submit} className="max-w-2xl grid gap-6">
      {error && <div className="bg-destructive/10 border border-destructive text-destructive text-sm rounded-md px-3 py-2">{error}</div>}

      <section className="grid gap-3">
        <input value={name} onChange={(e) => {
          setName(e.target.value);
          if (!existing && !keyTouched) setTableKey(slugify(e.target.value) || "primary");
        }} placeholder="Table name (e.g. Log)" required autoFocus={!existing} className={inputClass} />
        {!existing && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            ID
            <input value={tableKey} onChange={(e) => { setTableKey(e.target.value); setKeyTouched(true); }} required className={inputClass + " py-1 flex-1"} />
            <span>fixed once created</span>
          </label>
        )}
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's stored here? (optional)" className={inputClass} />
        <label className="grid gap-1 text-sm">
          <span>Context for AI assistants (optional)</span>
          <textarea
            value={background}
            onChange={(e) => setBackground(e.target.value)}
            rows={3}
            placeholder="Anything that helps an LLM read this data correctly, e.g. “Distances are in km; effort 'hard' means a race pace.”"
            className={inputClass}
          />
        </label>
      </section>

      <section className="grid gap-2">
        <h2 className="text-lg">Fields</h2>
        {drafts.length === 0 && <p className="text-sm text-muted-foreground">Add at least one field.</p>}
        {drafts.map((d, i) => (
          <div
            key={i}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragIndex !== null) moveDraft(dragIndex, i);
              setDragIndex(null);
            }}
            className={"flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg p-3 " + (dragIndex === i ? "opacity-50" : "")}
          >
            <button
              type="button"
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragEnd={() => setDragIndex(null)}
              className="cursor-grab text-muted-foreground hover:text-foreground flex-shrink-0"
              aria-label="Drag to reorder"
              title="Drag to reorder"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <div className="flex flex-col flex-shrink-0">
              <button type="button" onClick={() => moveDraft(i, i - 1)} disabled={i === 0} aria-label="Move up" className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:hover:text-muted-foreground">
                <ChevronUp className="h-3 w-3" />
              </button>
              <button type="button" onClick={() => moveDraft(i, i + 1)} disabled={i === drafts.length - 1} aria-label="Move down" className="text-muted-foreground hover:text-foreground disabled:opacity-20 disabled:hover:text-muted-foreground">
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            <input value={d.label} onChange={(e) => relabel(i, e.target.value)} placeholder="Field name" required className={inputClass + " flex-1 min-w-[140px]"} />
            <select
              value={d.type}
              disabled={d.locked}
              onChange={(e) => updateDraft(i, { type: e.target.value as FieldType })}
              className={inputClass}
              title={d.locked ? "A saved field's type can't change" : "Field type"}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{FIELD_TYPE_LABELS[t]}</option>
              ))}
            </select>
            {d.type === "number" && <input value={d.unit} onChange={(e) => updateDraft(i, { unit: e.target.value })} placeholder="Unit (km, min…)" className={inputClass + " w-32"} />}
            {(d.type === "select" || d.type === "multi_select") && (
              <input value={d.optionsText} onChange={(e) => updateDraft(i, { optionsText: e.target.value })} placeholder="Options, comma separated" required className={inputClass + " flex-1 min-w-[160px]"} />
            )}
            {d.type === "link" && (
              <>
                <select value={d.targetTableKey} disabled={d.locked} onChange={(e) => updateDraft(i, { targetTableKey: e.target.value })} required className={inputClass} title={d.locked ? "A saved field's link target can't change" : "Which table this links to"}>
                  <option value="" disabled>Link to…</option>
                  {linkableTables.map((t) => (
                    <option key={t.table_key} value={t.table_key}>{t.table_key === liveSelf.table_key ? `${t.name} (this table)` : t.name}</option>
                  ))}
                </select>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">
                  <input type="checkbox" checked={d.multiple} disabled={d.locked} onChange={(e) => updateDraft(i, { multiple: e.target.checked })} /> Multiple
                </label>
              </>
            )}
            {(d.type === "lookup" || d.type === "rollup") && (
              <>
                <select value={d.through} disabled={d.locked} onChange={(e) => updateDraft(i, { through: e.target.value, targetField: "" })} required className={inputClass} title="Which of this table's own link fields to read through">
                  <option value="" disabled>Via link…</option>
                  {drafts.filter((other) => other.type === "link" && other.key && other.key !== d.key).map((other) => (
                    <option key={other.key} value={other.key}>{other.label}</option>
                  ))}
                </select>
                <select value={d.targetField} disabled={d.locked || !d.through} onChange={(e) => updateDraft(i, { targetField: e.target.value })} required className={inputClass} title="Which field on the linked table to read">
                  <option value="" disabled>Field…</option>
                  {throughTargetFields(d.through).filter((f) => f.key).map((f) => (
                    <option key={f.key} value={f.key}>{f.label}</option>
                  ))}
                </select>
                {d.type === "rollup" && (
                  <select value={d.aggregate} disabled={d.locked} onChange={(e) => updateDraft(i, { aggregate: e.target.value as RollupAggregate })} className={inputClass} title="How to combine multiple linked entries' values">
                    {ROLLUP_AGGREGATES.map((a) => (
                      <option key={a} value={a}>{ROLLUP_AGGREGATE_LABELS[a]}</option>
                    ))}
                  </select>
                )}
              </>
            )}
            {d.type !== "lookup" && d.type !== "rollup" && (
              <label className="flex items-center gap-1 text-xs text-muted-foreground">
                <input type="checkbox" checked={d.required} onChange={(e) => updateDraft(i, { required: e.target.checked })} /> Required
              </label>
            )}
            {!d.locked && (
              <button type="button" onClick={() => removeDraft(i)} className="text-muted-foreground hover:text-destructive" aria-label="Remove field">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={addField} className="self-start flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Plus className="h-4 w-4" /> Add field
        </button>
        {existing && <p className="text-xs text-muted-foreground">Saved fields can be renamed but not removed or retyped — existing entries already use them.</p>}
      </section>

      {fields.length > 0 && (
        <section className="grid gap-2">
          <h2 className="text-lg">Preview</h2>
          <p className="text-sm text-muted-foreground">What adding an entry will look like. Updates live as you edit fields above.</p>
          {/* `disabled` on the fieldset -- not just the button -- excludes every
              descendant control from HTML5 constraint validation AND from this
              form's own submission (per spec, a disabled control participates
              in neither). Without it, a REQUIRED preview field (e.g. a
              template's required Choice field) blocks the real "Create table"
              submit with the browser's own "Please select an item" tooltip,
              even though this preview can never be filled in or submitted --
              found by actually clicking through this in a browser, not by
              reading the code. `className="contents"` keeps the fieldset from
              adding its own box to the existing flex-wrap layout. */}
          <fieldset disabled className="contents">
            <div className="flex flex-wrap items-end gap-2 bg-card border border-border rounded-lg p-4">
              {fields.filter((f) => f.type !== "lookup" && f.type !== "rollup").map((f, i) => (
                <FieldInput key={i} field={f} value={previewValue(f)} onChange={(v) => setPreviewState((s) => ({ ...s, [f.key]: v }))} />
              ))}
              <button type="button" title="Preview only — save the table to actually add entries" className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium opacity-50 cursor-not-allowed">
                Add
              </button>
            </div>
          </fieldset>
        </section>
      )}

      <section className="grid gap-3">
        <h2 className="text-lg">How other apps and AI read it</h2>
        <p className="text-sm text-muted-foreground">
          Every tracker shares one event format. Say which of your fields plays each role (all optional).
        </p>
        <div className="grid sm:grid-cols-2 gap-3">
          {roleSelect("Amount", amountField, setAmountField, ofType("number"), "A number that can be totalled or charted (spend, minutes, reps).")}
          {roleSelect("Category", categoryField, setCategoryField, ofType("select", "text"), "Groups entries in summaries.")}
          {roleSelect("Title", labelField, setLabelField, ofType("text"), "The short name shown for an entry.")}
          {roleSelect("Date", dateField, setDateField, ofType("date"), "When it happened. Otherwise, when you logged it.")}
        </div>
        {amountField && (
          <div className="grid gap-2">
            <input value={amountMeaning} onChange={(e) => setAmountMeaning(e.target.value)} placeholder="What does the amount mean? (optional)" className={inputClass} />
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={summable} onChange={(e) => setSummable(e.target.checked)} />
              Safe to add up (untick for ratings or scores)
            </label>
          </div>
        )}
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg">Display</h2>
        <p className="text-sm text-muted-foreground">How entries show on this table's own page.</p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="View">
          {VIEW_TYPES.map((v) => {
            const disabled = v === "chart" && !chartEligible;
            return (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={view === v}
                disabled={disabled}
                title={disabled ? "Needs a summable amount field (set one under “How other apps and AI read it”)" : undefined}
                onClick={() => setView(v)}
                className={
                  "px-3 py-1.5 rounded-md text-sm border " +
                  (view === v ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:hover:text-muted-foreground")
                }
              >
                {VIEW_LABELS[v]}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Accent color">
          <button
            type="button"
            role="radio"
            aria-checked={accent === ""}
            title="Default"
            onClick={() => setAccent("")}
            className={"w-7 h-7 rounded-full border-2 bg-primary " + (accent === "" ? "border-foreground" : "border-transparent")}
          />
          {ACCENT_NAMES.map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={accent === n}
              title={n}
              onClick={() => setAccent(accent === n ? "" : n)}
              style={{ backgroundColor: ACCENT_HEX[n] }}
              className={"w-7 h-7 rounded-full border-2 " + (accent === n ? "border-foreground" : "border-transparent")}
            />
          ))}
        </div>

        {view === "table" && fields.length > 0 && (
          <div className="grid gap-1">
            <span className="text-sm">Table columns</span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {fields.map((f) => (
                <label key={f.key} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={columns.includes(f.key)}
                    onChange={(e) => setColumns((prev) => (e.target.checked ? [...prev, f.key] : prev.filter((k) => k !== f.key)))}
                  />
                  {f.label}
                </label>
              ))}
            </div>
            <span className="text-xs text-muted-foreground">Leave none checked to show every field.</span>
          </div>
        )}

        {previewFields.length > 0 && (
          <div className="grid gap-1 mt-2">
            <span className="text-sm">Preview</span>
            <p className="text-xs text-muted-foreground">Sample data, just to show the shape of this view. Updates live as you change fields or display settings above.</p>
            {previewView === "table" ? (
              <TrackerTable def={previewDef} storageKey="__preview__" entries={previewEntries} />
            ) : previewView === "chart" ? (
              <TrackerChart def={previewDef} entries={previewEntries} />
            ) : (
              <TrackerList def={previewDef} entries={previewEntries} />
            )}
          </div>
        )}
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving || drafts.length === 0} className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
          {existing ? "Save changes" : "Create table"}
        </button>
        <Link href={existing ? `/trackers/${trackerSlug}/tables/${existing.table_key}` : `/trackers/${trackerSlug}`} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
      </div>
    </form>
  );
}

/** A starter template just prefills the two-step create flow's initial
 * state (TrackerMetaForm's name/icon, then TableForm's prefill) -- never
 * submitted on its own. */
function TemplatePicker({ onPick }: { onPick: (template: TrackerTemplate | null) => void }) {
  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">Start from a template, or build one from scratch.</p>
      <div className="grid sm:grid-cols-2 gap-3 max-w-2xl">
        {TRACKER_TEMPLATES.map((t) => {
          const Icon = ICON_COMPONENTS[t.icon];
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => onPick(t)}
              className="flex items-start gap-3 text-left bg-card border border-border rounded-lg p-4 hover:border-foreground/30"
            >
              <Icon className="h-5 w-5 flex-shrink-0 mt-0.5 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-muted-foreground mt-0.5">{t.description}</div>
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onPick(null)}
          className="flex items-center justify-center text-sm text-muted-foreground hover:text-foreground bg-card border border-dashed border-border rounded-lg p-4"
        >
          Start from scratch
        </button>
      </div>
    </div>
  );
}

function tablePrefillFromTemplate(t: TrackerTemplate | null): TablePrefill {
  return {
    tableKey: "primary",
    name: "Log",
    fields: t?.fields ?? [],
    amountField: t?.amountField,
    amountMeaning: t?.amountMeaning,
    summable: t?.summable,
    categoryField: t?.categoryField,
    labelField: t?.labelField,
    dateField: t?.dateField,
    view: t?.view,
    accent: t?.accent,
  };
}

/** New tracker is a two-step wizard, matching the backend's own split:
 * step 1 creates the tracker's identity (POST /trackers, no fields at
 * all); step 2 creates its first table (POST /trackers/:slug/tables) --
 * a template prefills both steps, one right after the other, from the
 * SAME pick. */
export function NewTracker() {
  const [, navigate] = useLocation();
  const [template, setTemplate] = useState<TrackerTemplate | null | undefined>(undefined);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);

  if (template === undefined) {
    return (
      <div>
        <h1 className="text-2xl mb-6">New tracker</h1>
        <TemplatePicker onPick={setTemplate} />
      </div>
    );
  }

  if (!createdSlug) {
    return (
      <div>
        <div className="flex items-center justify-between mb-6 max-w-2xl">
          <h1 className="text-2xl">New tracker</h1>
          <button type="button" onClick={() => setTemplate(undefined)} className="text-sm text-muted-foreground hover:text-foreground">
            Choose a different template
          </button>
        </div>
        <TrackerMetaForm template={template ?? undefined} onSaved={setCreatedSlug} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl mb-6">Add its first table</h1>
      <TableForm trackerSlug={createdSlug} prefill={tablePrefillFromTemplate(template)} onSaved={(tableKey) => navigate(`/trackers/${createdSlug}/tables/${tableKey}`)} />
    </div>
  );
}

export function EditTrackerMeta() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [, params] = useRoute("/trackers/:slug/edit");
  const [, navigate] = useLocation();
  const [meta, setMeta] = useState<TrackerMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params) return;
    customApi(`/trackers/${params.slug}`, token)
      .then((d) => setMeta(d as TrackerMeta))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the tracker"));
  }, [params?.slug, token]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!meta) return null;
  return (
    <div>
      <h1 className="text-2xl mb-6">Edit {meta.name}</h1>
      <TrackerMetaForm existing={meta} onSaved={(slug) => navigate(`/trackers/${slug}`)} />
    </div>
  );
}

export function NewTable() {
  const [, params] = useRoute("/trackers/:slug/tables/new");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  return (
    <div>
      <h1 className="text-2xl mb-6">New table</h1>
      <TableForm trackerSlug={slug} onSaved={(tableKey) => navigate(`/trackers/${slug}/tables/${tableKey}`)} />
    </div>
  );
}

export function EditTable() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [, params] = useRoute("/trackers/:slug/tables/:tableKey/edit");
  const [, navigate] = useLocation();
  const slug = params?.slug ?? "";
  const tableKey = params?.tableKey ?? "";
  const [table, setTable] = useState<(TableDef & { table_key: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params) return;
    customApi(`/trackers/${slug}/tables/${tableKey}`, token)
      .then((d) => setTable(d as TableDef & { table_key: string }))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the table"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tableKey, token]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!table) return null;
  return (
    <div>
      <h1 className="text-2xl mb-6">Edit {table.name}</h1>
      <TableForm trackerSlug={slug} existing={table} onSaved={() => navigate(`/trackers/${slug}/tables/${tableKey}`)} />
    </div>
  );
}
