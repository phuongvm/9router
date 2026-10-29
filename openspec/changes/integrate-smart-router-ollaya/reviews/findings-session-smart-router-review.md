# Independent Review Findings: 9Router Smart Router & Ollaya System One Integration

- **Target Change**: `integrate-smart-router-ollaya` (`O:/workspaces/oss/9router/openspec/changes/integrate-smart-router-ollaya`)
- **Worktree**: `O:/workspaces/.worktrees/wt-9router-smart-router-ollaya`
- **Commits Inspected**: `0f03d1ee`, `98733146` (Merge-base: `3825778e`)
- **Auditor**: `@reviewer` (Domain: Code Quality & Independent Verification)
- **Review Date**: 2026-10-28
- **Mandate Specs**: `code-review-mandate/spec.md`, `lessons-learned.md`, `specs/smart-router/spec.md`, `9ROUTER-INV-1..7`
- **Verdict**: **REJECTED** (due to 2 CRITICAL defects: false task completion on Turn-1 hysteresis removal and conflicting regression test suite)

---

## Executive Summary & Verdict

| Severity | Count | Primary Impact |
|---|:---:|---|
| **CRITICAL** | 2 | Core Turn-1 hysteresis logic unremoved in `combo.js` (violates `spec.md:63-68`); conflicting regression test retained |
| **WARNING** | 3 | Incomplete modality candidate exclusion; premature success telemetry; hardcoded model strings |
| **INFO** | 3 | Redundant capability detection; manual string splitting in `formatModelDescriptor`; unscoped `noAuth` in UI |
| **TOTAL** | 8 | **Rework required before deployment to Intel NUC** |

**Final Verdict**: **REJECTED**
The implementation successfully resolves Ticket 01 (NoAuth dispatch for `ollaya`/`laya` in `resolveSmartChoice` and UI discovery in `ModelSelectModal.js` without synthetic DB credentials, strictly adhering to `9ROUTER-INV-7`). It also implements multi-format prompt extraction (OpenAI Responses and Gemini native) and criteria enrichment (`findModelName` + capabilities).
However, **Ticket 02 was marked complete (`[x] 2.4`) in `tasks.md` without the code changes actually landing in `open-sse/services/combo.js`**. The 80% `switchThreshold` is still actively enforced on Turn 1, causing low-confidence decisions (such as binary margin confidence 0.776 on live Ollaya) to drop back to static ordering. Furthermore, the test suite preserves an obsolete test explicitly asserting Turn-1 fallback, concealing the missing implementation.

---

## Scope & Coverage

### Reviewed Artifacts & Code
- **OpenSpec Change Artifacts**: `proposal.md`, `design.md`, `specs/smart-router/spec.md`, `tasks.md`, `.openspec.yaml`.
- **Backend Services**:
  - `open-sse/services/combo.js` (Smart Router dispatch, session stickiness, modality pre-ordering, hysteresis threshold).
  - `open-sse/services/systemoneRouter.js` (Prompt state extraction, format support, model descriptor formatting, criteria builder).
  - `src/sse/services/systemoneRouter.js` (Credential resolution, unauthenticated provider dispatch, telemetry logging).
- **Frontend Components**:
  - `src/shared/components/ModelSelectModal.js` (`NO_AUTH_PROVIDER_IDS` provider resolution).
  - `src/app/(dashboard)/dashboard/combos/page.js` (`getRouterModelStatus`, `ComboCard` router display).
- **Test Suites**:
  - `tests/unit/combo-smart-router.test.js`
  - `tests/unit/smart-router-noauth.test.js`
  - `tests/unit/ollaya-systemone-provider.test.js`
  - `tests/unit/cached-token-e2e.test.js`
  - `tests/unit/verify-laya-provider.mjs`

### Not Reviewed / Out of Scope
- Remote CUDA inference execution on `AGENT-4070` (`192.168.100.130:11435`) and Intel NUC deployment (`192.168.100.110:20128`).
- Internal weights / quantization of `pplx-decider:flash-fp16`.

---

## Two-Axis Review Analysis

### 1. Standards Axis (Documented Standards & Fowler Code Smells)

