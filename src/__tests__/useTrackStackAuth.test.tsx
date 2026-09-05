import { describe, it, expect, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTrackStackAuth } from "../hooks/useTrackStackAuth.js";

afterEach(() => {
  window.localStorage.clear();
});

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
});
