import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useTrackStackAuth } from "trackstack-ui";
import { Plus } from "lucide-react";
import { ApiError } from "../lib/api.js";
import { CUSTOM_BASE_URL, customApi, type TrackerDefinition } from "../lib/customTrackers.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

export function Trackers() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [trackers, setTrackers] = useState<TrackerDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!CUSTOM_BASE_URL) {
      setError("VITE_CUSTOM_API_BASE is not configured for this deployment.");
      return;
    }
    try {
      setTrackers((await customApi("/trackers", token)) as TrackerDefinition[]);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not reach the custom trackers service");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl">My trackers</h1>
        <Link href="/trackers/new" className="flex items-center gap-1 bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm font-medium">
          <Plus className="h-4 w-4" /> New tracker
        </Link>
      </div>

      {error && (
        <div className="mb-4 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md px-3 py-2">{error}</div>
      )}

      {trackers && trackers.length === 0 && (
        <div className="bg-card border border-border rounded-lg p-6 text-sm text-muted-foreground text-center">
          You haven't made a tracker yet. Define the fields you want to record — a workout log, a reading list, anything — and TrackStack
          gives it a form, a list, and the same event API as the built-in trackers.
        </div>
      )}

      <div className="grid gap-3">
        {trackers?.map((t) => (
          <Link key={t.slug} href={`/trackers/${t.slug}`} className="block bg-card border border-border rounded-lg p-4 hover:border-foreground/30">
            <div className="font-medium">{t.name}</div>
            {t.description && <div className="text-sm text-muted-foreground mt-0.5">{t.description}</div>}
            <div className="text-xs text-muted-foreground mt-2">{t.fields.map((f) => f.label).join(" · ")}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
