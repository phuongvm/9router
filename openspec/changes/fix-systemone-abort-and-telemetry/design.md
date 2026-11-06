# Design: Fix System One AbortSignal Cancellation, 5,000ms Local Timeout, Failover Provenance Telemetry & Intel NUC Cutover

## Context

See `proposal.md` — Why and `explorations/2026-11-05-9router-systemone-abort-timeout-telemetry-exploration.md`.
`9router` dispatches System One decision requests through two entry seams that converge on `handleSystemoneCore` (`open-sse/handlers/systemoneCore.js`):
1. **Seam A (In-Process Smart Router)**: `handleChat` (`src/sse/handlers/chat.js:159,254`) → `handleComboChat` (`open-sse/services/combo.js:435,463`) → `resolveSmartChoice` (`src/sse/services/systemoneRouter.js:93`) → `handleSystemoneCore`.
2. **Seam B (Direct HTTP Endpoint `/v1/systemone`)**: `POST /api/v1/systemone` (`src/app/api/v1/systemone/route.js:20`) → `handleSystemone` (`src/sse/handlers/systemone.js:94,165`) → `handleSystemoneCore`.

Per `open-sse/AGENTS.md` and `tests/unit/ollaya-systemone-provider.test.js:59-67`, `open-sse/handlers/systemoneCore.js` MUST remain strictly config-driven with zero hardcoded provider/model literals (`"ollaya"`, `"laya"`, `"opencode"`, `"opencode-zen"`, `"typed-decisions"`, `"jev-1.13-free"`, `"public"`). All provider-specific failover and timeout constants belong in `open-sse/config/systemoneConfig.js`.

## Goals / Non-Goals

**Goals:**
- Cancel in-flight System One upstream `fetch` requests immediately when `resolveSmartChoice` hits its evaluation timeout ceiling (`8,000ms` default) or when the HTTP client disconnects (`request.signal`), suppressing zombie cloud failovers and false account cooldown penalties.
- Lower the local System One attempt timeout for `ollaya` and `laya` from `60,000ms` (`FETCH_CONNECT_TIMEOUT_MS`) to `5,000ms` (`SYSTEMONE_LOCAL_TIMEOUT_MS`) so 1-hop failover to `opencode-zen/jev-1.13-free` completes within `resolveSmartChoice`'s `8,000ms` budget and `OpenJevClient`'s `10,000ms` budget.
- Return `servedBy` provenance from `handleSystemoneCore` and persist the actual serving provider, model, and failover metadata in `usageHistory`, `usageDaily`, and `requestDetails`.
- Deploy the verified change alongside ancestor commit `dfd81d65afc3f59888a02c1b4c80a303f13de2dc` to Intel NUC (`192.168.100.110:20128`) with pre-deployment SQLite backup and live E2E verification.

**Non-Goals:**
- Modifying `hermes-nerve` client payload sizing or circuit-breaker logic (`O:/workspaces/oss/hermes-nerve`).
- Modifying the `ollaya` CUDA container or model selection on `AGENT-4070` (`O:/workspaces/docker-compose/ollaya`).
- Altering `FETCH_CONNECT_TIMEOUT_MS` (`60,000ms`) for standard generative chat/embeddings providers or cloud System One providers (`opencode-zen`, `openrouter`, `cloudflare-ai`).

## Decisions

### Decision 1: Config-Driven `SYSTEMONE_LOCAL_TIMEOUT_MS = 5000` in `open-sse/config/systemoneConfig.js`
- **Approach**:
  - Export a pure positive-integer parser `resolveSystemoneLocalTimeoutMs(raw = process.env.SYSTEMONE_LOCAL_TIMEOUT_MS, def = 5000)` and `SYSTEMONE_LOCAL_TIMEOUT_MS = resolveSystemoneLocalTimeoutMs()` in `open-sse/config/systemoneConfig.js` so valid positive integer strings (`"3500"` → `3500`) and invalid/non-positive values (`""`, `"0"`, `"-500"`, `"abc"`, `undefined` → `5000`) are deterministically unit-testable.
  - Add `timeoutMs: SYSTEMONE_LOCAL_TIMEOUT_MS` to each local entry in `SYSTEMONE_FAILOVER` (`ollaya` and `laya`).
  - In `open-sse/handlers/systemoneCore.js`, resolve the per-attempt timeout as:
    ```js
    const failoverCfg = SYSTEMONE_FAILOVER[provider];
    const providerTimeoutMs = failoverCfg?.timeoutMs ?? FETCH_CONNECT_TIMEOUT_MS;
    ```
