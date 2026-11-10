## Purpose

Define when the gateway releases a peeked combo stream to the client, how stream watchdog budgets are resolved per provider, and which terminal error a client receives when a stream watchdog fires, so slow reasoning models are not delayed or aborted by gateway-side timers.

## ADDED Requirements

### Requirement: Reasoning Frames Release the Combo Stream Peek
The combo empty-content peek SHALL commit a candidate and release its buffered head as soon as one complete client-format SSE frame carries non-empty reasoning: OpenAI `reasoning_content`, `reasoning` or `reasoning_details`; Anthropic `thinking_delta`; or a Responses reasoning text delta. It SHALL NOT wait for `EMPTY_PEEK_DEADLINE_MS`. Reasoning is a progress signal, not content.

#### Scenario: OpenAI-format reasoning frame releases the peek immediately
- **GIVEN** a combo seat whose stream emits a role frame and then a frame with `delta.reasoning_content` "thinking"
- **AND** the peek deadline is 45000 ms
- **WHEN** the peek reads the reasoning frame
- **THEN** the peek SHALL return outcome `content` with trigger `reasoning` and `timedOut` false
- **AND** the peek SHALL return before the deadline

#### Scenario: Anthropic-format thinking delta releases the peek
- **GIVEN** a client on `/v1/messages`
- **WHEN** the peek reads a `content_block_delta` event with delta type `thinking_delta` and non-empty `thinking`
- **THEN** the peek SHALL return outcome `content` with trigger `reasoning`

#### Scenario: Responses-format reasoning delta releases the peek
- **GIVEN** a client on `/v1/responses`
- **WHEN** the peek reads a `response.reasoning_summary_text.delta` or `response.reasoning_text.delta` event with a non-empty `delta`
- **THEN** the peek SHALL return outcome `content` with trigger `reasoning`

#### Scenario: Empty reasoning and role-only frames do not release the peek
- **GIVEN** a stream that emits a role frame and a frame with `delta.reasoning_content` ""
- **WHEN** the peek scans those frames
- **THEN** the peek SHALL keep reading and SHALL NOT report trigger `reasoning`

#### Scenario: Reasoning is still not classified as content
- **GIVEN** a delta payload containing only reasoning data `{ reasoning_content: "x" }`
- **WHEN** `deltaHasClientContent` is called with the delta payload
- **THEN** it SHALL return false

### Requirement: Terminal Empty Failover Is Preserved
A stream that ends with neither content nor reasoning SHALL still be judged empty, and a non-final combo seat SHALL still fall through to the next seat. A content-filter empty finish SHALL still not be retried. A stream that emits nothing before the deadline SHALL still be committed fail-open with `timedOut` true.

#### Scenario: Empty stop on a non-final seat falls through
- **GIVEN** a combo of two seats
- **AND** the first seat streams a role frame and a stop frame with empty delta
- **WHEN** the combo handles the request
- **THEN** the second seat SHALL be invoked
- **AND** the client SHALL receive only the second seat's content

#### Scenario: Content-filter empty finish is not retried
- **GIVEN** a combo of two seats
- **AND** the first seat ends empty with finish reason `content_filter`
- **WHEN** the combo handles the request
- **THEN** only the first seat SHALL be invoked

#### Scenario: Silent upstream is committed at the deadline
- **GIVEN** a seat that emits no frame within the peek deadline
- **WHEN** the deadline elapses
- **THEN** the peek SHALL return outcome `content` with trigger `deadline` and `timedOut` true
- **AND** the pending read SHALL be replayed to the client without loss

### Requirement: Reasoning-Only Seat Is Committed
When a combo seat streams reasoning and then ends without content, the gateway SHALL deliver that seat's stream to the client and SHALL NOT invoke the next seat, because reasoning bytes have already been released and two seats' streams SHALL never be concatenated into one client response.

#### Scenario: Think-then-abort seat is not retried
- **GIVEN** a combo of two seats
- **AND** the first seat streams a role frame, a reasoning frame and a stop frame with no content
- **WHEN** the combo handles the request
- **THEN** only the first seat SHALL be invoked
- **AND** the client stream SHALL contain the first seat's reasoning and SHALL NOT contain any frame from the second seat

### Requirement: Antigravity Stream Watchdog Budget
The resolved provider config `PROVIDERS.antigravity.stallTimeoutMs` SHALL equal 600000, and the chat streaming path SHALL arm the stream watchdog with that value for antigravity. A provider without a registry `stallTimeoutMs` SHALL keep `STREAM_STALL_TIMEOUT_MS` (default 360000). Existing registry values SHALL be unchanged.

#### Scenario: Antigravity stream receives the 600 s budget
- **GIVEN** a streaming chat request routed to provider `antigravity`
- **WHEN** the streaming handler pipes the upstream response
- **THEN** the stream watchdog SHALL be armed with 600000 ms

#### Scenario: Provider without a registry budget keeps the global default
- **GIVEN** a streaming chat request routed to a provider with no registry `stallTimeoutMs`
- **AND** the environment does not set `STREAM_STALL_TIMEOUT_MS`
- **WHEN** the streaming handler pipes the upstream response
- **THEN** the stream watchdog SHALL be armed with 360000 ms

#### Scenario: Existing provider budgets are unchanged
- **GIVEN** the configured provider registry for `qoder` and `qoder-cn`
- **WHEN** the resolved provider config is read for those providers
- **THEN** each `stallTimeoutMs` SHALL equal 120000

### Requirement: Phase-Labelled Stream Watchdog Abort
The stream watchdog SHALL use one budget for both phases. If it fires before any upstream byte arrived, the abort reason SHALL be `stream first-chunk timeout`; after at least one byte, `stream stall timeout`. The client SHALL receive the existing HTTP 504 terminal frame for its format carrying that reason, and the error log line SHALL carry it too.

#### Scenario: Watchdog fires before the first upstream byte
- **GIVEN** an upstream body that emits no bytes
- **AND** a watchdog budget of 50 ms
- **WHEN** 50 ms elapse
- **THEN** the abort terminal callback SHALL receive `stream first-chunk timeout`
- **AND** the client stream SHALL contain an error frame with that message followed by `data: [DONE]`

#### Scenario: Watchdog fires after the stream started
- **GIVEN** an upstream body that emits one chunk and then goes silent
- **AND** a watchdog budget of 50 ms
- **WHEN** 50 ms elapse after that chunk
- **THEN** the abort terminal callback SHALL receive `stream stall timeout`

#### Scenario: Each upstream chunk re-arms the budget
- **GIVEN** an upstream body that emits a chunk every 30 ms for 300 ms and then ends
- **AND** a watchdog budget of 50 ms
- **WHEN** the stream is consumed
- **THEN** the watchdog SHALL NOT fire and the stream SHALL complete normally

### Requirement: First-Chunk Constant Scope Is Explicit
`STREAM_FIRST_CHUNK_TIMEOUT_MS` SHALL NOT be applied to the chat streaming watchdog. Its declaration in `runtimeConfig.js` SHALL state that it is consumed only by the Kiro executor and that chat streaming uses the provider stall budget. Setting the environment variable SHALL NOT change chat streaming timing.

#### Scenario: Environment override does not shorten chat streaming
- **GIVEN** `STREAM_FIRST_CHUNK_TIMEOUT_MS` is set to 1000 in the environment
- **AND** a streaming chat request routed to provider `antigravity`
- **WHEN** the streaming handler pipes the upstream response
- **THEN** the stream watchdog SHALL be armed with 600000 ms
