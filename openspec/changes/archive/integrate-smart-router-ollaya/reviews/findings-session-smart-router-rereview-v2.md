# Independent Re-Review Findings: 9Router Smart Router & Ollaya System One Integration (Round 2)

- **Target Change**: `integrate-smart-router-ollaya` (`O:/workspaces/oss/9router/openspec/changes/integrate-smart-router-ollaya`)
- **Worktree**: `O:/workspaces/.worktrees/wt-9router-smart-router-ollaya`
- **Branch**: `feat/smart-router-ollaya`
- **Commits Inspected**: `0f03d1ee`, `98733146`, `cdafaf8e` (Merge-base: `3825778e`)
- **Remediation Commit**: `cdafaf8e` ("fix(smart-router): remove Turn-1 hysteresis, exclude incompatible modalities, validate before telemetry")
- **Auditor**: `@reviewer` (Domain: Code Quality & Independent Verification)
- **Review Date**: 2026-10-28
- **Mandate Specs**: `code-review-mandate/spec.md`, `lessons-learned.md`, `specs/smart-router/spec.md`, `9ROUTER-INV-1..7`
- **Verdict**: **APPROVED**

---

## Executive Summary & Verdict

| Severity | Count | Primary Impact | Status |
|---|:---:|---|:---:|
| **CRITICAL** | 0 | All prior critical defects (C-01, C-02) fully resolved | **RESOLVED** |
| **WARNING** | 0 | All prior warning defects (W-01, W-02, W-03) fully resolved | **RESOLVED** |
| **INFO** | 2 | Minor Fowler smell judgement calls noted (advisory only) | **ADVISORY** |
| **TOTAL** | 2 | **Ready for deployment to Intel NUC** | **PASS** |

**Final Verdict**: **APPROVED**

The remediation submitted in commit `cdafaf8e` by `@coder` on task `t_e65e6225` has completely and faithfully resolved all findings from prior review `t_d90c0df5`:
1. **C-01 (Turn-1 Hysteresis)**: Removed `switchThreshold` branch when no active sticky model exists in `open-sse/services/combo.js`. The top System One choice is unconditionally accepted and made sticky on Turn 1.
2. **C-02 (Test Suite Alignment)**: Obsolete Turn-1 fallback test was replaced with a test asserting top choice acceptance below `switchThreshold` (`0.65 < 0.8`), and a new test covers Turn-2+ cache-switching hysteresis (`0.79` retains sticky model, `0.80` switches).
3. **W-01 (Modality Exclusion)**: `partitionByHardCapabilities` partitions candidates by hard capabilities (`HARD_CAPS`), excluding models lacking required modalities from System One choice criteria and stickiness, while preserving them as a fallback tail.
4. **W-02 (Telemetry Validation)**: Telemetry records (`saveRequestUsage` and `saveRequestDetail`) in `src/sse/services/systemoneRouter.js` are persisted only after route validation, recording `status: "success"` on valid choice and `status: "error"` on invalid choice.
5. **W-03 (Config Locality)**: `DEFAULT_SYSTEMONE_ROUTER_MODEL` moved to `open-sse/config/systemoneConfig.js` and imported across services and UI components, eliminating hardcoded model strings.

---

## Detailed Remediation Audit

### [RESOLVED] C-01: Turn-One Decision Acceptance Without Hysteresis
- **Spec Reference**: `specs/smart-router/spec.md:63-68` (`Requirement: Turn-One Decision Acceptance Without Hysteresis`)
- **File & Line**: `open-sse/services/combo.js:464-474`
- **Verification Evidence**:
  In `handleComboChat`:
  ```javascript
  if (smartResult?.choice && candidateModels.includes(smartResult.choice)) {
    // No sticky model yet: accept the top choice. switchThreshold is cache-switching
    // hysteresis and only applies when leaving an existing sticky model (Turn 2+).
    rotatedModels = orderModelsByChoice(candidateModels, smartResult);
    log.info("COMBO", `smart-router selected ${smartResult.choice} (confidence: ${conf ?? "N/A"})`);
    if (!isPerTurn && sessionId) {
      setStickyComboModel(comboName, sessionId, smartResult.choice);
      activeStickyModel = smartResult.choice;
    }
  }
  ```
  The previous check `if (switchThreshold > 0 && conf !== null && conf < switchThreshold)` on Turn 1 has been removed. Binary-margin decisions (such as Ollaya confidence 0.776) now cleanly select the chosen model on Turn 1 rather than falling back to static ordering.

