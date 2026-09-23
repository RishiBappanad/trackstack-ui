import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { getHomeAppUrl, redirectToLogin } from "../lib/redirectToLogin.js";

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

const APPS = [
  { id: "home", label: "TrackStack Home", icon: "Home", href: "https://home.example" },
  { id: "finance", label: "Finance Tracker", icon: "Wallet", href: "https://finance.example" },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getHomeAppUrl", () => {
  it("finds the 'home' entry in the app registry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, APPS)));
    expect(await getHomeAppUrl("https://auth.example")).toBe("https://home.example");
  });

  it("resolves null when the registry has no 'home' entry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, [APPS[1]])));
    expect(await getHomeAppUrl("https://auth.example")).toBeNull();
  });

  it("resolves null (never throws) when the fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    expect(await getHomeAppUrl("https://auth.example")).toBeNull();
  });

  it("resolves null on a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));
    expect(await getHomeAppUrl("https://auth.example")).toBeNull();
  });
});

describe("redirectToLogin", () => {
  // window.location isn't normally reassignable in jsdom -- replace it
  // with a plain writable object so `window.location.href = ...` can be
  // asserted on, same as any other navigation-triggering function needs.
  let originalLocation: Location;

  beforeEach(() => {
    originalLocation = window.location;
    // @ts-expect-error -- deliberately replacing the read-only property for this test file only
    delete window.location;
    (window as unknown as { location: { href: string } }).location = { href: "" };
  });

  afterEach(() => {
    (window as unknown as { location: Location }).location = originalLocation;
  });

  it("navigates to Home's own url with no query string when returnTo is omitted", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, APPS)));
    await redirectToLogin("https://auth.example");
    expect(window.location.href).toBe("https://home.example");
  });

  it("navigates to Home with an encoded returnTo query param", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(200, APPS)));
    await redirectToLogin("https://auth.example", "https://finance.example/receipts?x=1");
    expect(window.location.href).toBe(
      "https://home.example?returnTo=https%3A%2F%2Ffinance.example%2Freceipts%3Fx%3D1"
    );
  });

  it("does not navigate when Home's url can't be resolved", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await redirectToLogin("https://auth.example", "https://finance.example/receipts");
    expect(window.location.href).toBe("");
  });
});
