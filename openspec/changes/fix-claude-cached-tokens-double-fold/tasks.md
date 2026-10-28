# Tasks: Fix Claude Stream Cached Tokens Double-Fold & Metadata

## 1. Implementation
- [x] 1.1 Implement `buildStateUsage` in `open-sse/translator/response/claude-to-openai.js` to emit canonical `state.usage` with `cached_tokens` and `cache_creation_input_tokens`.
  - Proof: `git show c3bae6d9 -- open-sse/translator/response/claude-to-openai.js`
- [x] 1.2 Add `alreadyFolded` guard in `open-sse/utils/usageTracking.js` for `canonicalizeUsage`.
  - Proof: `git show c3bae6d9 -- open-sse/utils/usageTracking.js`
- [x] 1.3 Implement `mergeClientUsage` in `open-sse/utils/stream.js` to preserve `prompt_tokens_details.cached_tokens` on finish chunks.
  - Proof: `git show c3bae6d9 -- open-sse/utils/stream.js`
- [x] 1.4 Enhance `tests/unit/cached-token-e2e.test.js` with stream-seam E2E tests and Windows SQLite handle closing.
  - Proof: `npx.cmd vitest run unit/cached-token-e2e.test.js`

## 2. Verification & Regression Testing
- [x] 2.1 Run full cached token E2E suite and golden response stream snapshots.
  - Proof: `npx.cmd vitest run unit/cached-token-e2e.test.js translator/golden-response-stream.test.js` (15/15 passed)
- [x] 2.2 Verify baseline invariants across providers, aliases, and OAuth URLs.
  - Proof: `node tests/__baseline__/verify-alias.mjs && node tests/__baseline__/verify-oauth-urls.mjs && node tests/__baseline__/verify-providers.mjs`

## 3. Production Deployment & Data Hygiene
- [x] 3.1 Deploy commit `c3bae6d9` to container `9router` on Intel NUC (`192.168.100.110:20128`).
  - Proof: NUC `docker inspect 9router` confirms commit `c3bae6d9` and HTTP 200 on `/v1/models`.
- [x] 3.2 Back up NUC SQLite database and recalculate double-folded historical Claude records in `usageHistory` and `usageDaily`.
  - Proof: Backup created at `9router_backup_20261028_160128.sqlite`; 13,101 rows recalculated; sample row `id=1009040` prompt reduced from 460,936 to 230,469 tokens.
- [x] 3.3 Set `stickyRoundRobinLimit: 50` for `antigravity` and `codex` in NUC `settings` table.
  - Proof: NUC `settings` table confirms limit 50; verified reduced account switching frequency (from 57/58 switches down to 11 switches in 31 requests).

## 4. Upstream Contribution
- [x] 4.1 Push clean upstream branch `contrib/fix-claude-cached-tokens-double-fold` (commit `72828b3d`) directly rebased on `upstream/master`.
  - Proof: `git ls-remote origin contrib/fix-claude-cached-tokens-double-fold`
- [x] 4.2 Open Pull Request #5292 on upstream repository `decolua/9router`.
  - Proof: `gh pr view 5292 --repo decolua/9router` (Status: OPEN, URL: https://github.com/decolua/9router/pull/5292)
