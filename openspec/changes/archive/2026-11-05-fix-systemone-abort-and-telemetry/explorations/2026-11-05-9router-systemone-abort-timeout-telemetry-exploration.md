# Exploration: 9Router System One AbortSignal Cancellation, 5,000ms Local Timeout, Failover Provenance Telemetry & NUC Cutover

- **Status**: COMPLETED — APPROVED FOR PROPOSAL (`fix-systemone-abort-and-telemetry`)
- **Date**: 2026-11-05
- **Project**: `9router` (`O:\workspaces\oss\9router`, `OPENSPEC_ROOT = O:/workspaces/oss/9router/openspec`)
- **Pinned Repository & Runtime Commits**:
  - `O:/workspaces/oss/9router` `HEAD` / `origin/master`: `dfd81d65afc3f59888a02c1b4c80a303f13de2dc` (`fix(smart-router): skip credential lookup for noAuth router providers`)
  - Deployed Intel NUC (`192.168.100.110:20128`) container `9router` (`ROUTER_VCS_REF`): `7f9d84388d9e5fec903e0414d8183e13114edb59` (1 commit behind `dfd81d65afc3f59888a02c1b4c80a303f13de2dc`)
- **Methodology**: Matt Pocock `diagnosing-bugs` (Tight Red Loop `< 5s`) + `codebase-design` (`DEEPENING`), cross-validated via Blind Dual-Model Independent RCA (`cb-gemini-argon` Pass A + `@reviewer` `codex/gpt-5.6-terra-review` Pass B in `deleg_88fb286c`).

---

## 1. Problem Statement & Verified Incident Baseline

On `2026-11-05`, Intel NUC `9router` (`192.168.100.110:20128`) emitted `34` delayed timeout warnings across four load windows (`05:57Z`, `06:27–06:33Z`, `06:38–06:41Z`, `06:48Z`), exemplified by:

```text
[06:40:52] ⚠️ [SYSTEMONE] Local Ollaya unreachable at http://192.168.100.130:11435/v1/systemone (The operation was aborted due to timeout). Failing over to opencode-zen/jev-1.13-free
```

Dual-model empirical forensics established four concrete defects inside `9router` and its NUC deployment state:

1. **Defect D-1 — Orphaned 60s Background Fetch & Zombie Cloud Failover (`src/sse/services/systemoneRouter.js:87-106`, `src/sse/handlers/systemone.js:94,165`, `open-sse/handlers/systemoneCore.js:100-115`)**:
   - At `2026-11-05T06:39:52.760Z`, Smart Combo `cb-nous-free` invoked `resolveSmartChoice`, which wraps `handleSystemoneCore` in `Promise.race([corePromise, timeoutPromise])` (`DEFAULT_SYSTEMONE_TIMEOUT_MS = 8000`) **without passing an `AbortSignal`**.
   - At `06:40:00.766Z` (`+8,006ms`), `resolveSmartChoice` abandoned `corePromise`, fell back to `nous/stealth/crouton-alpha`, and completed the chat turn at `06:40:09.842Z`.
   - Because `corePromise` was never aborted, `handleSystemoneCore` held its socket open until `FETCH_CONNECT_TIMEOUT_MS = 60000` (`open-sse/config/runtimeConfig.js:64`), firing at `06:40:52.877Z` (`Δ = 60.117s`), logging `"Local Ollaya unreachable"`, and executing a **zombie failover** to `opencode-zen/jev-1.13-free` whose response was discarded.
   - Similarly, `handleSystemone` (`src/sse/handlers/systemone.js:94,165`) does not forward `request.signal` to `handleSystemoneCore`, keeping upstream requests alive for `60s` after HTTP clients (`OpenJevClient` at `10s`) disconnect, and risking false `markAccountUnavailable` penalties (`:211`) when a client disconnects on credentialed lanes.

