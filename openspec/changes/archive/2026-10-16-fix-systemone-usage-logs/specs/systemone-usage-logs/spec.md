## ADDED Requirements

### Requirement: Usage Token Normalization in Core Handler
The `handleSystemoneCore` function SHALL return a normalized `usage` object containing `prompt_tokens`, `completion_tokens`, and `total_tokens`, and SHALL return `responseBody` with the parsed provider JSON response.

#### Scenario: Normalizing token usage from Laya provider
- **WHEN** a System One request is processed by `handleSystemoneCore` targeting a provider that reports `input_tokens` and `output_tokens`
- **THEN** the returned `usage` contains `prompt_tokens` equal to `input_tokens` and `completion_tokens` equal to `output_tokens`
- **AND** `total_tokens` is the sum of both values.

### Requirement: Comprehensive Usage and Detail Persistence
The `handleSystemone` function SHALL persist usage metrics via `saveRequestUsage` and request metadata via `saveRequestDetail` for all successful System One requests.

#### Scenario: Storing usage and detail for noAuth System One provider
- **WHEN** a client executes a System One evaluation targeting an unauthenticated local provider such as Laya
- **THEN** 9Router calls `saveRequestUsage` with the normalized `tokens` object and `status: "success"`
- **AND** calls `saveRequestDetail` with latency, request payload, response data, and status
- **AND** the evaluation is visible in recent requests analytics.

### Requirement: Resilient Token Ingestion in Database Repository
The `saveRequestUsage` and `getUsageStats` functions in `usageRepo.js` SHALL defensively preserve token counts and SHALL NOT discard recent requests that contain a valid model identifier.

#### Scenario: Querying recent requests including System One decisions
- **WHEN** the dashboard queries recent requests via `/api/usage/stats` or `/api/usage/stream`
- **THEN** requests with a valid `model` identifier are included in `recentRequests` even if output tokens are zero.
