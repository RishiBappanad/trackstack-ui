import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  attachBridgeListener, runPrePublishSmokeTest, buildTier2SrcDoc,
  BRIDGE_RATE_LIMIT_MAX_CALLS, SMOKE_TEST_WINDOW_MS,
  type BridgeHandlers,
} from "./tier2Bridge.js";

/**
 * TIER_2_CUSTOM_LAYOUT_SPEC.md's Guardrails, "Reliability: the bridge
 * itself" and "Pre-publish: a mandatory smoke test" -- these test the
 * DISPATCH logic (rate limiting, timeouts, unknown methods, finding
 * collection) against synthetic postMessage events, rather than a real
 * rendered sandboxed iframe: jsdom doesn't reliably execute a `srcdoc`
 * iframe's own scripts the way a real browser does, so the shim string
 * itself (buildTier2SrcDoc's actual output) is verified live, in a real
 * browser, separately -- see that verification note in this feature's
 * own commit/PR, not here.
 */

// A minimal stand-in for the sandboxed iframe's `contentWindow` -- real
// enough for `attachBridgeListener`'s `e.source === win` check, and for
// receiving the dispatcher's postMessage replies.
function fakeIframeWindow() {
  const received: unknown[] = [];
  const win = {
    postMessage: vi.fn((data: unknown) => received.push(data)),
  } as unknown as Window;
  return { win, received };
}

function dispatch(data: unknown, source: Window) {
  window.dispatchEvent(new MessageEvent("message", { data, source }));
}

describe("attachBridgeListener", () => {
  let detach: (() => void) | undefined;
  afterEach(() => {
    detach?.();
    detach = undefined;
  });

  it("ignores a message whose source isn't the exact iframe window it was given", async () => {
    const { win } = fakeIframeWindow();
    const { win: otherWin, received: otherReceived } = fakeIframeWindow();
    const getEntries = vi.fn().mockResolvedValue(["ok"]);
    detach = attachBridgeListener(() => win, { getEntries, getTableSchema: vi.fn(), getContext: vi.fn() });

    dispatch({ trackstackBridge: true, id: 1, method: "getEntries", params: {} }, otherWin);
    await new Promise((r) => setTimeout(r, 10));

    expect(getEntries).not.toHaveBeenCalled();
    expect(otherReceived).toHaveLength(0);
  });

  it("dispatches a real call to the matching handler and replies with its result", async () => {
    const { win, received } = fakeIframeWindow();
    const getEntries = vi.fn().mockResolvedValue([{ id: "e1" }]);
    detach = attachBridgeListener(() => win, { getEntries, getTableSchema: vi.fn(), getContext: vi.fn() });

    dispatch({ trackstackBridge: true, id: 7, method: "getEntries", params: { table_key: "log" } }, win);
    await new Promise((r) => setTimeout(r, 10));

    expect(getEntries).toHaveBeenCalledWith({ table_key: "log" });
    expect(received).toEqual([{ id: 7, result: [{ id: "e1" }] }]);
  });

  it("an unknown method name rejects cleanly instead of hanging", async () => {
    const { win, received } = fakeIframeWindow();
    detach = attachBridgeListener(() => win, { getEntries: vi.fn(), getTableSchema: vi.fn(), getContext: vi.fn() });

    dispatch({ trackstackBridge: true, id: 3, method: "createEntry", params: {} }, win);
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toEqual([{ id: 3, error: expect.stringContaining("unknown method") }]);
  });

  it("a handler that rejects relays the error message, not a hang", async () => {
    const { win, received } = fakeIframeWindow();
    const getEntries = vi.fn().mockRejectedValue(new Error("table not found"));
    detach = attachBridgeListener(() => win, { getEntries, getTableSchema: vi.fn(), getContext: vi.fn() });

    dispatch({ trackstackBridge: true, id: 9, method: "getEntries", params: {} }, win);
    await new Promise((r) => setTimeout(r, 10));

    expect(received).toEqual([{ id: 9, error: "table not found" }]);
  });

  it("rate-limits a burst of calls to the same method within one window", async () => {
    const { win, received } = fakeIframeWindow();
    const getEntries = vi.fn().mockResolvedValue([]);
    detach = attachBridgeListener(() => win, { getEntries, getTableSchema: vi.fn(), getContext: vi.fn() });

    for (let i = 0; i < BRIDGE_RATE_LIMIT_MAX_CALLS + 5; i++) {
      dispatch({ trackstackBridge: true, id: i, method: "getEntries", params: {} }, win);
    }
    await new Promise((r) => setTimeout(r, 20));

    const errors = received.filter((r) => (r as { error?: string }).error?.includes("too many calls"));
    expect(errors.length).toBeGreaterThan(0);
    expect(getEntries.mock.calls.length).toBeLessThanOrEqual(BRIDGE_RATE_LIMIT_MAX_CALLS);
  });
});

