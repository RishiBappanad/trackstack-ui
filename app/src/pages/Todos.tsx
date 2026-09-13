import { useCallback, useEffect, useState } from "react";
import { useTrackStackAuth } from "trackstack-ui";
import { Trash2, Check, Pencil, X } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";
const TODO_BASE_URL = import.meta.env.VITE_TODO_API_BASE ?? "";

const CATEGORIES = ["personal", "work", "errands", "health", "finance", "home", "other"] as const;

interface Todo {
  id: number;
  title: string;
  notes: string | null;
  category: string;
  status: "open" | "done";
  priority: number;
  due_at: string | null;
}

interface TodoFormValues {
  title: string;
  category: string;
  priority: number;
  dueAt: string; // "" or a <input type=date> value (YYYY-MM-DD)
  notes: string;
}

function todoToFormValues(t: Todo): TodoFormValues {
  return {
    title: t.title,
    category: t.category,
    priority: t.priority,
    dueAt: t.due_at ? t.due_at.slice(0, 10) : "",
    notes: t.notes ?? "",
  };
}

// due_at is a calendar date, not a moment in time -- there's no "time of
// day" a todo is due. Treating it as one (running it through `new Date()`
// and letting the browser's local timezone reinterpret it) is exactly
// what caused a real, confirmed bug: saving "2026-12-25" from the date
// picker round-tripped through `new Date("2026-12-25").toISOString()`
// (parsed as UTC midnight) and back through `.toLocaleDateString()`
// (rendered in local time), which showed "12/24/2026" for anyone west of
// UTC. Both directions below work on the YYYY-MM-DD string directly and
// never construct a Date object from it, so no timezone is ever involved.
function dateInputValueToDueAt(value: string): string {
  return `${value}T00:00:00.000Z`;
}
function formatDueAt(due_at: string): string {
  const [y, m, d] = due_at.slice(0, 10).split("-");
  return `${m}/${d}/${y}`;
}

const EMPTY_FORM: TodoFormValues = { title: "", category: "personal", priority: 1, dueAt: "", notes: "" };

/**
 * One shared form for both creating a todo (no `initial`/`onCancel`) and
 * editing one in place (both provided) -- previously these were two
 * separately hand-maintained forms with their own duplicated state and
 * JSX, which is exactly how the create form silently ended up missing
 * fields (due date, notes) that the edit form gained later.
 */
function TodoForm({
  initial,
  categories,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: TodoFormValues;
  categories: string[];
  submitLabel: string;
  onSubmit: (values: TodoFormValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = useState<TodoFormValues>(initial ?? EMPTY_FORM);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!values.title.trim()) return;
    await onSubmit({ ...values, title: values.title.trim(), notes: values.notes.trim() });
    if (!initial) setValues(EMPTY_FORM); // create mode: clear the form after a successful add
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        onCancel ? "flex flex-wrap items-start gap-2 px-4 py-3" : "flex flex-wrap gap-2 mb-6 bg-card border border-border rounded-lg p-4"
      }
    >
      <input
        value={values.title}
        onChange={(e) => setValues({ ...values, title: e.target.value })}
        placeholder="What needs doing?"
        autoFocus={!!onCancel}
        className="flex-1 min-w-[160px] bg-secondary border border-border rounded-md px-3 py-2 text-sm"
      />
      <select
        value={values.category}
        onChange={(e) => setValues({ ...values, category: e.target.value })}
        className="bg-secondary border border-border rounded-md px-2 py-2 text-sm"
      >
        {categories.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <input
        type="number"
        min={1}
        value={values.priority}
        onChange={(e) => setValues({ ...values, priority: Number(e.target.value) || 1 })}
        className="w-16 bg-secondary border border-border rounded-md px-2 py-2 text-sm"
        title="Priority"
      />
      <input
        type="date"
        value={values.dueAt}
        onChange={(e) => setValues({ ...values, dueAt: e.target.value })}
        className="bg-secondary border border-border rounded-md px-2 py-2 text-sm"
        title="Due date"
      />
      <input
        value={values.notes}
        onChange={(e) => setValues({ ...values, notes: e.target.value })}
        placeholder="Notes (optional)"
        className="flex-1 min-w-[160px] bg-secondary border border-border rounded-md px-3 py-2 text-sm"
      />
      <button type="submit" className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium">
        {submitLabel}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="text-muted-foreground hover:text-foreground rounded-md px-2 py-2" aria-label="Cancel edit">
          <X className="h-4 w-4" />
        </button>
      )}
    </form>
  );
}

