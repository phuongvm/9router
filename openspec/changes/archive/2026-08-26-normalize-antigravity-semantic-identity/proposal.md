## Why

Antigravity rejects a demonstrated request when client-derived `systemInstruction` begins with a known competitive provider/creator attribution, returning `429 RESOURCE_EXHAUSTED` and triggering fallback even though an adjacent same-host A/B request with only a neutralized opening succeeds. 9Router already applies one Antigravity-specific Claude/Anthropic compatibility rewrite, so the correct owner is the 9Router Antigravity compatibility layer rather than Hermes global identity assembly.

## What Changes

- Add an Antigravity-only semantic-identity compatibility policy that neutralizes exact known provider/creator attribution in text parts of `systemInstruction`.
- Cover both the demonstrated Hermes/Nous attribution and the existing Claude/Anthropic compatibility phrase while preserving the latter's current effective behavior.
- Preserve all content outside the exact attribution match, including behavioral instructions, safety and governance rules, memory, project context, tool policy, multipart structure, and non-text parts.
- Require deterministic, idempotent, copy-on-write behavior that does not unexpectedly mutate caller-owned request objects and is a no-op for missing, malformed, or unmatched instructions.
- Keep compatibility phrases and replacements in configuration rather than executor control flow; prohibit broad brand-removal patterns, full-instruction replacement, and full-prompt or credential logging.
- Add focused unit and regression coverage plus an explicit post-deployment live verification gate; a local patch or passing unit suite alone is not a production fix.
- Leave all non-Antigravity routes unchanged.

## Capabilities

### New Capabilities
- `antigravity-request-compatibility`: Defines provider-local semantic-identity neutralization, preservation and isolation guarantees, safety constraints, and verification boundaries for Antigravity-bound requests.

### Modified Capabilities

None. The repository has no existing Antigravity request-compatibility capability specification.

## Impact

- Affected runtime area: Antigravity request transformation in `open-sse/executors/antigravity.js`, with compatibility policy data under `open-sse/config/` and a pure helper/concern at an implementation-selected location consistent with repository conventions.
- Affected tests: focused Antigravity executor/translator tests, existing Claude compatibility regression coverage, and the repository no-regression baseline.
- Operational impact: after authorized deployment, rebuild and restart the serving image/service and verify fresh Agent4070 Hermes turns stay on the intended Gemini/Antigravity model and account without admission `RESOURCE_EXHAUSTED` or fallback.
- No API, credential format, OAuth selection, quota rotation, retry/backoff, dependency, or non-Antigravity behavior change is intended.