- **Rationale & Alternatives Considered**:
  - *Why `5,000ms`?* Normal local `ollaya` latency on `AGENT-4070` is `12–305ms`. A `5,000ms` local ceiling gives `>15×` headroom for normal GPU contention while leaving `3,000ms` inside `resolveSmartChoice`'s `8,000ms` ceiling (`DEFAULT_SYSTEMONE_TIMEOUT_MS`) and `5,000ms` inside `OpenJevClient`'s `10,000ms` ceiling so `opencode-zen/jev-1.13-free` (`~500–900ms`) completes before caller timeout.
  - *Alternative — Lowering global `FETCH_CONNECT_TIMEOUT_MS`*: Rejected because long-context LLM prefill across generative chat providers legitimately requires up to `60,000ms`.
  - *Alternative — Hardcoding `provider === "ollaya" ? 5000 : 60000` in `systemoneCore.js`*: Rejected because it violates `open-sse/AGENTS.md` and fails the AST literal guard in `tests/unit/ollaya-systemone-provider.test.js:59-67`.

### Decision 2: Composite `AbortController` Seam in `handleSystemoneCore` & Failover Suppression on Caller Abort
- **Approach**:
  - Extend `handleSystemoneCore` signature to `{ body, modelInfo, credentials, log, onRequestSuccess, signal, failoverFrom = null }`.
  - Before invoking `fetch`, check `if (signal?.aborted)` and return `{ ...createErrorResult(HTTP_STATUS.REQUEST_TIMEOUT, "System One request aborted"), aborted: true }` immediately.
  - Construct a per-attempt composite signal via a helper `createAttemptSignal(signal, providerTimeoutMs)` that creates an `AbortController`, listens for `{ once: true }` on `signal`, arms a `setTimeout` for `providerTimeoutMs` (`timer?.unref?.()`), records `timedOut = true` when the internal timer fires, and exposes `cleanup()` called inside `try ... finally` to clear the timer and remove the abort listener on `signal`.
  - In `catch (error)` around `fetch`:
    1. If `signal?.aborted` is `true`, log `log?.debug?.("SYSTEMONE", "Request aborted by caller")` and return `{ ...createErrorResult(HTTP_STATUS.REQUEST_TIMEOUT, error?.message || "System One request aborted"), aborted: true }` **without** calling `failover()` and **without** logging `"Failing over"`.
    2. Otherwise, if `failoverCfg` (`SYSTEMONE_FAILOVER[provider]`) is defined, distinguish local timeout (`attempt.didTimeout() || error?.name === "TimeoutError"`) from network/connect failure:
       - Timeout: `reason = \`timed out after ${providerTimeoutMs}ms at ${targetUrl}\``
       - Unreachable: `reason = \`unreachable at ${targetUrl} (${error.message})\``
       Pass `signal` and `failoverFrom: failoverFrom || { provider, model, reason }` into `failover(...)`.
  - On non-OK HTTP responses matching `failoverCfg?.statuses`: check `if (signal?.aborted)` first; if not aborted, invoke `failover(...)` with `reason: \`returned status ${providerResponse.status}\``, forwarding `signal` and `failoverFrom: failoverFrom || { provider, model, reason }`.
- **Rationale & Alternatives Considered**:
  - *Why explicit `AbortController` + `setTimeout` instead of bare `AbortSignal.timeout(providerTimeoutMs)`?* In Node 22 + Vitest, `AbortSignal.timeout()` uses a native timer that is not consistently controlled by `vi.useFakeTimers()` and does not distinguish whether an `AbortError`/`TimeoutError` came from the caller's `signal` or the per-provider timer when combined via `AbortSignal.any()`. An explicit `createAttemptSignal(signal, providerTimeoutMs)` tracks `didTimeout()` deterministically, works identically under real and fake timers, and guarantees zero listener leaks on `request.signal`.

