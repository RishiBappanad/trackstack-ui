import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTrackStackAuth } from "../hooks/useTrackStackAuth.js";

afterEach(() => {
  window.localStorage.clear();
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

describe("useTrackStackAuth", () => {
  it("defaults to the 'token' localStorage key", () => {
    window.localStorage.setItem("token", "abc123");
    const { result } = renderHook(() => useTrackStackAuth());
    expect(result.current.token).toBe("abc123");
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("respects a custom tokenKey -- the real-world case both existing apps need (token vs auth_token)", () => {
    window.localStorage.setItem("auth_token", "xyz789");
    const { result } = renderHook(() => useTrackStackAuth({ tokenKey: "auth_token" }));
    expect(result.current.token).toBe("xyz789");
  });

  it("is unauthenticated with no token present", () => {
    const { result } = renderHook(() => useTrackStackAuth());
    expect(result.current.token).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("logout() clears the token from localStorage and state", () => {
    window.localStorage.setItem("token", "abc123");
    const { result } = renderHook(() => useTrackStackAuth());
    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.logout();
    });

    expect(result.current.token).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(window.localStorage.getItem("token")).toBeNull();
  });

  it("logout() also fires a best-effort POST to authBaseUrl/logout to clear the SSO session cookie", () => {
    window.localStorage.setItem("token", "abc123");
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { status: "logged out" }));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTrackStackAuth({ authBaseUrl: "https://auth.example" }));
    act(() => {
      result.current.logout();
    });

    // Local state clears synchronously, without waiting on the fetch.
    expect(result.current.isAuthenticated).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.example/logout",
      expect.objectContaining({ method: "POST", credentials: "include" })
    );
  });

  it("logout() does not fetch when no authBaseUrl was configured", () => {
    window.localStorage.setItem("token", "abc123");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTrackStackAuth());
    act(() => {
      result.current.logout();
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("trySilentSSO() stores and returns a fresh token when a session cookie is valid", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { token: "sso-token", account: { id: 3, email: "e@f.com", name: null } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTrackStackAuth({ authBaseUrl: "https://auth.example" }));

    let response;
    await act(async () => {
      response = await result.current.trySilentSSO();
    });

    expect(fetchMock).toHaveBeenCalledWith("https://auth.example/sso/check", { credentials: "include" });
    expect(response).toEqual({ token: "sso-token", account: { id: 3, email: "e@f.com", name: null } });
    expect(result.current.token).toBe("sso-token");
    expect(result.current.isAuthenticated).toBe(true);
  });

  it("trySilentSSO() resolves to null (not a throw) when there's no active session", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "No active session" })));

    const { result } = renderHook(() => useTrackStackAuth({ authBaseUrl: "https://auth.example" }));

    let response;
    await act(async () => {
      response = await result.current.trySilentSSO();
    });

    expect(response).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it("trySilentSSO() resolves to null without fetching when no authBaseUrl was configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTrackStackAuth());

    let response;
    await act(async () => {
      response = await result.current.trySilentSSO();
    });

    expect(response).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("login() POSTs to authBaseUrl/login, stores the token, and returns the response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, { token: "new-token", account: { id: 1, email: "a@b.com", name: "A" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTrackStackAuth({ authBaseUrl: "https://auth.example" }));

    let response;
    await act(async () => {
      response = await result.current.login("a@b.com", "hunter2");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.example/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "a@b.com", password: "hunter2" }),
      })
    );
    expect(response).toEqual({ token: "new-token", account: { id: 1, email: "a@b.com", name: "A" } });
    expect(result.current.token).toBe("new-token");
    expect(result.current.isAuthenticated).toBe(true);
    expect(window.localStorage.getItem("token")).toBe("new-token");
  });

  it("login() throws the server's error message and does not store a token on failure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(401, { error: "Invalid email or password" })));

    const { result } = renderHook(() => useTrackStackAuth({ authBaseUrl: "https://auth.example" }));

    await expect(
      act(async () => {
        await result.current.login("a@b.com", "wrong");
      })
    ).rejects.toThrow("Invalid email or password");
    expect(result.current.token).toBeNull();
    expect(window.localStorage.getItem("token")).toBeNull();
  });

  it("register() POSTs to authBaseUrl/register with an optional name and stores the token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(201, { token: "reg-token", account: { id: 2, email: "c@d.com", name: null } })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useTrackStackAuth({ authBaseUrl: "https://auth.example", tokenKey: "auth_token" }));

    await act(async () => {
      await result.current.register("c@d.com", "hunter2");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://auth.example/register",
      expect.objectContaining({
        body: JSON.stringify({ email: "c@d.com", password: "hunter2", name: undefined }),
      })
    );
    expect(window.localStorage.getItem("auth_token")).toBe("reg-token");
  });

  it("loginWithGoogle() redirects to the URL the server returns", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { url: "https://accounts.google.com/o/oauth2/v2/auth?foo=bar" }));
    vi.stubGlobal("fetch", fetchMock);
    const originalLocation = window.location;
    // @ts-expect-error -- jsdom's window.location isn't directly assignable; deleting first is the standard workaround.
    delete window.location;
    // @ts-expect-error -- see above.
    window.location = { ...originalLocation, href: "" };

    const { result } = renderHook(() => useTrackStackAuth({ authBaseUrl: "https://auth.example" }));
    await act(async () => {
      await result.current.loginWithGoogle("https://app.example");
    });

    expect(fetchMock).toHaveBeenCalledWith("https://auth.example/google?returnTo=https%3A%2F%2Fapp.example");
    expect(window.location.href).toBe("https://accounts.google.com/o/oauth2/v2/auth?foo=bar");

    // @ts-expect-error -- see above.
    window.location = originalLocation;
  });

  it("loginWithGoogle() throws when the server doesn't return a url", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, { error: "Google OAuth not configured" })));

    const { result } = renderHook(() => useTrackStackAuth({ authBaseUrl: "https://auth.example" }));

    await expect(
      act(async () => {
        await result.current.loginWithGoogle();
      })
    ).rejects.toThrow("Google OAuth not configured");
  });
});
