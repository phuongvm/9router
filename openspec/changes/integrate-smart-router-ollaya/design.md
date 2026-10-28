# Design: Integrate Smart Router with Local Ollaya System One Engine

## Context

See proposal.md - Why.
The 9Router system currently delegates System One evaluations via `handleSystemoneCore` (`open-sse/handlers/systemoneCore.js`), which supports `noAuth` endpoints and transparent failover (`SYSTEMONE_FAILOVER`). However, `systemoneRouter.js` and `ModelSelectModal.js` bypassed these mechanisms by making per-caller assumptions about credential existence and filtering strictly on `FREE_PROVIDERS`.

## Goals / Non-Goals

**Goals:**
- Provide zero-friction, out-of-the-box routing to `ollaya` (`pplx-decider:flash-fp16`) for all smart combos.
- Ensure `ollaya` and `laya` are discovered seamlessly in the Combos UI.
- Maintain full prompt-cache retention through accurate session stickiness across conversation turns.
- Track usage and decision metrics for auditing and performance inspection.
- Maintain 100% backward compatibility with existing provider failovers and unit tests.

**Non-Goals:**
- Modifying Ollaya's internal inference engine or CUDA runner.
- Changing the client wire protocol for OpenAI, Anthropic, or Gemini chat completions.
- Supporting arbitrary third-party decision formats outside the Jev / System One specification.

## Decisions

### Decision 1: Deepen NoAuth Resolution Across Server and UI
- **Approach**: Check `AI_PROVIDERS[provider]?.noAuth || AI_PROVIDERS[provider]?.authType === "none"` in `src/sse/services/systemoneRouter.js` and `src/shared/components/ModelSelectModal.js`. When a provider is unauthenticated, allow dispatch with `credentials: null` and render it as available in selectors.
- **Alternatives Considered**:
  - *Synthesizing fake DB connection entries for Ollaya*: Rejected because it introduces phantom database records and contradicts `9ROUTER-INV-7`.
  - *Hardcoding 'ollaya' checks*: Rejected per `open-sse/AGENTS.md` and `codebase-design` (violates locality; shallow pattern).

### Decision 2: Criteria Metadata Enrichment at Dispatch Seam
- **Approach**: In `open-sse/services/systemoneRouter.js::buildChoiceCriteria`, lookup each candidate model in `open-sse/config/providerModels.js` (`findModelName`) and `open-sse/providers/capabilities.js` (`getCapabilitiesForModel`). Format the criterion string as `"<Name> (<capabilities>, <contextWindow>)"`.
- **Alternatives Considered**:
  - *Retaining null descriptions*: Rejected based on empirical proof on `ollaya`: prefixes (`cx/`, `ds/`) without descriptions yield 8% confidence coin-flips, whereas enriched metadata yields 97.7% confidence.
  - *Manually entering descriptions in Combos UI*: Rejected because it adds cognitive friction for the user when 9Router already maintains the capability registry.

### Decision 3: Separate Initial Turn Selection from Turn-2 Hysteresis
- **Approach**: In `open-sse/services/combo.js`, evaluate System One on Turn 1 and accept the candidate with the highest probability. Apply `switchThreshold` (80% default) only when `activeStickyModel` is already set (Turn 2+) to prevent disrupting a warm cache.
- **Alternatives Considered**:
  - *Lowering switchThreshold globally to 50%*: Rejected because it weakens cache retention on subsequent turns when the topic only slightly wanders.

### Decision 4: Modality Pre-Filtering Before System One Choice
- **Approach**: On turns requiring hard input modalities (`vision`, `audioInput`, `pdf`), filter the candidate array to models that satisfy the requirement before sending `criteria` to System One.
- **Alternatives Considered**:
  - *Letting System One decide without modality awareness*: Rejected because System One might select a text-only model, causing `autoSwitch` to override the choice and create a sticky cache mismatch on Turn 2.

## Risks / Trade-offs

- **[Risk] Ollaya host offline or unreachable on LAN** → **[Mitigation]** `handleSystemoneCore` automatically intercepts connection errors and fails over directly to `opencode-zen/jev-1.13-free` with zero downtime (`SYSTEMONE_FAILOVER.ollaya`).
- **[Risk] System One latency overhead on Turn 1** → **[Mitigation]** `pplx-decider:flash-fp16` runs on-device CUDA with `~100ms` latency. Strict Lock policy ensures Turn 2+ adds exactly `+0ms`.
- **[Risk] Excessive telemetry log volume from Smart Router** → **[Mitigation]** In-process evaluations are logged under `/internal/smart-router` and use standard `usageHistory` retention cleanup.
