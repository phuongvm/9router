# Proposal: Gemini Stream Stall & Reasoning Timeout Resilience

## Why

Combo `cb-gemini-argon` (seats `ag/gemini-4-argon-high` → `-medium` → `-low`) stalls and fails on long-context, high-reasoning turns. The 72h Intel NUC audit in the linked exploration (819 argon requests) established:

| # | Finding | Evidence | Status |
|---|---------|----------|--------|
| F1 | Upstream TTFT has a heavy tail on 100k–510k token contexts | 107/819 > 60s, 26 > 200s, max 2,172s; 22% of > 400k-token streams > 60s | Root driver (upstream, not fixable here) |
| F2 | `emptyFailover` treats reasoning frames as "no content" and holds the whole stream head for up to `EMPTY_PEEK_DEADLINE_MS` (45s) | 27 peek deadlines in 72h (12 on argon) | Defect — 9Router-induced latency |
| F3 | One coarse `STREAM_STALL_TIMEOUT_MS` (360s) watchdog covers prefill *and* inter-chunk idle | 30 stall kills (HTTP 504 error frame) in 72h, mostly `antigravity/gemini-4-argon-high` | Defect — kills streams Hermes (900s) would still accept |
| F4 | `STREAM_FIRST_CHUNK_TIMEOUT_MS` (200s) exists but is unwired on the chat path | Only consumer: `open-sse/executors/kiro.js` | Dead/misleading config |
| F5 | `FETCH_CONNECT_TIMEOUT_MS` (60s) is innocent | 0 `fetch connect timeout` occurrences in 72h | Disproven — out of scope |

## What Changes

Three seam-local changes ("Option 2 — Codebase Resilience & Seam Hardening"):

1. **Seam 1 — Peek progress signal** (`open-sse/services/emptyFailover.js`). The peek gains a second, separate signal — *reasoning progress* — alongside the existing *content* signal. A stream that emits reasoning/thinking frames is committed and released immediately instead of being held for 45s. `deltaHasClientContent` keeps its current meaning (answer text / tool calls). A stream that ends with **neither** content **nor** reasoning still falls through to the next combo seat (terminal empty failover intact).
2. **Seam 2 — Antigravity watchdog budget** (`open-sse/providers/registry/antigravity.js`). `transport.stallTimeoutMs: 600000` so `PROVIDERS.antigravity.stallTimeoutMs` resolves to 600s (below Hermes's 900s local timer) instead of the 360s global.
3. **Seam 3 — Two-phase stream watchdog** (`open-sse/utils/streamHandler.js`, `open-sse/handlers/chatCore/streamingHandler.js`, `open-sse/config/runtimeConfig.js`). `pipeWithDisconnect` distinguishes the *first-chunk* phase from the *inter-chunk idle* phase and reports which one fired. The budget is resolved once per provider. The global `STREAM_FIRST_CHUNK_TIMEOUT_MS` is **not** wired onto the chat path (its 200s default would kill streams that succeed today); its comment is corrected to state its Kiro-only scope.

**BREAKING (behavioral)**: a combo seat that emits reasoning and then aborts with no answer text (think-then-abort) is no longer retried on the next seat, because its reasoning bytes have already reached the client. This reverses an intent documented in `emptyFailover.js` (lines 34–35) and asserted in `tests/unit/combo-empty-failover.test.js`. See design D-1 — Commander acceptance required.

## Capabilities

### New Capabilities
- `stream-stall-resilience`: How the gateway decides when to release a peeked combo stream, how stream watchdog budgets are resolved per provider and phase, and which terminal error is emitted when a watchdog fires.

### Modified Capabilities
- None. (`antigravity-request-compatibility` covers request identity, not stream timing.)

## Impact

- **Code (apply phase only)**: `open-sse/services/emptyFailover.js`, `open-sse/services/combo.js` (log line only), `open-sse/utils/streamHandler.js`, `open-sse/handlers/chatCore/streamingHandler.js`, `open-sse/config/runtimeConfig.js`, `open-sse/providers/registry/antigravity.js`.
- **Tests**: `tests/unit/combo-empty-failover.test.js` (reasoning assertions inverted per D-1), new `tests/unit/stream-watchdog-phases.test.js`, `tests/__baseline__/verify-providers.mjs` snapshot refresh (antigravity transport gains one field).
- **Runtime**: Antigravity dead sockets take up to 600s (was 360s) to be detected. Non-antigravity providers: zero behavior change.
- **Not fixed by this change**: F1. Streams whose TTFT exceeds 600s still fail. The exploration does not quantify the > 600s fraction; task 4.3 measures it. Context compaction (exploration Option 1) and Hermes tuning (Option 3) are separate decisions.

## Non-goals

- Adaptive combo hysteresis / hedged routing on slow seats (exploration §7, `combo.js` row) — not requested; listed so the Commander can decide explicitly.
- A per-provider `firstChunkTimeoutMs` registry field — no provider needs a first-chunk budget different from its idle budget today (one adapter = hypothetical seam). Listed for explicit Commander decision.
- Changing `FETCH_CONNECT_TIMEOUT_MS` (F5 disproven).
