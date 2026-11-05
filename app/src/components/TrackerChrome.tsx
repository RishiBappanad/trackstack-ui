import { Link, useLocation } from "wouter";
import { ICON_COMPONENTS, type PinnedTracker } from "trackstack-ui";

/** The "own app" header for a PINNED tracker -- rendered by Shell (App.tsx)
 * in place of TrackStack's shared top nav, the same way finance-tracker or
 * nutrition-insights never show a "Home/Todos/Calendar/.../Developer" row
 * because that's not their app. Inverted (bg-foreground/text-background)
 * rather than a new hardcoded color, so it reads as a distinct title bar
 * against the rest of the light theme while still tracking each account's
 * own chosen hue/lightness -- no new design tokens needed.
 *
 * Deliberately covers every tracker route (Home, a table, Integrations,
 * Edit tracker/table) from one place in Shell, rather than each page
 * rendering its own copy -- TrackerHome/TrackerView read
 * `usePinnedTrackerChrome()` only to skip their OWN now-redundant
 * identity/breadcrumb row, never to re-render this bar themselves. */
export function TrackerChrome({
  tracker, email, onLogout, onDelete,
}: {
  tracker: PinnedTracker;
  email?: string;
  onLogout: () => void;
  onDelete?: () => void;
}) {
  const [location] = useLocation();
  const Icon = ICON_COMPONENTS[tracker.icon];
  const base = `/trackers/${tracker.slug}`;
  const onIntegrations = location === `${base}/integrations`;
  const onGoals = location === `${base}/goals`;
  const onEdit = location === `${base}/edit`;

  function linkClass(active: boolean) {
    return "text-xs font-semibold whitespace-nowrap " + (active ? "text-background" : "text-background/55 hover:text-background");
  }

  return (
    <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 md:px-6 py-3 bg-foreground text-background flex-shrink-0">
      <div className="flex items-center gap-5 min-w-0">
        <Link href={base} className="flex items-center gap-2 min-w-0 flex-shrink-0">
          <span className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
            <Icon className="h-4 w-4" />
          </span>
          <span className="font-semibold text-sm truncate">{tracker.name}</span>
        </Link>
        <nav className="flex items-center gap-4 overflow-x-auto">
          <Link href={base} className={linkClass(location === base)}>Home</Link>
          <Link href={`${base}/goals`} className={linkClass(onGoals)}>Goals</Link>
          <Link href={`${base}/integrations`} className={linkClass(onIntegrations)}>Integrations</Link>
          <Link href={`${base}/edit`} className={linkClass(onEdit)}>Edit tracker</Link>
        </nav>
      </div>
      <div className="flex items-center gap-4 text-xs text-background/55 flex-shrink-0">
        <Link href="/trackers" className="hover:text-background whitespace-nowrap">All trackers</Link>
        {onDelete && (
          <button onClick={onDelete} className="hover:text-destructive whitespace-nowrap">Delete tracker</button>
        )}
        {email && <span className="hidden lg:inline truncate max-w-[180px]">{email}</span>}
        <button onClick={onLogout} className="hover:text-background whitespace-nowrap">Sign out</button>
      </div>
    </header>
  );
}
