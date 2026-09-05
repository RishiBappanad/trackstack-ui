import type { LucideIcon } from "lucide-react";
import { Apple, LayoutDashboard, Wallet } from "lucide-react";
import { cn } from "../lib/cn.js";
import { useAppRegistry } from "../hooks/useAppRegistry.js";

/**
 * Extracted from two independently hand-rolled, nearly byte-identical
 * copies that already existed in nutrition-insights
 * (components/app-switcher.jsx) and finance-tracker
 * (artifacts/receipt-wallet/src/components/app-switcher.tsx) -- the
 * only real differences were which app id was hardcoded as "current"
 * and which CSS variable family was used for styling. Both hardcoded
 * details are now props instead.
 *
 * Styling contract: renders Tailwind utility classes against a
 * `switcher-*` CSS custom-property family (bg-switcher,
 * border-switcher-border, bg-switcher-active, text-switcher-foreground)
 * plus `ring-sidebar-ring` for the active-item ring. A consuming app's
 * Tailwind theme must define these -- nutrition-insights already does;
 * see its theme file for real values to copy when adopting this
 * component elsewhere.
 */
const DEFAULT_ICON_MAP: Record<string, LucideIcon> = {
  Wallet,
  Apple,
  LayoutDashboard,
};

export interface AppSwitcherProps {
  /** Base URL of trackstack-auth, e.g. import.meta.env.VITE_TRACKSTACK_AUTH_URL */
  authBaseUrl: string;
  /** This app's own id, as registered in trackstack-auth's app registry (e.g. "nutrition"). */
  currentAppId: string;
  /** Extra icon name -> component entries, merged over the defaults (Wallet, Apple, LayoutDashboard). */
  iconMap?: Record<string, LucideIcon>;
}

function useResolvedApps(props: AppSwitcherProps) {
  const apps = useAppRegistry(props.authBaseUrl);
  const iconMap = { ...DEFAULT_ICON_MAP, ...props.iconMap };
  return { apps, iconMap };
}

export function AppSwitcher(props: AppSwitcherProps) {
  const { apps, iconMap } = useResolvedApps(props);
  if (apps.length === 0) return null;

  return (
    <aside className="w-16 flex-shrink-0 bg-switcher border-r border-switcher-border hidden md:flex flex-col items-center py-4 gap-3">
      {apps.map((app) => {
        const Icon = iconMap[app.icon] || LayoutDashboard;
        const isActive = app.id === props.currentAppId;
        return (
          <a
            key={app.id}
            href={app.href}
            title={app.label}
            className={cn(
              "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200",
              isActive
                ? "bg-switcher-active text-primary-foreground ring-2 ring-sidebar-ring"
                : "text-switcher-foreground hover:bg-switcher-active/50 hover:text-sidebar-foreground"
            )}
          >
            <Icon className="h-5 w-5" />
          </a>
        );
      })}
    </aside>
  );
}

export function MobileAppSwitcher(props: AppSwitcherProps) {
  const { apps, iconMap } = useResolvedApps(props);
  if (apps.length === 0) return null;

  return (
    <div className="flex md:hidden items-center gap-2 px-2 py-1.5 border-b border-switcher-border bg-switcher">
      {apps.map((app) => {
        const Icon = iconMap[app.icon] || LayoutDashboard;
        const isActive = app.id === props.currentAppId;
        return (
          <a
            key={app.id}
            href={app.href}
            title={app.label}
            className={cn(
              "w-8 h-8 rounded-md flex items-center justify-center transition-all duration-200",
              isActive
                ? "bg-switcher-active text-primary-foreground ring-1 ring-sidebar-ring"
                : "text-switcher-foreground hover:bg-switcher-active/50"
            )}
          >
            <Icon className="h-4 w-4" />
          </a>
        );
      })}
    </div>
  );
}
