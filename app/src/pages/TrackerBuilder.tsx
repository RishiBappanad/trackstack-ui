import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useTrackStackAuth } from "trackstack-ui";
import { ChevronDown, ChevronUp, GripVertical, Plus, X } from "lucide-react";
import { ApiError } from "../lib/api.js";
import {
  ACCENT_HEX, ACCENT_NAMES, FIELD_TYPES, FIELD_TYPE_LABELS, ICON_COMPONENTS, ICON_NAMES, VIEW_TYPES, customApi, notifyPinnedTrackersChanged, slugify, uniqueSlug,
  type AccentName, type FieldDef, type FieldType, type IconName, type TrackerDefinition, type ViewType,
} from "../lib/customTrackers.js";
import { FieldInput } from "../components/FieldInput.js";

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
}

const inputClass = "bg-secondary border border-border rounded-md px-3 py-2 text-sm";

function draftFromField(f: FieldDef): FieldDraft {
  return { key: f.key, label: f.label, type: f.type, unit: f.unit ?? "", optionsText: (f.options ?? []).join(", "), required: !!f.required, locked: true };
}

function fieldFromDraft(d: FieldDraft): FieldDef {
  const field: FieldDef = { key: d.key, label: d.label.trim(), type: d.type };
  if (d.required) field.required = true;
  if (d.type === "number" && d.unit.trim()) field.unit = d.unit.trim();
  if (d.type === "select" || d.type === "multi_select") field.options = d.optionsText.split(",").map((o) => o.trim()).filter(Boolean);
  return field;
}

/** One form for both creating a tracker and editing an existing one (the
 * `existing` prop), the same shape the Todos page uses for its item form. */