2. **Defect D-2 — Inverted Timeout Hierarchy Preventing Live Failover (`open-sse/config/systemoneConfig.js:12-25`, `open-sse/handlers/systemoneCore.js:104-106`)**:
   - Local LAN System One providers (`ollaya` at `192.168.100.130:11435` and `laya` at `192.168.100.130:8000`) currently inherit `FETCH_CONNECT_TIMEOUT_MS = 60000` (`60s`), which is `7.5×` longer than `resolveSmartChoice`'s `8,000ms` total budget and `6×` longer than `OpenJevClient`'s `10,000ms` client timeout.
   - Consequently, whenever local Ollaya stalls under GPU saturation, `resolveSmartChoice` and `OpenJevClient` **always time out before 9Router's configured 1-hop cloud failover (`opencode-zen/jev-1.13-free`) can even start**.
   - Setting a dedicated local System One timeout `SYSTEMONE_LOCAL_TIMEOUT_MS = 5000` (`5,000ms`, overridable via `process.env.SYSTEMONE_LOCAL_TIMEOUT_MS`) leaves `3,000ms` inside `resolveSmartChoice`'s `8,000ms` ceiling and `5,000ms` inside `OpenJevClient`'s `10,000ms` ceiling so `opencode-zen/jev-1.13-free` (`~500–900ms` typical latency) completes live within caller budgets.
   - In addition, `handleSystemoneCore` currently logs `"Local Ollaya unreachable ..."` even when the failure was a local timeout (`TimeoutError`) rather than a connection refusal.

3. **Defect D-3 — Mislabeled `servedBy` Provider/Model Telemetry on Failover (`open-sse/handlers/systemoneCore.js:139-153`, `src/sse/handlers/systemone.js:110-129,185-206`, `src/sse/services/systemoneRouter.js:127-146`, `src/lib/db/repos/usageRepo.js:296`)**:
   - When `handleSystemoneCore` fails over recursively (`systemoneCore.js:9-19`) from `ollaya/pplx-decider:flash-fp16` to `opencode-zen/jev-1.13-free`, its return object `{ success, responseBody, usage, response }` omits which provider/model actually served the decision.
   - Both `handleSystemone` and `resolveSmartChoice` persist `provider` and `model` from the initial request's `modelInfo` (`ollaya` / `pplx-decider:flash-fp16`), corrupting `usageHistory`, `usageDaily`, and `requestDetails` by recording cloud `opencode-zen` failovers as local `ollaya` successes (e.g., `usageHistory#1192192` at `06:40:48Z`).
   - Furthermore, `usageRepo.js:296` hardcodes `stringifyJson({})` for the `meta` column in `usageHistory` instead of persisting `entry.meta`, and `requestDetailsRepo.js:105-119` omits `item.meta` from the persisted `record`.

4. **Defect D-4 — Undeployed `dfd81d65` on Intel NUC (`192.168.100.110:20128`)**:
   - Intel NUC `9router` is still running commit `7f9d84388d9e5fec903e0414d8183e13114edb59`, predating `dfd81d65afc3f59888a02c1b4c80a303f13de2dc` (`fix(smart-router): skip credential lookup for noAuth router providers`), causing false `⚠️ [AUTH] No credentials for ollaya` log warnings on Smart Combo requests.

---

## 2. Deep-Module Architecture & Seam Design (`codebase-design`)

1. **Config Seam (`open-sse/config/systemoneConfig.js`) — Preserving `open-sse/AGENTS.md` Zero-Hardcode Rule**:
   - Export pure parser `resolveSystemoneLocalTimeoutMs(raw = process.env.SYSTEMONE_LOCAL_TIMEOUT_MS, def = 5000)` and `SYSTEMONE_LOCAL_TIMEOUT_MS = resolveSystemoneLocalTimeoutMs()` (accepting positive integers only and falling back to `5000` for empty, zero, negative, or non-numeric values).
   - Attach `timeoutMs: SYSTEMONE_LOCAL_TIMEOUT_MS` to `SYSTEMONE_FAILOVER.ollaya` and `SYSTEMONE_FAILOVER.laya`.
   - Keep `open-sse/handlers/systemoneCore.js` completely free of provider/model string literals (`tests/unit/ollaya-systemone-provider.test.js:59-67`).

