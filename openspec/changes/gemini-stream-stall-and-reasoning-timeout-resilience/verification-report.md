# Verification Report — gemini-stream-stall-and-reasoning-timeout-resilience

Phase: 3 `/openspec-apply-change` (Coder). Worktree `O:/workspaces/.worktrees/wt-9router-gemini-stream-resilience`, base HEAD `0598f9f0`. Uncommitted working-tree changes, ready for `@reviewer`.
Gate 0.1 (Commander accepts D-1 BREAKING, Q2=NO, Q3=NO): recorded in `agent_share.md` 2026-11-09 22:50.

## Task status

| Task | State | Evidence |
|------|-------|----------|
| 1.1 RED | done | `combo-empty-failover.test.js`: 11 failed / 63 passed before implementation (3 inverted assertions at old lines 102-105, 347-351, 389 + new cases) |
| 1.2 | done | `streamEvents.js`: `CLAUDE_DELTA.THINKING`, `RESPONSES_EVENT.REASONING_SUMMARY_TEXT_DELTA`, `RESPONSES_EVENT.REASONING_TEXT_DELTA`; proof node import prints `schema ok`; `! grep -rn '"thinking_delta"' open-sse/services` → no match |
| 1.3 GREEN | done | `emptyFailover.js`: `inspectSSELine` → `{content, reasoning, finishReason}`; `scanSSEBuffer` latches `sawReasoning`; `peekStreamForContent` → `trigger` ∈ content/reasoning/deadline/end/error; 74/74 pass |
| 1.4 | done | `combo.js` diff = 2 insertions / 2 deletions (≤ 6); log `succeeded (trigger=<trigger>)`; `combo-empty-failover` + `combo-smart-router` = 2 files / 102 tests pass |
| 2.1 RED→GREEN | done | new `stream-watchdog-phases.test.js`: antigravity assertion failed (`undefined` ≠ 600000), then green after `stallTimeoutMs: 600000` in `registry/antigravity.js` |
| 2.2 | done | `git diff -U0 tests/__baseline__/providers-baseline.json` = exactly `@@ -30,0 +31 @@ + "stallTimeoutMs": 600000,` (1 insertion, 0 deletions); `verify-providers.mjs` rc 0 |
| 2.3 | done | handler armed with fake timers: no abort at 361 s, abort at 600 s; with `STREAM_FIRST_CHUNK_TIMEOUT_MS=1000` stubbed + module reset: no abort at 599 s, abort at 600 s |
| 3.1 RED | done | zero-byte case failed (`stream stall timeout` ≠ `stream first-chunk timeout`); handler-level 600 s case failed on the same label |
| 3.2 GREEN | done | `streamHandler.js`: `abortMessage = chunkCount === 0 ? "stream first-chunk timeout" : "stream stall timeout"`, same message in the `Error` passed to `handleError`; `stream-watchdog-phases` + `responses-abort-terminal` = 2 files / 14 tests pass |
| 3.3 | done | `runtimeConfig.js` diff is comment-only (no value change) |
| 4.1 local gate | done | see below |
| 4.1 NUC cutover | **NOT done** | requires Reviewer approval; out of scope for this dispatch |
| 4.2, 4.3 | not started | QA, post-deployment |

## 4.1 local regression gate

- Focused: `npx vitest run unit/combo-empty-failover.test.js unit/stream-watchdog-phases.test.js unit/responses-abort-terminal.test.js unit/gemini-4-argon.test.js unit/combo-smart-router.test.js` → **5 files / 126 tests passed**. Re-run with `unit/reasoningContentInjector.test.js` → 6 files / 138 passed.
- `node tests/__baseline__/verify-providers.mjs` → `✅ PROVIDERS byte-for-byte equal (101 providers)`, rc 0.
- `node tests/__baseline__/verify-alias.mjs` → `✅ Alias resolution byte-for-byte equal (132 tokens)`, rc 0.
- `node tests/__baseline__/verify-oauth-urls.mjs` → `✅ OAuth URLs byte-for-byte equal`, rc 0.
- `openspec validate "gemini-stream-stall-and-reasoning-timeout-resilience" --strict` → `valid`, rc 0.
- Full-suite A/B (clean HEAD `0598f9f0` in a temporary detached worktree, since removed, vs. this working tree; vitest JSON reporter):
  - base: 4656 tests / 4508 pass / 49 fail. now: 4670 / 4523 / 48 (+19 new tests, 2 fail→pass).
  - 48 failures are identical in both runs (pre-existing: cursor auto-import, headroom, golden-url-header, claude-header-forwarding, db-* EBUSY/lowdb, etc.).
  - "pass→fail/missing" = 6 entries:
    - 5 are the intentionally renamed D-1 tests (old names `…still empty (reasoning is not content)`, `…reasoning-only first member falls through` ×3, `…reasoning-only does not`) — they no longer exist; their replacements pass.
    - 1 is `reasoningContentInjector > DefaultExecutor transformRequest runs the injector for minimax`: failed once in the 4670-test run (duration 5.8 s, timeout-class failure under full-suite load) and passes in isolation 3/3 on both this tree and clean HEAD (12/12). Judged flaky/load-related; the change touches nothing in that path. Reviewer may re-run to confirm.
  - `verify-no-regression.mjs` was not used verbatim: its known-fails keys are `/app/`-prefixed Docker paths, which do not match a Windows run. The A/B above is the equivalent check.
- The full-suite run rewrote 4 tracked vitest snapshot files under `tests/translator/__snapshots__/`; reverted with `git checkout --` (not part of this change).

## Files changed (working tree)

`open-sse/config/runtimeConfig.js`, `open-sse/providers/registry/antigravity.js`, `open-sse/services/combo.js`, `open-sse/services/emptyFailover.js`, `open-sse/translator/schema/streamEvents.js`, `open-sse/utils/streamHandler.js`, `tests/__baseline__/providers-baseline.json`, `tests/unit/combo-empty-failover.test.js`, new `tests/unit/stream-watchdog-phases.test.js`.

## Notes for Reviewer

- `providers-baseline.json` is CRLF. `snapshot-providers.mjs` re-emitted it LF, dropped the trailing newline and pulled in unrelated `codebuddyHeaders` hook drift (+3 lines ×2). To satisfy the "exactly one added line" rule, the snapshot output was discarded and the single `"stallTimeoutMs": 600000,` line was inserted by hand, preserving CRLF. `verify-providers.mjs` passes against it. The hook drift is a pre-existing, unrelated baseline gap and was not touched.
- `delta.thought` not added (Q2=NO); no per-provider `firstChunkTimeoutMs` (Q3=NO).
- Residual risk unchanged: upstream TTFT > 600 s still fails (F1); when upstream emits zero bytes in prefill, Seam 1 does not help (45 s fail-open still applies).
