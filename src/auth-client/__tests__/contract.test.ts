// Runs this subpath's implementation against the shared behavioral
// contract in CONTRACT_FIXTURE.json at the repo root -- the same
// fixture the Python trackstack-auth-client package's tests are run
// against, so the two implementations can't silently drift out of sync.
import { describe, it, expect, vi, afterEach } from "vitest";
import { verifyTrackstackToken } from "../index.js";
import fixture from "../../../CONTRACT_FIXTURE.json";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyTrackstackToken (contract)", () => {
  it("verifies a valid JWT locally, with no network call at all", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await verifyTrackstackToken(fixture.validJwt, { jwtSecret: fixture.jwtSecret });

    expect(result).toEqual(fixture.expectedFromValidJwt);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns null for a malformed token when no trackstackAuthUrl is configured", async () => {
    const result = await verifyTrackstackToken(fixture.malformedToken, { jwtSecret: fixture.jwtSecret });
    expect(result).toBeNull();
  });

  it("falls back to POST /tokens/verify for a PAT", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(fixture.patVerifyResponseBody), { status: 200 })),
    );

    const result = await verifyTrackstackToken(fixture.patToken, {
      jwtSecret: fixture.jwtSecret,
      trackstackAuthUrl: fixture.trackstackAuthUrl,
    });

    expect(result).toEqual(fixture.expectedFromPat);
  });

  it("returns null (not a throw) for a revoked PAT", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "Invalid or expired token" }), { status: 401 })),
    );

    const result = await verifyTrackstackToken(fixture.revokedPatToken, {
      jwtSecret: fixture.jwtSecret,
      trackstackAuthUrl: fixture.trackstackAuthUrl,
    });

    expect(result).toBeNull();
  });

  it("returns null (not a throw) when trackstack-auth is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("connection refused");
      }),
    );

    const result = await verifyTrackstackToken(fixture.patToken, {
      jwtSecret: fixture.jwtSecret,
      trackstackAuthUrl: fixture.trackstackAuthUrl,
    });

    expect(result).toBeNull();
  });
});
