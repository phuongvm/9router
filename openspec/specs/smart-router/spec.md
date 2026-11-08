# smart-router Specification

## Purpose

Provides intelligent model selection for combo requests using System One decision models while maximizing upstream prompt-cache retention through session stickiness.

## Requirements

### Requirement: NoAuth Provider Dispatch in Smart Router
The `resolveSmartChoice` dispatcher SHALL support unauthenticated local decision engines (`noAuth: true` or `authType: "none"`) without requiring stored credentials in the local database.

#### Scenario: Dispatching router choice to Ollaya
- **WHEN** a combo request evaluates Smart Router targeting `ollaya/pplx-decider:flash-fp16`
- **THEN** `resolveSmartChoice` forwards the choice query to `handleSystemoneCore` with `credentials: null`
- **AND** does not log a missing credentials warning or abort evaluation.

### Requirement: Smart Router Telemetry and Detail Logging
The Smart Router evaluation process SHALL persist request usage metrics via `saveRequestUsage` and structured execution details via `saveRequestDetail` for each completed routing evaluation, attributing `provider`, `model`, and `meta` to the actual System One engine that served the response.

#### Scenario: Recording decision telemetry for recent requests
- **WHEN** `resolveSmartChoice` receives a valid route decision from a System One engine
- **THEN** 9Router records the evaluation tokens, latency, prompt state, and decision response
- **AND** the evaluation is visible in recent request analytics under endpoint `/internal/smart-router`.

#### Scenario: Attributing Smart Router telemetry on local-to-cloud failover
- **WHEN** `resolveSmartChoice` evaluates `ollaya/pplx-decider:flash-fp16`, local Ollaya fails or times out within 5,000ms, and `opencode-zen/jev-1.13-free` returns a valid route decision within the remaining evaluation budget
- **THEN** `resolveSmartChoice` calls `saveRequestUsage` and `saveRequestDetail` with `provider: "opencode-zen"`, `model: "jev-1.13-free"`, `endpoint: "/internal/smart-router"`, `status: "success"`, and `meta` containing `servedBy: "opencode-zen/jev-1.13-free"`, `failover: true`, `requestedProvider: "ollaya"`, and `requestedModel: "pplx-decider:flash-fp16"`.

### Requirement: Surface Local Decision Engines in UI Router Picker
The `ModelSelectModal` component SHALL include all registered System One decision engines with `noAuth: true` when `kindFilter="systemone"` is active.

#### Scenario: Opening System One Router Model modal
- **WHEN** a user opens the Router Model selector on the Combos page
- **THEN** `ollaya` and `laya` decision models appear in the available model list
- **AND** the models are selectable as the combo's `routerModel`.

### Requirement: Resilient Multi-Format Prompt State Extraction
The `extractPromptState` function SHALL extract prompt text across standard chat messages, OpenAI Responses API inputs, and Gemini native contents.

#### Scenario: Extracting state from Codex Responses input
- **WHEN** a request arrives in OpenAI Responses API format with user content block `{ type: "input_text", text: "Fix this race condition" }`
- **THEN** `extractPromptState` extracts `"Fix this race condition"`
- **AND** does not return an empty prompt state.

#### Scenario: Extracting state from Gemini native parts
- **WHEN** a request arrives in Gemini format with `contents: [{ role: "user", parts: [{ text: "Explain Raft" }] }]`
- **THEN** `extractPromptState` extracts `"Explain Raft"`
- **AND** limits the extracted length to `MAX_STATE_CHARS`.

### Requirement: Auto-Enriched Choice Criteria
The `buildChoiceCriteria` function SHALL enrich candidate model criteria with display names and capability metadata from the 9Router registry.

#### Scenario: Generating criteria for combo models
- **WHEN** `buildChoiceCriteria` receives candidate model IDs including provider prefixes
- **THEN** each criterion description contains the model name and key capabilities (such as reasoning, vision, and context window)
- **AND** the decision engine evaluates the candidates with calibrated confidence above zero.

### Requirement: Modality Pre-Filtering Before Smart Router
The `handleComboChat` handler SHALL filter candidate models by hard request modalities before evaluating Smart Router.

#### Scenario: Handling multimodal requests in smart combo
- **WHEN** a request requires an unsupported modality for text-only models (such as image input)
- **THEN** candidate models lacking that modality are excluded from the choice criteria
- **AND** the resulting sticky session model satisfies the required modality.

### Requirement: Turn-One Decision Acceptance Without Hysteresis
The `handleComboChat` handler SHALL accept the top System One choice on Turn 1 and SHALL NOT apply the Turn-2 cache-switching threshold when no sticky model exists.

#### Scenario: Initial turn model selection
- **WHEN** a new conversation session arrives at a smart combo without an active sticky model
- **THEN** the model with the highest probability is selected and locked for the session
- **AND** evaluation does not fall back to static order due to switch hysteresis.

### Requirement: Bounded Cancellation Propagation in Smart Router
When a Smart Router evaluation reaches its timeout ceiling or the parent chat request disconnects, 9Router SHALL immediately abort the in-flight System One evaluation via `AbortSignal` without leaving background upstream requests open or triggering post-timeout failovers.

#### Scenario: Cancelling stalled System One evaluation at router timeout ceiling
- **WHEN** `resolveSmartChoice` reaches `timeoutMs` (8,000ms default, or a custom test ceiling shorter than the local timeout) before System One responds
- **THEN** `resolveSmartChoice` aborts the `AbortController` signal passed to `handleSystemoneCore`, logs `smart-router: evaluation aborted`, and returns `null` so combo chat falls back to static model order
- **AND** no background `fetch` remains pending and no post-timeout failover to `opencode-zen/jev-1.13-free` is executed.

#### Scenario: Live cloud failover completing within Smart Router budget
- **WHEN** `resolveSmartChoice` dispatches to `ollaya/pplx-decider:flash-fp16` with `DEFAULT_SYSTEMONE_TIMEOUT_MS` (8,000ms), local Ollaya times out at `SYSTEMONE_LOCAL_TIMEOUT_MS` (5,000ms), and `opencode-zen/jev-1.13-free` responds within the remaining 3,000ms window
- **THEN** `resolveSmartChoice` returns the parsed route decision from `opencode-zen/jev-1.13-free` without aborting the combo evaluation.
