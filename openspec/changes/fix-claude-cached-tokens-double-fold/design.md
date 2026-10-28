# Design: Claude Stream Usage Normalization & Client Metadata Preservation

## Overview
This design resolves the token accounting divergence where Claude stream usage was double-folded during database persistence and stripped of cache metadata when delivered to OpenAI clients.

## Architecture & Data Flow

```text
Claude Upstream Stream Chunks
   │ (message_start: input_tokens, cache_read_input_tokens, cache_creation_input_tokens)
   │ (message_delta: output_tokens, stop_reason)
   ▼
claudeToOpenAIResponse (claude-to-openai.js)
   ├─► buildStateUsage():
   │     prompt_tokens = input + cache_read + cache_creation
   │     cached_tokens = cache_read
   │     cache_creation_input_tokens = cache_creation
   │     cache_read_input_tokens = cache_read
   ├─► toOpenAIUsage(..., "claude"): builds finalChunk.usage with prompt_tokens_details
   ▼
createSSEStream (stream.js)
   ├─► mergeClientUsage(filterUsage(finalChunk.usage), filterUsage(addBuffer(state.usage)))
   │     - Preserves prompt_tokens_details.cached_tokens
   │     - Overlays buffered flat token counts
   ▼
onStreamComplete / saveUsageStats (requestDetail.js)
   ▼
canonicalizeUsage (usageTracking.js)
   ├─► alreadyFolded check:
   │     prompt_tokens === input_tokens + cacheRead + cacheCreation
   │     -> passes prompt through untouched; sets cached = cacheRead
   ▼
saveRequestUsage (usageRepo.js) -> SQLite usageHistory & usageDaily
```

## Technical Decisions

### Decision 1: Explicit Canonical state.usage in Claude Translator
Instead of relying on downstream heuristics to infer whether `state.usage.prompt_tokens` includes or excludes cache, `buildStateUsage` explicitly sets both `cached_tokens` and `cache_creation_input_tokens`. This aligns `state.usage` with the canonical contract expected by `saveUsageStats`.

### Decision 2: Defense-in-Depth in canonicalizeUsage
`canonicalizeUsage` handles diverse usage shapes from different translators and proxies. By verifying `alreadyFolded` (`prompt === input + cacheRead + cacheCreation`), any caller that already folded the prompt cannot inadvertently trigger the Claude addition path.

### Decision 3: Merge vs. Overwrite in Client Finish Chunk
`stream.js` requires adding `BUFFER_TOKENS` (2000) to top-level prompt tokens for context safety in certain SDKs. By implementing `mergeClientUsage`, the buffered flat counts (`prompt_tokens`, `completion_tokens`, `total_tokens`) are merged over the translator-constructed usage, preserving nested structures such as `prompt_tokens_details`.

### Decision 4: Safe Resource Teardown in Windows E2E Tests
Node.js on Windows locks SQLite database files while any handle is open. Closing `global._dbAdapter?.instance` before `fs.rmSync` in `afterAll` prevents test runner crashes caused by `EBUSY`.