### Decision 3: End-to-End `AbortSignal` Wiring in `resolveSmartChoice`, `handleChat`, and `handleSystemone`
- **Approach**:
  - In `src/sse/handlers/chat.js` (`:159` and `:254`), pass `signal: request?.signal` into `resolveSmartChoice`.
  - In `src/sse/services/systemoneRouter.js::resolveSmartChoice`, accept `signal` in options, create `const controller = new AbortController()`, link parent `signal` (`if (signal?.aborted) return null;` and `signal.addEventListener("abort", onParentAbort, { once: true })`), and arm `timeoutId = setTimeout(() => { timedOut = true; controller.abort(new Error(\`System One router timed out after ${timeoutMs}ms\`)); }, timeoutMs)`. Pass `signal: controller.signal` to `handleSystemoneCore`. If `timedOut` or `signal?.aborted` triggers before `handleSystemoneCore` resolves, `controller.abort(...)` immediately cancels `handleSystemoneCore`'s in-flight `fetch` and `resolveSmartChoice` logs `smart-router: evaluation aborted (...)` and returns `null`.
  - In `src/sse/handlers/systemone.js::handleSystemone`, pass `signal: request?.signal` to `handleSystemoneCore` in both the `noAuth` branch (`:94`) and the credentialed account loop (`:165`). In the credentialed loop, if `result.aborted || request?.signal?.aborted`, return `errorResponse(HTTP_STATUS.REQUEST_TIMEOUT, result.error || "System One request aborted")` immediately **before** `markAccountUnavailable` (`:211`) so client disconnects never mark a healthy provider account unavailable. Endpoint-level unit tests in `tests/unit/smart-router-noauth.test.js` directly invoke `handleSystemone(request)` for both `noAuth` (`ollaya/pplx-decider:flash-fp16`) and credentialed (`openrouter/typesafe/jev-1.13`) requests with an aborting `request.signal` to verify `fetch` cancellation, failover warning suppression, and `expect(authService.markAccountUnavailable).not.toHaveBeenCalled()`.

### Decision 4: Deep-Module `servedBy` Provenance & `usageHistory.meta` / `requestDetails.meta` Persistence
- **Approach**:
  - When `handleSystemoneCore` succeeds, include `servedBy` in the returned object:
    ```js
    servedBy: {
      provider,
      model,
      failover: Boolean(failoverFrom),
      ...(failoverFrom ? { failoverFrom } : {}),
    }
    ```
  - In both `src/sse/handlers/systemone.js` and `src/sse/services/systemoneRouter.js`:
    ```js
    const servedProvider = result.servedBy?.provider || provider;
    const servedModel = result.servedBy?.model || model;
    const didFailover = Boolean(result.servedBy?.failover);
    const effectiveConnectionId = didFailover ? undefined : refreshedCredentials?.connectionId;
    const meta = didFailover
      ? {
          servedBy: `${servedProvider}/${servedModel}`,
          failover: true,
          requestedProvider: result.servedBy?.failoverFrom?.provider || provider,
          requestedModel: result.servedBy?.failoverFrom?.model || model,
          failoverReason: result.servedBy?.failoverFrom?.reason || null,
        }
      : {
          servedBy: `${servedProvider}/${servedModel}`,
          failover: false,
        };
    ```
    Pass `provider: servedProvider`, `model: servedModel`, `connectionId: effectiveConnectionId`, and `meta` to both `saveRequestUsage` and `saveRequestDetail`.
  - In `src/lib/db/repos/usageRepo.js`:
    - Update `saveRequestUsage` (`:296`) to write `stringifyJson(entry.meta && typeof entry.meta === "object" && !Array.isArray(entry.meta) ? entry.meta : {})` instead of hardcoded `stringifyJson({})`.
    - Update `getUsageHistory` (`:336-342`) to select `meta` and return `meta: parseJson(r.meta, {})` on each history item.
  - In `src/lib/db/repos/requestDetailsRepo.js`:
    - Update `flushToDatabase` (`:105-119`) to include `meta: item.meta && typeof item.meta === "object" ? item.meta : undefined` in `record`.
    - Export `flushToDatabase` on `__test__` (`export const __test__ = { sanitizeHeaders, flushToDatabase }`) so unit tests deterministically verify SQLite persistence and retrieval via `saveRequestDetail` → `await __test__.flushToDatabase()` → `getRequestDetails`.
- **Rationale & Alternatives Considered**:
  - *Why record `servedProvider` / `servedModel` in the top-level `provider` and `model` columns of `usageHistory` and `requestDetails`, with `requestedProvider` / `requestedModel` in `meta`?* `usageRepo.js::aggregateEntryToDay` (`:84-99`) and `calculateCost(entry.provider, entry.model, entry.tokens)` (`:259`) key off `entry.provider` and `entry.model`. Recording the actual serving provider (`opencode-zen` / `jev-1.13-free`) ensures daily provider/model rollups and cost calculations reflect reality, while `meta` preserves full auditability of the original requested target (`ollaya/pplx-decider:flash-fp16`) and failover reason.

## Architecture Updates

