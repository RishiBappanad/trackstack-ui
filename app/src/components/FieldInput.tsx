import { RATING_MAX, type FieldDef } from "../lib/customTrackers.js";

const inputClass = "bg-secondary border border-border rounded-md px-3 py-2 text-sm";

export interface LinkOption {
  id: string;
  label: string;
}

/** Renders the one input appropriate to a field's type -- shared between
 * the real entry form (TrackerView's EntryForm) and TrackerBuilder's live
 * preview, so a preview is a faithful 1:1 render of what entering data
 * will actually look like, not a second guess at it.
 *
 * lookup/rollup fields render nothing here -- they're computed server-side
 * (trackstack-custom rejects setting either directly), so there's never
 * anything for an entry form to input for one; TrackerView filters them
 * out of what it even passes to this component. `linkOptions` is only
 * meaningful for a `link` field: the target table's current entries,
 * fetched by the caller (this component has no network access of its
 * own). Omitted (TableForm's own Preview, which has no real target
 * entries to offer) renders a disabled placeholder instead of a broken
 * empty picker. */
export function FieldInput({ field, value, onChange, linkOptions }: { field: FieldDef; value: string | boolean | string[]; onChange: (v: string | boolean | string[]) => void; linkOptions?: LinkOption[] }) {
  const label = field.unit ? `${field.label} (${field.unit})` : field.label;

  if (field.type === "link") {
    if (!linkOptions) {
      return (
        <label className="flex flex-col gap-1 text-xs text-muted-foreground min-w-[140px] flex-1">
          {label}
          <select disabled className={inputClass} title="Preview only -- no real entries to link to yet">
            <option>(preview)</option>
          </select>
        </label>
      );
    }
    if (field.multiple) {
      const selected = Array.isArray(value) ? value : [];
      return (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground min-w-[160px]">
          {label}
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {linkOptions.length === 0 && <span className="italic">Nothing to link to yet</span>}
            {linkOptions.map((o) => (
              <label key={o.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={selected.includes(o.id)}
                  onChange={(e) => onChange(e.target.checked ? [...selected, o.id] : selected.filter((s) => s !== o.id))}
                />
                {o.label}
              </label>
            ))}
          </div>
        </div>
      );
    }
    return (
      <label className="flex flex-col gap-1 text-xs text-muted-foreground min-w-[140px] flex-1">
        {label}
        <select required={field.required} title={label} className={inputClass} value={String(value)} onChange={(e) => onChange(e.target.value)}>
          {!field.required && <option value="">—</option>}
          {field.required && value === "" && <option value="" disabled>Choose…</option>}
          {linkOptions.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
      </label>
    );
  }

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
