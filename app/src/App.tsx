import { useEffect, useState } from "react";
import { Route, Switch, Link, useLocation } from "wouter";
import { useTrackStackAuth, useCurrentUser, AppSwitcher, MobileAppSwitcher } from "trackstack-ui";
import { Login } from "./components/Login.js";
import { Home } from "./pages/Home.js";
import { Todos } from "./pages/Todos.js";
import { Tokens } from "./pages/Tokens.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

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
