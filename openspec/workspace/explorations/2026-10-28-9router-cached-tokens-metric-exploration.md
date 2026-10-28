# 9Router Cached-Tokens Metric Exploration (2026-10-28)

**Card:** t_d8403bb8 · **Fix commit:** `c3bae6d9` on `origin/master` (phuongvm/9router) · **Host:** Intel NUC `192.168.100.110:20128`, container `9router`

## 1. Symptom

The dashboard's *Cached Tokens* ratio fell to **63.34 %**. On our traffic mix it should be **95–98 %**. Claude was the worst case. On 2026-10-28, 645 of 646 Claude requests showed roughly 50 % cache. Upstream Anthropic was actually serving more than 99 % of their prompt from cache.

Reference row `usageHistory.id = 1009040` (claude-opus-5-5, `/v1/chat/completions`, streamed):

| field | stored (bad) | correct |
|---|---|---|
| prompt_tokens | 460 936 | 230 469 |
| cached_tokens | 229 469 | 229 469 |
| cache_creation_input_tokens | 998 | 998 |
| cache ratio | 49.78 % | 99.57 % |
| cost | $0.9944 | $0.0726 |

`460936 − 230469 = 230467 = 229469 + 998`. The whole cache was added into `prompt_tokens` a second time.

There are two independent causes:

1. **A code defect** in 9router (Bug 1A + 1B). It inflated the stored prompt for Claude.
2. **Account rotation** for antigravity and codex. It produced real cold-cache misses.

## 2. Root cause 1A: double fold on the streaming Claude → OpenAI path

Persistence path for a streamed request:
`claudeToOpenAIResponse()` builds `state.usage` → `finalizeStream()` → `onStreamComplete()` → `saveUsageStats()` → `canonicalizeUsage(state.usage)` → `saveRequestUsage()`.

- `open-sse/translator/response/claude-to-openai.js` (`message_start` and `message_delta`) set
  `prompt_tokens = input + cache_read + cache_creation`. That value is **already cache-inclusive**. It also kept
  `cache_read_input_tokens` and `cache_creation_input_tokens` and left `cached_tokens` **undefined**.
- `open-sse/utils/usageTracking.js` `canonicalizeUsage()` uses that exact shape to recognise *raw* Claude usage:
  `cached_tokens === undefined && (cache_read_input_tokens !== undefined || cache_creation_input_tokens !== undefined)`.
  When it matches, it runs `prompt = prompt + cached + cacheCreation`, which folds the cache in a **second time**.
