import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppSwitcher } from "../components/AppSwitcher.js";

const APPS = [
  { id: "nutrition", label: "Nutrition Insights", icon: "Apple", href: "https://nutrition.example.com" },
  { id: "finance", label: "Finance Tracker", icon: "Wallet", href: "https://finance.example.com" },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({ json: () => Promise.resolve(APPS) })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AppSwitcher", () => {
  it("fetches from {authBaseUrl}/apps and renders a link per app", async () => {
    render(<AppSwitcher authBaseUrl="https://auth.example.com" currentAppId="nutrition" />);

    await waitFor(() => {
      expect(screen.getByTitle("Nutrition Insights")).toBeInTheDocument();
    });
    expect(screen.getByTitle("Finance Tracker")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("https://auth.example.com/apps");
  });

  it("marks the current app as active via its href/title, not by omitting others", async () => {
    render(<AppSwitcher authBaseUrl="https://auth.example.com" currentAppId="finance" />);

    const financeLink = await screen.findByTitle("Finance Tracker");
    const nutritionLink = screen.getByTitle("Nutrition Insights");
    // Both apps still render -- "current" only changes styling, never hides siblings.
    expect(financeLink).toHaveAttribute("href", "https://finance.example.com");
    expect(nutritionLink).toHaveAttribute("href", "https://nutrition.example.com");
  });

  it("renders nothing before the registry has loaded", () => {
    // A fetch that never resolves within this test -- isolates the
    // synchronous initial-render check from the mocked fetch's
    // resolution, which otherwise races an unawaited state update.
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container } = render(
      <AppSwitcher authBaseUrl="https://auth.example.com" currentAppId="nutrition" />
    );
    expect(container).toBeEmptyDOMElement();
  });
});
