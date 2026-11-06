# Round 1 Independent Two-Axis Proposal Review

- **Change**: `fix-systemone-abort-and-telemetry`
- **Review scope**: proposal artifacts only; application source and tests were read-only.
- **Pinned checkout**: `dfd81d65afc3f59888a02c1b4c80a303f13de2dc`
- **Verdict**: **REJECTED**
- **Blocking IDs**: **B-01, B-02, B-03, B-04**

## Review method and independence

`hermes --profile reviewer status` completed with exit `0` and reported **Model: `cb-agent-reviewer`; Provider: `ai-router`**. This is independent of the exploration's cited `cb-gemini-argon` Pass A source.

The required two-axis review was conducted separately:

1. **Axis 1 — Standards / coherence / operations**: configuration convention, zero-hardcode rule, task proof quality, worktree/deployment discipline, and Fowler-smell risk.
2. **Axis 2 — Spec fidelity**: the canonical exploration's D-1 through D-4 findings against proposal, design, delta specs, and tasks.

The prescribed `delegate_task` facility was not available in this runtime's tool set, so no delegation was fabricated. The two axes and their findings remain isolated below.

## Deterministic evidence

| Check | Command / evidence | Result |
|---|---|---|
| Reviewer runtime | `hermes --profile reviewer status` | PASS, exit `0`: `cb-agent-reviewer` / `ai-router` |
| OpenSpec planning status | `C:/nvm4w/nodejs/openspec.EXE status --change fix-systemone-abort-and-telemetry --json` | PASS, exit `0`; schema `spec-driven`; proposal/specs/design/tasks all `done`; `isPlanningComplete: true` |
| Strict validation | `C:/nvm4w/nodejs/openspec.EXE validate fix-systemone-abort-and-telemetry --strict --type change` | PASS, exit `0`: `Change 'fix-systemone-abort-and-telemetry' is valid` |
| Exploration byte identity | `sha256sum` of canonical and packaged exploration | PASS, exit `0`; both are `7e0aeb7f51efeb2856209f459ba06b8343d403a2828c2e4ad75339fc01b83ea2` |
| Pinned HEAD | `git rev-parse HEAD` | PASS; exactly `dfd81d65afc3f59888a02c1b4c80a303f13de2dc` |
| Ancestor guard | `git merge-base --is-ancestor dfd81d65afc3f59888a02c1b4c80a303f13de2dc HEAD` | PASS, exit `0` |
| Protected checkout cleanliness | `git diff --exit-code; git diff --cached --exit-code` | **FAIL**: unstaged exit `1`; staged exit `0` |
| Baseline unit/invariant subset | `cd tests && npx vitest run unit/laya-systemone-provider.test.js unit/ollaya-systemone-provider.test.js unit/combo-smart-router.test.js unit/smart-router-noauth.test.js < /dev/null && cd .. && node tests/__baseline__/verify-alias.mjs && node tests/__baseline__/verify-oauth-urls.mjs && node tests/__baseline__/verify-providers.mjs && node tests/unit/verify-laya-provider.mjs && node tests/unit/test-systemone-usage-logic.mjs` | PASS, exit `0`; Vitest: 4 files / 49 tests; all five scripts passed |

The cleanliness failure predates this review report: `git status --short` showed modified `openspec/workspace/sessions/agent_share.md` and the new change/exploration artifacts as untracked. The exact `git diff` is the Leader's proposal entry in `agent_share.md` at lines 122–126. The primary checkout therefore does **not** satisfy the requested clean-checkout gate.

## Axis 1 — Standards, coherence, Fowler smells, and operational guardrails

### Blocking findings

- **[BLOCKER B-01] Protected checkout is not clean.**
  - **Evidence**: `git diff --exit-code` returned exit `1`; `git status --short` reported `M openspec/workspace/sessions/agent_share.md`, plus the proposal directory and canonical exploration as untracked. HEAD is correctly pinned, but the requested combined cleanliness condition is false.
  - **Risk**: later application-work isolation and test evidence cannot distinguish this proposal-review work from pre-existing primary-checkout changes.
  - **Required correction**: establish/record a clean protected-checkout baseline before implementation starts. Keep proposal artifacts and future source changes in the declared dedicated worktree; do not represent the present primary checkout as clean.

