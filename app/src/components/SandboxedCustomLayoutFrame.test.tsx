import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { SandboxedCustomLayoutFrame, TIER_2_IFRAME_SANDBOX } from "./SandboxedCustomLayoutFrame.js";

/**
 * TIER_2_CUSTOM_LAYOUT_SPEC.md's "Guardrails > Security" -- the one
 * guardrail in that spec required to be foolproof against accidental
 * regression, not merely mitigated. These two tests are layers 4-5;
 * layers 1-3 live in SandboxedCustomLayoutFrame.tsx itself (no override
 * prop, a single named constant, exact-equality discipline).
 *
 * Layer 4 (a build-time grep gate banning the literal string
 * "allow-same-origin" anywhere in this app's source tree) is NOT a
 * vitest test -- it's `npm run guard:sandbox` (package.json), wired
 * into CI (.github/workflows/deploy.yml) before any build/deploy step.
 */
describe("SandboxedCustomLayoutFrame sandbox-attribute integrity", () => {
  // Layer 3's own check: a change to the CONSTANT's value is a one-line
  // diff, reviewable in total isolation from anything about how the
  // component around it changes.
  it("the exported sandbox constant is exactly 'allow-scripts' -- not merely free of 'allow-same-origin'", () => {
    expect(TIER_2_IFRAME_SANDBOX).toBe("allow-scripts");
  });

  // Layer 5: proves the constant actually reaches the rendered DOM node
  // -- a wiring bug (the right value exists, but isn't what's actually
  // rendered) is a different failure mode than layer 3's check, and only
  // this one catches it.
  it("the rendered iframe's sandbox attribute equals exactly 'allow-scripts'", () => {
    const { container } = render(<SandboxedCustomLayoutFrame srcDoc="<p>hi</p>" title="Test layout" />);
    const iframe = container.querySelector("iframe");
    expect(iframe).not.toBeNull();
    expect(iframe!.getAttribute("sandbox")).toBe("allow-scripts");
  });

  it("has no prop that could ever change the sandbox attribute", () => {
    // TypeScript already forbids this at compile time (the component's
    // props type only accepts srcDoc/title/className) -- this test
    // exists so the guarantee is also verified at RUNTIME, independent
    // of whether a future edit weakens the type. Casting through
    // `unknown` deliberately, to simulate a caller that bypasses the
    // type system (a plain JS consumer, a loosely-typed wrapper).
    const Component = SandboxedCustomLayoutFrame as unknown as (props: Record<string, unknown>) => JSX.Element;
    const { container } = render(<Component srcDoc="<p>hi</p>" title="Test layout" sandbox="allow-scripts allow-same-origin" />);
    const iframe = container.querySelector("iframe");
    expect(iframe!.getAttribute("sandbox")).toBe("allow-scripts");
  });
});
