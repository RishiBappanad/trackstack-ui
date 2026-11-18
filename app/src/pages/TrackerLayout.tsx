import { useEffect, useRef, useState } from "react";
import { useRoute } from "wouter";
import { useTrackStackAuth } from "trackstack-ui";
import { ApiError } from "../lib/api.js";
import { customApi, type TrackerMeta } from "../lib/customTrackers.js";
import { Tier2CustomLayoutView } from "../components/Tier2CustomLayoutView.js";
import { runPrePublishSmokeTest, type SmokeTestReport } from "../lib/tier2Bridge.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

/** TIER_2_CUSTOM_LAYOUT_SPEC.md's builder: `/trackers/:slug/layout`.
 * Always edits/previews custom_ui_html_draft, never the published
 * custom_ui_html directly -- the draft/publish split is what makes
 * "break it as many times as you want while iterating" true, since the
 * tracker's real home view (TrackerHome) never reflects anything typed
 * here until Publish succeeds.
 *
 * This is also this app's one, deliberate escape-hatch route: linked
 * from TrackerChrome (pinned) and TrackerView's own tracker-level nav
 * row (unpinned) -- both OUTSIDE the content area a broken Tier 2
 * layout would occupy on TrackerHome -- so it's reachable regardless of
 * what the currently-published layout is doing. See
 * TIER_2_CUSTOM_LAYOUT_SPEC.md's Guardrails, "Reliability: a hung or
 * runaway script." */
