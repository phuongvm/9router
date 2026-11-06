# smart-router Specification Delta

## MODIFIED Requirements

### Requirement: Smart Router Telemetry and Detail Logging
The Smart Router evaluation process SHALL persist request usage metrics via `saveRequestUsage` and structured execution details via `saveRequestDetail` for each completed routing evaluation, attributing `provider`, `model`, and `meta` to the actual System One engine that served the response.

#### Scenario: Recording decision telemetry for recent requests
- **WHEN** `resolveSmartChoice` receives a valid route decision from a System One engine
- **THEN** 9Router records the evaluation tokens, latency, prompt state, and decision response
- **AND** the evaluation is visible in recent request analytics under endpoint `/internal/smart-router`.

#### Scenario: Attributing Smart Router telemetry on local-to-cloud failover
- **WHEN** `resolveSmartChoice` evaluates `ollaya/pplx-decider:flash-fp16`, local Ollaya fails or times out within 5,000ms, and `opencode-zen/jev-1.13-free` returns a valid route decision within the remaining evaluation budget
- **THEN** `resolveSmartChoice` calls `saveRequestUsage` and `saveRequestDetail` with `provider: "opencode-zen"`, `model: "jev-1.13-free"`, `endpoint: "/internal/smart-router"`, `status: "success"`, and `meta` containing `servedBy: "opencode-zen/jev-1.13-free"`, `failover: true`, `requestedProvider: "ollaya"`, and `requestedModel: "pplx-decider:flash-fp16"`.

## ADDED Requirements

### Requirement: Bounded Cancellation Propagation in Smart Router
When a Smart Router evaluation reaches its timeout ceiling or the parent chat request disconnects, 9Router SHALL immediately abort the in-flight System One evaluation via `AbortSignal` without leaving background upstream requests open or triggering post-timeout failovers.

#### Scenario: Cancelling stalled System One evaluation at router timeout ceiling
- **WHEN** `resolveSmartChoice` reaches `timeoutMs` (8,000ms default, or a custom test ceiling shorter than the local timeout) before System One responds
- **THEN** `resolveSmartChoice` aborts the `AbortController` signal passed to `handleSystemoneCore`, logs `smart-router: evaluation aborted`, and returns `null` so combo chat falls back to static model order
- **AND** no background `fetch` remains pending and no post-timeout failover to `opencode-zen/jev-1.13-free` is executed.

#### Scenario: Live cloud failover completing within Smart Router budget
- **WHEN** `resolveSmartChoice` dispatches to `ollaya/pplx-decider:flash-fp16` with `DEFAULT_SYSTEMONE_TIMEOUT_MS` (8,000ms), local Ollaya times out at `SYSTEMONE_LOCAL_TIMEOUT_MS` (5,000ms), and `opencode-zen/jev-1.13-free` responds within the remaining 3,000ms window
- **THEN** `resolveSmartChoice` returns the parsed route decision from `opencode-zen/jev-1.13-free` without aborting the combo evaluation.
