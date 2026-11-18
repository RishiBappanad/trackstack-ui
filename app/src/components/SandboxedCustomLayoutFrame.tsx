import { forwardRef } from "react";

/**
 * TIER_2_CUSTOM_LAYOUT_SPEC.md's "Guardrails > Security: the `sandbox`
 * attribute must never regress" -- this is the ONE guardrail in that
 * spec required to be foolproof against accidental regression, not
 * merely mitigated. Five independent layers; this file is layers 1-3,
 * SandboxedCustomLayoutFrame.test.tsx is layers 4-5.
 *
 * 1. No override surface exists: this component takes `srcDoc` and
 *    nothing else. There is no `sandbox` prop, no spread of arbitrary
 *    props onto the <iframe>, and no code path by which a caller could
 *    change the sandbox value -- because no such parameter exists to
 *    pass. If you are looking for a way to make this component's
 *    sandboxing configurable, stop: that is exactly the change this
 *    guardrail exists to prevent. Render a DIFFERENT component for a
 *    different trust boundary instead of adding a prop here.
 * 2. Exact equality, not a blocklist, is how every check against this
 *    value is written (see the test file) -- ruling out every dangerous
 *    token (`allow-same-origin`, `allow-top-navigation`, `allow-popups`,
 *    ones that don't exist yet) in one assertion, not just the ones
 *    someone remembered to list.
 * 3. This is the one, single, named definition site for the value.
 *
 * THIS IS THE ONLY COMPONENT IN THE ENTIRE FRONTEND ALLOWED TO RENDER
 * THE TIER 2 IFRAME. Every other file that needs to show a Tier 2
 * layout (TrackerHome, TrackerLayout's preview pane, the pre-publish
 * smoke test) renders THIS component -- never a raw <iframe> of their
 * own.
 */
export const TIER_2_IFRAME_SANDBOX = "allow-scripts";

export const SandboxedCustomLayoutFrame = forwardRef<HTMLIFrameElement, { srcDoc: string; title: string; className?: string }>(
  function SandboxedCustomLayoutFrame({ srcDoc, title, className }, ref) {
    return (
      <iframe
        ref={ref}
        title={title}
        srcDoc={srcDoc}
        sandbox={TIER_2_IFRAME_SANDBOX}
        className={className}
      />
    );
  },
);