export function TrackerLayout() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const [, params] = useRoute("/trackers/:slug/layout");
  const slug = params?.slug ?? "";

  const [meta, setMeta] = useState<TrackerMeta | null>(null);
  const [draftText, setDraftText] = useState("");
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [report, setReport] = useState<SmokeTestReport | null>(null);
  const [busy, setBusy] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (!slug) return;
    customApi(`/trackers/${slug}`, token)
      .then((d) => {
        const m = d as TrackerMeta;
        setMeta(m);
        setDraftText(m.custom_ui_html_draft);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : "Could not load this tracker"));
  }, [slug, token]);

  async function saveDraft(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const updated = (await customApi(`/trackers/${slug}`, token, {
        method: "PATCH",
        body: JSON.stringify({ custom_ui_html_draft: draftText }),
      })) as TrackerMeta;
      setMeta(updated);
      setStatus("Draft saved.");
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "Could not save the draft");
    } finally {
      setBusy(false);
    }
  }

  function updatePreview(): void {
    setReport(null);
    setPreviewHtml(draftText);
  }

  async function runTestAndPublish(): Promise<void> {
    setBusy(true);
    setStatus(null);
    setReport(null);
    try {
      // The test runs against a FRESH render of the current textarea
      // content (not whatever's already loaded in the preview, which
      // may be stale if the user edited since the last "Update
      // preview") -- same content, re-rendered, so the test is always
      // against exactly what's about to be published.
      setPreviewHtml(draftText);
      await new Promise((r) => setTimeout(r, 50)); // let the iframe actually mount with the fresh srcDoc before the test attaches its listeners
      const result = await runPrePublishSmokeTest(() => iframeRef.current?.contentWindow ?? null, {
        getEntries: (p) => {
          const params = (p ?? {}) as { table_key?: string; start?: string; end?: string; limit?: number };
          if (!params.table_key) return Promise.reject(new Error("getEntries: table_key is required"));
          const qs = new URLSearchParams();
          if (params.start) qs.set("start", params.start);
          if (params.end) qs.set("end", params.end);
          if (params.limit) qs.set("limit", String(params.limit));
          const query = qs.toString();
          return customApi(`/trackers/${slug}/tables/${params.table_key}/entries${query ? `?${query}` : ""}`, token);
        },
        getTableSchema: (p) => {
          const params = (p ?? {}) as { table_key?: string };
          if (!params.table_key) return Promise.reject(new Error("getTableSchema: table_key is required"));
          return customApi(`/trackers/${slug}/tables/${params.table_key}/schema`, token);
        },
        getContext: async () => {
          const ctx = (await customApi("/context", token)) as { trackers?: Record<string, unknown> };
          return ctx.trackers?.[slug] ?? null;
        },
      });
      setReport(result);
      if (!result.ok) {
        setStatus("The pre-publish test found problems -- see the report below. Publish is blocked until it runs clean.");
        return;
      }

      // Save the draft first (the exact content just tested), THEN
      // publish it -- publish itself re-validates the draft isn't empty
      // server-side, but the save here is what guarantees the published
      // copy is byte-for-byte what was actually tested, not whatever
      // was last saved before this edit session.
      await customApi(`/trackers/${slug}`, token, { method: "PATCH", body: JSON.stringify({ custom_ui_html_draft: draftText }) });
      const published = (await customApi(`/trackers/${slug}/layout/publish`, token, { method: "POST" })) as TrackerMeta;
      setMeta(published);
      setStatus("Published. This tracker's home view now shows this layout.");
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "Could not run the test");
    } finally {
      setBusy(false);
    }
  }

  async function revertToTier1(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const updated = (await customApi(`/trackers/${slug}`, token, { method: "PATCH", body: JSON.stringify({ layout_tier: 1 }) })) as TrackerMeta;
      setMeta(updated);
      setStatus("Reverted to the default Tier 1 layout. Your draft and published HTML are untouched -- publish again any time.");
    } catch (e) {
      setStatus(e instanceof ApiError ? e.message : "Could not revert");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="text-destructive text-sm">{error}</p>;
  if (!meta) return null;

  return (
    <div className="max-w-5xl">
      <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
        <h1 className="text-2xl">Custom layout for {meta.name}</h1>
        <span className="text-xs text-muted-foreground">
          Currently live: {meta.layout_tier === 2 ? "Tier 2 (this custom layout)" : "Tier 1 (default)"}
        </span>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Write HTML/CSS/JS for this tracker's own home view. Nothing here goes live until you run the test and publish --
        edit and preview as much as you want first.
      </p>

      {status && (
        <div className={"mb-4 border rounded-md px-3 py-2 text-sm " + (report && !report.ok ? "bg-destructive/10 border-destructive text-destructive" : "bg-secondary border-border")}>
          {status}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium mb-1 block">Draft HTML/CSS/JS</label>
          <textarea
            value={draftText}
            onChange={(e) => setDraftText(e.target.value)}
            spellCheck={false}
            className="w-full h-[50vh] font-mono text-xs bg-card border border-border rounded-lg p-3 resize-none"
            placeholder={"<h1>My dashboard</h1>\n<script>\n  const entries = await TrackStack.getEntries({ table_key: 'log' });\n  // ...render however you want\n</script>"}
          />
          <div className="flex gap-2 mt-2">
            <button type="button" onClick={saveDraft} disabled={busy} className="bg-secondary rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
              Save draft
            </button>
            <button type="button" onClick={updatePreview} disabled={busy} className="bg-secondary rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50">
              Update preview
            </button>
          </div>
        </div>

        <div>
          <label className="text-sm font-medium mb-1 block">Preview</label>
          {previewHtml !== null ? (
            <Tier2CustomLayoutView
              trackerSlug={slug}
              html={previewHtml}
              token={token}
              iframeRef={iframeRef}
              className="w-full h-[50vh] border border-border rounded-lg bg-background"
            />
          ) : (
            <div className="w-full h-[50vh] border border-border rounded-lg bg-background flex items-center justify-center text-sm text-muted-foreground">
              Click "Update preview" to render your draft here.
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          onClick={runTestAndPublish}
          disabled={busy || !draftText.trim()}
          className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          Run test &amp; publish
        </button>
        {meta.layout_tier === 2 && (
          <button type="button" onClick={revertToTier1} disabled={busy} className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50">
            Revert to default layout
          </button>
        )}
      </div>

      {report && (
        <div className="mt-4 bg-card border border-border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <span className={"text-sm font-semibold " + (report.ok ? "text-success" : "text-destructive")}>
              {report.ok ? "Test passed" : "Test failed"}
            </span>
            {!report.loaded && <span className="text-xs text-muted-foreground">— the layout never finished loading</span>}
          </div>
          {report.bridgeCallCountExceeded && (
            <p className="text-sm text-destructive mb-2">
              This draft made {report.bridgeCallCount} data calls while loading — that looks like a runaway loop, not normal startup behavior.
            </p>
          )}
          {report.findings.length > 0 && (
            <ul className="space-y-2">
              {report.findings.map((f, i) => (
                <li key={i} className="text-xs font-mono bg-destructive/10 border border-destructive/30 rounded px-2 py-1.5">
                  <div className="text-destructive font-semibold">{f.type}: {f.message}</div>
                  {(f.filename || f.lineno) && (
                    <div className="text-muted-foreground mt-0.5">
                      {f.filename ?? "layout"}{f.lineno ? `:${f.lineno}${f.colno ? `:${f.colno}` : ""}` : ""}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
