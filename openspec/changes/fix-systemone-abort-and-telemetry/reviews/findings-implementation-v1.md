# Round 1 Independent Two-Axis Implementation & Cutover Review

- **Change**: `fix-systemone-abort-and-telemetry`
- **Reviewed range**: `dfd81d65afc3f59888a02c1b4c80a303f13de2dc..20caa5be24a5f81439bf54d184abf29ca08b2e7c`
- **Implementation commit**: `ff1162ef43f30db6cca4287edc26003d124f1090`
- **Review commit / deployed revision**: `20caa5be24a5f81439bf54d184abf29ca08b2e7c`
- **Reviewer runtime**: `cb-agent-reviewer` via `ai-router` (`hermes --profile reviewer status`, exit `0`)
- **Review mode**: Round 1 cold diff, isolated Standards and Spec-fidelity axes, independent offline suite, and live Intel NUC re-verification.

## Verdict

**APPROVED**

- **Blocking IDs**: None.
- **Axis 1 — Standards / code quality / Fowler smells**: PASS; no Critical, Warning, or Info findings.
- **Axis 2 — OpenSpec fidelity**: PASS; all seven delta requirements and their fourteen scenarios are implemented and independently exercised.
- **Cutover**: PASS at `20caa5be24a5f81439bf54d184abf29ca08b2e7c`; the Intel NUC source revision and container revision label equal local `HEAD`, required ancestor is present, restart count is zero, both required live POST probes succeeded, and the ollaya credential-warning gate passed.

This approval is for implementation and cutover verification only. It does not archive the change or synchronize its delta specifications into canonical `openspec/specs/`.

## Scope and Integrity Evidence

| Gate | Independent evidence | Result |
|---|---|---|
| Reviewer independence | `hermes --profile reviewer status` reported `Model: cb-agent-reviewer`, `Provider: ai-router`; exit `0`. | PASS |
| Protected checkout identity and cleanliness | `test -z "$(git -C 'O:/workspaces/oss/9router' status --porcelain)"`, `git diff --exit-code`, ancestor check, and `git diff --check dfd81d65..HEAD` all exited `0`. `PRIMARY_HEAD=20caa5be24a5f81439bf54d184abf29ca08b2e7c`; `BASE=dfd81d65afc3f59888a02c1b4c80a303f13de2dc`. Rechecked after tests: `PRIMARY_STILL_CLEAN`. | PASS |
| Review worktree hygiene | `git -C O:/workspaces/.worktrees/wt-9router-review-impl diff --check dfd81d65..20caa5be` plus worktree and primary status checks emitted `DIFF_AND_STATUSES_OK`. | PASS |
| Implemented scope | Commit range contains exactly implementation/test changes plus change artifacts and handoff metadata. No unrelated production source modules were changed. | PASS |
| OpenSpec status | `openspec instructions apply --change ... --json` reported `total: 10`, `complete: 10`, `remaining: 0`, state `all_done`. | PASS |
| Strict OpenSpec validation | `openspec validate fix-systemone-abort-and-telemetry --strict --type change` returned `Change 'fix-systemone-abort-and-telemetry' is valid` (exit `0`). | PASS |
| Exploration parity | Canonical and packaged exploration files both SHA-256 to `90a8111161b0c897d6a9986c4f56cfb8a9877839ea034ce6091b7444633b175b`. | PASS |

## Deterministic Verification Evidence

### Offline 9ROUTER-INV-1..7 gate

Executed from the protected primary checkout exactly as requested:

```bash
cd "O:/workspaces/oss/9router/tests" && npx vitest run \
  unit/nous-dynamic-models.test.js unit/nous-oauth-provider.test.js \
  unit/nous-refresh-and-example.test.js unit/nous-suggested-models-route.test.js \
  unit/antigravity-semantic-identity.test.js unit/antigravity-semantic-identity-executor.test.js \
  unit/antigravity-semantic-identity-policy.test.js unit/cursor-client-version.test.js \
  unit/dashboard-guard.test.js unit/edgeTts.test.js unit/trusted-api-peer.test.js \
  unit/antigravity-claude-5-5.test.js unit/antigravity-quota-routing.test.js \
  unit/claude-opus-5-5.test.js unit/laya-systemone-provider.test.js \
  unit/ollaya-systemone-provider.test.js unit/combo-smart-router.test.js \
  unit/smart-router-noauth.test.js < /dev/null && \
cd "O:/workspaces/oss/9router" && \
node tests/__baseline__/verify-alias.mjs && \
node tests/__baseline__/verify-oauth-urls.mjs && \
node tests/__baseline__/verify-providers.mjs && \
node tests/unit/verify-laya-provider.mjs && \
node tests/unit/test-systemone-usage-logic.mjs
```

Actual result: exit `0`; Vitest reported **18 files passed / 177 tests passed** in `10.54s`. The baseline scripts reported alias resolution `132` tokens byte-for-byte equal, OAuth URLs byte-for-byte equal, and `101` providers byte-for-byte equal. The two Node checks independently reported:

