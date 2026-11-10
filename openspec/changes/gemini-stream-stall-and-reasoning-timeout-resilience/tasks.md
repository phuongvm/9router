# Tasks: Gemini Stream Stall & Reasoning Timeout Resilience

Ownership and gates: see `design.md` § Ownership & gates. Each task is a tracer bullet: write the failing test (RED, show output) → implement → GREEN (show output) → tick. A checkbox is never proof; the `Proof:` command output is.

Common test command (run from `tests/`): `npx vitest run <files>`.

## 0. Gate

- [x] 0.1 Commander accepts design D-1 BREAKING behaviour (reasoning-only seat is committed, not retried) and answers design Open Questions 2–3 (Q2=NO, Q3=NO).
  - Proof: Commander reply recorded in `agent_share.md` Updates Log at 2026-11-09 22:50.

## 1. Seam 1 — Peek releases on reasoning progress (`open-sse/services/emptyFailover.js`)

- [x] 1.1 RED: in `tests/unit/combo-empty-failover.test.js` invert the three reasoning-fallthrough assertions (lines 102-105, 347-351, 389) to expect commit; add cases: OpenAI `reasoning_content` frame releases peek before a 45000 ms deadline with `trigger: "reasoning"`, `timedOut: false`; Anthropic `thinking_delta` and Responses reasoning delta release; empty `reasoning_content: ""` does not release; `deltaHasClientContent({reasoning_content:"x"})` stays false. [Blocked by: 0.1]
  - Proof: `npx vitest run unit/combo-empty-failover.test.js` shows the new/inverted cases failing and all others passing.
- [x] 1.2 Add schema constants `CLAUDE_DELTA.THINKING = "thinking_delta"`, `RESPONSES_EVENT.REASONING_SUMMARY_TEXT_DELTA`, `RESPONSES_EVENT.REASONING_TEXT_DELTA` in `open-sse/translator/schema/streamEvents.js` (no hardcoded strings in `emptyFailover.js`). [Blocked by: 1.1]
  - Proof: `node -e 'import("./open-sse/translator/schema/streamEvents.js").then(m => { if (m.CLAUDE_DELTA.THINKING !== "thinking_delta" || !m.RESPONSES_EVENT.REASONING_TEXT_DELTA) process.exit(1); })'` && `! grep -rn '"thinking_delta"' open-sse/services`
- [x] 1.3 Implement reasoning detection: `inspectSSELine` returns `{ content, reasoning, finishReason }` (OpenAI shape via `extractReasoningText` from `translator/concerns/reasoning.js`); `scanSSEBuffer` latches `sawReasoning`; `peekStreamForContent` returns `outcome: "content"` with `trigger` ∈ {`content`,`reasoning`,`deadline`,`end`,`error`}. Update the comment block at lines 26-35 and 47-52 to the new rule. [Blocked by: 1.2]
  - Proof: `npx vitest run unit/combo-empty-failover.test.js` all green.
- [x] 1.4 `open-sse/services/combo.js`: pass `trigger` through `peekComboResponse` and log `succeeded (trigger=<trigger>)` (replaces the `peek deadline; committed` suffix). No other combo logic change. [Blocked by: 1.3]
  - Proof: `npx vitest run unit/combo-empty-failover.test.js unit/combo-smart-router.test.js` green; `git diff --stat -- open-sse/services/combo.js` ≤ 6 lines changed.

## 2. Seam 2 — Antigravity watchdog budget (`open-sse/providers/registry/antigravity.js`)

- [x] 2.1 RED: new `tests/unit/stream-watchdog-phases.test.js` asserts `PROVIDERS.antigravity.stallTimeoutMs === 600000`, `PROVIDERS.qoder.stallTimeoutMs === 120000`, `PROVIDERS["qoder-cn"].stallTimeoutMs === 120000`, and that a provider with no registry value resolves to `STREAM_STALL_TIMEOUT_MS`. Then add `stallTimeoutMs: 600000` to `antigravity.transport`. [Blocked by: 0.1]
  - Proof: RED output before the registry edit, GREEN after: `npx vitest run unit/stream-watchdog-phases.test.js`.
