# Two-Axis Independent Implementation Review — v1

- **Change**: `gemini-stream-stall-and-reasoning-timeout-resilience`
- **Worktree / base**: `O:/workspaces/.worktrees/wt-9router-gemini-stream-resilience` @ `0598f9f0fd6c14e27117bffadd0815e1799025b1`
- **Review scope**: Tasks 0.1–3.3 and mandatory local verification in Task 4.1. Intel NUC cutover is intentionally held pending review approval.
- **Verdict**: **REJECTED / CHANGES REQUESTED**

## Executive Decision

One **CRITICAL** Spec-fidelity defect blocks approval: the phase-label implementation treats an empty upstream *chunk* as proof that the stream has started, although the requirement defines the phase boundary as the arrival of an upstream *byte*. A zero-length `Uint8Array` therefore produces `stream stall timeout`, not the required `stream first-chunk timeout`.

All mandatory focused suites, baselines, strict validation, and diff hygiene independently pass. Those tests do not cover an empty chunk, so they do not disprove the byte-vs-chunk defect. No Intel NUC deployment may proceed until this finding is corrected and independently reverified.

## Review Context and Evidence

- Required repository context loaded: `open-sse/AGENTS.md`, `docs/ARCHITECTURE.md`, active delta spec, design, tasks, source, tests, and `agent_share.md`.
- Project-local `code-review-mandate/spec.md` and `lessons-learned.md` are absent. This was also recorded in the prior proposal review; no cross-project document was treated as local policy.
- OpenSpec planning status is complete (`proposal`, `specs`, `design`, `tasks` all `done`).
- `git diff --check 0598f9f0fd6c14e27117bffadd0815e1799025b1` passed (exit `0`). The implementation diff is uncommitted and limited to the declared nine implementation/test/baseline files, plus OpenSpec/session artifacts.
- The required two delegated axes were attempted, but remote delegation rejected configured host alias `agent4070` as unknown. The two axes below were completed independently in this reviewer session and are kept separate.

## Independent Proof Commands

| Gate | Command | Result |
|---|---|---|
| Focused regression suites | `cd tests && npx vitest run unit/combo-empty-failover.test.js unit/stream-watchdog-phases.test.js unit/responses-abort-terminal.test.js unit/gemini-4-argon.test.js unit/combo-smart-router.test.js` | **PASS**, exit `0`; 5 files / 126 tests |
| Provider baseline | `node tests/__baseline__/verify-providers.mjs` | **PASS**, exit `0`; 101 providers byte-for-byte equal |
| Alias baseline | `node tests/__baseline__/verify-alias.mjs` | **PASS**, exit `0`; 132 tokens byte-for-byte equal |
| OAuth baseline | `node tests/__baseline__/verify-oauth-urls.mjs` | **PASS**, exit `0` |
| Strict OpenSpec validation | `openspec validate "gemini-stream-stall-and-reasoning-timeout-resilience" --strict` | **PASS**, exit `0` |
| Extra adversarial byte-boundary probe | Inline Node harness invoking `pipeWithDisconnect` with `Uint8Array(0)`, a 30 ms budget, then silence | **FAIL**, harness assertion exit `7`: emitted `stream stall timeout` |

The baseline commands emitted only the repository's existing Node `MODULE_TYPELESS_PACKAGE_JSON` warning; all three exit codes remained `0`.

## Finding

### [CRITICAL] S-01 — Empty chunks are incorrectly classified as stream progress

- **Spec**: `specs/stream-stall-resilience/spec.md:88-96` requires `stream first-chunk timeout` when the watchdog fires **before any upstream byte arrived**. `design.md:89-91` likewise defines the threshold as `0 bytes` vs `>=1 byte`.
- **Implementation**: `open-sse/utils/streamHandler.js:236-245` increments `chunkCount` for every emitted chunk, including `Uint8Array(0)`. The watchdog chooses its terminal message solely from `chunkCount === 0` at `:210-214`.
- **Reproduction**: An independent Node harness created an upstream body that emits `new Uint8Array(0)` and then remains open. It logged `chunks=1 | bytes=0`, then emitted `terminal=stream stall timeout`; its assertion that the emitted error be `stream first-chunk timeout` failed (`ZERO_BYTE_WATCHDOG_RC=7`).
- **Impact**: Observability and client-facing 504 terminal diagnostics are wrong for any upstream/transport that emits an empty chunk during prefill. This violates Requirement **Phase-Labelled Stream Watchdog Abort**, scenario **Watchdog fires before the first upstream byte**.
- **Required correction**: Base the phase decision on byte progress (`totalBytes === 0`, or an equivalent explicit `sawUpstreamByte` set only when the chunk size is greater than zero), rather than raw chunk count. Add a regression test for `Uint8Array(0)` followed by silence that asserts the first-chunk message and terminal frame. Preserve the existing one-or-more-byte mid-stream test.

