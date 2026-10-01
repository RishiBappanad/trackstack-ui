import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Dumbbell } from "lucide-react";
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

  it("styles the active item against switcher-active-foreground, not primary-foreground", async () => {
    // A theme's primary-foreground is chosen to pair with `primary`, an
    // unrelated color -- reusing it here instead of a dedicated token
    // risks an active icon that's invisible against switcher-active in
    // any theme where the two colors happen to be similarly dark.
    render(<AppSwitcher authBaseUrl="https://auth.example.com" currentAppId="finance" />);
    const financeLink = await screen.findByTitle("Finance Tracker");
    expect(financeLink.className).toContain("text-switcher-active-foreground");
    expect(financeLink.className).not.toContain("text-primary-foreground");
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

  describe("extraItems", () => {
    const extraItems = [{ id: "custom_runs", label: "Runs", href: "/trackers/runs", icon: "Dumbbell", active: true }];

    it("renders an extra item alongside the registered apps, using its own `active` rather than currentAppId", async () => {
      render(<AppSwitcher authBaseUrl="https://auth.example.com" currentAppId="nutrition" iconMap={{ Dumbbell }} extraItems={extraItems} />);
      const link = await screen.findByTitle("Runs");
      expect(link).toHaveAttribute("href", "/trackers/runs");
      expect(link.className).toContain("bg-switcher-active");
      // The registered app itself is unaffected -- still governed by currentAppId.
      expect((await screen.findByTitle("Nutrition Insights")).className).toContain("bg-switcher-active");
    });

    it("renders even with an empty registry, and nothing at all with neither", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ json: () => Promise.resolve([]) }));
      const { container } = render(<AppSwitcher authBaseUrl="https://auth.example.com" currentAppId="nutrition" extraItems={extraItems} />);
      await waitFor(() => expect(screen.getByTitle("Runs")).toBeInTheDocument());

      const { container: empty } = render(<AppSwitcher authBaseUrl="https://auth.example.com" currentAppId="nutrition" />);
      await waitFor(() => expect(empty).toBeEmptyDOMElement());
      expect(container).not.toBeEmptyDOMElement();
    });
  });
});
