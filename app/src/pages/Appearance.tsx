import { useState } from "react";
import { useTrackStackAuth, useCurrentUser } from "trackstack-ui";
import { ApiError } from "../lib/api.js";
import {
  applyTheme, saveAccountTheme, THEME_PRESETS, DEFAULT_HUE, DEFAULT_LIGHTNESS, HUE_RANGE, LIGHTNESS_RANGE,
} from "../lib/theme.js";

const AUTH_BASE_URL = import.meta.env.VITE_TRACKSTACK_AUTH_URL ?? "";

/** Home's own account-wide theme settings -- hue + background lightness,
 * with a few presets as a fast way to set both at once (see theme.ts's
 * doc comment on why there are only these two underlying numbers). Every
 * slider/preset click applies live immediately (document.documentElement
 * is global, so this previews exactly like flipping the real setting
 * would look across the whole app) but isn't PATCHed to the account until
 * "Save" -- same prefill-then-explicit-save shape as TrackerBuilder's own
 * form, so navigating away without saving just leaves the last-saved
 * theme in place on next load. */
export function Appearance() {
  const { token } = useTrackStackAuth({ authBaseUrl: AUTH_BASE_URL });
  const { user } = useCurrentUser(AUTH_BASE_URL, token);
  const [draft, setDraft] = useState<{ hue: number; backgroundLightness: number } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (!user) return null;

  // Once set, `draft` is never cleared back to null on save -- only a
  // fresh page load re-derives it from the account (useCurrentUser has
  // no way to re-fetch after this page's own PATCH, so `user` itself
  // stays stale for the rest of this visit). Clearing it on save success
  // previously fell back to that stale `user.theme`, which still read
  // the PRE-save value -- so the just-saved preset's own highlight
  // snapped back to whatever was active before saving, even though the
  // page was still visibly showing the new theme. `dirty`, not
  // `draft`'s nullness, is what actually tracks "has an unsaved change."
  const current = draft ?? { hue: user.theme.hue ?? DEFAULT_HUE, backgroundLightness: user.theme.backgroundLightness ?? DEFAULT_LIGHTNESS };

  function preview(next: { hue: number; backgroundLightness: number }) {
    setDraft(next);
    setDirty(true);
    setSaved(false);
    applyTheme(next.hue, next.backgroundLightness);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await saveAccountTheme(token, current);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your theme");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    setSaving(true);
    setError(null);
    try {
      await saveAccountTheme(token, { hue: null, backgroundLightness: null });
      setDraft({ hue: DEFAULT_HUE, backgroundLightness: DEFAULT_LIGHTNESS });
      setDirty(false);
      setSaved(true);
      applyTheme(null, null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reset your theme");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl grid gap-6">
      <h1 className="text-2xl">Appearance</h1>
      {error && <div className="bg-destructive/10 border border-destructive text-destructive text-sm rounded-md px-3 py-2">{error}</div>}

      <section className="grid gap-2">
        <h2 className="text-lg">Presets</h2>
        <div className="flex flex-wrap gap-2">
          {THEME_PRESETS.map((p) => {
            const active = current.hue === p.hue && current.backgroundLightness === p.backgroundLightness;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => preview({ hue: p.hue, backgroundLightness: p.backgroundLightness })}
                className={"px-3 py-1.5 rounded-md text-sm border " + (active ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground")}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4">
        <h2 className="text-lg">Fine-tune</h2>
        <label className="grid gap-1 text-sm">
          <span>Accent hue</span>
          <input
            type="range"
            min={HUE_RANGE.min}
            max={HUE_RANGE.max}
            value={current.hue}
            onChange={(e) => preview({ ...current, hue: Number(e.target.value) })}
          />
        </label>
        <label className="grid gap-1 text-sm">
          <span>Background brightness</span>
          <input
            type="range"
            min={LIGHTNESS_RANGE.min}
            max={LIGHTNESS_RANGE.max}
            value={current.backgroundLightness}
            onChange={(e) => preview({ ...current, backgroundLightness: Number(e.target.value) })}
          />
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button type="button" disabled={saving || !dirty} onClick={save} className="bg-primary text-primary-foreground rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50">
          Save
        </button>
        <button type="button" disabled={saving} onClick={reset} className="text-sm text-muted-foreground hover:text-foreground">
          Reset to default
        </button>
        {saved && <span className="text-sm text-muted-foreground">Saved.</span>}
      </div>
    </div>
  );
}
