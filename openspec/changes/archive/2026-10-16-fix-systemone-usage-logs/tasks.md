# Tasks: System One Request Logging Implementation

- [x] 1. Core Handler Normalization <!-- id: 1-core-handler -->
  - [x] 1.1 Update `open-sse/handlers/systemoneCore.js` to return `responseBody` and normalized `usage` object.
  - [x] 1.2 Verify `tests/unit/verify-laya-provider.mjs` assertions for `usage` and `responseBody`.

- [x] 2. Next.js SSE Handler Enhancement <!-- id: 2-handler-enhancement -->
  - [x] 2.1 Import `saveRequestDetail` in `src/sse/handlers/systemone.js`.
  - [x] 2.2 Wire up latency measurement and token normalization in `noAuth` branch.
  - [x] 2.3 Wire up `saveRequestUsage` and `saveRequestDetail` in `noAuth` branch.
  - [x] 2.4 Wire up `saveRequestDetail` in authenticated credential loop branch.

- [x] 3. Database Repository Resilience <!-- id: 3-repo-resilience -->
  - [x] 3.1 Defensive token synthesis in `saveRequestUsage` in `src/lib/db/repos/usageRepo.js`.
  - [x] 3.2 Update `recentRequests` mapper to read `promptTokens` from row fallback.
  - [x] 3.3 Relax zero-token filter for valid model requests.

- [x] 4. Verification and Deployment <!-- id: 4-verification-deployment -->
  - [x] 4.1 Run unit test suite `node tests/unit/verify-laya-provider.mjs`.
  - [x] 4.2 Validate OpenSpec change artifacts with `openspec validate --strict`.
  - [x] 4.3 Archive OpenSpec change and merge worktree into `master`.
  - [x] 4.4 Push to GitHub and deploy to Intel NUC (`intel_nuc`).
  - [x] 4.5 Backfill existing 23 Laya records in Intel NUC SQLite database.
  - [x] 4.6 Verify live System One request appears in `recentRequests` via API.
