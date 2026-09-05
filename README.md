# trackstack-ui

Shared React component library for TrackStack apps (nutrition-insights,
finance-tracker, and future trackers). See the main
[CLAUDE.md](https://github.com/RishiBappanad/workspace-notes/blob/main/CLAUDE.md)
constitution for the project this belongs to.

## Why this exists

`AppSwitcher` started as two independently hand-rolled, nearly
byte-identical copies in nutrition-insights and finance-tracker,
differing only in which app id was hardcoded as "current" and which CSS
variable family was used. That's the exact kind of duplication this
library exists to eliminate — every new tracker should get the shared
cross-app UI for free, without re-implementing it.

## What's here (v0.1.0)

- `AppSwitcher` / `MobileAppSwitcher` — the desktop icon rail / mobile
  switcher bar, fetching from trackstack-auth's `GET /apps`.
- `ProfileCard` — identity (name/email), settings link, logout. Deliberately
  does **not** include "today's summary" stats — those are inherently
  tracker-specific; render your own summary widget as `children`.
- `useAppRegistry`, `useTrackStackAuth`, `useCurrentUser` — the hooks
  the components above are built on, exported directly for a consuming
  app that wants the data without the pre-built UI.

**Not here yet, on purpose**: `NotificationBell` and its `useNotifications`
hook depend on `trackstack-notifications`, which doesn't exist yet and
is intentionally being built much later. When it lands, it should be
addable the same way everything else here is (see "Adding to this
library" below) — no restructuring of what's already here should be
needed. `EventForm` and `AggregationChart` (generic event-logging form
and chart) are also not built yet — deferred until a second real
tracker's shape clarifies what's actually generic about them, rather
than guessing from nutrition-insights' shape alone.

## Required host app setup

This library ships **no CSS of its own** — components render Tailwind
utility classes against CSS custom properties the *consuming app's*
Tailwind theme must define. `AppSwitcher`/`MobileAppSwitcher` need:

```css
--switcher
--switcher-border
--switcher-active
--switcher-foreground
```

plus the already-common `--sidebar-ring`, `--primary-foreground`. See
nutrition-insights' theme file for real, working values to copy — it's
the app these were extracted from, so its values are already correct.
`ProfileCard` only uses the common `--card`, `--border`, `--muted`,
`--foreground`, `--muted-foreground` tokens most shadcn-style themes
already define.

## Auth model this assumes

Per CLAUDE.md's Authentication Flow: a trackstack-auth JWT is stored in
the browser, verified locally by each backend, no per-request call back
to trackstack-auth needed for verification. **The localStorage key this
JWT is stored under is not yet standardized across apps** (`token` for
nutrition, `auth_token` for finance) — `useTrackStackAuth`'s `tokenKey`
option exists specifically because of this; pass your app's real key
rather than relying on the `"token"` default unless that's actually
what your app uses. Standardizing this across apps is a real follow-up,
tracked in workspace-notes, not something this library papers over.

## Adding to this library

1. Add the component/hook under `src/components/` or `src/hooks/`.
2. Export it from `src/index.ts`.
3. That's it — no other file needs to change for a consuming app to
   pick it up once it re-installs/rebuilds against a new version.

## Development

```bash
npm install
npm run build      # tsup -> dist/ (ESM + CJS + .d.ts)
npm run typecheck
```

Not yet published anywhere (npm or GitHub Packages) — no app consumes
this yet. Publishing is part of migrating nutrition-insights/
finance-tracker onto it (a separate, later step), not part of building
the library itself.
