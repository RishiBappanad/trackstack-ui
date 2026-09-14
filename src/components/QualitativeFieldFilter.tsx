/**
 * Compact multi-select filter for a "qualitative field" (a category, a
 * tag, any TEXT column with a small set of named values) -- a
 * scrollable checkbox list inside a native <details> dropdown (no
 * click-outside handling needed: <details> already toggles via its own
 * <summary>) instead of a row of pills, so a user with many custom
 * values isn't confronted with all of them at once.
 *
 * Pure filtering only, backend-agnostic -- it doesn't know or care
 * whether `options` came from a fixed enum, a user_categories table, or
 * something else. Creating new values lives in QualitativeFieldSelect
 * instead: a user wants to make a new value while creating/editing the
 * thing it's attached to, not while filtering an existing list (see
 * todo-tracker's Todos page, this component's first extraction source,
 * for the reasoning -- category creation started here and was moved
 * after exactly that feedback).
 */
export interface QualitativeFieldFilterProps {
  /** Button label, e.g. "Categories". */
  label: string;
  options: string[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  onClear: () => void;
}

export function QualitativeFieldFilter({ label, options, selected, onToggle, onClear }: QualitativeFieldFilterProps) {
  return (
    <details className="relative">
      <summary className="list-none cursor-pointer bg-secondary border border-border rounded-md px-3 py-1.5 text-sm select-none">
        {label}
        {selected.size > 0 ? ` (${selected.size})` : ""}
      </summary>
      <div className="absolute z-10 mt-1 w-56 bg-card border border-border rounded-lg shadow-lg p-2">
        <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
          {options.map((o) => (
            <label key={o} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-secondary text-sm capitalize cursor-pointer">
              <input type="checkbox" checked={selected.has(o)} onChange={() => onToggle(o)} />
              {o}
            </label>
          ))}
        </div>
        {selected.size > 0 && (
          <button type="button" onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground underline mt-1 ml-2">
            Clear selection
          </button>
        )}
      </div>
    </details>
  );
}