- Laya failover `servedBy` provenance and caller-abort zombie-failover suppression passed.
- SQLite persistence/retrieval round trip for both `usageHistory.meta` and `requestDetails.meta` passed.

The Node runtime emitted existing `MODULE_TYPELESS_PACKAGE_JSON` performance warnings only; no assertion or test failed.

### Live Intel NUC cutover gate

Independent live checks against `192.168.100.110:20128` produced:

```text
NUC_SHA=20caa5be24a5f81439bf54d184abf29ca08b2e7c
LABEL_SHA=20caa5be24a5f81439bf54d184abf29ca08b2e7c
RESTARTS=0
E2E_POST_PROBES_OK choice= b chat_model= stealth/crouton-alpha content= Pong
OLLAYA_NO_CREDENTIAL_WARNINGS=0
```

The revision command also required `git merge-base --is-ancestor dfd81d65... "$NUC_SHA"` and therefore independently proves the required ancestor is deployed. The POST probes asserted HTTP `200`, a valid `systemone` choice, and non-empty chat content. Credentials were read from the local protected environment and were not printed.

A convenience compound shell invocation printed the successful revision and POST results but exited `2` afterward because of a trailing local shell quoting error. No result is claimed from that aggregate exit code. The zero-warning check was immediately rerun as its own remote command and returned exit `0` with `OLLAYA_NO_CREDENTIAL_WARNINGS=0`; the revision and POST checks had already completed successfully before the local quoting failure.

## Axis 1 — Standards, Code Quality, Security, and Fowler Smells

### Findings

**No blocking or advisory findings.**

| Review area | Evidence and assessment |
|---|---|
| Config-driven boundary / zero hardcode | `open-sse/config/systemoneConfig.js:6-45` owns local timeout parsing and both local failover entries. `open-sse/handlers/systemoneCore.js:152-154` resolves `SYSTEMONE_FAILOVER[provider]?.timeoutMs ?? FETCH_CONNECT_TIMEOUT_MS`. A literal scan of the core handler returned `ZERO_HARDCODE_LITERALS_OK` for the prohibited provider/model/credential literals specified by `open-sse/AGENTS.md`. |
| Timeout and cancellation module quality | `systemoneCore.js:8-47` encapsulates composite signal lifecycle in `createAttemptSignal`, clears its timer, and detaches the caller listener. `:130-136`, `:164-189`, and `:198-215` cover pre-fetch, rejected-fetch, and HTTP-status paths before failover. The helper reduces rather than duplicates timeout mechanics. |
| Failover behavior | `systemoneCore.js:51-62` centralizes configured next-hop construction and propagates `signal` plus original `failoverFrom`. `:176-179` differentiates timeout from network failure while preserving the configured failover suffix. |
| Router lifecycle | `systemoneRouter.js:95-145` creates a request-bounded controller, forwards it into the core, clears its timer, and removes the parent listener in `finally`. `chat.js:159-165` and `:255-261` wire `request.signal` for both top-level and nested combo paths. |
| Telemetry cohesion | `systemone.js:19-79` factors direct and credentialed endpoint persistence into one helper. `systemoneRouter.js:173-211` maps actual serving provider/model, removes stale connection attribution on failover, and records audit metadata. This avoids divergent duplicate persistence logic across the direct endpoint branches. |
| Persistence and data safety | `usageRepo.js:290-301, 340-346` only accepts object (not array) metadata, serializes it, and parses it with `{}` fallback. `requestDetailsRepo.js:61-71` continues to redact sensitive request headers before writing details; `:105-124` persists only object metadata. No new secrets, API keys, or unredacted credentials are added to tracked source or report output. |
| Test quality | Added tests cover parser valid/invalid inputs, direct and failover provenance, timeout vs unreachable diagnostics, cancellation during local and cloud hops, direct noAuth and credentialed `408` paths, account-health suppression, Smart Router timeout cleanup, telemetry attribution, and actual SQLite round trips. The independent 18-file suite passed. |
| Fowler smell baseline | No introduced Mysterious Name, Duplicated Code, Feature Envy, Data Clump, Primitive Obsession, Repeated Switch, Shotgun Surgery, Divergent Change, Speculative Generality, Message Chain, Middle Man, or Refused Bequest was found. The three local helpers have single responsibilities and the changed seams are appropriate request-dispatch, endpoint, and persistence boundaries. |

### Security notes

- The implementation retains header redaction (`requestDetailsRepo.js:61-69`) before persisting request details.
- The reviewed live probe used a key from the protected local environment only; output is redacted and no key was committed.
- The only fallback credential token remains the existing configuration-owned noAuth stub in `systemoneConfig.js`, not a newly embedded secret. This is consistent with the provider configuration model and is rejected from `systemoneCore.js` by the literal guard.

## Axis 2 — OpenSpec Fidelity

### `systemone-dispatch`

