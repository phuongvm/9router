# Two-Axis Independent Implementation Re-Review — v2

- **Change**: `gemini-stream-stall-and-reasoning-timeout-resilience`
- **Worktree / review base**: `O:/workspaces/.worktrees/wt-9router-gemini-stream-resilience` / `0598f9f0fd6c14e27117bffadd0815e1799025b1`
- **Scope**: Tasks 0.1–3.3, Task 4.1 local regression gate, and remediation of v1 S-01. Intel NUC cutover is deliberately out of scope until this approval.
- **Verdict**: **APPROVED**

## Executive Decision

v1 blocker **S-01 is resolved**. `pipeWithDisconnect` now selects its watchdog phase from `totalBytes === 0`, not `chunkCount === 0` (`open-sse/utils/streamHandler.js:210-214`). An independently authored runtime probe enqueued `Uint8Array(0)`, waited for the watchdog, and observed `terminal=stream first-chunk timeout` plus `data: [DONE]` (exit `0`). The committed regression test exercises the same boundary (`tests/unit/stream-watchdog-phases.test.js:54-61`).

All five mandatory focused Vitest suites and all three required baseline scripts passed independently. No blocking or warning findings remain on either review axis. **Task 4.1's local regression portion is verified; its Intel NUC cutover portion remains held pending this review approval.** Tasks 4.2–4.3 remain QA/post-deployment work and are not approved or completed by this review.

## Review Context and Boundaries

- Required context read: `CLAUDE.md`, `open-sse/AGENTS.md`, `docs/ARCHITECTURE.md`, active proposal/design/tasks/delta spec, source and tests, `agent_share.md`, v1 findings, and the implementation verification report.
- The mandated project-local files `code-review-mandate/spec.md` and `lessons-learned.md` (including `docs/lessons/lessons-learned.md`) are absent. No cross-project policy was substituted.
- `openspec status` reports the planning artifacts complete under `spec-driven`; strict validation passed.
- The implementation is uncommitted against base `0598f9f0`. Tracked implementation changes are restricted to the six declared engine/config files, one provider baseline, and the combo test; the expected new watchdog test and active OpenSpec artifacts are untracked. No commits exist after the review base.
- The required parallel-delegate dispatches for the Standards and Spec axes were attempted. Both failed before execution because Nerve reports `Unknown remote host alias: agent4070`. The axes below were therefore independently completed in this reviewer session and remain explicitly separated.

## Independent Proof Evidence

| Gate | Command | Actual result |
|---|---|---|
| S-01 adversarial byte-boundary probe | Inline Node ESM harness calling `pipeWithDisconnect` with `Uint8Array(0)`, 30 ms budget, and silence | **PASS**, exit `0`: `chunks=1 | bytes=0`; `terminal=stream first-chunk timeout`; `has_done=true` |
| Mandatory focused suites | `cd tests && npx vitest run unit/combo-empty-failover.test.js unit/stream-watchdog-phases.test.js unit/responses-abort-terminal.test.js unit/gemini-4-argon.test.js unit/combo-smart-router.test.js` | **PASS**, exit `0`; 5 files / **127 tests** |
| Provider baseline | `node tests/__baseline__/verify-providers.mjs` | **PASS**, exit `0`; 101 providers byte-for-byte equal |
| Alias baseline | `node tests/__baseline__/verify-alias.mjs` | **PASS**, exit `0`; 132 tokens byte-for-byte equal |
| OAuth URL baseline | `node tests/__baseline__/verify-oauth-urls.mjs` | **PASS**, exit `0` |
| Strict OpenSpec validation | `openspec validate "gemini-stream-stall-and-reasoning-timeout-resilience" --strict` | **PASS**, exit `0`; 1/1 change valid, no issues |
| Diff hygiene | `git diff --check 0598f9f0fd6c14e27117bffadd0815e1799025b1` | **PASS**, exit `0` |

The Node invocations emitted the repository's existing `MODULE_TYPELESS_PACKAGE_JSON` warning only; all proof commands retained exit `0`.

## Prior Finding Disposition

### [RESOLVED] S-01 — Empty chunks must not count as byte progress

- **v1 defect**: An empty `Uint8Array` advanced `chunkCount`, so the watchdog reported `stream stall timeout` despite zero upstream bytes.
- **Resolution**: `open-sse/utils/streamHandler.js:197-212` keeps diagnostics for chunks and accumulated bytes, while the phase decision is now `totalBytes === 0 ? "stream first-chunk timeout" : "stream stall timeout"`.
- **Regression coverage**: `tests/unit/stream-watchdog-phases.test.js:54-61` asserts the exact empty-chunk case, the terminal message, and `[DONE]`; the neighbouring positive-byte case retains the mid-stream assertion at `:63-69`.
- **Independent reproduction**: The probe described above logged `chunks=1 | bytes=0` then `STREAM FIRST-CHUNK TIMEOUT`; its assertions passed. This directly satisfies `specs/stream-stall-resilience/spec.md:88-108` and `design.md:89-91`.

