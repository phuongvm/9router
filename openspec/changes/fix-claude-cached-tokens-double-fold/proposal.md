# Proposal: Fix Claude Stream Cached Tokens Double-Fold and Preserve SSE Cache Details

## Why
When streaming Claude completions through 9Router to OpenAI-compatible clients (`/v1/chat/completions`), cached input tokens (`cache_read_input_tokens` and `cache_creation_input_tokens`) were being double-counted in `prompt_tokens` in the database, while `prompt_tokens_details.cached_tokens` was stripped from the final SSE chunk returned to clients.

Investigation identified two root causes:
1. **Double-Fold in Persistence Pipeline (Bug 1A)**:
   - `claudeToOpenAIResponse` (`open-sse/translator/response/claude-to-openai.js`) converts Claude streaming chunks to OpenAI format. It computes `promptTokens = inputTokens + cacheReadTokens + cacheCreationTokens` (cache-inclusive) and sets `state.usage = { prompt_tokens: promptTokens, cache_read_input_tokens, cache_creation_input_tokens }`, but leaves `cached_tokens` undefined.
   - When the stream ends, `createSSEStream` calls `onStreamComplete(usage)` → `saveUsageStats` → `canonicalizeUsage(state.usage)`.
   - `canonicalizeUsage` in `open-sse/utils/usageTracking.js` inspects `usage.cached_tokens === undefined && (usage.cache_read_input_tokens !== undefined || usage.cache_creation_input_tokens !== undefined)` and assumes prompt tokens exclude cache, adding `cache_read + cache_creation` into `prompt_tokens` a **second time**.
   - Result: Stored `prompt_tokens` in `usageHistory` and `usageDaily` was ~2x the actual prompt (e.g. 460,936 instead of 230,469), cutting reported Claude cache ratio in half (~48% instead of ~96-99%) and erroneously charging full uncached rates for all cached tokens in cost calculation.

2. **Stripping of Cache Details from Client Finish Chunk (Bug 1B)**:
   - In `open-sse/utils/stream.js`, when a finish chunk arrives, the handler executed:
     `item.usage = filterUsageForFormat(addBufferToUsage(state.usage), sourceFormat);`
   - Because `state.usage` only carried flat accounting counts (`cache_read_input_tokens`) and lacked `prompt_tokens_details`, `filterUsageForFormat(..., "openai")` stripped all cache metadata, returning bare `{ prompt_tokens, completion_tokens, total_tokens }` to the client.

## What Changes
1. **`open-sse/translator/response/claude-to-openai.js`**:
   - Introduce `buildStateUsage` to emit `state.usage` with `cached_tokens` and `cache_creation_input_tokens` explicitly populated alongside `prompt_tokens`, signaling to downstream persistence layers that cache has already been folded.
   - Update `message_stop` fallback to build usage via `toOpenAIUsage(..., "claude")` with full cache details matching `message_delta`.

2. **`open-sse/utils/usageTracking.js`**:
   - Add an `alreadyFolded` check in `canonicalizeUsage`: if `prompt_tokens === input_tokens + cacheRead + cacheCreation`, recognize the input as pre-folded and assign `cached = cacheRead` without adding to `prompt`.

3. **`open-sse/utils/stream.js`**:
   - Introduce `mergeClientUsage` so that buffered accounting counts overlay translator-attached usage without erasing `prompt_tokens_details.cached_tokens` or `cache_creation_tokens`.

4. **`tests/unit/cached-token-e2e.test.js`**:
   - Close SQLite adapter in `afterAll` to eliminate `EBUSY` file locking errors on Windows.
   - Add comprehensive stream-seam E2E tests validating prompt token accuracy, cache ratio fidelity, cost computation, and client chunk metadata preservation.

## Success Criteria
- [x] Stream-seam E2E unit tests in `cached-token-e2e.test.js` pass with 100% assertions.
- [x] Stored `prompt_tokens` matches true prompt (`input_tokens + cache_read + cache_creation`) without duplication.
- [x] Client finish chunk preserves `prompt_tokens_details: { cached_tokens, cache_creation_tokens }`.
- [x] Live 9Router deployment and SQLite recalculation confirm zero double-folded records and restore Claude cache metrics to >96%.
