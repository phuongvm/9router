# Proposal: Fix System One Request Logging and UI Analytics Integration

## Why
When running System One (Jev typed decision) evaluations via 9Router UI or API (e.g. testing `laya/laya-auto`), the requests succeed on the provider container and are stored in the `usageHistory` SQLite table, but fail to appear in "Recent Requests" on the "Usage & Analytics" dashboard (`/dashboard/usage`).

Investigation identified three root causes:
1. `src/sse/handlers/systemone.js` passes `promptTokens` and `completionTokens` as top-level properties to `saveRequestUsage` instead of packing them into a `tokens` object (`tokens: { prompt_tokens, completion_tokens, total_tokens }`), and omits `status: "success"`.
2. `src/lib/db/repos/usageRepo.js` expects token counts exclusively in `entry.tokens`. Missing `entry.tokens` causes `promptTokens` and `completionTokens` to be stored as 0 with `tokens = "{}"`.
3. In `usageRepo.js`, both the REST stats query (`getUsageStats`) and real-time SSE stream (`getActiveAndRecentRequests`) filter out entries where `e.promptTokens === 0 && e.completionTokens === 0`, causing all System One requests with 0 recorded tokens to be discarded from the `recentRequests` array.
4. `systemone.js` does not call `saveRequestDetail`, preventing System One evaluations from being displayed and inspected on the "Details" tab (`/dashboard/usage?tab=details`).

## What Changes
1. **`open-sse/handlers/systemoneCore.js`**:
   - Normalize `usage` to return `{ prompt_tokens, completion_tokens, total_tokens }` supporting both `input_tokens` (Laya format) and `prompt_tokens` (OpenRouter/Jev format), with state length fallback.
   - Return `responseBody` in the result object for logging and request details storage.

2. **`src/sse/handlers/systemone.js`**:
   - Import `saveRequestDetail` from `@/lib/usageDb.js`.
   - Measure latency and properly construct `tokens: { prompt_tokens, completion_tokens, total_tokens }`.
   - Call `saveRequestUsage` with `tokens` and `status: "success"`.
   - Call `saveRequestDetail` with latency, request payload, response data, and status.

3. **`src/lib/db/repos/usageRepo.js`**:
   - Provide defensive fallback in `saveRequestUsage` to construct `entry.tokens` from `entry.promptTokens` and `entry.completionTokens` if `entry.tokens` is omitted.
   - Guard `recentRequests` filter so valid model requests are not dropped even if token counts are zero.

4. **Testing & Database Backfill**:
   - Update unit test verification (`verify-laya-provider.mjs`) to assert proper `usage` and `responseBody` return structure.
   - Backfill existing 23 Laya records in Intel NUC SQLite database with appropriate token counts so previous UI tests appear on the dashboard.

## Success Criteria
- [ ] `node tests/unit/verify-laya-provider.mjs` passes with 100% assertions.
- [ ] System One requests to `laya/laya-auto` produce non-zero token entries in `usageHistory`.
- [ ] System One requests appear in "Recent Requests" on the 9Router Overview tab.
- [ ] System One requests appear in the "Details" tab with latency and request/response inspection.
