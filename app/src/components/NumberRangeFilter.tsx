/** A continuous (number-field) counterpart to trackstack-ui's
 * QualitativeFieldFilter: a slider for the common case, with a manual
 * number input beside it for anyone who wants an exact bound rather than
 * whatever a drag lands on -- both control the SAME value, not two
 * separate things. `bounds` is the slider's travel range, derived from
 * the actual values present in the current entries (see TrackerView's
 * numberBounds()); `value: null` on either side means "no restriction
 * from this side," not "pinned to the bound." */
export interface NumberRange {
  min: number | null;
  max: number | null;
}

export interface NumberRangeFilterProps {
  label: string;
  unit?: string;
  bounds: { min: number; max: number };
  value: NumberRange;
  onChange: (value: NumberRange) => void;
  onClear: () => void;
}

const inputClass = "bg-secondary border border-border rounded-md px-2 py-1 text-sm w-full";

/** A plain integer step for a wide/whole-number range, a finer one for a
 * narrow or fractional one -- good enough for a filter, not a precision
 * instrument. */
function sliderStep(bounds: { min: number; max: number }): number {
  const span = bounds.max - bounds.min;
  return span > 20 || span === 0 ? 1 : span / 100;
}

export function NumberRangeFilter({ label, unit, bounds, value, onChange, onClear }: NumberRangeFilterProps) {
  const active = value.min !== null || value.max !== null;
  const step = sliderStep(bounds);
  const unitSuffix = unit ? ` (${unit})` : "";

  return (
    <details className="relative">
      <summary className="list-none cursor-pointer bg-secondary border border-border rounded-md px-3 py-1.5 text-sm select-none">
        {label}
        {active ? " •" : ""}
      </summary>
      <div className="absolute z-10 mt-1 w-64 bg-card border border-border rounded-lg shadow-lg p-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Min{unitSuffix}</span>
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={step}
            value={value.min ?? bounds.min}
            onChange={(e) => onChange({ min: Number(e.target.value), max: value.max })}
          />
          <input
            type="number"
            value={value.min ?? ""}
            placeholder={String(bounds.min)}
            onChange={(e) => onChange({ min: e.target.value === "" ? null : Number(e.target.value), max: value.max })}
            className={inputClass}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">Max{unitSuffix}</span>
          <input
            type="range"
            min={bounds.min}
            max={bounds.max}
            step={step}
            value={value.max ?? bounds.max}
            onChange={(e) => onChange({ min: value.min, max: Number(e.target.value) })}
          />
          <input
            type="number"
            value={value.max ?? ""}
            placeholder={String(bounds.max)}
            onChange={(e) => onChange({ min: value.min, max: e.target.value === "" ? null : Number(e.target.value) })}
            className={inputClass}
          />
        </label>
        {active && (
          <button type="button" onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground underline text-left">
            Clear
          </button>
        )}
      </div>
    </details>
  );
}
