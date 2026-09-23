import { useState } from "react";
import { useTrackStackAuth, useCurrentUser, useAppRegistry } from "trackstack-ui";
import { Link } from "wouter";
import { CheckSquare, KeyRound, CalendarDays, Target, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

// There is no central "sync everything" endpoint anywhere in TrackStack
// today (checked: trackstack-gateway is a pure path-prefix proxy, no
// /actions or fan-out route of its own; workspace-notes/
// ACTIONS_CONTRACT_SPEC.md's POST /actions/{name}/run contract is spec'd
// but only finance-tracker has ever implemented one, for CPI, not for
// this) -- this list is the fan-out itself, one entry per tracker that
// has a real sync endpoint to call. todo-tracker isn't here: it's a
// passive sync TARGET (other trackers' actions push into it), it has
// nothing of its own to trigger.
const SYNC_SOURCES = [
  { id: "finance", label: "Finance Tracker", apiBase: import.meta.env.VITE_FINANCE_API_BASE ?? "", path: "/api/transactions/sync" },
  { id: "nutrition", label: "Nutrition Insights", apiBase: import.meta.env.VITE_NUTRITION_API_BASE ?? "", path: "/sync/all" },
].filter((s) => s.apiBase);

function SyncEverything({ token }: { token: string | null }) {
  const [results, setResults] = useState<Record<string, { ok: boolean; detail: string } | "pending">>({});
  const [running, setRunning] = useState(false);

  async function runSync() {
    setRunning(true);
    setResults(Object.fromEntries(SYNC_SOURCES.map((s) => [s.id, "pending"])));
    await Promise.all(
      SYNC_SOURCES.map(async (source) => {
        try {
          const data = await apiFetch(source.apiBase, source.path, token, { method: "POST" });
          const detail =
            typeof data === "object" && data
              ? (data as Record<string, unknown>).status !== undefined
                ? String((data as Record<string, unknown>).status)
                : "done"
              : "done";
          setResults((prev) => ({ ...prev, [source.id]: { ok: true, detail } }));
        } catch (e) {
          setResults((prev) => ({ ...prev, [source.id]: { ok: false, detail: e instanceof ApiError ? e.message : "Failed" } }));
        }
      })
    );
    setRunning(false);
  }

  if (SYNC_SOURCES.length === 0) return null;

  return (
    <div className="bg-card border border-border rounded-lg p-4 mb-8">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-sm">Sync everything</div>
          <div className="text-xs text-muted-foreground">Runs each tracker's own sync (Plaid, Cronometer) in one click</div>
        </div>
        <button
          onClick={runSync}
          disabled={running}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-60"
        >
          <RefreshCw className={"h-3.5 w-3.5 " + (running ? "animate-spin" : "")} /> {running ? "Syncing…" : "Sync"}
        </button>
      </div>
      {Object.keys(results).length > 0 && (
        <ul className="mt-3 space-y-1">
          {SYNC_SOURCES.map((source) => {
            const r = results[source.id];
            if (!r) return null;
            return (
              <li key={source.id} className="flex items-center gap-2 text-xs">
                {r === "pending" ? (
                  <RefreshCw className="h-3 w-3 animate-spin text-muted-foreground" />
                ) : r.ok ? (
                  <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                ) : (
                  <XCircle className="h-3 w-3 text-destructive" />
                )}
                <span className="text-muted-foreground">{source.label}:</span>
                <span className={r !== "pending" && !r.ok ? "text-destructive" : ""}>{r === "pending" ? "syncing…" : r.detail}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function Home() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const { user } = useCurrentUser(AUTH_BASE_URL, token);
  const apps = useAppRegistry(AUTH_BASE_URL);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl mb-1">Welcome{user?.name ? `, ${user.name}` : ""}</h1>
      <p className="text-muted-foreground mb-8">This is TrackStack's center console — cross-app tools live here.</p>

      <SyncEverything token={token} />

      <div className="grid gap-3 sm:grid-cols-2 mb-8">
        <Link
          href="/todos"
          className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors"
        >
          <CheckSquare className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <div className="font-medium text-sm">Todos</div>
            <div className="text-xs text-muted-foreground">Manage your cross-app todo list</div>
          </div>
        </Link>
        <Link
          href="/calendar"
          className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors"
        >
          <CalendarDays className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <div className="font-medium text-sm">Calendar</div>
            <div className="text-xs text-muted-foreground">Everything logged, across every tracker</div>
          </div>
        </Link>
        <Link
          href="/goals"
          className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors"
        >
          <Target className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <div className="font-medium text-sm">Goals</div>
            <div className="text-xs text-muted-foreground">Every goal, across every tracker</div>
          </div>
        </Link>
        <Link
          href="/tokens"
          className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors"
        >
          <KeyRound className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <div className="font-medium text-sm">Developer</div>
            <div className="text-xs text-muted-foreground">Personal access tokens for scripts &amp; automations</div>
          </div>
        </Link>
      </div>

      {apps.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Your trackers</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {apps.map((app) => (
              <a
                key={app.id}
                href={app.href}
                className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors"
              >
                <div className="font-medium text-sm">{app.label}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