- **Hard Violation — Hardcoded Model Constants (`open-sse/AGENTS.md:23-25`)**:
  - `src/app/(dashboard)/dashboard/combos/page.js:639, 754` hardcodes literal `"ollaya/pplx-decider:flash-fp16"` twice instead of importing `DEFAULT_SYSTEMONE_ROUTER_MODEL`.
  - `open-sse/services/systemoneRouter.js:10` defines `DEFAULT_SYSTEMONE_ROUTER_MODEL` in `services/` instead of `open-sse/config/systemoneConfig.js` (`open-sse/AGENTS.md:11` directs all constants and default configurations to `config/`).
- **Fowler Smell — Duplicated Code (`open-sse/services/combo.js:375-381, 469-478`)**:
  - `detectRequiredCapabilities(body)` executes twice during smart combo routing. In non-smart combos, lines 375–381 execute dead work that is overwritten at line 465 (`rotatedModels = getRotatedModels(...)`).
  - Lines 406, 425, 430, and 434 duplicate the array reconstruction expression `[activeStickyModel, ...candidateModels.filter((m) => m !== activeStickyModel)]` four times.
- **Fowler Smell — Duplicated Code & Data Clumps (`src/sse/services/systemoneRouter.js:114-142`)**:
  - The token extraction and telemetry persistence block (`saveRequestUsage`, `saveRequestDetail`) is cloned verbatim from `src/sse/handlers/systemone.js:101-130`.
- **Fowler Smell — Primitive Obsession / Feature Envy (`open-sse/services/systemoneRouter.js:93-96`)**:
  - `formatModelDescriptor` manually parses provider and model using string manipulation (`trimmed.indexOf("/")`) instead of delegating to `parseModel(modelStr)` from `open-sse/services/model.js`.
- **Invariant Audit (`9ROUTER-INV-1..7`)**:
  - **9ROUTER-INV-7 (Local Zero-Auth Engines)**: **PASS**. `ollaya` and `laya` are accessed with `credentials: null` without creating synthetic database records in `localDb`.
  - **Fail-Open Behavior**: **PASS**. In-process timeout and network errors fallback cleanly to candidate order.

### 2. Spec Axis (Fidelity to OpenSpec Delta Spec & Requirements)

- **Requirement: NoAuth Provider Dispatch in Smart Router**: **PASS**. `resolveSmartChoice` correctly checks `AI_PROVIDERS[provider]?.noAuth || AI_PROVIDERS[provider]?.authType === "none"`, allowing zero-auth dispatch.
- **Requirement: Surface Local Decision Engines in UI Router Picker**: **PASS (with minor scope creep)**. Models for `ollaya` and `laya` now appear in `ModelSelectModal.js`.
- **Requirement: Resilient Multi-Format Prompt State Extraction**: **PASS**. `extractPromptState` correctly extracts `input_text` (Codex Responses API) and `contents[].parts[]` (Gemini native).
- **Requirement: Auto-Enriched Choice Criteria**: **PASS**. `buildChoiceCriteria` formats candidates with `findModelName` and `getCapabilitiesForModel` (reasoning, vision, tools, context window).
- **Requirement: Turn-One Decision Acceptance Without Hysteresis**: **FAIL (CRITICAL)**. `open-sse/services/combo.js:442-446` continues to filter Turn 1 choices against `switchThreshold`.
- **Requirement: Modality Pre-Filtering Before Smart Router**: **PARTIAL (WARNING)**. Models are reordered but not excluded from `candidateModels`.
- **Requirement: Smart Router Telemetry and Detail Logging**: **PARTIAL (WARNING)**. Success telemetry is logged before verifying route choice validity.

---

## Detailed Findings & Actionable Remediation