- [x] 2.2 Refresh provider baseline: `node tests/__baseline__/snapshot-providers.mjs` (from repo root), then `node tests/__baseline__/verify-providers.mjs`. [Blocked by: 2.1]
  - Proof: `git diff -U0 tests/__baseline__/providers-baseline.json` shows exactly one added line `"stallTimeoutMs": 600000` under `antigravity` (plus a comma change on the preceding line if JSON requires); verify script exit 0.
- [x] 2.3 Prove the handler arms the antigravity budget: in `stream-watchdog-phases.test.js`, call `handleStreamingResponse` for `provider: "antigravity"` with a silent upstream and `vi.spyOn`/fake timers to assert the watchdog fires at 600000 ms, not 360000 ms; repeat with `process.env.STREAM_FIRST_CHUNK_TIMEOUT_MS="1000"` set before module import to prove no effect. [Blocked by: 2.1]
  - Proof: `npx vitest run unit/stream-watchdog-phases.test.js` green.

## 3. Seam 3 — Phase-labelled watchdog & first-chunk constant scope

- [x] 3.1 RED: in `stream-watchdog-phases.test.js` add `pipeWithDisconnect` cases with a 50 ms budget: zero-byte upstream → `onAbortTerminal` receives `stream first-chunk timeout` and output contains `data: [DONE]`; one-chunk-then-silent → `stream stall timeout`; chunk every 30 ms for 300 ms → completes without abort. [Blocked by: 0.1]
  - Proof: first case fails (receives `stream stall timeout`) before implementation.
- [x] 3.2 Implement in `open-sse/utils/streamHandler.js`: watchdog sets `abortMessage` by `chunkCount === 0`; the `Error` passed to `handleError` carries the same message. Signature of `pipeWithDisconnect` unchanged. [Blocked by: 3.1]
  - Proof: `npx vitest run unit/stream-watchdog-phases.test.js unit/responses-abort-terminal.test.js` green (existing `stream stall timeout` test must stay green unchanged).
- [x] 3.3 Correct the `STREAM_FIRST_CHUNK_TIMEOUT_MS` comment in `open-sse/config/runtimeConfig.js` (Kiro tool-call-repair only; chat uses provider stall budget). Update the `STREAM_STALL_TIMEOUT_MS` comment to state it covers both first-chunk and inter-chunk phases. No value changes. [Blocked by: 3.2]
  - Proof: `git diff -- open-sse/config/runtimeConfig.js` shows comment-only changes.

## 4. Regression, deployment, production evidence

- [x] 4.1 Local regression gate, then NUC cutover. Run focused suites `unit/combo-empty-failover.test.js unit/stream-watchdog-phases.test.js unit/responses-abort-terminal.test.js unit/gemini-4-argon.test.js unit/combo-smart-router.test.js`; run `node tests/__baseline__/verify-providers.mjs`, `verify-alias.mjs`, `verify-oauth-urls.mjs`; full-suite A/B against clean HEAD with `tests/__baseline__/verify-no-regression.mjs` (0 pass→fail). After Reviewer approval, deploy to Intel NUC `192.168.100.110:20128`. [Blocked by: 1.4, 2.3, 3.3]
  - Proof: suite outputs; NUC container revision label == pushed SHA (`295b6cd7933901430c9e42f49afb60e0aea1ca03`), `RestartCount == 0`, `/v1/models` HTTP 200 (76 models active), live `POST /v1/chat/completions` on `cb-gemini-argon` returned HTTP 200 with `trigger=content`/`trigger=reasoning` observable in logs.
- [ ] 4.2 QA, 24h NUC log window: count combo `trigger=reasoning` vs `trigger=deadline` commits on `cb-gemini-argon`; count `stream first-chunk timeout` vs `stream stall timeout`; confirm no antigravity stall abort occurs before 600 s elapsed. [Blocked by: 4.1]
  - Proof: `docker logs --since 24h 9router` grep counts, with the exact command lines.
- [ ] 4.3 QA, residual-risk measurement: fraction of argon streams with TTFT > 600 s in the same window (from `📊 DONE ... TTFT` lines and first-chunk timeout lines); report to Commander for the separate exploration-Option-1 decision. [Blocked by: 4.2]
  - Proof: count table in `openspec/changes/gemini-stream-stall-and-reasoning-timeout-resilience/verification-report.md`.
