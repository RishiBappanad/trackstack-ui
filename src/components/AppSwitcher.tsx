import type { LucideIcon } from "lucide-react";
import { Apple, Home, LayoutDashboard, Wallet } from "lucide-react";
import { cn } from "../lib/cn.js";
import { useAppRegistry } from "../hooks/useAppRegistry.js";

/**
 * The app id hardcoded as "current" and the CSS variable family used for
 * styling are both props, not hardcoded, so this one component serves
 * every consuming app.
 *
 * Styling contract: renders Tailwind utility classes against a
 * `switcher-*` CSS custom-property family (bg-switcher,
 * border-switcher-border, bg-switcher-active, text-switcher-foreground,
 * text-switcher-active-foreground) plus `ring-sidebar-ring` for the
 * active-item ring. A consuming app's Tailwind theme must define these
 * -- nutrition-insights already does; see its theme file for real
 * values to copy when adopting this component elsewhere.
 *
 * `switcher-active-foreground` must be chosen to contrast against
 * `switcher-active` specifically, NOT reused from `primary-foreground`
 * -- that token is designed to pair with `primary`, an unrelated color,
 * and a theme where the two colors happen to be similarly dark can end
 * up with an invisible active-icon on exactly the app whose icon is
 * currently active.
 */
const DEFAULT_ICON_MAP: Record<string, LucideIcon> = {
  Wallet,
  Apple,
  LayoutDashboard,
  Home,
};

/**
 * An extra, caller-supplied link rendered in the same strip as the
 * registered apps, separated by a thin divider -- e.g. Home's own
 * per-user pinned custom trackers (trackstack-custom's `pinned` flag).
 * Deliberately NOT sourced from trackstack-auth's app registry: that
 * registry is a deployment-level list of separately-hosted services,
 * global across every user (see its own GET /apps), whereas this is
 * ordinary per-user data the CALLER already has (or fetches its own way)
 * -- AppSwitcher just renders whatever it's handed, the same as it
 * already renders the registry's apps. `active` is supplied rather than
 * computed here because these hrefs are same-app paths (e.g.
 * "/trackers/runs"), not the registry's own cross-origin URLs, and only
 * the caller's router knows the current one.
 */
export interface AppSwitcherExtraItem {
  id: string;
  label: string;
  href: string;
  /** A key into the resolved icon map (defaults + `iconMap` prop). Falls back to LayoutDashboard, same as an app's own unresolved icon. */
  icon: string;
  active: boolean;
}

export interface AppSwitcherProps {
  /** Base URL of trackstack-auth, e.g. import.meta.env.VITE_TRACKSTACK_AUTH_URL */
  authBaseUrl: string;
  /** This app's own id, as registered in trackstack-auth's app registry (e.g. "nutrition"). */
  currentAppId: string;
  /** Extra icon name -> component entries, merged over the defaults (Wallet, Apple, LayoutDashboard). */
  iconMap?: Record<string, LucideIcon>;
  /** Extra links rendered after the registered apps -- see AppSwitcherExtraItem. */
  extraItems?: AppSwitcherExtraItem[];
}

function useResolvedApps(props: AppSwitcherProps) {
  const apps = useAppRegistry(props.authBaseUrl);
  const iconMap = { ...DEFAULT_ICON_MAP, ...props.iconMap };
  return { apps, iconMap };
}

// Plain <a> elements (a full navigation, not SPA routing) even for a
// same-app extraItem -- consistent with every other link here, and keeps
// this library router-agnostic rather than taking a dependency on
// whichever router the consuming app happens to use. A harmless
// full-page reload for an internal link, same tradeoff MobileAppSwitcher
// below already makes.
function SwitcherLink({ href, title, icon: Icon, active, size }: { href: string; title: string; icon: LucideIcon; active: boolean; size: "desktop" | "mobile" }) {
  const dims = size === "desktop" ? "w-10 h-10 rounded-lg" : "w-8 h-8 rounded-md";
  const ring = size === "desktop" ? "ring-2" : "ring-1";
  const iconSize = size === "desktop" ? "h-5 w-5" : "h-4 w-4";
  return (
    <a
      href={href}
      title={title}
      className={cn(
        dims,
        "flex items-center justify-center transition-all duration-200",
        active
          ? `bg-switcher-active text-switcher-active-foreground ${ring} ring-sidebar-ring`
          : "text-switcher-foreground hover:bg-switcher-active/50 hover:text-sidebar-foreground"
      )}
    >
      <Icon className={iconSize} />
    </a>
  );
}

export function AppSwitcher(props: AppSwitcherProps) {
  const { apps, iconMap } = useResolvedApps(props);
  const extraItems = props.extraItems ?? [];
  if (apps.length === 0 && extraItems.length === 0) return null;

  return (
    <aside className="w-16 flex-shrink-0 bg-switcher border-r border-switcher-border hidden md:flex flex-col items-center py-4 gap-3">
      {apps.map((app) => (
        <SwitcherLink key={app.id} href={app.href} title={app.label} icon={iconMap[app.icon] || LayoutDashboard} active={app.id === props.currentAppId} size="desktop" />
      ))}
      {apps.length > 0 && extraItems.length > 0 && <div className="w-8 border-t border-switcher-border" />}
      {extraItems.map((item) => (
        <SwitcherLink key={item.id} href={item.href} title={item.label} icon={iconMap[item.icon] || LayoutDashboard} active={item.active} size="desktop" />
      ))}
    </aside>
  );
}

export function MobileAppSwitcher(props: AppSwitcherProps) {
  const { apps, iconMap } = useResolvedApps(props);
  const extraItems = props.extraItems ?? [];
  if (apps.length === 0 && extraItems.length === 0) return null;

  return (
    <div className="flex md:hidden items-center gap-2 px-2 py-1.5 border-b border-switcher-border bg-switcher">
      {apps.map((app) => (
        <SwitcherLink key={app.id} href={app.href} title={app.label} icon={iconMap[app.icon] || LayoutDashboard} active={app.id === props.currentAppId} size="mobile" />
      ))}
      {apps.length > 0 && extraItems.length > 0 && <div className="h-6 border-l border-switcher-border" />}
      {extraItems.map((item) => (
        <SwitcherLink key={item.id} href={item.href} title={item.label} icon={iconMap[item.icon] || LayoutDashboard} active={item.active} size="mobile" />
      ))}
    </div>
  );
}