## Axis 1 — Standards and Surgical Discipline

**Status: PASS, no separate blocking standards finding.**

- **Scope**: The application diff is surgical: reasoning progress is isolated to `emptyFailover.js`; `combo.js` only propagates/logs `trigger`; provider policy is one Antigravity registry field plus the corresponding baseline; watchdog API signature remains unchanged; `runtimeConfig.js` is comment-only.
- **Repository conventions**: `emptyFailover.js` imports canonical schema constants and reuses `extractReasoningText`, complying with `open-sse/AGENTS.md:11-12,24,32` instead of hard-coding translator event strings. `streamEvents.js:14,27-28` supplies the required constants.
- **D-1 separation**: `deltaHasClientContent` remains content-only (`emptyFailover.js:39-47`); `inspectSSELine` exposes independent reasoning state (`:121-134`). This avoids semantic conflation and preserves the public predicate's contract.
- **Fowler smell screen**: No introduced Mysterious Name, duplicated logic, feature envy, data clump, primitive obsession, repeated switch, shotgun surgery, divergent change, speculative generality, message chain, middle man, or refused bequest was found. The additional `trigger` is a small, direct causal datum at the only combo caller.
- **Hygiene**: `git diff --check` passed. No drive-by source refactor was found.

## Axis 2 — Spec Fidelity and Task Coverage

**Status: FAIL because of S-01.** Apart from S-01, the implementation and tests trace to all stated requirements and scenarios as follows.

| Requirement / scenarios | Independent implementation and test evidence | Status |
|---|---|---|
| **R1 Reasoning frames release combo peek** (OpenAI, Anthropic, Responses, empty reasoning, reasoning stays non-content) | `emptyFailover.js:60-115,121-150,201-213`; `combo-empty-failover.test.js:45-69,106-153,238-297` | PASS |
| **R2 Terminal empty failover preserved** (empty stop falls through; content filter does not; deadline commits/replays) | Existing fallback flow at `combo.js:566-584`; tests `combo-empty-failover.test.js:155-180,376-405,424-443` | PASS |
| **R3 D-1 reasoning-only seat committed** | Commander acceptance is recorded at `tasks.md:9-10` and `agent_share.md` (2026-11-09 22:50); release behaviour at `emptyFailover.js:211-213`; real combo assertions at `combo-empty-failover.test.js:395-399,435-438` | PASS |
| **R4 Antigravity 600 s budget / default fallback / existing budgets** | `antigravity.js:21-28`; existing resolver `streamingHandler.js:97-98`; tests `stream-watchdog-phases.test.js:99-136`; baseline field is exact | PASS |
| **R5 Phase-labelled watchdog** (zero-byte first chunk, after-byte stall, rearm each chunk) | Correct for truly zero chunks and positive-byte chunks (`streamHandler.js:206-249`; tests `stream-watchdog-phases.test.js:44-77`), but fails required **no upstream byte** semantics after an empty chunk | **FAIL — S-01** |
| **R6 First-chunk constant scope explicit** | Comment-only clarification `runtimeConfig.js:51-61`; environment isolation test `stream-watchdog-phases.test.js:109-118`; resolver stays provider/global stall budget | PASS |

### Task execution disposition

| Task range | Result |
|---|---|
| 0.1 | **Verified**: Commander accepted breaking D-1 and Q2/Q3 decisions are recorded; `tasks.md:9-10` is checked. |
| 1.1–1.4 | **Implemented and focused-test verified**; all checkboxes are checked. |
| 2.1–2.3 | **Implemented and focused/baseline verified**; all checkboxes are checked. |
| 3.1–3.3 | **Partially verified**: implementation satisfies checked/positive-byte test paths, but Task 3.2 is not specification-complete due to S-01. |
| 4.1 local regression | Required focused and baseline commands independently pass. The task remains correctly unchecked because its deployment portion must wait for approval. |
| 4.2–4.3 | Not started; remain QA/post-deployment work. |

## Approval Boundary and Required Re-review

This is **not approved** for Intel NUC cutover, production QA, completion, spec sync, or archive.

For re-review, provide:

1. A correction for S-01 and a focused test that covers a zero-length upstream chunk before silence.
2. Output of the five mandatory focused Vitest suites and three mandatory baseline scripts after the correction.
3. `openspec validate "gemini-stream-stall-and-reasoning-timeout-resilience" --strict` exit `0`.
4. `git diff --check` exit `0`.

No production/source/test implementation files were edited by Reviewer.
