import { useEffect, useState } from "react";
import type { TrackStackAccount } from "../types.js";

export interface UseCurrentUserResult {
  user: TrackStackAccount | null;
  loading: boolean;
  error: string | null;
}

/** Fetches the current account from trackstack-auth's GET /me. Returns
 * user: null (not an error) if there's no token yet, matching how a
 * consuming app would render "not logged in" without needing to treat
 * that as a fetch failure. */
export function useCurrentUser(
  authBaseUrl: string,
  token: string | null
): UseCurrentUserResult {
  const [user, setUser] = useState<TrackStackAccount | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authBaseUrl || !token) {
      setUser(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`${authBaseUrl}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => {
        if (!r.ok) throw new Error(`GET /me failed (${r.status})`);
        return r.json();
      })
      .then((data) => {
        if (!cancelled) setUser(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authBaseUrl, token]);

  return { user, loading, error };
}