### [RESOLVED] C-02: Test Suite Aligned with Spec
- **Spec Reference**: `specs/smart-router/spec.md:63-68`
- **File & Line**: `tests/unit/combo-smart-router.test.js:338-407`
- **Verification Evidence**:
  1. Test `"accepts the top System One choice on Turn 1 even when confidence is below switchThreshold (no Turn-1 hysteresis)"`:
     - Calls `handleComboChat` with confidence `0.65` and `confidenceThreshold: 0.8`.
     - Asserts `expect(calls[0]).toBe("ds/deepseek-v4")` and verifies `getStickyComboModel` returns `"ds/deepseek-v4"`.
  2. Test `"enforces switchThreshold hysteresis only on Turn 2+ (default smart policy)"`:
     - Turn 1: confidence `0.60` -> calls `"ds/deepseek-v4"`.
     - Turn 2: candidate `"cx/gpt-5-mini"` with confidence `0.79` (< 0.80) -> does NOT switch, calls `"ds/deepseek-v4"` (preserves cache).
     - Turn 3: candidate `"cx/gpt-5-mini"` with confidence `0.80` (>= 0.80) -> switches, calls `"cx/gpt-5-mini"`.

### [RESOLVED] W-01: Modality Pre-Filtering Excludes Incompatible Models
- **Spec Reference**: `specs/smart-router/spec.md:55-61` (`Requirement: Modality Pre-Filtering Before Smart Router`)
- **File & Line**: `open-sse/services/combo.js:107-124, 396-405, 484`
- **Verification Evidence**:
  `partitionByHardCapabilities(models, required)` filters models by `HARD_CAPS`.
  In `handleComboChat`:
  ```javascript
  if (required.size > 0) {
    const ordered = reorderByCapabilities(models, required);
    const { compatible, incompatible } = partitionByHardCapabilities(ordered, required);
    candidateModels = compatible.length > 0 ? compatible : ordered;
    excludedModels = compatible.length > 0 ? incompatible : [];
    if (excludedModels.length > 0) {
      log.info("COMBO", `smart-router excluded [${excludedModels.join(", ")}] lacking [${[...required].join(",")}]`);
    }
  }
  rotatedModels = candidateModels;
  ...
  if (excludedModels.length > 0) rotatedModels = [...rotatedModels, ...excludedModels];
  ```
  Incompatible models are never passed to System One choice criteria or locked into session stickiness. If compatible models fail upstream, excluded models are kept as a last-resort fallback tail.

### [RESOLVED] W-02: Telemetry Persisted After Route Validation
- **Spec Reference**: `specs/smart-router/spec.md:18-24` (`Requirement: Smart Router Telemetry and Detail Logging`)
- **File & Line**: `src/sse/services/systemoneRouter.js:122-145`
- **Verification Evidence**:
  ```javascript
  const json = result.responseBody || (await result.response.json());
  const route = parseSystemOneRouteAnswer(json);
  const status = route?.choice ? "success" : "error";

  saveRequestUsage({
    provider,
    model,
    connectionId: refreshedCredentials?.connectionId,
    endpoint: "/internal/smart-router",
    tokens,
    status,
  }).catch(() => {});
  ```
  `parseSystemOneRouteAnswer` executes before database persistence. Invalid route decisions are logged with `status: "error"`, preventing phantom success records in usage analytics.

