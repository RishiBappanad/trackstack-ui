#!/usr/bin/env node
// TIER_2_CUSTOM_LAYOUT_SPEC.md's Guardrails, Security layer 4: fails
// the build if the literal string "allow-same-origin" appears ANYWHERE
// in this app's source tree. Written in plain Node (not a shell `grep`
// one-liner) so it runs identically on the Linux CI runner and on a
// Windows dev machine, where npm scripts execute through cmd.exe, not
// bash -- `!`/`grep` piping is not portable across both.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, basename } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const NEEDLE = "allow-same-origin";

// Exempt: any *.test.ts(x) file (test files never ship in the production
// bundle, so a string appearing only there can't regress what actually
// runs -- and tests legitimately need to assert ABOUT this string, e.g.
// "the shim never contains allow-same-origin"), plus
// SandboxedCustomLayoutFrame.tsx itself (its doc comment explains, in
// prose, exactly why this value must never appear there -- see its own
// header). That component is already the most scrutinized non-test file
// in this guardrail (layers 1-3: no override prop, a single named
// constant, exact-equality checks). This gate's real job is catching the
// string in SHIPPED code somewhere ELSE entirely -- a different
// component rendering its own, separately-sandboxed iframe -- not
// flagging the one place that's already independently guarded.
function isExempt(path) {
  return /\.test\.tsx?$/.test(path) || basename(path) === "SandboxedCustomLayoutFrame.tsx";
}

function walk(dir) {
  const hits = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) hits.push(...walk(full));
    else if (stat.isFile() && !isExempt(full) && readFileSync(full, "utf8").includes(NEEDLE)) hits.push(full);
  }
  return hits;
}

const hits = walk(ROOT);
if (hits.length > 0) {
  console.error(`guard:sandbox FAILED -- "${NEEDLE}" found in:\n` + hits.map((h) => `  ${h}`).join("\n"));
  process.exit(1);
}
console.log("guard:sandbox passed -- \"allow-same-origin\" not found anywhere in src/.");
