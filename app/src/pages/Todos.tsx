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
  submitLabel,
  onSubmit,
  onCancel,
}: {
  initial?: TodoFormValues;
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
        {CATEGORIES.map((c) => (
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

export function Todos() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<"" | "open" | "done">("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [priorityFilter, setPriorityFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);

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

  useEffect(() => {
    load();
  }, [load]);

  function todoRequestBody(v: TodoFormValues) {
    return {
      title: v.title,
      category: v.category,
      priority: v.priority,
      due_at: v.dueAt ? new Date(v.dueAt).toISOString() : null,
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

  // Client-side filters -- on top of the status filter above, which is
  // already a real query param the backend applies (GET /todos?status=).
  // Search/category/priority filter the already-fetched list instead of
  // adding more query params: a personal todo list is small enough that
  // there's no real cost to filtering client-side, and it avoids growing
  // the API surface for something this list can already do locally.
  const visibleTodos = todos.filter((t) => {
    if (search.trim() && !t.title.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (categoryFilter && t.category !== categoryFilter) return false;
    if (priorityFilter && t.priority !== Number(priorityFilter)) return false;
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

      <TodoForm submitLabel="Add" onSubmit={createTodo} />

      <div className="flex flex-wrap items-center gap-2 mb-4">
        {(["", "open", "done"] as const).map((f) => (
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
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="bg-secondary border border-border rounded-md px-2 py-1.5 text-sm"
        >
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={1}
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
          placeholder="Priority"
          className="w-20 bg-secondary border border-border rounded-md px-2 py-1.5 text-sm"
          title="Filter by exact priority"
        />
      </div>

      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {visibleTodos.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">No todos here.</p>}
        {visibleTodos.map((t) =>
          editingId === t.id ? (
            <TodoForm
              key={t.id}
              initial={todoToFormValues(t)}
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
                  {t.due_at && <span>· due {new Date(t.due_at).toLocaleDateString()}</span>}
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
