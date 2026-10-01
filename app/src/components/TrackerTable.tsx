import { formatValue, type Entry, type FieldDef, type TrackerDefinition } from "../lib/customTrackers.js";

/** Tier B's "table" view: the same entries the card-list view already
 * has, laid out as a spreadsheet-style grid instead. `columns` (from
 * ui_config) picks which fields show, and in what order; absent/empty
 * falls back to every field in its defined order -- the renderer's
 * default, not a second copy of it. */
export function TrackerTable({
  def, entries, onEdit, onDelete,
}: {
  def: TrackerDefinition;
  entries: Entry[];
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const keys = def.ui_config?.columns?.length ? def.ui_config.columns : def.fields.map((f) => f.key);
  const columns = keys.map((k) => def.fields.find((f) => f.key === k)).filter((f): f is FieldDef => !!f);

  return (
    <div className="bg-card border border-border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            {columns.map((f) => (
              <th key={f.key} className="text-left font-medium px-3 py-2 whitespace-nowrap">{f.label}</th>
            ))}
            <th className="text-left font-medium px-3 py-2 whitespace-nowrap">Occurred</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 && (
            <tr>
              <td colSpan={columns.length + 2} className="px-3 py-6 text-center text-muted-foreground">No entries yet.</td>
            </tr>
          )}
          {entries.map((entry) => (
            <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
              {columns.map((f) => (
                <td key={f.key} className={"px-3 py-2 whitespace-nowrap " + (f.type === "number" ? "font-mono" : "")}>
                  {formatValue(f, entry.values[f.key])}
                </td>
              ))}
              <td className="px-3 py-2 whitespace-nowrap text-muted-foreground font-mono">{new Date(entry.occurred_at).toLocaleDateString()}</td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <button onClick={() => onEdit(entry.id)} className="text-muted-foreground hover:text-foreground px-1">Edit</button>
                <button onClick={() => onDelete(entry.id)} className="text-muted-foreground hover:text-destructive px-1">Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