function TrackerForm({ existing, onSaved }: { existing?: TrackerDefinition; onSaved: (slug: string) => void }) {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [name, setName] = useState(existing?.name ?? "");
  const [slug, setSlug] = useState(existing?.slug ?? "");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState(existing?.description ?? "");
  const [background, setBackground] = useState(existing?.background ?? "");
  const [drafts, setDrafts] = useState<FieldDraft[]>(existing ? existing.fields.map(draftFromField) : []);
  const [amountField, setAmountField] = useState(existing?.amount_field ?? "");
  const [amountMeaning, setAmountMeaning] = useState(existing?.amount_meaning ?? "");
  const [summable, setSummable] = useState(existing?.summable ?? true);
  const [categoryField, setCategoryField] = useState(existing?.category_field ?? "");
  const [labelField, setLabelField] = useState(existing?.label_field ?? "");
  const [dateField, setDateField] = useState(existing?.date_field ?? "");
  const [icon, setIcon] = useState<IconName | "">(existing?.icon ?? "");
  const [pinned, setPinned] = useState(existing?.pinned ?? false);
  const [view, setView] = useState<ViewType>(existing?.ui_config?.view ?? "list");
  const [accent, setAccent] = useState<AccentName | "">(existing?.ui_config?.accent ?? "");
  const [columns, setColumns] = useState<string[]>(existing?.ui_config?.columns ?? []);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fields = drafts.map(fieldFromDraft);
  const ofType = (...types: FieldType[]) => fields.filter((f) => types.includes(f.type) && f.label);

  // Live preview of the entry form -- reuses FieldInput, the same
  // component the real "Add entry" form renders, so this is a faithful
  // 1:1 preview rather than a second guess at the real UI. Keyed off the
  // CURRENT draft (not a saved field list), so editing a label, type, or
  // options updates it immediately. Left untouched (no sync effect) when
  // a field is added/renamed/removed: previewValue() just falls back to
  // a type-appropriate default for any key it hasn't seen state for yet,
  // and a stale entry for a renamed/removed key is simply never read
  // again -- no cleanup needed.
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
    setDrafts((prev) => [...prev, { key: "", label: "", type: "text", unit: "", optionsText: "", required: false, locked: false }]);
  }

  // Field order is just the drafts array's order -- it drives form layout
  // and list/chart display order directly (table view's own `columns`
  // already lets a tracker override order independently), so reordering
  // here needs nothing on the backend: PATCH just sends `fields` in its
  // new order, the same array it always sent.
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    // Defensive, not the primary guard (the view picker already disables
    // "chart" when ineligible) -- falls back to "list" instead of
    // surfacing a 400 if amount_field/summable changed after chart was
    // picked.
    const effectiveView = view === "chart" && !chartEligible ? "list" : view;
    // Tier A (ui_config: null) is the default this always starts from;
    // only send a Tier B config once the user has actually customized
    // something, rather than every tracker growing a populated-but-
    // identical-to-default config the moment this section exists.
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
      icon: icon || null,
      pinned,
      ui_config: uiConfig,
    };
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
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input type="checkbox" checked={d.required} onChange={(e) => updateDraft(i, { required: e.target.checked })} /> Required
            </label>
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
          <div className="flex flex-wrap items-end gap-2 bg-card border border-border rounded-lg p-4">
            {fields.map((f, i) => (
              // Keyed by draft position, not f.key -- a newly added,
              // not-yet-labeled field has an empty key (same as any other
              // blank one) until it's given a label, so f.key alone isn't
              // unique yet.
              <FieldInput key={i} field={f} value={previewValue(f)} onChange={(v) => setPreviewState((s) => ({ ...s, [f.key]: v }))} />
            ))}
            <button type="button" disabled title="Preview only — save the tracker to actually add entries" className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium opacity-50 cursor-not-allowed">
              Add
            </button>
          </div>
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
        <p className="text-sm text-muted-foreground">How entries show on this tracker's own page.</p>
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
          {ACCENT_NAMES.map((name) => (
            <button
              key={name}
              type="button"
              role="radio"
              aria-checked={accent === name}
              title={name}
              onClick={() => setAccent(accent === name ? "" : name)}
              style={{ backgroundColor: ACCENT_HEX[name] }}
              className={"w-7 h-7 rounded-full border-2 " + (accent === name ? "border-foreground" : "border-transparent")}
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
      </section>

      <section className="grid gap-3">
        <h2 className="text-lg">Sidebar</h2>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Icon">
          {ICON_NAMES.map((name) => {
            const Icon = ICON_COMPONENTS[name];
            const selected = icon === name;
            return (
              <button
                key={name}
                type="button"
                role="radio"
                aria-checked={selected}
                title={name}
                onClick={() => {
                  // Clearing the icon while pinned would be rejected
                  // server-side (a pinned tracker must have one) -- unpin
                  // here too, rather than surfacing that as a save error.
                  if (selected) setPinned(false);
                  setIcon(selected ? "" : name);
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
          <input
            type="checkbox"
            checked={pinned}
            disabled={!icon}
            onChange={(e) => setPinned(e.target.checked)}
          />
          Pin to the sidebar
        </label>
        {!icon && <p className="text-xs text-muted-foreground">Pick an icon to pin this tracker to the sidebar.</p>}
      </section>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={saving || drafts.length === 0} className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
          {existing ? "Save changes" : "Create tracker"}
        </button>
        <Link href={existing ? `/trackers/${existing.slug}` : "/trackers"} className="text-sm text-muted-foreground hover:text-foreground">
          Cancel
        </Link>
      </div>
    </form>
  );
}

export function NewTracker() {
  const [, navigate] = useLocation();
  return (
    <div>
      <h1 className="text-2xl mb-6">New tracker</h1>
      <TrackerForm onSaved={(slug) => navigate(`/trackers/${slug}`)} />
    </div>
  );
}

export function EditTracker() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [, params] = useRoute("/trackers/:slug/edit");
  const [, navigate] = useLocation();
  const [def, setDef] = useState<TrackerDefinition | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params) return;
    customApi(`/trackers/${params.slug}`, token)
      .then((d) => setDef(d as TrackerDefinition))
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load the tracker"));
  }, [params?.slug, token]);

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!def) return null;
  return (
    <div>
      <h1 className="text-2xl mb-6">Edit {def.name}</h1>
      <TrackerForm existing={def} onSaved={(slug) => navigate(`/trackers/${slug}`)} />
    </div>
  );
}
