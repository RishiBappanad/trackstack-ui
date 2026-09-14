import { defineConfig } from "tsup";

export default defineConfig({
  // Object form (not an array) -- both entry files are named "index.ts"
  // in their own folders, and tsup names output files after the entry
  // basename by default, which would collide as dist/index.* for both.
  entry: { index: "src/index.ts", "auth-client": "src/auth-client/index.ts" },
  format: ["esm", "cjs"],
  dts: true,
  sourcemap: true,
  clean: true,
  external: ["react", "react-dom", "express"],
});
