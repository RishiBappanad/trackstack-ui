// Runs this subpath's implementation against the shared behavioral
// contract in CALENDAR_CONTRACT_FIXTURE.json at the repo root -- the
// same fixture the Python trackstack-calendar-client package's tests
// are run against, so the two implementations can't silently drift.
import { describe, it, expect, vi, afterEach } from "vitest";
import { createCalendarPusher } from "../index.js";
import fixture from "../../../CALENDAR_CONTRACT_FIXTURE.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

function pusher() {
  return createCalendarPusher({ calendarBaseUrl: fixture.calendarBaseUrl, tracker: fixture.tracker });
}

describe("createCalendarPusher (contract)", () => {
  it("posts the exact contract request body and URL for a plain push", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: fixture.successResponseStatus }));
    vi.stubGlobal("fetch", fetchSpy);

    const result = await pusher()(fixture.authHeader, fixture.pushInput as any);

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe(fixture.expectedUrl);
    expect(init.headers.Authorization).toBe(fixture.expectedAuthorizationHeader);
    expect(JSON.parse(init.body as string)).toEqual(fixture.expectedRequestBody);
  });

  it("passes kind through verbatim when provided", async () => {
    const fetchSpy = vi.fn(async () => new Response(null, { status: fixture.successResponseStatus }));
    vi.stubGlobal("fetch", fetchSpy);

    await pusher()(fixture.authHeader, fixture.pushInputWithKind as any);

    const [, init] = fetchSpy.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual(fixture.expectedRequestBodyWithKind);
  });

  it("resolves false (not a throw) for a non-2xx response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: fixture.notFoundResponseStatus })));

    const result = await pusher()(fixture.authHeader, fixture.pushInput as any);
    expect(result).toBe(false);
  });

  it("resolves false (not a throw) when the network call fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );

    const result = await pusher()(fixture.authHeader, fixture.pushInput as any);
    expect(result).toBe(false);
  });

  it("resolves false (not a throw) when the push exceeds its timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: { signal: AbortSignal }) => {
        return new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new Error("aborted")));
        });
      }),
    );

    const push = createCalendarPusher({ calendarBaseUrl: fixture.calendarBaseUrl, tracker: fixture.tracker, timeoutMs: 5 });
    const result = await push(fixture.authHeader, fixture.pushInput as any);
    expect(result).toBe(false);
  });
});
