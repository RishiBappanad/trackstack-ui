/**
 * TIER_2_CUSTOM_LAYOUT_SPEC.md: the sandboxed-iframe shim, the parent-
 * side postMessage dispatcher, and the pre-publish smoke test. This is
 * the one place all three live, so the published layout, the live
 * editor preview, and the pre-publish test all run the EXACT same
 * injected shim -- never three slightly different code paths that could
 * drift from each other.
 *
 * SandboxedCustomLayoutFrame.tsx (the only component that ever renders
 * the iframe itself) is the security-critical half of this feature --
 * see that file and its own test for the sandbox-attribute guardrails.
 * This file is the reliability half: the bridge's rate limiting/
 * timeouts/unknown-method handling, and the smoke test's error capture.
 */

// ---- The shim injected into every Tier 2 srcdoc ---------------------

/** A reserved tag distinguishing a real bridge call (getEntries/
 * getTableSchema/getContext) from a smoke-test-only message
 * (error/rejection/ready) on the same postMessage channel -- so the two
 * listeners below can never mistake one for the other. */
const BRIDGE_TAG = "trackstackBridge";
const TEST_TAG = "trackstackTierTwoTest";

/** Defense in depth alongside the sandbox attribute itself: no network
 * of its own (connect-src 'none' -- the bridge is the only way out),
 * no nested frames/plugins/form navigation. Needs real browser
 * verification before being fully trusted (TIER_2_CUSTOM_LAYOUT_SPEC.md's
 * own open question) -- this is a reasonable first draft, not assumed
 * final. img-src/font-src allow https:/data: deliberately (a chart
 * referencing an icon or inline image is a normal, low-risk thing to
 * want; it's connect-src, not these, that would let the layout exfiltrate
 * structured data on its own). */
const TIER_2_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; " +
  "img-src data: https:; font-src data: https:; connect-src 'none'; " +
  "frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none';";

/** Injected once, before the author's own HTML -- defines window.TrackStack
 * (the read-only bridge client) and installs the error/rejection relay
 * that's what makes the pre-publish smoke test's report detailed instead
 * of the sanitized "Script error." a cross-origin parent would otherwise
 * see. Always present, in every rendered instance (preview, smoke test,
 * published) -- never a separate "test mode" build, so what's tested is
 * exactly what ships. */
const TIER_2_SHIM = `
<meta http-equiv="Content-Security-Policy" content="${TIER_2_CSP}">
<script>
(function () {
  var nextId = 0;
  var pending = {};
  window.addEventListener("message", function (e) {
    var data = e.data;
    if (!data || typeof data !== "object" || data.id === undefined || !(data.id in pending)) return;
    var entry = pending[data.id];
    delete pending[data.id];
    if (data.error) entry.reject(new Error(data.error));
    else entry.resolve(data.result);
  });
  function call(method, params) {
    var id = ++nextId;
    return new Promise(function (resolve, reject) {
      pending[id] = { resolve: resolve, reject: reject };
      window.parent.postMessage({ ${JSON.stringify(BRIDGE_TAG)}: true, id: id, method: method, params: params || {} }, "*");
    });
  }
  window.TrackStack = {
    getEntries: function (params) { return call("getEntries", params); },
    getTableSchema: function (params) { return call("getTableSchema", params); },
    getContext: function () { return call("getContext", {}); },
  };

  function relay(type, detail) {
    window.parent.postMessage(Object.assign({ ${JSON.stringify(TEST_TAG)}: true, type: type }, detail), "*");
  }
  window.addEventListener("error", function (e) {
    relay("error", { message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, stack: e.error && e.error.stack });
  });
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    relay("unhandledrejection", { message: r && r.message ? r.message : String(r), stack: r && r.stack });
  });
  if (document.readyState === "complete") relay("ready", {});
  else window.addEventListener("load", function () { relay("ready", {}); });
})();
</script>
`;

