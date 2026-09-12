import { useCallback, useEffect, useState } from "react";
import { useTrackStackAuth } from "trackstack-ui";
import { Trash2 } from "lucide-react";
import { apiFetch, ApiError } from "../lib/api.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

interface PersonalAccessToken {
  id: number;
  name: string;
  created_at: string;
  last_used_at: string | null;
}

export function Tokens() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [tokens, setTokens] = useState<PersonalAccessToken[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justCreated, setJustCreated] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = (await apiFetch(AUTH_BASE_URL, "/tokens", token)) as PersonalAccessToken[];
      setTokens(data);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load tokens");
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const data = (await apiFetch(AUTH_BASE_URL, "/tokens", token, {
        method: "POST",
        body: JSON.stringify({ name: name.trim() }),
      })) as { token: string };
      setJustCreated(data.token);
      setName("");
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not create token");
    }
  }

  async function revoke(id: number) {
    try {
      await apiFetch(AUTH_BASE_URL, `/tokens/${id}`, token, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not revoke token");
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl mb-1">Personal access tokens</h1>
      <p className="text-sm text-muted-foreground mb-6">
        Long-lived credentials for hitting TrackStack APIs directly — scripts, cross-tracker automations, anything
        that isn't a browser. A token authenticates as your full account everywhere a login would.
      </p>

      {error && (
        <div className="mb-4 bg-destructive/10 border border-destructive text-destructive text-sm rounded-md px-3 py-2">
          {error}
        </div>
      )}

      {justCreated && (
        <div className="mb-4 bg-accent border border-primary rounded-md px-3 py-3 text-sm">
          <p className="mb-2 font-medium">Copy this now — it won't be shown again.</p>
          <code className="block bg-background rounded px-2 py-1.5 text-xs break-all">{justCreated}</code>
          <button onClick={() => setJustCreated(null)} className="text-xs text-muted-foreground mt-2 hover:text-foreground">
            Dismiss
          </button>
        </div>
      )}

      <form onSubmit={createToken} className="flex gap-2 mb-6">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. todo-tracker automation"
          className="flex-1 bg-secondary border border-border rounded-md px-3 py-2 text-sm"
        />
        <button type="submit" className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium">
          Create token
        </button>
      </form>

      <div className="bg-card border border-border rounded-lg divide-y divide-border">
        {tokens.length === 0 && <p className="p-6 text-sm text-muted-foreground text-center">No tokens yet.</p>}
        {tokens.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm">{t.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                Created {new Date(t.created_at).toLocaleDateString()}
                {t.last_used_at ? ` · last used ${new Date(t.last_used_at).toLocaleDateString()}` : " · never used"}
              </div>
            </div>
            <button onClick={() => revoke(t.id)} className="text-muted-foreground hover:text-destructive flex-shrink-0" aria-label="Revoke">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
