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
}

export interface UseTrackStackAuthResult {
  token: string | null;
  isAuthenticated: boolean;
  logout: () => void;
}

/** Reads/clears the trackstack-auth JWT from localStorage. Does not
 * verify or decode the token -- that's each backend's job on every
 * request (see CLAUDE.md's Authentication Flow: "Each tracker verifies
 * JWT locally"). This hook only tracks whether a token is present. */
export function useTrackStackAuth(
  options: UseTrackStackAuthOptions = {}
): UseTrackStackAuthResult {
  const tokenKey = options.tokenKey ?? "token";
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
  }, [tokenKey]);

  return { token, isAuthenticated: token !== null, logout };
}
