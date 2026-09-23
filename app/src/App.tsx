import { useEffect, useState } from "react";
import { Route, Switch, Link, useLocation } from "wouter";
import { useTrackStackAuth, useCurrentUser, useAppRegistry, AppSwitcher, MobileAppSwitcher } from "trackstack-ui";
import type { TrackStackApp } from "trackstack-ui";
import { Login } from "./components/Login.js";
import { Home } from "./pages/Home.js";
import { Todos } from "./pages/Todos.js";
import { Calendar } from "./pages/Calendar.js";
import { Goals } from "./pages/Goals.js";
import { Tokens } from "./pages/Tokens.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

// Extract the trackstack-auth token from the URL hash BEFORE
// useTrackStackAuth reads localStorage -- runs synchronously at module
// load time, same pattern nutrition-insights/finance-tracker's own
// App files already use. trackstack-auth's /google/callback redirects
// with #trackstack_token=... (see trackstack-auth/src/routes.ts). This
// was missing entirely here (home's App.tsx was written from scratch
// this session rather than ported from either existing app), which
// combined with a second bug in nutrition/finance's own Google-login
// call sites (passing window.location.origin, losing their own
// /nutrition or /finance path now that the gateway puts every tracker
// on one shared origin) meant a Google login from ANY tracker landed
// back on this page with a token in the hash that nothing ever read --
// "Google OAuth isn't working" for the whole site, found 2026-09-12.
(function extractGoogleToken() {
  const hash = window.location.hash;
  const match = hash.match(/trackstack_token=([^&]+)/);
  if (match) {
    localStorage.setItem("token", match[1]);
    window.location.hash = "";
  }
})();

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const [location] = useLocation();
  const active = location === href;
  return (
    <Link
      href={href}
      className={
        "px-3 py-2 rounded-md text-sm font-medium " +
        (active ? "bg-secondary text-foreground" : "text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </Link>
  );
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const { user } = useCurrentUser(AUTH_BASE_URL, token);

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <AppSwitcher authBaseUrl={AUTH_BASE_URL} currentAppId="home" />
      <div className="flex-1 flex flex-col min-w-0">
        <MobileAppSwitcher authBaseUrl={AUTH_BASE_URL} currentAppId="home" />
        <header className="flex items-center justify-between px-6 py-4 border-b border-border">
          <nav className="flex gap-1">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/todos">Todos</NavLink>
            <NavLink href="/calendar">Calendar</NavLink>
            <NavLink href="/goals">Goals</NavLink>
            <NavLink href="/tokens">Developer</NavLink>
          </nav>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {user?.email && <span>{user.email}</span>}
            <button onClick={onLogout} className="hover:text-foreground">
              Sign out
            </button>
          </div>
        </header>
        <main className="flex-1 p-6 min-w-0">
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/todos" component={Todos} />
            <Route path="/calendar" component={Calendar} />
            <Route path="/goals" component={Goals} />
            <Route path="/tokens" component={Tokens} />
            <Route>
              <p className="text-muted-foreground">Page not found.</p>
            </Route>
          </Switch>
        </main>
      </div>
    </div>
  );
}

/** `returnTo`'s origin must belong to a real, registered TrackStack app --
 * otherwise a crafted `?returnTo=https://evil.example` link could turn
 * Home's own login flow into an open redirect. Origin-only (not a full
 * URL match) because every app lives behind trackstack-gateway on one
 * shared origin in production, where a path-level check would be
 * meaningless; in local dev, where each app is still its own origin,
 * this is the real check. */
