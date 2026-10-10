import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { usePinnedTrackers, notifyPinnedTrackersChanged } from "../hooks/usePinnedTrackers.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

const PINNED = [{ slug: "runs", name: "Runs", icon: "Dumbbell" }];

describe("usePinnedTrackers", () => {
  it("fetches {customBaseUrl}/trackers/pinned with a bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, PINNED));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePinnedTrackers("https://custom.example.com", "tok123"));
    await waitFor(() => expect(result.current).toEqual(PINNED));
    expect(fetchMock).toHaveBeenCalledWith("https://custom.example.com/trackers/pinned", { headers: { Authorization: "Bearer tok123" } });
  });

  it("does not fetch, and returns [], without a base URL or token", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    expect(renderHook(() => usePinnedTrackers("", "tok123")).result.current).toEqual([]);
    expect(renderHook(() => usePinnedTrackers("https://custom.example.com", null)).result.current).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("fails soft on a non-OK response or a network error -- the rest of the sidebar still works", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));
    const { result } = renderHook(() => usePinnedTrackers("https://custom.example.com", "tok123"));
    await waitFor(() => expect(result.current).toEqual([]));
  });

  it("refetches when notifyPinnedTrackersChanged() fires, without a token/URL change", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(200, [])).mockResolvedValueOnce(jsonResponse(200, PINNED));
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => usePinnedTrackers("https://custom.example.com", "tok123"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    act(() => notifyPinnedTrackersChanged());
    await waitFor(() => expect(result.current).toEqual(PINNED));
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
