# Proposal: Fix System One AbortSignal Cancellation, 5,000ms Local Timeout, Failover Provenance Telemetry & Intel NUC Cutover

## Why

During concurrent Hermes + Nerve load on `2026-11-05`, Intel NUC `9router` (`192.168.100.110:20128`) emitted `34` delayed `[SYSTEMONE] Local Ollaya unreachable ... (The operation was aborted due to timeout). Failing over to opencode-zen/jev-1.13-free` warnings 60 seconds after requests began. Dual-model empirical forensics (`openspec/workspace/explorations/2026-11-05-9router-systemone-abort-timeout-telemetry-exploration.md`) proved four interlocking defects in `9router`:
1. `resolveSmartChoice` (`src/sse/services/systemoneRouter.js:87-106`) aborts its `Promise.race` at `8,000ms` without passing an `AbortSignal` to `handleSystemoneCore` (`open-sse/handlers/systemoneCore.js:100-115`), and `handleSystemone` (`src/sse/handlers/systemone.js:94,165`) does not forward `request.signal` — leaking orphaned background fetches that stay open for `FETCH_CONNECT_TIMEOUT_MS = 60,000ms` and fire wasted zombie failovers to `opencode-zen/jev-1.13-free` 50–52 seconds after caller abandonment.
2. Local LAN System One providers (`ollaya` and `laya`) inherit `FETCH_CONNECT_TIMEOUT_MS = 60,000ms`, which exceeds `resolveSmartChoice`'s `8,000ms` ceiling and `OpenJevClient`'s `10,000ms` timeout, preventing live 1-hop failover from ever completing within the caller's budget.
3. When `handleSystemoneCore` fails over from a local provider (`ollaya`/`laya`) to `opencode-zen/jev-1.13-free`, it does not return `servedBy` provenance, causing `handleSystemone` and `resolveSmartChoice` to mislabel cloud failover responses in `usageHistory`, `usageDaily`, and `requestDetails` under the failed primary provider (`provider: "ollaya"`, `status: "success"`), while `usageRepo.js:296` discards `entry.meta` as `{}`.
4. Intel NUC `9router` (`ROUTER_VCS_REF=7f9d84388d9e5fec903e0414d8183e13114edb59`) has not yet been deployed with commit `dfd81d65afc3f59888a02c1b4c80a303f13de2dc` (`fix(smart-router): skip credential lookup for noAuth router providers`), producing false `⚠️ [AUTH] No credentials for ollaya` warnings.

## What Changes

- **Propagate `AbortSignal` and Suppress Zombie Failover on Caller Cancellation**:
  - Update `handleSystemoneCore` (`open-sse/handlers/systemoneCore.js`) to accept `signal` and `failoverFrom`, compose a per-attempt abort signal from the caller's `signal` and the provider's timeout, and immediately abort without invoking `failover()` or logging `"Failing over"` whenever `signal?.aborted` is `true` (before `fetch`, on `fetch` rejection, on status failover, or during recursive failover hops).
  - Update `resolveSmartChoice` (`src/sse/services/systemoneRouter.js`) to accept optional `signal` (forwarded from `src/sse/handlers/chat.js:159,254`), manage an `AbortController` that aborts when either the parent `signal` aborts or `timeoutMs` (`8,000ms` default) expires, pass `signal: controller.signal` into `handleSystemoneCore`, and clean up timers and listeners in `finally`.
  - Update `handleSystemone` (`src/sse/handlers/systemone.js:94,165`) to forward `signal: request?.signal` into `handleSystemoneCore` across both `noAuth` and credentialed branches, and skip `markAccountUnavailable` when a request was aborted by the client (`result.aborted || request?.signal?.aborted`).
- **Dedicated `5,000ms` Local System One Timeout (`SYSTEMONE_LOCAL_TIMEOUT_MS`) & Accurate Diagnostic Logging**:
  - Export `resolveSystemoneLocalTimeoutMs(raw = process.env.SYSTEMONE_LOCAL_TIMEOUT_MS, def = 5000)` and `SYSTEMONE_LOCAL_TIMEOUT_MS = resolveSystemoneLocalTimeoutMs()` in `open-sse/config/systemoneConfig.js` and attach `timeoutMs: SYSTEMONE_LOCAL_TIMEOUT_MS` to `SYSTEMONE_FAILOVER.ollaya` and `SYSTEMONE_FAILOVER.laya`, keeping `open-sse/handlers/systemoneCore.js` free of provider/model literals (`open-sse/AGENTS.md`).
  - Resolve `providerTimeoutMs = SYSTEMONE_FAILOVER[provider]?.timeoutMs ?? FETCH_CONNECT_TIMEOUT_MS` inside `handleSystemoneCore` so local `ollaya`/`laya` attempts time out at `5,000ms` — leaving `3,000ms` inside `resolveSmartChoice`'s `8,000ms` budget and `5,000ms` inside `OpenJevClient`'s `10,000ms` budget for live `opencode-zen/jev-1.13-free` failover.
  - Distinguish local timeout errors (`Local ${label} timed out after ${providerTimeoutMs}ms at ${targetUrl}. Failing over to ${next.provider}/${next.model}`) from connection errors (`Local ${label} unreachable at ${targetUrl} (${error.message}). Failing over to ${next.provider}/${next.model}`).
