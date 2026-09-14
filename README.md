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

## `trackstack-ui/auth-client` — backend auth, not a React import

A separate subpath, not re-exported from the main `trackstack-ui`
import: shared JWT-then-personal-access-token verification for a
tracker's own **backend** (Node/Express), extracted after this exact
fallback logic was found to be silently missing in two of three
trackers despite being documented as universal. Has no dependency on
React — `react`/`react-dom` are `optional` peer dependencies, so a
backend service can `npm install trackstack-ui` for just this without
ever installing React.

```ts
import { createRequireAuth } from "trackstack-ui/auth-client";

const requireAuth = createRequireAuth({
  jwtSecret: process.env.JWT_SECRET!,
  trackstackAuthUrl: process.env.TRACKSTACK_AUTH_URL, // omit to disable PAT support
  onAuthenticated: async (account) => ensureLocalUser(account),
});

app.get("/todos", requireAuth, (req, res) => { /* req.account.accountId */ });
```

The lower-level `verifyTrackstackToken(token, opts)` is also exported
directly, for a framework other than Express, or a tracker that needs
to rename the request property this attaches to (see the doc comment on
`createRequireAuth` for how to wrap it).

The Python equivalent lives in the
[`trackstack-auth-client`](https://github.com/RishiBappanad/trackstack-auth-client)
PyPI package. Both are tested against the same `CONTRACT_FIXTURE.json`
at this repo's root, so they can't silently drift apart the way the two
hand-copied versions already did once.

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

Published to npm as `trackstack-ui` (currently `0.2.0`) — both
nutrition-insights and finance-tracker depend on it for real.

## `app/` — TrackStack's home page (2026-09-12)

A separate React app living alongside this library in the same repo,
under `app/`: the "center console" — cross-app tools that don't belong
to any one tracker, rather than getting duplicated across each tracker's
own frontend. `src/` above is completely unaffected by this — it's still
the same publishable component library, just with a consumer of its own
now living next to it.

**Pages**: Home (a dashboard using this library's own `AppSwitcher` to
jump to other trackers), Todos (full CRUD against todo-tracker's API),
Developer (personal-access-token management against trackstack-auth's
`/tokens` routes — the previous reason to even have PATs was to hit an
API "without necessarily needing to interact with the frontend"; this
page is where a human actually gets one in the first place).

**Imports this library's own source directly** (`../src/index.ts` via a
Vite alias), not the published npm package — this app always sees the
current, possibly-uncommitted state of the library, with none of the
stale-published-version class of bug nutrition-insights/finance-tracker
hit earlier this session with their OWN `trackstack-ui` dependency.
`resolve.dedupe` in `app/vite.config.ts` is required alongside this —
without it, the library's own React import resolves a second, separate
React copy from this package's root `node_modules` instead of
`app/node_modules`, breaking hooks with an "Invalid hook call" error.

```bash
cd app
npm install
npm run dev
```

Needs `VITE_TRACKSTACK_AUTH_URL` and `VITE_TODO_API_BASE` set (an
`.env.local` in `app/`, gitignored) — see `app/src/vite-env.d.ts` for
both. Not yet deployed anywhere; no gateway/unified-URL work has started
either (see `workspace-notes/ACTIONS_CONTRACT_SPEC.md` and
`todo-tracker/README.md`'s "Not yet built" sections for that plan).
