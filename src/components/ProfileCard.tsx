import type { ReactNode } from "react";
import { LogOut, Settings, User } from "lucide-react";
import { cn } from "../lib/cn.js";
import { useCurrentUser } from "../hooks/useCurrentUser.js";

/**
 * Deliberately scoped to what's actually generic across every tracker:
 * identity (name/email), a settings link, and logout. The original
 * plan (see workspace-notes/ACTION_ITEMS.md's P1.3) also called for
 * "quick stats (today's summary, current goal)" -- that's inherently
 * tracker-specific (nutrition's "today's summary" and finance's don't
 * share a shape), so instead of inventing a fake generic stats format,
 * `children` is where a consuming app renders its own summary widget
 * underneath the identity block. Don't build a generic stats renderer
 * here until a second tracker's actual shape is known well enough to
 * find the real common structure, if any.
 */
export interface ProfileCardProps {
  authBaseUrl: string;
  token: string | null;
  settingsHref: string;
  onLogout: () => void;
  children?: ReactNode;
  className?: string;
}

export function ProfileCard({
  authBaseUrl,
  token,
  settingsHref,
  onLogout,
  children,
  className,
}: ProfileCardProps) {
  const { user, loading } = useCurrentUser(authBaseUrl, token);

  return (
    <div className={cn("rounded-lg border border-border bg-card p-4 space-y-3", className)}>
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
          <User className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          {loading ? (
            <div className="h-4 w-24 rounded bg-muted animate-pulse" />
          ) : (
            <>
              <p className="text-sm font-medium text-foreground truncate">
                {user?.name || user?.email || "Not signed in"}
              </p>
              {user?.name && (
                <p className="text-xs text-muted-foreground truncate">{user.email}</p>
              )}
            </>
          )}
        </div>
      </div>

      {children}

      <div className="flex items-center gap-2 pt-1 border-t border-border">
        <a
          href={settingsHref}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </a>
        <button
          onClick={onLogout}
          className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          Logout
        </button>
      </div>
    </div>
  );
}
