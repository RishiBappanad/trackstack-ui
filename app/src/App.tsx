import { useEffect, useState } from "react";
import { Route, Switch, Link, useLocation } from "wouter";
import { useTrackStackAuth, useCurrentUser, AppSwitcher, MobileAppSwitcher } from "trackstack-ui";
import { Login } from "./components/Login.js";
import { Home } from "./pages/Home.js";
import { Todos } from "./pages/Todos.js";
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

export default function App() {
  const auth = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [ssoChecked, setSsoChecked] = useState(false);

  useEffect(() => {
    if (auth.isAuthenticated) {
      setSsoChecked(true);
      return;
    }
    auth.trySilentSSO().finally(() => setSsoChecked(true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ssoChecked) return null;

  if (!auth.isAuthenticated) {
    return <Login onLogin={auth.login} onRegister={auth.register} onGoogleLogin={auth.loginWithGoogle} />;
  }

  return <Shell onLogout={auth.logout} />;
}
