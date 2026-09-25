import { useEffect, useState } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useTrackStackAuth } from "trackstack-ui";
import { Plus, X } from "lucide-react";
import { ApiError } from "../lib/api.js";
import { FIELD_TYPES, customApi, slugify, uniqueSlug, type FieldDef, type FieldType, type TrackerDefinition } from "../lib/customTrackers.js";

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
  if (d.type === "select") field.options = d.optionsText.split(",").map((o) => o.trim()).filter(Boolean);
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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const fields = drafts.map(fieldFromDraft);
  const ofType = (...types: FieldType[]) => fields.filter((f) => types.includes(f.type) && f.label);

  function updateDraft(index: number, patch: Partial<FieldDraft>) {
    setDrafts((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)));
  }

  function addField() {
    setDrafts((prev) => [...prev, { key: "", label: "", type: "text", unit: "", optionsText: "", required: false, locked: false }]);
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
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
    };
    try {
      if (existing) {
        await customApi(`/trackers/${existing.slug}`, token, { method: "PATCH", body: JSON.stringify(body) });
        onSaved(existing.slug);
      } else {
        await customApi("/trackers", token, { method: "POST", body: JSON.stringify({ ...body, slug }) });
        onSaved(slug);
      }
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
          <div key={i} className="flex flex-wrap items-center gap-2 bg-card border border-border rounded-lg p-3">
            <input value={d.label} onChange={(e) => relabel(i, e.target.value)} placeholder="Field name" required className={inputClass + " flex-1 min-w-[140px]"} />
            <select
              value={d.type}
              disabled={d.locked}
              onChange={(e) => updateDraft(i, { type: e.target.value as FieldType })}
              className={inputClass}
              title={d.locked ? "A saved field's type can't change" : "Field type"}
            >
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            {d.type === "number" && <input value={d.unit} onChange={(e) => updateDraft(i, { unit: e.target.value })} placeholder="Unit (km, min…)" className={inputClass + " w-32"} />}
            {d.type === "select" && (
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
