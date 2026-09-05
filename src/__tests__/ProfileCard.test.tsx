import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ProfileCard } from "../components/ProfileCard.js";

const USER = { id: 1, email: "rishi@example.com", name: "Rishi" };

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve(USER) }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ProfileCard", () => {
  it("shows the resolved name and email once /me responds", async () => {
    render(
      <ProfileCard
        authBaseUrl="https://auth.example.com"
        token="real-token"
        settingsHref="/settings"
        onLogout={() => {}}
      />
    );

    await waitFor(() => expect(screen.getByText("Rishi")).toBeInTheDocument());
    expect(screen.getByText("rishi@example.com")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "https://auth.example.com/me",
      expect.objectContaining({ headers: { Authorization: "Bearer real-token" } })
    );
  });

  it("shows 'Not signed in' and skips the fetch entirely when there's no token", () => {
    render(
      <ProfileCard authBaseUrl="https://auth.example.com" token={null} settingsHref="/settings" onLogout={() => {}} />
    );
    expect(screen.getByText("Not signed in")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("calls onLogout when the logout button is clicked", async () => {
    const onLogout = vi.fn();
    render(
      <ProfileCard authBaseUrl="https://auth.example.com" token="real-token" settingsHref="/settings" onLogout={onLogout} />
    );
    await waitFor(() => expect(screen.getByText("Rishi")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Logout"));
    expect(onLogout).toHaveBeenCalledOnce();
  });

  it("renders children as the tracker-specific stats slot", () => {
    render(
      <ProfileCard authBaseUrl="https://auth.example.com" token={null} settingsHref="/settings" onLogout={() => {}}>
        <div data-testid="custom-stats">Today: 1,800 kcal</div>
      </ProfileCard>
    );
    expect(screen.getByTestId("custom-stats")).toBeInTheDocument();
  });
});
