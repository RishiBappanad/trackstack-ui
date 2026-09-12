import { useCallback, useEffect, useState } from "react";

export interface UseTrackStackAuthOptions {
  /**
   * localStorage key the JWT is stored under. Defaults to "token", but
   * MUST be overridden by any app that doesn't use that key -- per
   * CLAUDE.md's Authentication Flow section, this already varies
   * per app today ("token" for nutrition, "auth_token" for finance).
   * Standardizing this across apps is a real follow-up (see
   * EVENT_CONTRACT_SPEC.md-style open questions), not something this
   * library can silently assume away.
   */
  tokenKey?: string;
  /**
   * Base URL of the trackstack-auth service (e.g.
   * import.meta.env.VITE_TRACKSTACK_AUTH_URL). Required to call
   * login/register/loginWithGoogle -- omit it if an app only ever reads
   * an already-issued token (isAuthenticated/logout), never issues one
   * itself.
   */
  authBaseUrl?: string;
}

export interface TrackStackAccount {
  id: number;
  email: string;
  name: string | null;
}

export interface TrackStackAuthResponse {
  token: string;
  account: TrackStackAccount;
}

export interface UseTrackStackAuthResult {
  token: string | null;
  isAuthenticated: boolean;
  /** Clears the local token immediately (synchronous, so the UI can drop
   * into its logged-out state right away) and, best-effort in the
   * background, POSTs {authBaseUrl}/logout to clear trackstack-auth's
   * own SSO session cookie too -- without this second part, a user who
   * explicitly logs out of one app could get silently re-authenticated
   * the next time they (or another app) call trySilentSSO(), since the
   * cookie would still be valid. Not awaited and never throws -- a
   * failed background cookie-clear shouldn't block or error out an
   * otherwise-successful local logout. */
  logout: () => void;
  /** POSTs to {authBaseUrl}/login, stores the returned token, and returns
   * the full response (token + account) for callers that also want the
   * account (e.g. to seed their own user state). Throws on a non-2xx
   * response or a response with no token, with the server's own `error`
   * message when present. */
  login: (email: string, password: string) => Promise<TrackStackAuthResponse>;
  /** Same contract as login(), POSTing to {authBaseUrl}/register. `name`
   * is optional -- trackstack-auth itself treats it as optional. */
  register: (email: string, password: string, name?: string) => Promise<TrackStackAuthResponse>;
  /** Fetches {authBaseUrl}/google?returnTo=... and redirects the browser
   * to the returned Google OAuth URL (window.location.href = ...) --
   * doesn't return a token itself, since the actual token issuance
   * happens after Google redirects back through /google/callback.
   * `returnTo` defaults to the current origin. Throws if the server
   * doesn't return a url (e.g. Google OAuth not configured). */
  loginWithGoogle: (returnTo?: string) => Promise<void>;
  /** Single sign-on: GETs {authBaseUrl}/sso/check with credentials
   * included, so trackstack-auth's own session cookie -- set at
   * login/register/Google-callback time, possibly from a DIFFERENT
   * TrackStack app entirely -- rides along automatically. If that
   * cookie is still valid, stores the freshly-issued token exactly like
   * login()/register() do and returns the response; if there's no
   * session (never logged in anywhere, or explicitly logged out),
   * resolves to `null` rather than throwing -- this is an expected,
   * routine outcome (most first visits), not an error condition. Meant
   * to be called once on app load, before falling back to showing a
   * login page. */
  trySilentSSO: () => Promise<TrackStackAuthResponse | null>;
}

/** Reads/clears the trackstack-auth JWT from localStorage, and (given
 * `authBaseUrl`) issues one via login/register/Google -- the full
 * client-side surface every TrackStack app needs to talk to
 * trackstack-auth, in one place instead of each app hand-rolling the
 * same three fetch calls independently (see workspace-notes/
 * ACTION_ITEMS.md's cross-repo duplication scan, 2026-09-10: this hook
 * existed with zero consumers while nutrition-insights and
 * finance-tracker each reimplemented the whole thing from scratch).
 * Does not verify or decode the token -- that's each backend's job on
 * every request (see CLAUDE.md's Authentication Flow: "Each tracker
 * verifies JWT locally"). */
export function useTrackStackAuth(
  options: UseTrackStackAuthOptions = {}
): UseTrackStackAuthResult {
  const tokenKey = options.tokenKey ?? "token";
  const authBaseUrl = options.authBaseUrl ?? "";
  const [token, setToken] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem(tokenKey)
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === tokenKey) setToken(e.newValue);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [tokenKey]);

  const logout = useCallback(() => {
    window.localStorage.removeItem(tokenKey);
    setToken(null);
    if (authBaseUrl) {
      fetch(`${authBaseUrl}/logout`, { method: "POST", credentials: "include" }).catch(() => {
        // Best-effort -- the local logout above already happened either way.
      });
    }
  }, [tokenKey, authBaseUrl]);

  const issueToken = useCallback(
    async (path: "/login" | "/register", body: Record<string, unknown>): Promise<TrackStackAuthResponse> => {
      const res = await fetch(`${authBaseUrl}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include", // required for the SSO session cookie in the response to actually be stored
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        throw new Error(data.error || (path === "/login" ? "Login failed" : "Registration failed"));
      }
      window.localStorage.setItem(tokenKey, data.token);
      setToken(data.token);
      return data;
    },
    [authBaseUrl, tokenKey]
  );

  const login = useCallback(
    (email: string, password: string) => issueToken("/login", { email, password }),
    [issueToken]
  );

  const register = useCallback(
    (email: string, password: string, name?: string) => issueToken("/register", { email, password, name }),
    [issueToken]
  );

  const loginWithGoogle = useCallback(
    async (returnTo?: string) => {
      // Defaults to origin + pathname, not just origin -- with every
      // TrackStack app now potentially living behind trackstack-gateway
      // on one shared origin (e.g. gateway/nutrition, gateway/finance),
      // an origin-only default silently drops which app the user was
      // actually on, so trackstack-auth's /google/callback redirect
      // lands on the gateway's bare root instead of back on the caller.
      // Real bug, not hypothetical: nutrition-insights and finance-tracker
      // both explicitly passed window.location.origin at their own call
      // sites before this fix (2026-09-12) and hit exactly this.
      const target = returnTo ?? (typeof window === "undefined" ? "" : window.location.origin + window.location.pathname);
      const res = await fetch(`${authBaseUrl}/google?returnTo=${encodeURIComponent(target)}`);
      const data = await res.json();
      if (!data.url) throw new Error(data.error || "Google login unavailable");
      window.location.href = data.url;
    },
    [authBaseUrl]
  );

  const trySilentSSO = useCallback(async (): Promise<TrackStackAuthResponse | null> => {
    if (!authBaseUrl) return null;
    try {
      const res = await fetch(`${authBaseUrl}/sso/check`, { credentials: "include" });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.token) return null;
      window.localStorage.setItem(tokenKey, data.token);
      setToken(data.token);
      return data;
    } catch {
      return null;
    }
  }, [authBaseUrl, tokenKey]);

  return { token, isAuthenticated: token !== null, logout, login, register, loginWithGoogle, trySilentSSO };
}