- **Persist Accurate `servedBy` Provenance in `usageHistory`, `usageDaily`, and `requestDetails`**:
  - Return `servedBy: { provider, model, failover: Boolean(failoverFrom), ...(failoverFrom ? { failoverFrom } : {}) }` from `handleSystemoneCore`.
  - Update `src/sse/handlers/systemone.js` and `src/sse/services/systemoneRouter.js` to persist `provider: servedProvider`, `model: servedModel`, `connectionId: didFailover ? undefined : credentials?.connectionId`, and `meta` (`{ servedBy: "${servedProvider}/${servedModel}", failover: false }` on direct hit, or `{ servedBy: "${servedProvider}/${servedModel}", failover: true, requestedProvider: provider, requestedModel: model, failoverReason: result.servedBy.failoverFrom?.reason }` on failover) in `saveRequestUsage` and `saveRequestDetail`.
  - Update `src/lib/db/repos/usageRepo.js` (`saveRequestUsage` and `getUsageHistory`) to persist and return `entry.meta` in `usageHistory.meta` (defaulting to `{}`), and update `src/lib/db/repos/requestDetailsRepo.js` to retain `meta` on persisted detail records and expose `flushToDatabase` via `__test__` (`export const __test__ = { sanitizeHeaders, flushToDatabase }`) for deterministic SQLite round-trip testing (`saveRequestDetail` → `__test__.flushToDatabase()` → `getRequestDetails`).
- **Isolated Worktree Verification & Intel NUC Deployment (`dfd81d65` + New Commit)**:
  - Keep protected primary checkout `O:/workspaces/oss/9router` 100% clean (`git status --porcelain` empty) while staging all proposal, code, and test work in isolated worktree `O:/workspaces/.worktrees/wt-9router-systemone-abort` branched from `dfd81d65afc3f59888a02c1b4c80a303f13de2dc`, pass all Vitest and `9ROUTER-INV-1..7` baseline gates, fast-forward `origin/master`, and execute `O:/workspaces/_config/agent4070/hermes/services/apply-live-9router-cutover.ps1 -DeployNuc` followed by exit-status-bearing SSH and HTTP POST assertions (`LOCAL_SHA == NUC_SHA == LABEL_SHA`, `RestartCount == 0`, live `POST /v1/systemone` + `POST /v1/chat/completions` `cb-nous-free` returning HTTP 200, and zero `[AUTH] No credentials for ollaya` warnings in container logs).

## Capabilities

### New Capabilities
- `systemone-dispatch`: Core System One upstream request dispatch, configurable `5,000ms` local provider timeout (`SYSTEMONE_LOCAL_TIMEOUT_MS`), caller `AbortSignal` propagation and failover suppression on caller cancellation, timeout-vs-unreachable diagnostics, and `servedBy` provenance reporting.

### Modified Capabilities
- `smart-router`: Propagate caller and evaluation-timeout `AbortSignal` from `resolveSmartChoice` into `handleSystemoneCore` so timed-out or disconnected Smart Router evaluations cancel in-flight upstream requests without triggering zombie cloud failovers, and record `servedBy` provider/model provenance in `/internal/smart-router` telemetry.
- `systemone-usage-logs`: Record actual `servedBy` provider and model (instead of the failed primary provider) in `usageHistory`, `usageDaily`, and `requestDetails` when System One fails over, and persist `entry.meta` in `usageHistory.meta`.

## Impact

- **Code (`O:/workspaces/oss/9router`)**:
  - `open-sse/config/systemoneConfig.js`
  - `open-sse/handlers/systemoneCore.js`
  - `src/sse/services/systemoneRouter.js`
  - `src/sse/handlers/chat.js`
  - `src/sse/handlers/systemone.js`
  - `src/lib/db/repos/usageRepo.js`
  - `src/lib/db/repos/requestDetailsRepo.js`
- **Tests (`O:/workspaces/oss/9router/tests`)**:
  - `tests/unit/ollaya-systemone-provider.test.js`
  - `tests/unit/laya-systemone-provider.test.js`
  - `tests/unit/smart-router-noauth.test.js`
  - `tests/unit/verify-laya-provider.mjs`
  - `tests/unit/test-systemone-usage-logic.mjs`
- **Production Infrastructure (`Intel NUC 192.168.100.110:20128`)**:
  - Deployed via `O:/workspaces/_config/agent4070/hermes/services/apply-live-9router-cutover.ps1 -DeployNuc` with pre-deployment SQLite backup (`backup.sh`), fast-forwarding `/home/ubuntu/workspaces/oss/9router` from `7f9d84388d9e5fec903e0414d8183e13114edb59` to the new `origin/master` `HEAD` (descendant of `dfd81d65afc3f59888a02c1b4c80a303f13de2dc`).
- **Out of Scope**:
  - `O:/workspaces/oss/hermes-nerve` (`_assessment_state` truncation and `OpenJevClient` circuit breaker — tracked as a separate slice).
  - `O:/workspaces/docker-compose/ollaya` (`AGENT-4070` container runtime configuration).
  - `O:/workspaces/oss/hermes-agent` (`@url:` composer linkification).