/** The ONLY place custom_ui_html(_draft) is turned into an actual
 * srcdoc string -- used identically by the editor's live preview, the
 * pre-publish smoke test, and TrackerHome's published render. */
export function buildTier2SrcDoc(authorHtml: string): string {
  return TIER_2_SHIM + authorHtml;
}

// ---- Parent-side bridge dispatcher ------------------------------------

export interface BridgeHandlers {
  getEntries(params: unknown): Promise<unknown>;
  getTableSchema(params: unknown): Promise<unknown>;
  getContext(params: unknown): Promise<unknown>;
}

/** A backend hiccup must reject the iframe's pending promise, not hang
 * it forever (TIER_2_CUSTOM_LAYOUT_SPEC.md's Guardrails, "Reliability:
 * the bridge itself"). */
export const BRIDGE_CALL_TIMEOUT_MS = 10_000;

/** A buggy loop (`setInterval(() => TrackStack.getEntries(...), 0)`)
 * must not be able to burn the account's own rate-limit budget --
 * capped here, independent of and tighter than the backend's own
 * 300/min limiter, before a single one of these calls even reaches the
 * network. */
export const BRIDGE_RATE_LIMIT_WINDOW_MS = 1000;
export const BRIDGE_RATE_LIMIT_MAX_CALLS = 10;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

interface BridgeMessage {
  id: number;
  method: string;
  params: unknown;
}

function isBridgeMessage(data: unknown): data is BridgeMessage {
  return !!data && typeof data === "object" && (data as Record<string, unknown>)[BRIDGE_TAG] === true;
}

/** Listens for bridge calls from exactly ONE iframe window (never any
 * other sender -- `getWindow()` is read fresh on every message since the
 * iframe can remount, e.g. on a draft reload during editing) and
 * dispatches to the real, authenticated REST calls Home already makes
 * elsewhere. Unknown method names and rate-limited calls both reject
 * cleanly, never hang. Returns a cleanup function -- callers MUST call
 * it on unmount (TIER_2_CUSTOM_LAYOUT_SPEC.md's "Reliability: iframe
 * lifecycle" -- a stale listener from a previous mount answering a new
 * iframe's calls is exactly the intermittent bug that guardrail exists
 * to prevent). */