- The result: `prompt_tokens = input + 2·(read + creation)`. Cost is computed from that, and `nonCachedInput = prompt − cached − creation` then charged a full prompt's worth of cached tokens at the uncached input rate. Per-row Claude cost was overstated by up to ~13×.
- Non-streaming (`extractUsageFromResponse` on the raw Claude body), `/v1/messages` passthrough and `kiro-to-claude.js` are **not affected**. Those paths set cache-exclusive `input_tokens` or `prompt_tokens`, so the cache is folded exactly once. This was confirmed in the DB: 0 of 666 cache-bearing `/v1/messages` rows match the signature.
- History: the fold-in-translator form dates from `6437a1c5` (2026-03-09). The canonicalize branch arrived with `54e3245a` (2026-07-03, upstream #2209). The double fold starts where the two meet.

## 3. Root cause 1B: the finish chunk loses `cached_tokens` for OpenAI clients

`open-sse/utils/stream.js`, finish-chunk handling:
`item.usage = filterUsageForFormat(addBufferToUsage(state.usage), sourceFormat)`

This **replaced** the usage the translator had already attached to the finish chunk, which was built with `toOpenAIUsage(..., "claude")` and carried `prompt_tokens_details.cached_tokens`. The client-visible usage was rebuilt from the flat accounting record, so OpenAI-format clients never saw their cache hits. The `message_stop` fallback in the translator also used `input + output` and dropped every cached token.

## 4. Fix (commit `c3bae6d9`)

| file | change |
|---|---|
| `open-sse/translator/response/claude-to-openai.js` | New `buildStateUsage()`. `state.usage` is emitted in **canonical** form: cache-inclusive `prompt_tokens`, plus `cached_tokens` and `cache_creation_input_tokens` always present. `canonicalizeUsage` then takes its passthrough branch. The `message_stop` fallback now uses the same cache-inclusive `toOpenAIUsage(..., "claude")`. |
| `open-sse/utils/usageTracking.js` | Defence in depth. If `prompt_tokens === input_tokens + cache_read + cache_creation` (with cache > 0), the shape is treated as already folded and is not folded again. With zero cache both readings agree, so the check never has to guess. |
| `open-sse/utils/stream.js` | New `mergeClientUsage()`. The buffered accounting counts are overlaid **onto** the translator-built usage, and nested `*_details` objects are merged key by key, so `prompt_tokens_details.cached_tokens` survives. |
| `tests/unit/cached-token-e2e.test.js` | End-to-end regression tests: `claudeToOpenAIResponse` + `createSSETransformStreamWithLogger` → `onStreamComplete` → `saveUsageStats` → `canonicalizeUsage` → `saveRequestUsage` → SQLite. The test asserts the real prompt is stored (not 2×), cached tokens persist, cost is not inflated, and the client finish chunk carries `prompt_tokens_details.cached_tokens`. It also covers the no-cache, creation-only and legacy pre-folded shapes. The 4 seam tests failed before the fix and pass after it. |

Verification (2026-10-28, worktree `O:/workspaces/.worktrees/9router-cached-tokens-fix`):
- The 9ROUTER-INV-1..7 suites plus `cached-token-e2e`: **16 files / 128 tests passed**.
- Usage/stream/cache-adjacent suites (12 files): **97 tests passed**.
- Baselines (`verify-alias`, `verify-oauth-urls`, `verify-providers`, `verify-laya-provider`, `test-systemone-usage-logic`): passed.

## 5. Root cause 2: antigravity and codex rotate accounts on every request

The `settings.providerStrategies` override on the NUC was:
`antigravity` and `codex` → `{"fallbackStrategy":"round-robin","stickyRoundRobinLimit":1}`.

`src/sse/services/auth.js`: when the current account is selected, it gets `consecutiveUseCount = 1` (after a switch). The next request checks `currentCount < stickyLimit`, which is `1 < 1` and therefore false, so it **switches**. Every request goes to a different account (`268d8fc4`, `5c9ab81f` and `a45b6bc6` in turn). Prompt caches are per account, so each conversation turn lands on an account whose prefix cache is up to three turns stale. The result is cold misses and roughly a 3-turn lag in cache warmth.

Measured from container logs on 2026-10-28:
- **Before** (round-robin, limit 1): 58 antigravity requests, **57 account switches**. Every request rotated.
- **After** (round-robin, limit 50): 31 requests, 11 switches. All of those happened in the first ~20 s while per-account counters reset. After that, 20+ consecutive requests stayed on one warm account.

`stickyRoundRobinLimit: 50` was chosen over plain `fill-first` because it keeps load spread across accounts over time while holding a multi-turn conversation on one account for up to 50 requests.

## 6. Production remediation on the NUC (2026-10-28)

1. **Backup:** `/home/ubuntu/workspaces/docker-compose/9router/backups/9router_backup_20261028_160128.sqlite`. This is an online `.backup` of the bind-mounted `/var/lib/9router/db/data.sqlite`, taken before any write.
2. **Deploy:** the NUC checkout was fast-forwarded `8d5c7274 → c3bae6d9`, `ROUTER_VCS_REF` was updated, `docker compose build 9router`, then `docker compose up -d --no-deps 9router`. The container was recreated at 09:05:30 UTC and `/v1/models` returns 200. The first post-deploy Claude request logged `IN 107549 (CACHE ↻107059 +488)`, so the prompt is no longer doubled. Cache-bearing Claude rows written after the deploy that match the double-fold signature: **0 of 54**.
3. **Historical recalculation:** one `BEGIN IMMEDIATE` transaction, run inside the container with the app's own `calculateCostFromTokens` and `getPricingForModel` (user `kv/pricing` overrides take precedence). The dry run came first.
   - Selection: `provider='claude'`, cache > 0, `prompt_tokens >= 2·(cached_tokens + cache_creation_input_tokens)`, timestamp before the deploy.
   - `usageHistory`: **13 101 rows** rewritten. `promptTokens` and `tokens.prompt_tokens/total_tokens` were reduced by `(read + creation)` and `cost` was recomputed. Prompt tokens went from 3 347 298 484 to 1 679 811 203. Claude cost went from **$7 780.49 to $1 044.05**.
   - `usageDaily`: **36 day rollups** were adjusted by per-row deltas across `promptTokens` and `cost` at day level and in `byProvider`, `byModel`, `byAccount`, `byApiKey` and `byEndpoint`. Counter-key misses: 0. Cross-check for 2026-10-20 to 2026-10-28: the Claude `promptTokens` and `cost` sums from `usageHistory` equal the `usageDaily.byProvider.claude` rollups exactly on every day.
   - Row 1009040 is now `prompt_tokens = 230469`, cost $0.0726.
4. **Strategy:** `providerStrategies.antigravity` and `.codex` → `{"fallbackStrategy":"round-robin","stickyRoundRobinLimit":50}`, written in the same transaction. The app reads settings from the DB on each request, so no restart was needed.
5. **Stats API:** `GET /api/usage/stats?period=today` returned HTTP 200 (loopback, CLI-token auth). Claude **96.56 %** cached (830 req), antigravity 68.83 %, codex 71.72 %, overall 77.02 %. Before the fix the overall figure was 63.34 % and Claude was about 49.8 %.

## 7. Residual notes

- **Selection heuristic ambiguity.** A non-streaming Claude → OpenAI row is folded only once, but it also matches `p ≥ 2c` when its uncached input is at least its cache. Those rows cannot be told apart in the stored data, because the token JSON shape is identical. Before the cleanup, only 44 of ~13 150 cache-bearing Claude `/v1/chat/completions` rows were provably single-folded (`p < 2c`). Non-streaming traffic is therefore around 0.3 %, and the low-cache subset of it is smaller still. Any mis-correction is bounded by that population. 29 rows still match `p ≥ 2c` after correction because their uncached input is larger than their cache. That is legitimate and they are not double-folded.
- Antigravity's remaining ~69 % ratio is now real upstream behaviour (Gemini implicit caching), not an accounting artefact. It should rise as conversations stay on warm accounts.
- `_meta.totalRequestsLifetime` is unchanged. The request counts were correct; only token and cost fields were wrong.
- Rollback: restore the backup above, or revert `c3bae6d9` and redeploy.
