import { Pencil, Trash2 } from "lucide-react";
import { formatValue, type Entry, type TrackerDefinition } from "../lib/customTrackers.js";

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

/** Tier A's default view: a plain card list, one entry per row. `onEdit`/
 * `onDelete` are optional so a preview with no real entries to act on
 * (TrackerBuilder's own Display preview) can render the identical
 * component with neither -- the action column simply doesn't appear,
 * same as TrackerTable's own treatment. */
export function TrackerList({
  def, entries, onEdit, onDelete, emptyMessage = "No entries yet.",
}: {
  def: TrackerDefinition;
  entries: Entry[];
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-lg divide-y divide-border">
      {entries.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">{emptyMessage}</p>}
      {entries.map((entry) => (
        <div key={entry.id} className="flex items-center gap-3 px-4 py-3">
          <EntryRow def={def} entry={entry} />
          {onEdit && (
            <button onClick={() => onEdit(entry.id)} className="text-muted-foreground hover:text-foreground flex-shrink-0" aria-label="Edit">
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <button onClick={() => onDelete(entry.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0" aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