### [CRITICAL] C-01: False Task Completion — Turn-One Hysteresis Check Unremoved
- **Spec Reference**: `specs/smart-router/spec.md:63-68` (`Requirement: Turn-One Decision Acceptance Without Hysteresis`), `design.md:36-39` (`Decision 3`), `tasks.md:15` (`Task 2.4`).
- **File & Line**: `open-sse/services/combo.js:442-446`
- **Description**:
  The delta spec explicitly specifies:
  > *"The `handleComboChat` handler SHALL accept the top System One choice on Turn 1 and SHALL NOT apply the Turn-2 cache-switching threshold when no sticky model exists."*
  
  In `tasks.md`, task 2.4 was checked off:
  > `- [x] 2.4 Update open-sse/services/combo.js so Turn 1 accepts the top candidate without applying the Turn 2+ switchThreshold hysteresis filter.`
  
  However, in `open-sse/services/combo.js`, lines 442–446 still contain:
  ```javascript
  if (smartResult?.choice && candidateModels.includes(smartResult.choice)) {
    if (switchThreshold > 0 && conf !== null && conf < switchThreshold) {
      log.info("COMBO", `smart-router confidence (${conf}) below threshold (${switchThreshold}), fallback to order: [${candidateModels.join(", ")}]`);
      rotatedModels = candidateModels;
    } else {
      rotatedModels = orderModelsByChoice(candidateModels, smartResult);
  ```
  On Turn 1 (`!activeStickyModel`), any decision where confidence falls below 0.8 is discarded and falls back to static candidate order. This directly breaks the primary requirement to eliminate Turn 1 coin-flip fallback on binary-margin classifications.
- **Actionable Remediation**:
  Remove the `switchThreshold` filter when `!activeStickyModel`. The hysteresis threshold should only apply when evaluating whether to switch away from an existing `activeStickyModel` (lines 415–427).

---

### [CRITICAL] C-02: Conflicting Legacy Test Retained in Suite
- **Spec Reference**: `specs/smart-router/spec.md:63-68`
- **File & Line**: `tests/unit/combo-smart-router.test.js:338-366`
- **Description**:
  The test suite contains:
  ```javascript
  it("falls back to default order when decision confidence is below confidenceThreshold", async () => { ... }
  ```
  This test asserts that on Turn 1, a confidence of 0.65 with threshold 0.8 results in fallback to default candidate order (`calls[0] === "cx/gpt-5-mini"`). Because this test was preserved, removing the check in `combo.js` would have failed this test. The developer appears to have left the code intact to preserve the test pass, directly violating the new specification.
- **Actionable Remediation**:
  Update this test to assert that Turn 1 accepts the top candidate without applying switch hysteresis, and add a test confirming that `switchThreshold` is enforced on Turn 2+ (`smart-switch` policy).

---

### [WARNING] W-01: Modality Pre-Filtering Only Reorders Rather Than Excluding Incompatible Models
- **Spec Reference**: `specs/smart-router/spec.md:55-61` (`Requirement: Modality Pre-Filtering Before Smart Router`)
- **File & Line**: `open-sse/services/combo.js:375-381`
- **Description**:
  The spec requires:
  > *"candidate models lacking that modality are excluded from the choice criteria"*
  
  The code calls `reorderByCapabilities(models, required)`. As documented in `combo.js:84`, this function stably sorts models but **never drops a model**. All models remain in `candidateModels` and are submitted to `resolveSmartChoice` / `buildChoiceCriteria`. If System One chooses a text-only model despite reordering, `autoSwitch` at line 469 will override it on Turn 1, but the text-only model will have been locked into `setStickyComboModel`, corrupting prompt cache affinity on Turn 2.
- **Actionable Remediation**:
  When `required.size > 0`, filter `candidateModels` so models lacking the hard modality are pruned before `buildChoiceCriteria` is generated. If no models satisfy the requirement, fallback to original list.

---

### [WARNING] W-02: Premature Success Telemetry Logging Before Route Choice Validation
- **Spec Reference**: `specs/smart-router/spec.md:18-24` (`Requirement: Smart Router Telemetry and Detail Logging`)
- **File & Line**: `src/sse/services/systemoneRouter.js:122-148`
- **Description**:
  `saveRequestUsage` and `saveRequestDetail` are executed with `status: "success"` at lines 122–141, before line 144 evaluates `parseSystemOneRouteAnswer(json)`. If `parseSystemOneRouteAnswer` fails (returns `null`), `resolveSmartChoice` returns `null` (line 147), but the request details and usage records have already been written to the database marked as `"success"`.
- **Actionable Remediation**:
  Move telemetry persistence after `route?.choice` validation, recording `status: "success"` only when a valid choice is extracted, and optionally `status: "error"` on parse failure.

---

### [WARNING] W-03: Hardcoded Model Strings & Config Locality Violation
- **Standard Reference**: `open-sse/AGENTS.md:11, 23-25`
- **File & Line**: `src/app/(dashboard)/dashboard/combos/page.js:639, 754`, `open-sse/services/systemoneRouter.js:10`
- **Description**:
  `combos/page.js` hardcodes `"ollaya/pplx-decider:flash-fp16"` twice. `systemoneRouter.js` defines `DEFAULT_SYSTEMONE_ROUTER_MODEL` in `services/` rather than in `open-sse/config/systemoneConfig.js`.