2. **Core Dispatch Seam (`open-sse/handlers/systemoneCore.js`)**:
   - Extend `handleSystemoneCore({ body, modelInfo, credentials, log, onRequestSuccess, signal, failoverFrom })`.
   - Resolve `providerTimeoutMs = SYSTEMONE_FAILOVER[provider]?.timeoutMs ?? FETCH_CONNECT_TIMEOUT_MS`.
   - Build a per-attempt composite `AbortController` linking `signal` (caller abort) and `setTimeout(..., providerTimeoutMs)` (with `timer.unref?.()` and deterministic listener/timer cleanup in `finally` — compatible with both production Node 22 and Vitest `vi.useFakeTimers()`).
   - **Pre-fetch & Post-error Caller-Abort Guard**: If `signal?.aborted` is `true` before `fetch`, on `fetch` rejection, or before HTTP-status failover, return `{ ...createErrorResult(HTTP_STATUS.REQUEST_TIMEOUT, error?.message || "System One request aborted"), aborted: true }` immediately **without** calling `failover()` and **without** logging a `"Failing over"` warning.
   - **Accurate Failover Reason & Recursive Signal/Provenance Propagation**: When `!signal?.aborted` and failover triggers:
     - Timeout error: `reason = "timed out after ${providerTimeoutMs}ms at ${targetUrl}"` (logged as `Local ${label} timed out after ${providerTimeoutMs}ms at ${targetUrl}. Failing over to ${next.provider}/${next.model}`).
     - Connection error: `reason = "unreachable at ${targetUrl} (${error.message})"`.
     - HTTP status error: `reason = "returned status ${providerResponse.status}"`.
     - Forward `signal` and `failoverFrom: failoverFrom || { provider, model, reason }` into the recursive `handleSystemoneCore` call so caller cancellation also aborts an in-flight cloud failover hop and preserves root failover provenance.
   - **Provenance Return Contract**: On success, include:
     ```js
     servedBy: {
       provider,
       model,
       failover: Boolean(failoverFrom),
       ...(failoverFrom ? { failoverFrom } : {}),
     }
     ```

3. **Caller & Telemetry Persistence Seams (`src/sse/services/systemoneRouter.js`, `src/sse/handlers/chat.js`, `src/sse/handlers/systemone.js`, `src/lib/db/repos/usageRepo.js`, `src/lib/db/repos/requestDetailsRepo.js`)**:
   - `chat.js` (`:159`, `:254`) forwards `signal: request?.signal` to `resolveSmartChoice`.
   - `resolveSmartChoice` creates a local `AbortController`, aborts it when either `signal` aborts or `timeoutMs` (`8000` default) elapses, passes `signal: controller.signal` into `handleSystemoneCore`, and cleans up timers/listeners in `finally`.
   - `handleSystemone` (`:94`, `:165`) forwards `signal: request?.signal` into `handleSystemoneCore` and skips `markAccountUnavailable` when `result.aborted || request?.signal?.aborted`.
   - Both `resolveSmartChoice` and `handleSystemone` compute `servedProvider = result.servedBy?.provider || provider`, `servedModel = result.servedBy?.model || model`, `didFailover = Boolean(result.servedBy?.failover)`, `effectiveConnectionId = didFailover ? undefined : credentials?.connectionId`, and `meta`:
     - Direct hit: `{ servedBy: "${servedProvider}/${servedModel}", failover: false }`
     - Failover hit: `{ servedBy: "${servedProvider}/${servedModel}", failover: true, requestedProvider: provider, requestedModel: model, failoverReason: result.servedBy.failoverFrom?.reason }`
   - `usageRepo.js::saveRequestUsage` persists `entry.meta` into `usageHistory.meta` (defaulting to `{}`) and `getUsageHistory` exposes `meta: parseJson(r.meta, {})`; `requestDetailsRepo.js` preserves `meta` on persisted detail records and exposes `flushToDatabase` on `__test__` (`export const __test__ = { sanitizeHeaders, flushToDatabase }`) so SQLite persistence and `getRequestDetails` retrieval are deterministically verifiable in unit tests.
   - Endpoint-handler tests in `tests/unit/smart-router-noauth.test.js` directly invoke `handleSystemone(request)` for both `noAuth` (`ollaya/pplx-decider:flash-fp16`) and credentialed (`openrouter/typesafe/jev-1.13`) routes with an aborting `request.signal`, proving in-flight `fetch` aborts immediately, `opencode-zen/jev-1.13-free` failover and `"Failing over to"` warnings are suppressed, and `markAccountUnavailable` is never called.

