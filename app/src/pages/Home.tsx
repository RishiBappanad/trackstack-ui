import { useTrackStackAuth, useCurrentUser, useAppRegistry } from "trackstack-ui";
import { Link } from "wouter";
import { CheckSquare, KeyRound } from "lucide-react";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

export function Home() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const { user } = useCurrentUser(AUTH_BASE_URL, token);
  const apps = useAppRegistry(AUTH_BASE_URL);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl mb-1">Welcome{user?.name ? `, ${user.name}` : ""}</h1>
      <p className="text-muted-foreground mb-8">This is TrackStack's center console — cross-app tools live here.</p>

      <div className="grid gap-3 sm:grid-cols-2 mb-8">
        <Link
          href="/todos"
          className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors"
        >
          <CheckSquare className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <div className="font-medium text-sm">Todos</div>
            <div className="text-xs text-muted-foreground">Manage your cross-app todo list</div>
          </div>
        </Link>
        <Link
          href="/tokens"
          className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors"
        >
          <KeyRound className="h-5 w-5 text-primary flex-shrink-0" />
          <div>
            <div className="font-medium text-sm">Developer</div>
            <div className="text-xs text-muted-foreground">Personal access tokens for scripts &amp; automations</div>
          </div>
        </Link>
      </div>

      {apps.length > 0 && (
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">Your trackers</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {apps.map((app) => (
              <a
                key={app.id}
                href={app.href}
                className="flex items-center gap-3 bg-card border border-border rounded-lg p-4 hover:border-primary transition-colors"
              >
                <div className="font-medium text-sm">{app.label}</div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