describe("buildTier2SrcDoc", () => {
  it("prepends the shim before the author's own HTML, never after", () => {
    const html = "<h1>My dashboard</h1>";
    const srcDoc = buildTier2SrcDoc(html);
    expect(srcDoc.indexOf("window.TrackStack")).toBeLessThan(srcDoc.indexOf(html));
  });

  it("the injected shim never references allow-same-origin", () => {
    expect(buildTier2SrcDoc("<p>x</p>")).not.toContain("allow-same-origin");
  });
});

describe("runPrePublishSmokeTest", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("reports ok when the iframe signals ready and nothing else happens", async () => {
    const { win } = fakeIframeWindow();
    const handlers: BridgeHandlers = { getEntries: vi.fn(), getTableSchema: vi.fn(), getContext: vi.fn() };
    const reportPromise = runPrePublishSmokeTest(() => win, handlers);

    dispatch({ trackstackTierTwoTest: true, type: "ready" }, win);
    await vi.advanceTimersByTimeAsync(SMOKE_TEST_WINDOW_MS);

    const report = await reportPromise;
    expect(report).toMatchObject({ ok: true, loaded: true, findings: [], bridgeCallCount: 0 });
  });

  it("fails the gate and reports an uncaught error with its detail", async () => {
    const { win } = fakeIframeWindow();
    const handlers: BridgeHandlers = { getEntries: vi.fn(), getTableSchema: vi.fn(), getContext: vi.fn() };
    const reportPromise = runPrePublishSmokeTest(() => win, handlers);

    dispatch({ trackstackTierTwoTest: true, type: "ready" }, win);
    dispatch({ trackstackTierTwoTest: true, type: "error", message: "x is not defined", filename: "layout.html", lineno: 12, colno: 3 }, win);
    await vi.advanceTimersByTimeAsync(SMOKE_TEST_WINDOW_MS);

    const report = await reportPromise;
    expect(report.ok).toBe(false);
    expect(report.findings).toEqual([
      expect.objectContaining({ type: "error", message: "x is not defined", filename: "layout.html", lineno: 12, colno: 3 }),
    ]);
  });

  it("fails the gate when the iframe never signals ready within the window", async () => {
    const { win } = fakeIframeWindow();
    const handlers: BridgeHandlers = { getEntries: vi.fn(), getTableSchema: vi.fn(), getContext: vi.fn() };
    const reportPromise = runPrePublishSmokeTest(() => win, handlers);

    await vi.advanceTimersByTimeAsync(SMOKE_TEST_WINDOW_MS);

    const report = await reportPromise;
    expect(report).toMatchObject({ ok: false, loaded: false });
  });

  it("flags a runaway bridge-call volume even with zero errors", async () => {
    const { win } = fakeIframeWindow();
    const handlers: BridgeHandlers = { getEntries: vi.fn().mockResolvedValue([]), getTableSchema: vi.fn(), getContext: vi.fn() };
    const reportPromise = runPrePublishSmokeTest(() => win, handlers);

    dispatch({ trackstackTierTwoTest: true, type: "ready" }, win);
    for (let i = 0; i < 30; i++) {
      dispatch({ trackstackBridge: true, id: i, method: "getEntries", params: {} }, win);
    }
    await vi.advanceTimersByTimeAsync(SMOKE_TEST_WINDOW_MS);

    const report = await reportPromise;
    expect(report.ok).toBe(false);
    expect(report.bridgeCallCountExceeded).toBe(true);
  });
});
