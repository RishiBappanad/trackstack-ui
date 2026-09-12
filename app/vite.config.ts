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
export default defineConfig({
  plugins: [react(), tailwindcss()],
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