## Standards and Surgical Discipline (Axis 1)

**Status: PASS — 0 findings.**

- **Repository conventions**: The change uses `CLAUDE.md:53-55` / `open-sse/AGENTS.md:11-12,24,32` conventions: schema values are centralized in `open-sse/translator/schema/streamEvents.js:10-32`, and OpenAI reasoning parsing reuses `extractReasoningText` in `open-sse/services/emptyFailover.js:16-25,121-134` rather than duplicating parsing or hard-coding event discriminators in the service.
- **Surgical boundaries**: The diff implements only the three specified seams: reason-progress decision/replay (`emptyFailover.js`, `combo.js`), registry-derived Antigravity watchdog budget (`antigravity.js` and baseline), and internal watchdog labelling (`streamHandler.js` plus comment-only runtime config). `pipeWithDisconnect` retains its public signature; the stream handler remains responsible for raw-byte activity.
- **D-1 clarity**: `deltaHasClientContent` remains content-only (`emptyFailover.js:39-47`); separate `reasoning` and `trigger` values preserve the public predicate's meaning and make the accepted commitment cause observable (`:121-150, 201-213`; `combo.js:561-563`).
- **Fowler smell screen**: No introduced documented-standard breach or material judgement-call smell was found: no Mysterious Name, Duplicated Code, Feature Envy, Data Clump, Primitive Obsession, Repeated Switches, Shotgun Surgery, Divergent Change, Speculative Generality, Message Chain, Middle Man, or Refused Bequest.
- **Security note**: Changed paths neither alter authentication, secrets, request headers, nor outbound destination selection. The registry's pre-existing credential fields were not changed. No security regression was identified in this limited review scope.

## Spec Fidelity and Task Coverage (Axis 2)

**Status: PASS — 0 findings.**

| Requirement | Implementation and independent evidence | Result |
|---|---|---|
| R1 — reasoning frames release the peek | OpenAI extraction and Anthropic/Responses handlers: `emptyFailover.js:59-115,121-150,201-213`; exercised by `combo-empty-failover.test.js` within the mandatory 127-test run | PASS |
| R2 — terminal empty failover remains intact | Existing fall-through/no-retry paths at `combo.js:566-584`; test suite covers empty stop, content-filter, and deadline replay | PASS |
| R3 — Commander-accepted D-1 reasoning-only commitment | Acceptance recorded at `tasks.md:9-10` and `agent_share.md` (2026-11-09 22:50); commitment trigger is logged at `combo.js:561-563`; focused combo suite passes | PASS |
| R4 — Antigravity receives 600,000 ms while defaults/existing budgets remain | `antigravity.js:21-28`; resolver `streamingHandler.js:97-98`; assertions `stream-watchdog-phases.test.js:108-145`; provider baseline verifies 101 providers | PASS |
| R5 — phase-labelled watchdog abort | Byte threshold at `streamHandler.js:210-214`; zero-byte, empty-chunk, positive-byte stall, and rearm tests at `stream-watchdog-phases.test.js:44-86`; independent empty-chunk probe passes | PASS |
| R6 — first-chunk constant scope | Comment-only clarification `runtimeConfig.js:51-61`; env-isolation handler test `stream-watchdog-phases.test.js:118-127`; chat resolver continues to use provider/global stall budget | PASS |

### Task disposition

| Task range | Review disposition |
|---|---|
| 0.1 | Verified complete: Commander accepted D-1 and answered Q2/Q3, as recorded in task evidence. |
| 1.1–1.4 | Verified complete by implementation inspection and focused-suite pass. |
| 2.1–2.3 | Verified complete by registry/handler inspection, phase test, and provider baseline pass. |
| 3.1–3.3 | Verified complete. S-01 correction and its regression test now meet the required **byte** boundary. |
| 4.1 — local regression | Verified complete through the five focused suites and three baseline scripts. **NUC cutover remains held pending this approval.** |
| 4.2–4.3 | Unstarted QA/post-deployment obligations; remain unchecked and outside this approval. |

## Approval Boundary

This approval authorizes the next gated action: the Task 4.1 Intel NUC cutover may proceed under its deployment procedure. It does **not** authorize deployment itself, mark Task 4.1 fully complete, approve Tasks 4.2–4.3, synchronize specs, or archive the change. Those actions require their separately specified evidence and ownership gates.