/**
 * Compact multi-select category filter -- a scrollable checkbox list
 * inside a native <details> dropdown (no click-outside handling needed:
 * <details> already toggles via its own <summary>) instead of a row of
 * pills, so a user with many custom categories isn't confronted with all
 * of them at once. Also where new custom categories get created, since
 * this is the one place both filtering and category management live.
 */
function CategoryFilterDropdown({
  allCategories,
  selected,
  onToggle,
  onClear,
  onAddCategory,
}: {
  allCategories: string[];
  selected: Set<string>;
  onToggle: (c: string) => void;
  onClear: () => void;
  onAddCategory: (name: string) => Promise<void>;
}) {
  const [newCategory, setNewCategory] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const name = newCategory.trim();
    if (!name) return;
    try {
      await onAddCategory(name);
      setNewCategory("");
      setAddError(null);
    } catch (err) {
      setAddError(err instanceof ApiError ? err.message : "Could not add category");
    }
  }

  return (
    <details className="relative">
      <summary className="list-none cursor-pointer bg-secondary border border-border rounded-md px-3 py-1.5 text-sm select-none">
        Categories{selected.size > 0 ? ` (${selected.size})` : ""}
      </summary>
      <div className="absolute z-10 mt-1 w-56 bg-card border border-border rounded-lg shadow-lg p-2">
        <div className="max-h-48 overflow-y-auto flex flex-col gap-0.5">
          {allCategories.map((c) => (
            <label key={c} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-secondary text-sm capitalize cursor-pointer">
              <input type="checkbox" checked={selected.has(c)} onChange={() => onToggle(c)} />
              {c}
            </label>
          ))}
        </div>
        {selected.size > 0 && (
          <button type="button" onClick={onClear} className="text-xs text-muted-foreground hover:text-foreground underline mt-1 ml-2">
            Clear selection
          </button>
        )}
        <form onSubmit={handleAdd} className="flex gap-1 mt-2 pt-2 border-t border-border">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="New category..."
            className="flex-1 min-w-0 bg-secondary border border-border rounded-md px-2 py-1 text-xs"
          />
          <button type="submit" className="bg-primary text-primary-foreground rounded-md px-2 py-1 text-xs font-medium">
            Add
          </button>
        </form>
        {addError && <div className="text-xs text-destructive mt-1">{addError}</div>}
      </div>
    </details>
  );
}

