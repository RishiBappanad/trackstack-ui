import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Mirrors the root trackstack-ui library's own vitest.config.ts exactly
// (same jsdom/testing-library versions) -- added specifically for
// TIER_2_CUSTOM_LAYOUT_SPEC.md's mandatory sandbox-attribute test (the
// one guardrail in that spec required to be foolproof against
// accidental regression, not just mitigated), not a general testing
// initiative for this app.
//
// setupFiles uses an absolute (import.meta.url-resolved) path, not the
// bare relative string the root config gets away with: this directory
// sits one level below a REPO that itself has its own vitest.config.ts
// (the root trackstack-ui library), and Vitest's workspace auto-
// detection resolves a relative setupFiles path against that outer
// root instead of this file's own directory when it spots the nested
// config -- found live, not assumed.
export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: {
      jsdom: { url: "http://localhost" },
    },
    globals: true,
    setupFiles: [fileURLToPath(new URL("./src/__tests__/setup.ts", import.meta.url))],
  },
});