| Requirement / scenario group | Verified implementation and evidence | Result |
|---|---|---|
| Dedicated 5,000ms local timeout; cloud remains 60,000ms; parser overrides | `systemoneConfig.js:6-21, 32-44` exports `resolveSystemoneLocalTimeoutMs` and applies the parsed default to both local entries. `systemoneCore.js:152-154` selects configured local or standard cloud timeout. Focused tests exercise `3500`, empty, zero, negative, non-numeric, undefined values, the 5,000ms local timeout, and a 60,000ms cloud bound. | PASS |
| Caller cancellation and zombie-failover suppression | `systemoneCore.js:130-136, 164-174, 198-204` returns aborted `408` results without failover; recursive calls retain the same signal. `systemone.js:163-165, 226-228` maps abort to HTTP `408`; the credentialed path performs this before `markAccountUnavailable` at `:244`. Tests cover local and active cloud-failover abort plus both endpoint modes. | PASS |
| Timeout vs unreachable diagnostics | `systemoneCore.js:176-179` produces `timed out after <ms> at <url>` only for internal timeout and otherwise `unreachable at <url> (<error>)`. The suite asserts the exact configured 5,000ms warning and the preserved failover suffix. | PASS |
| Core `servedBy` provenance | `systemoneCore.js:243-248` returns actual provider/model, boolean failover, and original failure context. Direct and failover assertions passed. | PASS |

### `smart-router`

| Requirement / scenario group | Verified implementation and evidence | Result |
|---|---|---|
| Actual-serving telemetry attribution | `systemoneRouter.js:173-211` uses `result.servedBy`, suppresses original connection ID on failover, and persists `servedBy`, `failover`, requested target, and reason to both repositories. Tests cover direct and Ollaya-to-Zen evaluation. | PASS |
| Router timeout / parent-disconnect cancellation | `systemoneRouter.js:95-152` binds a controller to parent signal and evaluation timeout, passes it to the core, and returns `null` on cancellation. `chat.js:159-165, 255-261` supplies the incoming request signal. The short-timeout test proves the captured fetch signal is aborted and no zombie failover is called. | PASS |
| Live failover budget behavior | The 5,000ms local bounded configuration leaves the specified 3,000ms Smart Router headroom. Direct unit coverage verifies the configured local timeout and cloud hop propagation; the independently successful `cb-nous-free` live Smart Combo probe verifies the assembled route is operational. | PASS |

### `systemone-usage-logs`

| Requirement / scenario group | Verified implementation and evidence | Result |
|---|---|---|
| Direct local usage/detail logging | `systemone.js:55-78, 166-177` persists normalized tokens, success status, and direct `servedBy` metadata for noAuth providers. | PASS |
| Failover actual provider/model attribution | `systemone.js:38-53` and `systemoneRouter.js:173-188` place the actual Zen provider/model in top-level persistence fields and retain original requested target/reason in metadata. Tests assert both `saveRequestUsage` and `saveRequestDetail` arguments. | PASS |
| `usageHistory.meta` and `requestDetails.meta` round trip | `usageRepo.js:290-301, 340-346` serializes and returns metadata. `requestDetailsRepo.js:71, 88-142, 184-193` exposes deterministic test flushing and returns stored JSON detail records. Both the Vitest and standalone Node SQLite round trips passed. | PASS |

## Review Limitations and Non-Findings

- The review used direct code and runtime evidence. The requested `delegate_task` facility was not exposed in this reviewer runtime after capability discovery, so the two axes were executed as separate reviewer passes rather than through unavailable delegated agents. This does not weaken any listed command evidence.
- The old `docs/ARCHITECTURE.md` is known stale regarding the SQLite layer, while `CLAUDE.md:76-80` records the current SQLite architecture. The change correctly targets `src/lib/db/repos/*`; this documentation inconsistency predates and is outside the reviewed diff.
- No code, test, deployment, Git state, or canonical specifications were modified by this reviewer. Only this review report and the required append-only collaboration update are written.

## Reproduction Commands

1. Verify checkout/integrity:
   ```bash
   test -z "$(git -C 'O:/workspaces/oss/9router' status --porcelain)" && \
   git -C "O:/workspaces/oss/9router" diff --exit-code && \
   git -C "O:/workspaces/oss/9router" merge-base --is-ancestor dfd81d65afc3f59888a02c1b4c80a303f13de2dc HEAD && \
   git --no-pager -C "O:/workspaces/oss/9router" diff --check dfd81d65afc3f59888a02c1b4c80a303f13de2dc..HEAD
   ```
2. Run the requested offline suite shown above from `O:/workspaces/oss/9router/tests`.
3. Re-run Task 3.3's three explicit live commands in `tasks.md:21-23`, without printing protected credential material.
4. Validate the OpenSpec change:
   ```bash
   cd "O:/workspaces/.worktrees/wt-9router-review-impl" && \
   C:/nvm4w/nodejs/openspec.EXE validate fix-systemone-abort-and-telemetry --strict --type change
   ```