- **[BLOCKER B-04] D-4 deployment acceptance is not runnable or self-verifying.**
  - **Locations**: `tasks.md:20`; `apply-live-9router-cutover.ps1:128-165`.
  - **Evidence**: Task 3.3 requires live `POST /v1/systemone`, Smart Combo `cb-nous-free`, a matching container revision, `RestartCount == 0`, and zero `[AUTH] No credentials for ollaya` logs. It supplies neither reproducible POST commands/payloads nor assertions for these conditions. The supplied PowerShell script only probes `/v1/models` after recreate; it does not inspect the revision label or restart count, execute either required POST, or search logs for zero forbidden warnings.
  - **Risk**: the task can be checked after a healthy model catalog despite failing the capability being deployed, serving requests, or suppressing the known auth warning.
  - **Required correction**: add executable, exit-status-bearing proof commands with safe fixtures for both POST paths; compare NUC checkout SHA and container revision label to the intended merged SHA; assert `.RestartCount -eq 0`; and use an inverse log assertion (for example `! docker logs --since 2m 9router | grep -Fq '[AUTH] No credentials for ollaya'`). Define expected HTTP body/route markers and redact credentials.

### Standards pass observations

- The proposal/design preserve `open-sse/AGENTS.md:24` configuration-driven requirements: provider/model literals are directed to `open-sse/config/systemoneConfig.js`, not `systemoneCore.js`. This matches the existing literal guard in `tests/unit/ollaya-systemone-provider.test.js:59-67`.
- The design selects one composite cancellation seam and explicitly describes timer/listener cleanup (`design.md:41-54`), avoiding duplicated timeout policy across router and core. No unmitigated Fowler duplicated-code, speculative-generality, or message-chain finding is present in the proposal.
- Worktree implementation intent is coherent: `tasks.md:5` makes the designated worktree and pinned base explicit; source/test edits are scoped there. The later production fast-forward/cutover is operationally separate, but it must not be claimed as clean while B-01 remains true.
- `tasks.md:8`, `:14`, and `:18` provide runnable local test commands and baseline gates. The weak point is the production proof described in B-04, not the local command syntax.

## Axis 2 — Fidelity to the canonical Exploration (D-1 through D-4)

### D-1 — AbortSignal propagation and zombie failover suppression

**Partially specified; rejected for an unproven direct-endpoint acceptance path.**

The intended behavior is faithfully described in `design.md:41-60` and the `systemone-dispatch` delta (`specs/systemone-dispatch/spec.md:21-36`): caller abort precedes failover, is propagated across recursive failover hops, and bypasses `markAccountUnavailable`.

- **[BLOCKER B-02] The tasks omit executable coverage for direct `/v1/systemone` client-abort behavior and account-health suppression.**
  - **Exploration requirement**: D-1 says `handleSystemone` must forward `request.signal` on both noAuth and credentialed paths and avoid a false `markAccountUnavailable` penalty (`exploration.md:23-27,72-79`).
  - **Delta requirement**: the credentialed HTTP-disconnect scenario is normative (`systemone-dispatch/spec.md:34-36`).
  - **Gap**: `tasks.md:8` tests core cancellation; `tasks.md:14` tests a Smart Router timeout and telemetry. Neither mandates a test that invokes `handleSystemone(request)` with an aborted request signal on the credentialed route, proves the passed core signal aborts fetch, proves `markAccountUnavailable` was not called, and proves no `Failing over to` warning was emitted.
  - **Required correction**: add an endpoint-handler test (or an existing endpoint-handler suite) covering both noAuth and credentialed requests, with an abort-aware fetch mock and spies for `markAccountUnavailable` and logger warning. Make it part of an explicit exit-0 proof command.

### D-2 — 5,000ms local timeout and timeout-vs-unreachable diagnostics

**Substantively faithful, with an advisory test-coverage gap.**

The proposal/design/delta consistently specify `SYSTEMONE_LOCAL_TIMEOUT_MS = 5000`, per-local-provider configuration, retained cloud `FETCH_CONNECT_TIMEOUT_MS`, and distinct timeout/unreachable warning text (`proposal.md:17-20`; `design.md:27-54`; `systemone-dispatch/spec.md:9-19,38-47`). Task 1.4 mandates local-timeout, connection-failure, active-caller, and warning assertions.