function isRegisteredOrigin(url: string, apps: TrackStackApp[]): boolean {
  try {
    const origin = new URL(url).origin;
    return apps.some((app) => {
      try {
        return new URL(app.href).origin === origin;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}

export default function App() {
  const auth = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const apps = useAppRegistry(AUTH_BASE_URL);
  const [ssoChecked, setSsoChecked] = useState(false);
  const [returnTo] = useState(() =>
    typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("returnTo")
  );
  // Deliberately separate from auth.isAuthenticated -- see the big
  // comment on `authenticated` below for why trusting that directly here
  // caused a real infinite redirect loop.
  const [freshlyAuthenticated, setFreshlyAuthenticated] = useState(false);

  useEffect(() => {
    // The ordinary "already logged into Home" shortcut is only safe when
    // there's no returnTo in play: with one, Home's own possibly-stale
    // localStorage token must NOT be trusted on its own (see below), so
    // it's always re-verified against the shared session cookie instead,
    // even if auth.isAuthenticated already reads true from that cache.
    if (!returnTo && auth.isAuthenticated) {
      setSsoChecked(true);
      return;
    }
    auth.trySilentSSO().then((result) => {
      if (result) setFreshlyAuthenticated(true);
    }).finally(() => setSsoChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A fresh, explicit login/register (the user actually typing credentials
  // into the form on THIS page load) counts as freshly authenticated too --
  // only a token that was already sitting in localStorage before any of
  // this ran should not.
  const handleLogin: typeof auth.login = async (email, password) => {
    const result = await auth.login(email, password);
    setFreshlyAuthenticated(true);
    return result;
  };
  const handleRegister: typeof auth.register = async (email, password, name) => {
    const result = await auth.register(email, password, name);
    setFreshlyAuthenticated(true);
    return result;
  };

  // Whether to treat this browser as authenticated. With no returnTo,
  // this is the ordinary case -- trust whatever's already in
  // localStorage, same as any other TrackStack app. With a returnTo,
  // it's NOT: auth.isAuthenticated merely reflects whatever JWT happens
  // to already be cached in HOME's OWN localStorage from some earlier,
  // unrelated visit, and JWTs aren't revocable (only the shared session
  // cookie is, on logout -- see useTrackStackAuth's logout() doc). That
  // combination produced a real infinite loop, found 2026-09-22: a
  // tracker logs out for real (its own token cleared, cookie cleared)
  // and bounces here with returnTo; if Home separately still has an
  // old, merely-not-yet-expired token of its own, the old code below
  // treated THAT as "authenticated" and immediately bounced back to the
  // tracker the user just deliberately left -- which, still genuinely
  // logged out, bounced right back here, forever. Gating the returnTo
  // path on freshlyAuthenticated instead (set only by a real trySilentSSO
  // success or an explicit login/register submission on this page load)
  // means a stale local token can no longer drive that bounce on its own.
  const authenticated = returnTo ? freshlyAuthenticated : auth.isAuthenticated;

  // Home is a waypoint for auth when the browser arrived via
  // ?returnTo=... (bounced here by another tracker's own "not logged in"
  // redirect, see trackstack-ui's redirectToLogin()), not necessarily
  // where the user actually wanted to end up -- once authenticated, send
  // them back there instead of flashing Home's own dashboard first.
  // Waits on the app registry (apps starts empty until GET /apps
  // resolves) so a valid returnTo isn't rejected just because the fetch
  // hasn't landed yet.
  useEffect(() => {
    if (!authenticated || !returnTo || apps.length === 0) return;
    if (!isRegisteredOrigin(returnTo, apps)) return;
    window.location.href = returnTo;
  }, [authenticated, returnTo, apps]);

  if (!ssoChecked) return null;

  if (!authenticated) {
    return (
      <Login
        onLogin={handleLogin}
        onRegister={handleRegister}
        onGoogleLogin={() => auth.loginWithGoogle(returnTo ?? undefined)}
      />
    );
  }

  // Waiting to bounce back via returnTo: keep rendering nothing only
  // while it's still possible that will happen -- either the registry
  // hasn't loaded yet (can't validate returnTo without it) or it has and
  // returnTo checks out (the redirect effect above will navigate away
  // any moment). Once the registry has loaded and returnTo turns out
  // NOT to belong to a real registered app, fall through to the ordinary
  // dashboard instead of leaving the user stuck on a blank page forever.
  if (returnTo && (apps.length === 0 || isRegisteredOrigin(returnTo, apps))) return null;

  return <Shell onLogout={auth.logout} />;
}
