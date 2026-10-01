import { useEffect, useState } from "react";
import type { TrackStackApp } from "../types.js";

/**
 * Fetches the cross-app registry from trackstack-auth's GET /apps.
 *
 * `authBaseUrl` is a plain parameter rather than a hardcoded env var
 * read, since a shared library can't assume every future consumer uses
 * Vite, or names the env var the same way.
 */
export function useAppRegistry(authBaseUrl: string): TrackStackApp[] {
  const [apps, setApps] = useState<TrackStackApp[]>([]);

  useEffect(() => {
    if (!authBaseUrl) return;
    let cancelled = false;
    fetch(`${authBaseUrl}/apps`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) setApps(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [authBaseUrl]);

  return apps;
}