export function attachBridgeListener(getWindow: () => Window | null, handlers: BridgeHandlers): () => void {
  const callTimes = new Map<string, number[]>();

  function rateLimited(method: string): boolean {
    const now = Date.now();
    const recent = (callTimes.get(method) ?? []).filter((t) => now - t < BRIDGE_RATE_LIMIT_WINDOW_MS);
    recent.push(now);
    callTimes.set(method, recent);
    return recent.length > BRIDGE_RATE_LIMIT_MAX_CALLS;
  }

  function onMessage(e: MessageEvent): void {
    const win = getWindow();
    if (!win || e.source !== win || !isBridgeMessage(e.data)) return;
    const { id, method, params } = e.data;
    const respond = (payload: { result?: unknown; error?: string }) => win.postMessage({ id, ...payload }, "*");

    if (rateLimited(method)) {
      respond({ error: "too many calls -- slow down" });
      return;
    }
    const handler = (handlers as unknown as Record<string, ((p: unknown) => Promise<unknown>) | undefined>)[method];
    if (!handler) {
      respond({ error: `unknown method "${method}"` });
      return;
    }
    withTimeout(handler(params), BRIDGE_CALL_TIMEOUT_MS).then(
      (result) => respond({ result }),
      (err) => respond({ error: err instanceof Error ? err.message : String(err) }),
    );
  }

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

// ---- Pre-publish smoke test --------------------------------------------

export interface SmokeTestFinding {
  type: "error" | "unhandledrejection";
  message: string;
  filename?: string;
  lineno?: number;
  colno?: number;
  stack?: string;
}

export interface SmokeTestReport {
  ok: boolean;
  loaded: boolean;
  findings: SmokeTestFinding[];
  bridgeCallCount: number;
  bridgeCallCountExceeded: boolean;
}

export const SMOKE_TEST_WINDOW_MS = 5000;
/** Across the WHOLE test window, all methods combined -- deliberately
 * more generous than BRIDGE_RATE_LIMIT_MAX_CALLS/sec, since this is
 * flagging "this draft's normal startup behavior looks like a runaway
 * loop," not re-implementing the per-second limiter. */
export const SMOKE_TEST_MAX_BRIDGE_CALLS = 20;

function isTestMessage(data: unknown): data is { type: string } & Record<string, unknown> {
  return !!data && typeof data === "object" && (data as Record<string, unknown>)[TEST_TAG] === true;
}

/** Runs the mandatory pre-publish smoke test (TIER_2_CUSTOM_LAYOUT_SPEC.md's
 * "Pre-publish: a mandatory smoke test") against whichever iframe
 * `getWindow()` currently points at -- the SAME iframe the editor's live
 * preview already renders, not a second invisible instance. Uses the
 * REAL bridge handlers (not stubs), so a bridge call that would fail once
 * published (a stale table_key reference, say) shows up as a finding
 * here too, not just at runtime after the fact. Always runs the FULL
 * window rather than resolving the instant "ready" arrives -- an error
 * from code that runs after load (a `.then()` continuation, a delayed
 * render) is exactly the kind of thing a too-early resolve would miss. */
export function runPrePublishSmokeTest(getWindow: () => Window | null, handlers: BridgeHandlers): Promise<SmokeTestReport> {
  return new Promise((resolve) => {
    const findings: SmokeTestFinding[] = [];
    let loaded = false;
    let bridgeCallCount = 0;

    // Counts every ATTEMPTED call, independently of attachBridgeListener's
    // own dispatch -- that listener already rate-limits before a call
    // ever reaches a handler, so counting from inside the handlers
    // themselves would undercount a true runaway loop (most of its calls
    // never get that far). This is a separate listener on the same
    // channel specifically so the two concerns -- "did this call
    // actually run" vs. "how many were attempted" -- can't interfere
    // with each other.
    function onBridgeMessage(e: MessageEvent): void {
      const win = getWindow();
      if (!win || e.source !== win) return;
      const data = e.data;
      if (data && typeof data === "object" && (data as Record<string, unknown>)[BRIDGE_TAG] === true) bridgeCallCount++;
    }
    window.addEventListener("message", onBridgeMessage);

    const detachBridge = attachBridgeListener(getWindow, handlers);

    function finish(): void {
      window.removeEventListener("message", onTestMessage);
      window.removeEventListener("message", onBridgeMessage);
      detachBridge();
      clearTimeout(timer);
      const bridgeCallCountExceeded = bridgeCallCount > SMOKE_TEST_MAX_BRIDGE_CALLS;
      resolve({
        ok: loaded && findings.length === 0 && !bridgeCallCountExceeded,
        loaded,
        findings,
        bridgeCallCount,
        bridgeCallCountExceeded,
      });
    }

    function onTestMessage(e: MessageEvent): void {
      const win = getWindow();
      if (!win || e.source !== win || !isTestMessage(e.data)) return;
      const data = e.data;
      if (data.type === "ready") {
        loaded = true;
        return;
      }
      if (data.type === "error" || data.type === "unhandledrejection") {
        findings.push({
          type: data.type,
          message: String(data.message ?? "unknown error"),
          filename: typeof data.filename === "string" ? data.filename : undefined,
          lineno: typeof data.lineno === "number" ? data.lineno : undefined,
          colno: typeof data.colno === "number" ? data.colno : undefined,
          stack: typeof data.stack === "string" ? data.stack : undefined,
        });
      }
    }

    window.addEventListener("message", onTestMessage);
    const timer = setTimeout(finish, SMOKE_TEST_WINDOW_MS);
  });
}
