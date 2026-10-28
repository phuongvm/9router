## Purpose
Define strict behavioral requirements for normalizing, aggregating, and persisting cached token metrics across streaming translators and client SSE events.

## Requirements

### Requirement: Single-Fold Streaming Token Accounting
The `claudeToOpenAIResponse` translator and `canonicalizeUsage` utility SHALL persist prompt tokens that include cached tokens exactly once, and SHALL NOT double-count `cache_read_input_tokens` or `cache_creation_input_tokens` into `prompt_tokens`.

#### Scenario: Streaming Claude turn with cache read and cache creation
- **WHEN** a Claude streaming completion arrives with `input_tokens: 2`, `cache_read_input_tokens: 229469`, and `cache_creation_input_tokens: 998`
- **THEN** `state.usage` SHALL contain `prompt_tokens: 230469`, `cached_tokens: 229469`, and `cache_creation_input_tokens: 998`
- **AND** `canonicalizeUsage(state.usage)` SHALL return `prompt_tokens: 230469` without adding cache tokens a second time
- **AND** the recorded cache ratio SHALL reflect the true cache-read percentage above 99%.

### Requirement: Preservation of Client-Facing Cache Metadata on SSE Streams
The `createSSEStream` transform handler SHALL preserve `prompt_tokens_details` including `cached_tokens` and `cache_creation_tokens` in the finish chunk sent to OpenAI-compatible clients.

#### Scenario: Emitting terminal SSE chunk to OpenAI-format client
- **WHEN** a streaming response finishes and usage accounting is finalized
- **THEN** the usage object on the terminal chunk SHALL contain `prompt_tokens` with context buffer applied
- **AND** SHALL retain nested `prompt_tokens_details.cached_tokens` and `prompt_tokens_details.cache_creation_tokens`
- **AND** SHALL NOT strip cache details when applying client format filtering.

### Requirement: Windows-Compatible Database Test Cleanup
The `cached-token-e2e.test.js` test suite SHALL cleanly close database connections prior to temporary directory removal.

#### Scenario: Cleaning up test directory in Windows environment
- **WHEN** vitest finishes executing test cases in `tests/unit/cached-token-e2e.test.js`
- **THEN** all open SQLite adapter instances SHALL be closed in `afterAll`
- **AND** `fs.rmSync` SHALL remove temporary directories without encountering EBUSY resource locking errors.