### [RESOLVED] W-03: Configuration Locality & Constant DRY
- **Standard Reference**: `open-sse/AGENTS.md:11, 23-25`
- **File & Line**: `open-sse/config/systemoneConfig.js:4`, `open-sse/services/systemoneRouter.js:10`, `src/app/(dashboard)/dashboard/combos/page.js:13, 640, 755`
- **Verification Evidence**:
  `DEFAULT_SYSTEMONE_ROUTER_MODEL = "ollaya/pplx-decider:flash-fp16"` is defined in `open-sse/config/systemoneConfig.js`, re-exported by `open-sse/services/systemoneRouter.js`, and imported into `combos/page.js`. No hardcoded model string literals remain.

---

## Two-Axis Review Analysis

### 1. Standards Axis (Documented Standards & Fowler Code Smells)
- **Documented Repo Standards (`open-sse/AGENTS.md`)**: **PASS**
  - Config-driven constants centralized under `config/`.
  - Non-blocking `.catch(() => {})` telemetry logging preserving fail-open behavior.
  - Canonical naming and clean modular re-exports.
- **Fowler Smell Baseline**:
  - *Duplicated Code (Eliminated)*: `detectRequiredCapabilities(body)` is now computed once at the entry of `handleComboChat`, removing the duplicate traversal noted in prior review.
  - *Speculative Telemetry (Eliminated)*: Premature `"success"` state eliminated.
  - *Advisory Observation 1 (Minor Redundant Lookup)*: `reorderByCapabilities` and `partitionByHardCapabilities` both inspect capabilities for `HARD_CAPS`. Overhead is negligible for typical combo candidate counts (2-10 models).
  - *Advisory Observation 2 (Stylistic Consistency)*: `partitionByHardCapabilities` uses canonical `parseModel` whereas adjacent legacy function `reorderByCapabilities` uses manual string splitting. Recommend adopting `parseModel` across both functions in future refactoring.

### 2. Spec Axis (OpenSpec Delta Spec & Invariant Fidelity)
- **9ROUTER-INV-1..7 Invariants**: **100% COMPLIANT**
  - **9ROUTER-INV-7 (Local Zero-Auth Engines)**: Zero synthetic database records created; `noAuth: true` / `authType: "none"` dispatched with `credentials: null`.
  - **Zero-Checkout**: Primary branch `master` untouched in production checkout `O:/workspaces/oss/9router`; changes strictly confined to worktree `O:/workspaces/.worktrees/wt-9router-smart-router-ollaya`.
- **Fidelity to `specs/smart-router/spec.md`**:
  - NoAuth Provider Dispatch: **PASS**
  - UI Router Picker: **PASS**
  - Multi-Format Prompt Extraction: **PASS**
  - Auto-Enriched Choice Criteria: **PASS**
  - Modality Pre-Filtering: **PASS**
  - Turn-One Decision Acceptance Without Hysteresis: **PASS**
  - Telemetry & Analytics: **PASS**

---

## Automated Test Verification Evidence

The test suites were executed directly against worktree `O:/workspaces/.worktrees/wt-9router-smart-router-ollaya`:

1. **Target Smart Router & NoAuth Suites**:
   - Command: `npx vitest run -c tests/vitest.config.js tests/unit/combo-smart-router.test.js tests/unit/smart-router-noauth.test.js`
   - Outcome: **32 passed (32 total), 2 test files, duration 502ms, exit code 0**
2. **Ollaya & Claude Cached Token Regression Suites**:
   - Command: `npx vitest run -c tests/vitest.config.js tests/unit/ollaya-systemone-provider.test.js tests/unit/cached-token-e2e.test.js`
   - Outcome: **21 passed (21 total), 2 test files, duration 647ms, exit code 0**
3. **Laya System One Integration Script**:
   - Command: `node tests/unit/verify-laya-provider.mjs`
   - Outcome: **ALL VERIFICATION CHECKS PASSED, exit code 0**
4. **Git Tree Cleanliness**:
   - Command: `git -C O:/workspaces/.worktrees/wt-9router-smart-router-ollaya status --short`
   - Outcome: Clean (0 uncommitted files, branch ahead by 3 commits: `0f03d1ee`, `98733146`, `cdafaf8e`)

---

## Recommendation & Next Handoff

- **Verdict**: **APPROVED**
- **Action**: All criteria met. The change is approved for merge to `master` and deployment to Intel NUC (`DESKTOP-01`).