export function Todos() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [todos, setTodos] = useState<Todo[]>([]);
  // "Open" is the default and leftmost tab so completed items don't
  // clutter the list by default; "All" (still everything, done included)
  // and "Done" remain one click away.
  const [filter, setFilter] = useState<"open" | "" | "done">("open");
  const [search, setSearch] = useState("");
  const [categoryFilters, setCategoryFilters] = useState<Set<string>>(new Set());
  const [priorityMin, setPriorityMin] = useState("");
  const [priorityMax, setPriorityMax] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [customCategories, setCustomCategories] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!TODO_BASE_URL) {
      setError("VITE_TODO_API_BASE is not configured for this deployment.");
      return;
    }
    try {
      const q = filter ? `?status=${filter}` : "";
      const data = (await apiFetch(TODO_BASE_URL, `/todos${q}`, token)) as Todo[];
      setTodos(data);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the todo service");
    }
  }, [token, filter]);

  const loadCategories = useCallback(async () => {
    if (!TODO_BASE_URL || !token) return;
    try {
      const data = (await apiFetch(TODO_BASE_URL, "/categories", token)) as { name: string }[];
      setCustomCategories(data.map((c) => c.name));
    } catch {
      // Non-fatal -- the built-in categories still work fine without this.
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const allCategories = [...CATEGORIES, ...customCategories.filter((c) => !(CATEGORIES as readonly string[]).includes(c))];

  async function addCategory(name: string) {
    const created = (await apiFetch(TODO_BASE_URL, "/categories", token, {
      method: "POST",
      body: JSON.stringify({ name }),
    })) as { name: string };
    setCustomCategories((prev) => [...prev, created.name]);
  }

  function todoRequestBody(v: TodoFormValues) {
    return {
      title: v.title,
      category: v.category,
      priority: v.priority,
      due_at: v.dueAt ? dateInputValueToDueAt(v.dueAt) : null,
      notes: v.notes ? v.notes : null,
    };
  }

  async function createTodo(values: TodoFormValues) {
    try {
      await apiFetch(TODO_BASE_URL, "/todos", token, { method: "POST", body: JSON.stringify(todoRequestBody(values)) });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create todo");
    }
  }

  async function saveEdit(id: number, values: TodoFormValues) {
    try {
      await apiFetch(TODO_BASE_URL, `/todos/${id}`, token, { method: "PATCH", body: JSON.stringify(todoRequestBody(values)) });
      setEditingId(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update todo");
    }
  }

  async function toggleDone(t: Todo) {
    try {
      await apiFetch(TODO_BASE_URL, `/todos/${t.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ status: t.status === "done" ? "open" : "done" }),
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not update todo");
    }
  }

  async function remove(id: number) {
    try {
      await apiFetch(TODO_BASE_URL, `/todos/${id}`, token, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not delete todo");
    }
  }

  function toggleCategoryFilter(c: string) {
    setCategoryFilters((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  // Client-side filters -- on top of the status filter above, which is
  // already a real query param the backend applies (GET /todos?status=).
  // Search/category/priority filter the already-fetched list instead of
  // adding more query params: a personal todo list is small enough that
  // there's no real cost to filtering client-side, and it avoids growing
  // the API surface for something this list can already do locally.
  const min = priorityMin ? Number(priorityMin) : -Infinity;
  const max = priorityMax ? Number(priorityMax) : Infinity;
  const visibleTodos = todos.filter((t) => {
    if (search.trim() && !t.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (categoryFilters.size > 0 && !categoryFilters.has(t.category)) return false;
    if (t.priority < min || t.priority > max) return false;
    return true;
  });

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl mb-6">Todos</h1>

      {error && (
        <div className="mb-4 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <TodoForm categories={allCategories} submitLabel="Add" onSubmit={createTodo} />

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(["open", "", "done"] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              "px-3 py-1.5 rounded-md text-sm " +
              (filter === f ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")
            }
          >
            {f === "" ? "All" : f === "open" ? "Open" : "Done"}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name..."
          className="flex-1 min-w-[140px] bg-secondary border border-border rounded-md px-3 py-1.5 text-sm"
        />
        <CategoryFilterDropdown
          allCategories={allCategories}
          selected={categoryFilters}
          onToggle={toggleCategoryFilter}
          onClear={() => setCategoryFilters(new Set())}
          onAddCategory={addCategory}
        />
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <input
            type="number"
            min={1}
            value={priorityMin}
            onChange={(e) => setPriorityMin(e.target.value)}
            placeholder="Min"
            title="Minimum priority"
            className="w-16 bg-secondary border border-border rounded-md px-2 py-1.5 text-sm"
          />
          <span>–</span>
          <input
            type="number"
            min={1}
            value={priorityMax}
            onChange={(e) => setPriorityMax(e.target.value)}
            placeholder="Max"
            title="Maximum priority"
            className="w-16 bg-secondary border border-border rounded-md px-2 py-1.5 text-sm"
          />
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {visibleTodos.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">No todos here.</p>}
        {visibleTodos.map((t) =>
          editingId === t.id ? (
            <TodoForm
              key={t.id}
              initial={todoToFormValues(t)}
              categories={allCategories}
              submitLabel="Save"
              onCancel={() => setEditingId(null)}
              onSubmit={(values) => saveEdit(t.id, values)}
            />
          ) : (
            <div key={t.id} className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => toggleDone(t)}
                className={
                  "h-5 w-5 rounded-full border flex items-center justify-center flex-shrink-0 " +
                  (t.status === "done" ? "bg-success border-success text-success-foreground" : "border-border")
                }
                aria-label={t.status === "done" ? "Mark open" : "Mark done"}
              >
                {t.status === "done" && <Check className="h-3 w-3" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={"text-sm " + (t.status === "done" ? "line-through text-muted-foreground" : "")}>{t.title}</div>
                <div className="text-xs text-muted-foreground flex gap-2 mt-0.5">
                  <span className="capitalize">{t.category}</span>
                  <span>· P{t.priority}</span>
                  {t.due_at && <span>· due {formatDueAt(t.due_at)}</span>}
                </div>
                {t.notes && <div className="text-xs text-muted-foreground mt-1">{t.notes}</div>}
              </div>
              <button
                onClick={() => setEditingId(t.id)}
                className="text-muted-foreground hover:text-foreground flex-shrink-0"
                aria-label="Edit"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={() => remove(t.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0" aria-label="Delete">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ),
        )}
      </div>
    </div>
  );
}
