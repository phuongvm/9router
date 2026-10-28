# Proposal: Integrate Smart Router with Local Ollaya System One Engine

## Why

Upstream 9Router introduced the "Smart Router" Combo strategy, which queries a System One decision model to dynamically select the optimal candidate model and retains session stickiness to preserve warm prompt caches. However, 9Router's current implementation cannot route to our on-device CUDA System One engine (`ollaya` on `AGENT-4070` RTX 4070 Ti SUPER at `192.168.100.130:11435`, running `pplx-decider:flash-fp16`) due to missing `noAuth` handling in `systemoneRouter.js`, exclusion in `ModelSelectModal.js`, dropped OpenAI Responses / Gemini prompt formats, blind prefix classification with `null` criteria, and an inverted Turn-1 confidence hysteresis threshold.

## What Changes

- **Unblock NoAuth System One Providers in Smart Router**: Allow `noAuth` and `authType === "none"` providers (`ollaya`, `laya`) to dispatch without stored DB credentials in `systemoneRouter.js` and surface them in Combos UI `ModelSelectModal.js`.
- **Telemetry & Observability**: Record in-process Smart Router decisions via `saveRequestUsage` and `saveRequestDetail` (satisfying `openspec/specs/systemone-usage-logs/spec.md`).
- **Input Format Support**: Expand `extractPromptState` to support OpenAI Responses API (`/v1/responses`, Codex `input_text`) and Gemini Native (`contents[].parts[]`).
- **Enriched Criteria & Modality Ordering**: Auto-enrich `buildChoiceCriteria` with model display names and capabilities from 9Router registry; filter hard modalities (`vision`, `audioInput`, `pdf`) before dispatching to Smart Router.
- **Turn-1 Hysteresis Fix**: Do not apply the 80% cache-switching threshold on Turn 1 where no cache exists yet.
- **Default Router Promotion**: Promote `ollaya/pplx-decider:flash-fp16` as `DEFAULT_SYSTEMONE_ROUTER_MODEL` (with automatic failover to `opencode-zen/jev-1.13-free`).

## Capabilities

### New Capabilities
- `smart-router`: System One intelligent combo model routing, prompt state extraction, criteria enrichment, session stickiness, and failover behavior.

### Modified Capabilities
None (the change aligns implementation with existing canonical specs `systemone-usage-logs` and `laya-provider`).

## Impact

- Files: `open-sse/services/systemoneRouter.js`, `open-sse/services/combo.js`, `src/sse/services/systemoneRouter.js`, `src/shared/components/ModelSelectModal.js`, `src/app/(dashboard)/dashboard/combos/page.js`.
- Testing: Vitest unit tests in `tests/unit/combo-smart-router.test.js`, `tests/unit/ollaya-systemone-provider.test.js`, and new E2E tests for Smart Router with `ollaya`.
- Runtime: Zero breaking changes to existing chat endpoints; local GPU System One latency is ~100ms with 0-hop LAN dispatch.
