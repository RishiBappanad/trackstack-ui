import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { formatValue, type Entry, type FieldDef, type TrackerDefinition } from "../lib/customTrackers.js";

// A live, per-viewer column filter -- distinct from `ui_config.columns`,
// which is the tracker's own configured default, set once at setup time
// and shared by whoever views it. This is "how I currently want to see
// it on THIS browser," which is why it lives in localStorage rather than
// being written back to ui_config: a per-viewer convenience, not data
// another viewer or Claude needs to see, and not something that needs to
// survive a device change. Keyed by slug, not by anything else, so it
// naturally resets if a tracker is deleted and a new one reuses the slug.
const COLUMN_PREF_PREFIX = "trackstack:table-columns:";

// A synthetic column key for the entry's occurred_at (every entry has
// one, regardless of whether this tracker even has a date field) -- not
// a real field, so it's carried alongside the real ones in the SAME
// picker/preference rather than being a second, separate toggle. Default
// state keeps today's behavior (always shown) until a viewer actively
// hides it, which is the point: a tracker with its own date field
// already shows that via the ordinary column picker, so forcing
// "Occurred" on with no way to turn it off was pure redundancy for that
// case -- see this component's own git history for the bug report.
const OCCURRED_KEY = "__occurred__";

function loadColumnPref(slug: string): string[] | null {
  try {
    const raw = localStorage.getItem(COLUMN_PREF_PREFIX + slug);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((v) => typeof v === "string") ? parsed : null;
  } catch {
    return null; // private browsing, disabled storage, or corrupt JSON -- just fall back to the default
  }
}

function saveColumnPref(slug: string, keys: string[]): void {
  try {
    localStorage.setItem(COLUMN_PREF_PREFIX + slug, JSON.stringify(keys));
  } catch {
    // Best-effort only -- a failed write just means the choice isn't
    // remembered next time, not a broken table this time.
  }
}

function clearColumnPref(slug: string): void {
  try {
    localStorage.removeItem(COLUMN_PREF_PREFIX + slug);
  } catch {
    // ignore
  }
}

/** Tier B's "table" view: the same entries the card-list view already
 * has, laid out as a spreadsheet-style grid instead. `ui_config.columns`
 * (set during tracker setup) picks the DEFAULT columns, in order;
 * absent/empty falls back to every field in its defined order. On top of
 * that, a per-viewer "Columns" picker lets whoever is LOOKING at the
 * table further narrow which of those columns actually show, remembered
 * per tracker in this browser (see loadColumnPref above) -- the setup-
 * time choice and the viewing-time choice are deliberately two different
 * things, not one setting with two editors. */
export function TrackerTable({
  def, entries, onEdit, onDelete, emptyMessage = "No entries yet.",
}: {
  def: TrackerDefinition;
  entries: Entry[];
  // Optional so a preview with no real entries to act on (TrackerBuilder's
  // own Display preview) can render this exact component with neither --
  // the action column simply doesn't appear, same treatment as TrackerList.
  onEdit?: (id: string) => void;
  onDelete?: (id: string) => void;
  emptyMessage?: string;
}) {
  const defaultKeys = [...(def.ui_config?.columns?.length ? def.ui_config.columns : def.fields.map((f) => f.key)), OCCURRED_KEY];
  const [visibleKeys, setVisibleKeys] = useState<string[]>(() => loadColumnPref(def.slug) ?? defaultKeys);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);
  const hasOverride = loadColumnPref(def.slug) !== null;

  useEffect(() => {
    if (!pickerOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [pickerOpen]);

  // A field removed (or a tracker swapped out under the same slug) should
  // drop from a saved preference rather than silently matching nothing --
  // re-derives from the CURRENT field list whenever it changes. OCCURRED_KEY
  // is never a real field, so it's exempted rather than stripped here.
  useEffect(() => {
    setVisibleKeys((prev) => prev.filter((k) => k === OCCURRED_KEY || def.fields.some((f) => f.key === k)));
  }, [def.fields]);

  function toggle(key: string) {
    setVisibleKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      saveColumnPref(def.slug, next);
      return next;
    });
  }

  function resetToDefault() {
    clearColumnPref(def.slug);
    setVisibleKeys(defaultKeys);
  }

  const showOccurred = visibleKeys.includes(OCCURRED_KEY);

  // Render order follows the tracker's own field-definition order, not
  // defaultKeys -- defaultKeys only seeds which columns start checked.
  // Deriving order from defaultKeys instead would silently cap what the
  // live picker can ever show to whatever subset the builder configured,
  // since a field outside that list could be checked but would never
  // appear: found while testing this exact feature (checking "TempLow",
  // which wasn't in this tracker's configured columns, visibly did
  // nothing).
  const columns = def.fields.filter((f) => visibleKeys.includes(f.key));
  const showActions = !!(onEdit || onDelete);

  return (
    <div className="bg-card border border-border rounded-lg overflow-visible">
      <div ref={pickerRef} className="flex items-center justify-between px-3 py-2 border-b border-border relative">
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <SlidersHorizontal className="h-3 w-3" /> Columns
        </button>
        {pickerOpen && (
          <div className="absolute right-3 top-full mt-1 z-10 bg-card border border-border rounded-md shadow-lg p-2 min-w-[180px]">
            {def.fields.map((f) => (
              <label key={f.key} className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-secondary rounded-md cursor-pointer">
                <input type="checkbox" checked={visibleKeys.includes(f.key)} onChange={() => toggle(f.key)} />
                {f.label}
              </label>
            ))}
            <label className="flex items-center gap-2 px-2 py-1 text-sm hover:bg-secondary rounded-md cursor-pointer border-t border-border mt-1 pt-2">
              <input type="checkbox" checked={showOccurred} onChange={() => toggle(OCCURRED_KEY)} />
              Occurred
            </label>
            {hasOverride && (
              <button type="button" onClick={resetToDefault} className="w-full text-left px-2 py-1 mt-1 text-xs text-muted-foreground hover:text-foreground border-t border-border">
                Reset to tracker default
              </button>
            )}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              {columns.map((f) => (
                <th key={f.key} className="text-left font-medium px-3 py-2 whitespace-nowrap">{f.label}</th>
              ))}
              {showOccurred && <th className="text-left font-medium px-3 py-2 whitespace-nowrap">Occurred</th>}
              {showActions && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 && (
              <tr>
                <td colSpan={columns.length + (showOccurred ? 1 : 0) + (showActions ? 1 : 0)} className="px-3 py-6 text-center text-muted-foreground">{emptyMessage}</td>
              </tr>
            )}
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-0 hover:bg-secondary/50">
                {columns.map((f) => (
                  <td key={f.key} className={"px-3 py-2 whitespace-nowrap " + (f.type === "number" ? "font-mono" : "")}>
                    {formatValue(f, entry.values[f.key])}
                  </td>
                ))}
                {showOccurred && <td className="px-3 py-2 whitespace-nowrap text-muted-foreground font-mono">{new Date(entry.occurred_at).toLocaleDateString()}</td>}
                {showActions && (
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {onEdit && <button onClick={() => onEdit(entry.id)} className="text-muted-foreground hover:text-foreground px-1">Edit</button>}
                    {onDelete && <button onClick={() => onDelete(entry.id)} className="text-muted-foreground hover:text-destructive px-1">Delete</button>}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
