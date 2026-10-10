import { useCallback, useEffect, useState } from "react";
import type { IconName } from "../lib/trackerIcons.js";

/** The shape trackstack-custom's GET /trackers/pinned returns -- just
 * enough to render a sidebar link, not a full tracker definition. */
export interface PinnedTracker {
  slug: string;
  name: string;
  icon: IconName;
}

// Every TrackStack app's own Shell/layout renders AppSwitcher, so every
// one of them needs its own pinned-trackers list to feed it (a pinned
// tracker is meant to be reachable from anywhere, the same as any other
// app's own icon). Only the tracker-builder pages (Home-only today) ever
// change pinning, but any app can listen for the change -- within that
// SAME app's own single-page session; switching apps is a full page
// navigation (AppSwitcher's own hrefs), which already re-fetches on
// mount, so this event only matters for "pin something, stay put, see it
// update without a reload."
const PINNED_CHANGED_EVENT = "trackstack:pinned-trackers-changed";

export function notifyPinnedTrackersChanged(): void {
  window.dispatchEvent(new Event(PINNED_CHANGED_EVENT));
}

/** Fetches the caller's pinned trackers from trackstack-custom's GET
 * /trackers/pinned. `customBaseUrl` is a plain parameter, same as every
 * other hook here (useAppRegistry's authBaseUrl, etc.) -- a shared
 * library can't assume every consumer uses Vite or names its env var the
 * same way. */
export function usePinnedTrackers(customBaseUrl: string, token: string | null): PinnedTracker[] {
  const [pinned, setPinned] = useState<PinnedTracker[]>([]);

  const load = useCallback(() => {
    if (!customBaseUrl || !token) return;
    fetch(`${customBaseUrl}/trackers/pinned`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`GET /trackers/pinned failed (${r.status})`))))
      .then(setPinned)
      .catch(() => {
        // Non-fatal -- the rest of the sidebar still works without this.
      });
  }, [customBaseUrl, token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    window.addEventListener(PINNED_CHANGED_EVENT, load);
    return () => window.removeEventListener(PINNED_CHANGED_EVENT, load);
  }, [load]);

  return pinned;
}
