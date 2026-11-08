# systemone-usage-logs Specification

## Purpose

Defines token usage normalization, serving-provider provenance attribution, and SQLite `usageHistory` / `requestDetails` metadata persistence for `/v1/systemone` and Smart Router System One requests.

## Requirements

### Requirement: Usage Token Normalization in Core Handler
The `handleSystemoneCore` function SHALL return a normalized `usage` object containing `prompt_tokens`, `completion_tokens`, and `total_tokens`, and SHALL return `responseBody` with the parsed provider JSON response.

#### Scenario: Normalizing token usage from Laya provider
- **WHEN** a System One request is processed by `handleSystemoneCore` targeting a provider that reports `input_tokens` and `output_tokens`
- **THEN** the returned `usage` contains `prompt_tokens` equal to `input_tokens` and `completion_tokens` equal to `output_tokens`
- **AND** `total_tokens` is the sum of both values.

### Requirement: Comprehensive Usage and Detail Persistence
The `handleSystemone` function SHALL persist usage metrics via `saveRequestUsage` and request metadata via `saveRequestDetail` for all successful System One requests, recording the actual serving provider and model alongside failover provenance metadata when failover occurs.

#### Scenario: Storing usage and detail for noAuth System One provider
- **WHEN** a client executes a System One evaluation targeting an unauthenticated local provider such as Laya or Ollaya and the local provider responds directly
- **THEN** 9Router calls `saveRequestUsage` with `provider` and `model` matching the local provider, the normalized `tokens` object, `status: "success"`, and `meta: { servedBy: "<provider>/<model>", failover: false }`
- **AND** calls `saveRequestDetail` with latency, request payload, response data, `meta`, and `status: "success"`
- **AND** the evaluation is visible in recent requests analytics.

#### Scenario: Recording actual serving provider when local System One fails over to cloud
- **WHEN** a client executes `POST /v1/systemone` targeting `ollaya/pplx-decider:flash-fp16` or `laya/laya-auto`, the local endpoint fails or times out, and `opencode-zen/jev-1.13-free` serves the HTTP 200 response
- **THEN** 9Router calls `saveRequestUsage` and `saveRequestDetail` with `provider: "opencode-zen"`, `model: "jev-1.13-free"`, `status: "success"`, and `meta` containing `servedBy: "opencode-zen/jev-1.13-free"`, `failover: true`, `requestedProvider`, `requestedModel`, and `failoverReason`
- **AND** daily provider/model aggregations in `usageDaily` attribute the request to `opencode-zen` / `jev-1.13-free` rather than `ollaya` or `laya`.

### Requirement: Resilient Token Ingestion in Database Repository
The `saveRequestUsage` and `getUsageStats` functions in `usageRepo.js` SHALL defensively preserve token counts and SHALL NOT discard recent requests that contain a valid model identifier.

#### Scenario: Querying recent requests including System One decisions
- **WHEN** the dashboard queries recent requests via `/api/usage/stats` or `/api/usage/stream`
- **THEN** requests with a valid `model` identifier are included in `recentRequests` even if output tokens are zero.

### Requirement: Usage History and Request Details Metadata Persistence
The usage and request-details repositories SHALL persist caller-provided object metadata in `usageHistory.meta` and `requestDetails.data` and SHALL return parsed `meta` objects when querying `getUsageHistory` and `getRequestDetails`.

#### Scenario: Saving and reading failover metadata in usageHistory
- **WHEN** `saveRequestUsage` is invoked with `meta: { servedBy: "opencode-zen/jev-1.13-free", failover: true, requestedProvider: "ollaya", requestedModel: "pplx-decider:flash-fp16" }`
- **THEN** `usageHistory.meta` stores the serialized JSON object rather than `{}`
- **AND** `getUsageHistory` returns the parsed `meta` object on the corresponding record.

#### Scenario: Saving and reading failover metadata in requestDetails
- **WHEN** observability is enabled and `saveRequestDetail` is invoked with `meta: { servedBy: "opencode-zen/jev-1.13-free", failover: true, requestedProvider: "ollaya", requestedModel: "pplx-decider:flash-fp16", failoverReason: "timed out after 5000ms at http://192.168.100.130:11435/v1/systemone" }` and flushed to SQLite
- **THEN** `getRequestDetails` returns the persisted record with `details[0].meta` equal to the supplied failover metadata object.
