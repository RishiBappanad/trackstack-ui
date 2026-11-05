import { createContext, useContext } from "react";

/** Whether the CURRENT route is inside a pinned tracker -- set once, by
 * Shell (App.tsx), from the same `usePinnedTrackers()` list it already
 * fetches for the sidebar. A pinned tracker gets its own `TrackerChrome`
 * header in place of TrackStack's shared top nav (the user's own framing:
 * "if it's sidebarred it should appear more independently"); an unpinned
 * one keeps the ordinary shared-nav experience, nested under "Trackers"
 * like any other builder page. Consumed by TrackerHome/TrackerView, which
 * skip their own redundant identity/breadcrumb row when this is true,
 * since TrackerChrome already covers it. Context over a prop/hook-per-page
 * so the pinned check happens once, in Shell, rather than refetching
 * per-page. */
export const TrackerChromeContext = createContext(false);

export function usePinnedTrackerChrome(): boolean {
  return useContext(TrackerChromeContext);
}