4. **Worktree Isolation & Intel NUC Cutover**:
   - Keep protected primary checkout `O:/workspaces/oss/9router` (`master` @ `dfd81d65afc3f59888a02c1b4c80a303f13de2dc`) 100% clean (`git status --porcelain` empty, `git diff --exit-code` exit `0`, `git diff --cached --exit-code` exit `0`) while staging all proposal and code/test work inside dedicated git worktree `O:/workspaces/.worktrees/wt-9router-systemone-abort` (`fix/systemone-abort-and-telemetry`).
   - Run full Vitest + `9ROUTER-INV-1..7` + baseline snapshot verification gates before fast-forwarding `origin/master` and `O:/workspaces/oss/9router`.
   - Execute `O:/workspaces/_config/agent4070/hermes/services/apply-live-9router-cutover.ps1 -DeployNuc` to back up NUC SQLite, fast-forward `/home/ubuntu/workspaces/oss/9router` to the new `origin/master` `HEAD` (which includes ancestor `dfd81d65afc3f59888a02c1b4c80a303f13de2dc`), update `ROUTER_VCS_REF`, rebuild/recreate container `9router`, and execute deterministic exit-status-bearing assertions verifying `LOCAL_SHA == NUC_SHA == LABEL_SHA`, `RestartCount == 0`, HTTP `200` + valid response payloads on live `POST /v1/systemone` and `POST /v1/chat/completions` (`cb-nous-free`), and `! docker logs --since 2m 9router 2>&1 | grep -Fq '[AUTH] No credentials for ollaya'`.

---

## 3. Baseline Verification & Out-of-Scope Boundaries

- **Verified Baseline Suites (`O:/workspaces/oss/9router`, commit `dfd81d65afc3f59888a02c1b4c80a303f13de2dc`)**:
  - `cd O:/workspaces/oss/9router/tests && npx vitest run unit/laya-systemone-provider.test.js unit/ollaya-systemone-provider.test.js unit/combo-smart-router.test.js unit/smart-router-noauth.test.js < /dev/null` → `PASS` (`rc=0`).
  - `node tests/__baseline__/verify-alias.mjs && node tests/__baseline__/verify-oauth-urls.mjs && node tests/__baseline__/verify-providers.mjs` → `PASS` (`rc=0`).
  - `node tests/unit/verify-laya-provider.mjs && node tests/unit/test-systemone-usage-logic.mjs` → `PASS` (`rc=0`).
- **Explicitly Out of Scope (Separate Repo Slices)**:
  - Bounding `_assessment_state` payload size and adding an `OpenJevClient` circuit breaker in `O:/workspaces/oss/hermes-nerve` (tracked separately under `hermes-agent` incident exploration Q3).
  - Changing local `ollaya` container model selection or VRAM allocation on `AGENT-4070` (`O:/workspaces/docker-compose/ollaya`, Q1).
  - Modifying Hermes Desktop `@url:` auto-chip paste behavior (`O:/workspaces/oss/hermes-agent`).