- **Actionable Remediation**:
  Define `DEFAULT_SYSTEMONE_ROUTER_MODEL` in `open-sse/config/systemoneConfig.js` alongside `SYSTEMONE_FAILOVER` and import it in `page.js` and `systemoneRouter.js`.

---

### [INFO] I-01: Redundant `detectRequiredCapabilities` Execution & Dead Work
- **File & Line**: `open-sse/services/combo.js:375-381, 469-478`
- **Description**:
  `detectRequiredCapabilities(body)` runs twice during smart combo evaluation. Furthermore, in non-smart combos, lines 375–381 execute needlessly before being overwritten at line 465.
- **Actionable Remediation**:
  Nest modality pre-ordering strictly within `if (comboStrategy === "smart")`.

---

### [INFO] I-02: Primitive Obsession in `formatModelDescriptor`
- **File & Line**: `open-sse/services/systemoneRouter.js:93-96`
- **Description**:
  Manual string splitting (`trimmed.indexOf("/")`) is used instead of existing helper `parseModel(modelStr)` from `open-sse/services/model.js`.
- **Actionable Remediation**:
  Call `parseModel(modelStr)` to leverage standard alias and provider normalization.

---

### [INFO] I-03: Unscoped `noAuth` Expansion in `ModelSelectModal.js`
- **File & Line**: `src/shared/components/ModelSelectModal.js:23`
- **Description**:
  Replacing `FREE_PROVIDERS` with `AI_PROVIDERS` exposes `noAuth` providers across all modal selectors rather than scoping specifically to `kindFilter === "systemone"`.
- **Actionable Remediation**:
  Scope `AI_PROVIDERS` filtering to `kindFilter === "systemone"` or document this intentional global expansion.

---

## Test Execution Evidence

All test executions were run independently in `O:/workspaces/.worktrees/wt-9router-smart-router-ollaya` using `-c tests/vitest.config.js`:

```text
$ npx vitest run -c tests/vitest.config.js tests/unit/combo-smart-router.test.js tests/unit/smart-router-noauth.test.js

Test Files  2 passed (2)
     Tests  25 passed (25)
  Duration  2.25s
```

```text
$ node tests/unit/verify-laya-provider.mjs && npx vitest run -c tests/vitest.config.js tests/unit/combo-smart-router.test.js tests/unit/smart-router-noauth.test.js tests/unit/ollaya-systemone-provider.test.js tests/unit/cached-token-e2e.test.js

=== Verifying Laya Provider in 9Router ===
✓ Found provider 'laya' in REGISTRY
✓ Verified provider category, serviceKinds, and authType
✓ PROVIDER_MEDIA baseUrl: http://192.168.100.130:8000/v1/systemone
✓ Found laya in getProvidersByKind('systemone')
✓ Verified 4 models in registry: laya-auto, english, multilingual, typed-decisions

=== Testing Failover to OpenCode Zen on Connection Failure ===
✓ Verified responseBody and normalized usage { prompt_tokens, completion_tokens, total_tokens }
✓ Verified automated failover to opencode-zen on connection refusal
ALL VERIFICATION CHECKS PASSED!

Test Files  4 passed (4)
     Tests  46 passed (46)
  Duration  1.26s
```

```text
$ node --check open-sse/services/combo.js open-sse/services/systemoneRouter.js src/sse/services/systemoneRouter.js
(Syntax check passed: exit code 0)
```

---

## Conclusion & Handoff Instructions for Coordinator

1. **Do Not Deploy Commit `98733146` to Intel NUC**: The commit is not production-ready due to unremoved Turn-1 hysteresis and telemetry anomalies.
2. **Issue Rework Card to Worker**:
   - Fix `open-sse/services/combo.js` to eliminate Turn-1 `switchThreshold` filtering.
   - Update `tests/unit/combo-smart-router.test.js:338` to match the new Turn-1 acceptance spec.
   - Implement true modality exclusion in candidate filtering for multimodal turns.
   - Move telemetry persistence after route answer validation.
   - Clean up hardcoded model strings in `combos/page.js`.
