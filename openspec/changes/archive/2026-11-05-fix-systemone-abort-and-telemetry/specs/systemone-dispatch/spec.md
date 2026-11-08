# systemone-dispatch Specification

## Purpose

Defines upstream request timeout bounds, caller cancellation propagation, failover suppression on caller abort, and serving-provider provenance for System One decision requests.

## ADDED Requirements

### Requirement: Dedicated Local System One Upstream Timeout
The System One core dispatcher SHALL enforce a dedicated local upstream timeout of 5,000ms by default (configurable via `SYSTEMONE_LOCAL_TIMEOUT_MS`) for local System One providers configured with cloud failover, while preserving the standard upstream connect timeout for cloud System One providers.

#### Scenario: Local Ollaya stalls and fails over within 5,000ms
- **WHEN** a System One request targets `ollaya/pplx-decider:flash-fp16` and the local Ollaya endpoint does not respond within `SYSTEMONE_LOCAL_TIMEOUT_MS` (5,000ms default) while the caller remains active
- **THEN** 9Router aborts the local Ollaya fetch at 5,000ms instead of waiting 60,000ms
- **AND** immediately dispatches the configured 1-hop failover request to `opencode-zen/jev-1.13-free`.

#### Scenario: Cloud System One provider retains standard connect timeout
- **WHEN** a System One request targets a cloud provider without a local failover entry (such as `opencode-zen/jev-1.13-free`)
- **THEN** 9Router bounds the upstream fetch by `FETCH_CONNECT_TIMEOUT_MS` (60,000ms default) composed with any active caller `AbortSignal`.

#### Scenario: Valid and invalid environment overrides for local timeout
- **WHEN** `resolveSystemoneLocalTimeoutMs` evaluates a positive integer string such as `"3500"`
- **THEN** it returns `3500`
- **AND** when it evaluates `""`, `"0"`, `"-500"`, `"abc"`, or `undefined`, it falls back to `5000`.

### Requirement: Caller Cancellation Propagation and Zombie Failover Suppression
The System One core dispatcher and HTTP endpoint handler SHALL propagate caller `AbortSignal` cancellation to in-flight primary and failover upstream requests, SHALL suppress automatic failover and failover warnings when the caller has already aborted, and SHALL NOT penalize provider account health on client disconnects.

#### Scenario: Caller aborts while local System One request is in flight
- **WHEN** a caller supplies an `AbortSignal` that aborts before the local `ollaya` or `laya` upstream fetch settles
- **THEN** 9Router immediately aborts the in-flight local upstream `fetch`
- **AND** does NOT invoke failover to `opencode-zen/jev-1.13-free`
- **AND** does NOT emit a `"Failing over to"` warning log.

#### Scenario: Caller aborts during an active cloud failover hop
- **WHEN** local `ollaya` fails at 5,000ms, 9Router initiates failover to `opencode-zen/jev-1.13-free`, and the caller's `AbortSignal` aborts before the cloud failover responds
- **THEN** 9Router immediately aborts the in-flight `opencode-zen` upstream `fetch` and returns an aborted result without hanging in the background.

#### Scenario: HTTP client disconnects on credentialed System One endpoint
- **WHEN** an HTTP client disconnects (`request.signal` aborts) during `POST /v1/systemone` against a credentialed System One provider
- **THEN** `handleSystemone` aborts the upstream request, returns HTTP 408 without logging a `"Failing over to"` warning, and exits without calling `markAccountUnavailable`.

### Requirement: Accurate Timeout Versus Unreachable Failover Diagnostics
When a local System One attempt fails while the caller is still waiting, the dispatcher SHALL distinguish per-attempt timeout expiration from network connection failures in operational failover warnings while preserving the target failover provider/model suffix.

#### Scenario: Logging local timeout expiration accurately
- **WHEN** a local `ollaya` request exceeds `SYSTEMONE_LOCAL_TIMEOUT_MS` while the caller has not aborted
- **THEN** 9Router logs a `SYSTEMONE` warning stating `Local Ollaya timed out after 5000ms at <url>. Failing over to opencode-zen/jev-1.13-free`.

#### Scenario: Logging local connection refusal accurately
- **WHEN** a local `ollaya` or `laya` request fails with `ECONNREFUSED` while the caller has not aborted
- **THEN** 9Router logs a `SYSTEMONE` warning stating `Local <Label> unreachable at <url> (<error>). Failing over to opencode-zen/jev-1.13-free`.

### Requirement: Serving Provider Provenance in Core Dispatch Result
Every successful System One dispatch result SHALL include structured `servedBy` provenance identifying the actual serving provider, serving model, boolean failover flag, and original failure context whenever failover occurred.

#### Scenario: Direct local System One success provenance
- **WHEN** `ollaya/pplx-decider:flash-fp16` responds with HTTP 200 and valid JSON without failing over
- **THEN** the core result contains `servedBy: { provider: "ollaya", model: "pplx-decider:flash-fp16", failover: false }`.

#### Scenario: Cloud failover System One success provenance
- **WHEN** `ollaya/pplx-decider:flash-fp16` fails over to `opencode-zen/jev-1.13-free` and the failover responds with HTTP 200 and valid JSON
- **THEN** the core result contains `servedBy` with `provider: "opencode-zen"`, `model: "jev-1.13-free"`, `failover: true`, and `failoverFrom: { provider: "ollaya", model: "pplx-decider:flash-fp16", reason: <string> }`.