```text
Caller (resolveSmartChoice 8,000ms OR handleSystemone request.signal)
  │
  │  passes signal: AbortSignal
  ▼
handleSystemoneCore({ body, modelInfo, credentials, log, onRequestSuccess, signal, failoverFrom })
  ├─ Primary Attempt (ollaya/laya): providerTimeoutMs = SYSTEMONE_FAILOVER[provider].timeoutMs (5,000ms)
  │    ├─ Caller signal aborts first ──► Abort fetch immediately, DO NOT failover, return { aborted: true }
  │    ├─ 5,000ms local timer / ECONNREFUSED / HTTP 500..504 (and !signal.aborted)
  │    │    └─► Log accurate reason ("timed out after 5000ms" vs "unreachable")
  │    │    └─► failover() -> handleSystemoneCore({ ..., modelInfo: opencode-zen/jev-1.13-free, signal, failoverFrom })
  │    └─ 200 OK ──► return { success: true, responseBody, usage, response, servedBy: { provider, model, failover: false } }
  │
  └─ Failover Attempt (opencode-zen/jev-1.13-free): bounded by remaining caller signal (3,000ms in Smart Router)
       ├─ Caller signal aborts ──► Abort cloud fetch immediately, return { aborted: true }
       └─ 200 OK ──► return {
                        success: true, responseBody, usage, response,
                        servedBy: {
                          provider: "opencode-zen", model: "jev-1.13-free",
                          failover: true,
                          failoverFrom: { provider: "ollaya", model: "pplx-decider:flash-fp16", reason }
                        }
                      }
  │
  ▼
Telemetry Persistence (saveRequestUsage + saveRequestDetail)
  └─ provider = servedBy.provider, model = servedBy.model, meta = { servedBy, failover, requestedProvider, requestedModel, failoverReason }
```

## Risks / Trade-offs

- **[Risk] Existing unit tests mocking `handleSystemoneCore` omit `servedBy` in mocked return values** → **[Mitigation]** Both `systemone.js` and `systemoneRouter.js` fall back via `result.servedBy?.provider || provider` and `result.servedBy?.model || model`, preserving 100% compatibility with existing unit test mocks.
- **[Risk] Existing unit tests assert `expect.stringContaining("Failing over to opencode-zen")` on failover warnings** → **[Mitigation]** Both timeout and unreachable warning messages preserve the exact suffix `. Failing over to ${next.provider}/${next.model}` (`tests/unit/laya-systemone-provider.test.js:65`, `tests/unit/ollaya-systemone-provider.test.js:107`, `tests/unit/verify-laya-provider.mjs:108`).
- **[Risk] Modifying primary checkout `O:/workspaces/oss/9router` during active operations** → **[Mitigation]** Perform all edits and test runs inside isolated git worktree `O:/workspaces/.worktrees/wt-9router-systemone-abort`, fast-forwarding `origin/master` and `O:/workspaces/oss/9router` only after all gates pass.

## Migration Plan

1. Create isolated worktree `O:/workspaces/.worktrees/wt-9router-systemone-abort` from `dfd81d65afc3f59888a02c1b4c80a303f13de2dc` (`master`).
2. Implement config, handler, router, and repository updates along with unit and baseline verification tests inside the worktree.
3. Run full offline verification gate (`Vitest` suites, `verify-alias.mjs`, `verify-oauth-urls.mjs`, `verify-providers.mjs`, `verify-laya-provider.mjs`, `test-systemone-usage-logic.mjs`).
4. Commit with Conventional Commit message, push to `origin/master`, fast-forward `O:/workspaces/oss/9router`, and clean up the worktree.
5. Run `"C:/Program Files/PowerShell/7/pwsh.exe" -NoProfile -File "O:/workspaces/_config/agent4070/hermes/services/apply-live-9router-cutover.ps1" -DeployNuc` to back up NUC SQLite (`backup.sh`), fast-forward `/home/ubuntu/workspaces/oss/9router` on Intel NUC (`192.168.100.110`) to the new `HEAD` (which includes `dfd81d65afc3f59888a02c1b4c80a303f13de2dc`), update `ROUTER_VCS_REF`, rebuild and recreate container `9router`, and verify live health, container revision label, logs, and telemetry.
6. **Rollback**: Restore `/home/ubuntu/workspaces/docker-compose/9router/.env` `ROUTER_VCS_REF` to the previous SHA (`dfd81d65afc3f59888a02c1b4c80a303f13de2dc` or `7f9d84388d9e5fec903e0414d8183e13114edb59`) and run `docker compose build 9router && docker compose up -d --no-deps 9router` on `intel_nuc`.
