# Tasks: Integrate Smart Router with Local Ollaya System One Engine

## 1. Slice 1: Unblock NoAuth & Enable Ollaya in Combos UI

- [x] 1.1 Update `src/shared/components/ModelSelectModal.js` to discover `noAuth` providers from `AI_PROVIDERS` and verify `ollaya/*` and `laya/*` models appear when `kindFilter="systemone"`.
- [x] 1.2 Update `src/sse/services/systemoneRouter.js` to dispatch unauthenticated providers with `credentials: null` and verify no missing credential warning is emitted.
- [x] 1.3 Add telemetry logging in `src/sse/services/systemoneRouter.js` calling `saveRequestUsage` and `saveRequestDetail` under endpoint `/internal/smart-router`.
- [x] 1.4 Add unit tests in `tests/unit/smart-router-noauth.test.js` validating `resolveSmartChoice` with unauthenticated providers.

## 2. Slice 2: Criteria Enrichment, Input Formats & Hysteresis

- [ ] 2.1 Update `open-sse/services/systemoneRouter.js::extractPromptState` to support OpenAI Responses API (`input_text`) and Gemini native (`contents[].parts[]`).
- [ ] 2.2 Update `open-sse/services/systemoneRouter.js::buildChoiceCriteria` to auto-populate criteria descriptions from `findModelName` and `getCapabilitiesForModel`.
- [ ] 2.3 Update `open-sse/services/combo.js` to pre-filter candidate models by hard request modalities (`vision`, `pdf`, `audioInput`) before calling Smart Router.
- [ ] 2.4 Update `open-sse/services/combo.js` so Turn 1 accepts the top candidate without applying the Turn 2+ `switchThreshold` hysteresis filter.
- [ ] 2.5 Run Vitest unit tests in `tests/unit/combo-smart-router.test.js` to verify criteria formatting, format extraction, and hysteresis behavior.

## 3. Slice 3: Default Ollaya Promotion & Live Verification

- [ ] 3.1 Update `DEFAULT_SYSTEMONE_ROUTER_MODEL` in `open-sse/services/systemoneRouter.js` to `"ollaya/pplx-decider:flash-fp16"`.
- [ ] 3.2 Update `src/app/(dashboard)/dashboard/combos/page.js` default placeholder and status label to reflect Ollaya local readiness.
- [ ] 3.3 Execute full regression suites (`9ROUTER-INV-1..7`, baseline tests) via Vitest and verify all pass.
- [ ] 3.4 Execute an end-to-end chat request through a Smart Router combo targeting Ollaya on LAN (`192.168.100.130:11435`) and verify decision in recent requests.

## Workflow follow-up

- Create isolated git worktree for implementation.
- Execute changes via Crew subagents.
- Deploy verified commit to Intel NUC (`192.168.100.110:20128`).
