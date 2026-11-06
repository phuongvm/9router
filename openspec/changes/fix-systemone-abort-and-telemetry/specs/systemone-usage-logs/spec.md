# systemone-usage-logs Specification Delta

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Usage History and Request Details Metadata Persistence
The usage and request-details repositories SHALL persist caller-provided object metadata in `usageHistory.meta` and `requestDetails.data` and SHALL return parsed `meta` objects when querying `getUsageHistory` and `getRequestDetails`.

#### Scenario: Saving and reading failover metadata in usageHistory
- **WHEN** `saveRequestUsage` is invoked with `meta: { servedBy: "opencode-zen/jev-1.13-free", failover: true, requestedProvider: "ollaya", requestedModel: "pplx-decider:flash-fp16" }`
- **THEN** `usageHistory.meta` stores the serialized JSON object rather than `{}`
- **AND** `getUsageHistory` returns the parsed `meta` object on the corresponding record.

#### Scenario: Saving and reading failover metadata in requestDetails
- **WHEN** observability is enabled and `saveRequestDetail` is invoked with `meta: { servedBy: "opencode-zen/jev-1.13-free", failover: true, requestedProvider: "ollaya", requestedModel: "pplx-decider:flash-fp16", failoverReason: "timed out after 5000ms at http://192.168.100.130:11435/v1/systemone" }` and flushed to SQLite
- **THEN** `getRequestDetails` returns the persisted record with `details[0].meta` equal to the supplied failover metadata object.
