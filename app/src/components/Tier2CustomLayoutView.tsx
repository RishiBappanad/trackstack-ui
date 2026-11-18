import { useEffect, useMemo, useRef } from "react";
import { customApi } from "../lib/customTrackers.js";
import { attachBridgeListener, buildTier2SrcDoc, type BridgeHandlers } from "../lib/tier2Bridge.js";
import { SandboxedCustomLayoutFrame } from "./SandboxedCustomLayoutFrame.js";

/**
 * TIER_2_CUSTOM_LAYOUT_SPEC.md: renders one tracker's custom HTML/CSS/JS
 * (published or draft -- the caller decides which) through
 * SandboxedCustomLayoutFrame, with the read-only bridge wired up against
 * this tracker's real, already-authenticated REST endpoints. Used by
 * TrackerHome (the published view) AND TrackerLayout (the editor's live
 * preview, and the pre-publish smoke test's own render) -- one
 * implementation, so what's tested at publish time is exactly what
 * renders afterward.
 */
export function Tier2CustomLayoutView({
  trackerSlug, html, token, iframeRef, className,
}: {
  trackerSlug: string;
  html: string;
  token: string | null;
  /** Exposed so the smoke test (TrackerLayout) can read contentWindow
   * off the SAME iframe this component renders, rather than a second,
   * separate instance. */
  iframeRef?: React.RefObject<HTMLIFrameElement>;
  className?: string;
}) {
  const ownRef = useRef<HTMLIFrameElement>(null);
  const ref = iframeRef ?? ownRef;
  const srcDoc = useMemo(() => buildTier2SrcDoc(html), [html]);

  useEffect(() => {
    const handlers: BridgeHandlers = {
      getEntries: (params) => {
        const p = (params ?? {}) as { table_key?: string; start?: string; end?: string; limit?: number };
        if (!p.table_key) return Promise.reject(new Error("getEntries: table_key is required"));
        const qs = new URLSearchParams();
        if (p.start) qs.set("start", p.start);
        if (p.end) qs.set("end", p.end);
        if (p.limit) qs.set("limit", String(p.limit));
        const query = qs.toString();
        return customApi(`/trackers/${trackerSlug}/tables/${p.table_key}/entries${query ? `?${query}` : ""}`, token);
      },
      getTableSchema: (params) => {
        const p = (params ?? {}) as { table_key?: string };
        if (!p.table_key) return Promise.reject(new Error("getTableSchema: table_key is required"));
        return customApi(`/trackers/${trackerSlug}/tables/${p.table_key}/schema`, token);
      },
      getContext: async () => {
        const ctx = (await customApi("/context", token)) as { trackers?: Record<string, unknown> };
        return ctx.trackers?.[trackerSlug] ?? null;
      },
    };
    // Reads ref.current fresh on every message (see attachBridgeListener's
    // own doc comment) rather than capturing it once here, so a re-mount
    // of the underlying <iframe> (a new srcDoc, e.g.) never leaves a
    // stale listener answering on behalf of a window that no longer
    // matches what's rendered -- TIER_2_CUSTOM_LAYOUT_SPEC.md's
    // "Reliability: iframe lifecycle" guardrail.
    return attachBridgeListener(() => ref.current?.contentWindow ?? null, handlers);
  }, [trackerSlug, token, ref]);

  return <SandboxedCustomLayoutFrame ref={ref} srcDoc={srcDoc} title={`${trackerSlug} custom layout`} className={className} />;
}