**Advisory A-01**: task 1.2 requires only default `5000` assertions. Because the change promises a *positive-integer environment override*, add valid and invalid environment-override tests so malformed values cannot silently collapse the local failover budget.

### D-3 — `servedBy` provenance and `usageHistory.meta` / `requestDetails` persistence

**Partially specified; rejected because request-detail persistence lacks a persistence proof.**

The return contract and top-level provider/model attribution agree with the exploration (`exploration.md:62-79`), proposal (`proposal.md:21-24`), design (`design.md:62-99`), and deltas. The proposed `servedProvider` fallback also maintains compatibility for existing mocks.

- **[BLOCKER B-03] No task proves that `requestDetails.meta` is actually persisted and later retrievable.**
  - **Exploration requirement**: D-3 explicitly requires `requestDetailsRepo.js` to retain `item.meta` on persisted detail records (`exploration.md:35-38,72-79`).
  - **Task gap**: `tasks.md:13` says to update `requestDetailsRepo.js`, but its only persistence round-trip in `tasks.md:14` is `saveRequestUsage` / `getUsageHistory` for SQLite. The same task only checks that the `saveRequestDetail` caller receives an object; a mock/spied call cannot prove `flushToDatabase()` includes `meta` in `requestDetails.data`.
  - **Required correction**: add a deterministic repository-level test that enables observability, saves a detail with failover `meta`, flushes it, reads through `getRequestDetails`, and asserts the exact metadata. Add it to Task 2.3's exit-0 command. Retain the existing `usageHistory.meta` round trip.

### D-4 — Intel NUC cutover including `dfd81d65`

**Base ancestry and intended cutover are specified, but the production proof is blocked by B-04.**

- Current checkout equality to `dfd81d65afc3f59888a02c1b4c80a303f13de2dc` and `merge-base --is-ancestor` both passed.
- `proposal.md:25-26`, `design.md:138-145`, and `tasks.md:18-20` correctly require a merged descendant containing `dfd81d65`, a backup, rebuild/recreate, and post-cutover checks.
- The actual cutover script updates `ROUTER_VCS_REF` from the NUC checkout then rebuilds/recreates (`apply-live-9router-cutover.ps1:137-165`), but proves only `/v1/models`. Therefore D-4's stated response, log, revision, and restart invariants remain untestable from the current tasks as written.

## Required rework before Round 2

1. **B-01**: record a clean protected-checkout baseline and maintain worktree isolation.
2. **B-02**: make direct `handleSystemone` cancellation/health-penalty behavior executable and mandatory in the task proof.
3. **B-03**: make `requestDetails.meta` persistence/retrieval executable and mandatory in the task proof.
4. **B-04**: replace narrative production assertions with deterministic, safe, exit-status-bearing NUC post-cutover commands for revisions, restart count, both required POSTs, and zero auth-warning logs.
5. Address advisory A-01 by testing valid and invalid `SYSTEMONE_LOCAL_TIMEOUT_MS` overrides.

## Reproduction commands

```bash
cd O:/workspaces/oss/9router
C:/nvm4w/nodejs/openspec.EXE status --change fix-systemone-abort-and-telemetry --json
C:/nvm4w/nodejs/openspec.EXE validate fix-systemone-abort-and-telemetry --strict --type change
sha256sum openspec/workspace/explorations/2026-11-05-9router-systemone-abort-timeout-telemetry-exploration.md openspec/changes/fix-systemone-abort-and-telemetry/explorations/2026-11-05-9router-systemone-abort-timeout-telemetry-exploration.md
git rev-parse HEAD
git diff --exit-code
git diff --cached --exit-code
cd tests && npx vitest run unit/laya-systemone-provider.test.js unit/ollaya-systemone-provider.test.js unit/combo-smart-router.test.js unit/smart-router-noauth.test.js < /dev/null
cd .. && node tests/__baseline__/verify-alias.mjs && node tests/__baseline__/verify-oauth-urls.mjs && node tests/__baseline__/verify-providers.mjs && node tests/unit/verify-laya-provider.mjs && node tests/unit/test-systemone-usage-logic.mjs
```
