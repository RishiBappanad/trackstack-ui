import { useState } from "react";
import { Check, X } from "lucide-react";

const NEW_VALUE_SENTINEL = "__qualitative_field_new_value__";

/**
 * Single-select for a "qualitative field" (a category, a tag, any TEXT
 * column with a small set of named values) with a built-in "+ New..."
 * option that swaps in a small inline name input -- confirming it calls
 * `onAddOption`, then selects the newly-created value. Backend-agnostic:
 * it doesn't know or care whether `options` came from a fixed enum, a
 * user_categories table in Postgres, or something else -- the caller
 * owns fetching/merging the option list and persisting a new one.
 *
 * Extracted 2026-09-14 from todo-tracker's create/edit form, after
 * creation was deliberately moved OUT of the sibling
 * QualitativeFieldFilter component (a user wants to make a new value
 * while creating/editing the thing it's attached to, not while
 * filtering an existing list).
 */
export interface QualitativeFieldSelectProps {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onAddOption: (name: string) => Promise<void>;
  /** Label for the trailing "create new" option. Default "+ New...". */
  newOptionLabel?: string;
  className?: string;
}

const DEFAULT_SELECT_CLASSNAME = "bg-secondary border border-border rounded-md px-2 py-2 text-sm";

export function QualitativeFieldSelect({
  value,
  options,
  onChange,
  onAddOption,
  newOptionLabel = "+ New...",
  className,
}: QualitativeFieldSelectProps) {
  const [addingNew, setAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function confirmNew() {
    const name = newName.trim();
    if (!name) {
      setAddingNew(false);
      return;
    }
    try {
      await onAddOption(name);
      onChange(name);
      setAddingNew(false);
      setNewName("");
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add value");
    }
  }

  function cancelNew() {
    setAddingNew(false);
    setNewName("");
    setError(null);
  }

  if (addingNew) {
    return (
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-1">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                confirmNew();
              }
            }}
            placeholder="New value name"
            autoFocus
            className={className ?? `${DEFAULT_SELECT_CLASSNAME} w-36`}
          />
          <button
            type="button"
            onClick={confirmNew}
            aria-label="Confirm new value"
            className="bg-primary text-primary-foreground rounded-md px-2 py-2 text-sm"
          >
            <Check className="h-4 w-4" />
          </button>
          <button type="button" onClick={cancelNew} className="text-muted-foreground hover:text-foreground rounded-md px-1 py-2" aria-label="Cancel new value">
            <X className="h-4 w-4" />
          </button>
        </div>
        {error && <div className="text-xs text-destructive">{error}</div>}
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        if (e.target.value === NEW_VALUE_SENTINEL) setAddingNew(true);
        else onChange(e.target.value);
      }}
      className={className ?? DEFAULT_SELECT_CLASSNAME}
    >
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
      <option value={NEW_VALUE_SENTINEL}>{newOptionLabel}</option>
    </select>
  );
}
