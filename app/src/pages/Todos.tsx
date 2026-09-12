import { useCallback, useEffect, useState } from "react";
import { useTrackStackAuth } from "trackstack-ui";
import { Trash2, Check } from "lucide-react";
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

export function Todos() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [todos, setTodos] = useState<Todo[]>([]);
  const [filter, setFilter] = useState<"" | "open" | "done">("");
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<string>("personal");
  const [priority, setPriority] = useState(1);

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

  async function createTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      await apiFetch(TODO_BASE_URL, "/todos", token, {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), category, priority }),
      });
      setTitle("");
      setPriority(1);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create todo");
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

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl mb-6">Todos</h1>

      {error && (
        <div className="mb-4 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <form onSubmit={createTodo} className="flex flex-wrap gap-2 mb-6 bg-card border border-border rounded-lg p-4">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="What needs doing?"
          className="flex-1 min-w-[160px] bg-secondary border border-border rounded-md px-3 py-2 text-sm"
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
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
          value={priority}
          onChange={(e) => setPriority(Number(e.target.value) || 1)}
          className="w-16 bg-secondary border border-border rounded-md px-2 py-2 text-sm"
          title="Priority"
        />
        <button type="submit" className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium">
          Add
        </button>
      </form>

      <div className="flex gap-2 mb-4">
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
      </div>

      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {todos.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">No todos here.</p>}
        {todos.map((t) => (
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
              </div>
            </div>
            <button onClick={() => remove(t.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0" aria-label="Delete">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
