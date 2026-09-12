import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// Imports trackstack-ui's own library source directly from ../src rather
// than the published npm package -- this app lives in the same repo as
// the library, so it should always see the current, uncommitted state of
// AppSwitcher/useTrackStackAuth/etc., not whatever version was last
// published. The exact class of "stale published package" bug this
// session hit repeatedly with nutrition-insights/finance-tracker's OWN
// trackstack-ui dependency doesn't apply here, since there's no
// published-package indirection to go stale in the first place.
//
// Consequence: whatever ../src itself imports at runtime (clsx,
// tailwind-merge, lucide-react) must be resolvable from ../src's own
// location -- Vite/Rollup resolves each file's imports via standard
// Node resolution rooted at THAT file, which walks up from
// trackstack-ui/src through trackstack-ui/ itself, never sideways into
// app/node_modules no matter what app/package.json declares. The real
// fix is installing trackstack-ui's own root package.json (its
// dependencies already list all three), not duplicating them into
// app/package.json -- a Dockerfile that only ran `npm ci` inside app/
// looked like it needed that duplication, until testing in a genuinely
// clean container (no root node_modules already sitting there, unlike
// local dev) showed it still failed on lucide-react even with it
// "fixed" for clsx/tailwind-merge -- see app/Dockerfile's root install
// step. Found 2026-09-12.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Same VITE_BASE_PATH convention nutrition-insights/finance-tracker's
  // own Vite configs already use for gateway/proxy-mode builds (e.g.
  // `--build-arg BASE_PATH=/nutrition/`) -- this app is the "/" catch-all
  // rather than a sub-path, so it should rarely need this overridden,
  // but keeping the same knob avoids a special case.
  base: process.env.VITE_BASE_PATH || "/",
  server: { host: true },
  resolve: {
    alias: {
      "trackstack-ui": fileURLToPath(new URL("../src/index.ts", import.meta.url)),
    },
    // Without this, importing ../src/index.ts (which lives outside this
    // package) resolves ITS OWN "react" import by walking up from
    // ../src/hooks/*.ts and finding trackstack-ui's root node_modules --
    // a second, separate React instance from the one app/node_modules
    // supplies to main.tsx/App.tsx, which breaks hooks with an "Invalid
    // hook call" error at runtime (two React copies never share the same
    // dispatcher). Forces both import paths to resolve to this package's
    // single copy instead.
    dedupe: ["react", "react-dom"],
  },
});
