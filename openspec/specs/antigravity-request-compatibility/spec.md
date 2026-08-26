## Purpose

Defines how 9Router makes Antigravity-bound semantic identity compatible with upstream admission policy while preserving all unrelated request meaning, structure, privacy, and provider isolation.

## Requirements

### Requirement: Exact known attribution neutralization
9Router SHALL neutralize only literal occurrences of known competitive provider/creator attribution in text parts of an Antigravity-bound `systemInstruction`. The known Hermes/Nous attribution `You are Hermes Agent, an intelligent AI assistant created by Nous Research.` SHALL become `You are an intelligent AI assistant.` The known Claude/Anthropic attribution `You are a Claude agent, built on Anthropic's Claude Agent SDK.` SHALL retain its existing effective behavior by being removed.

#### Scenario: Hermes and Nous attribution is neutralized
- **WHEN** an Antigravity-bound text part contains the exact known Hermes/Nous attribution
- **THEN** 9Router replaces only that literal attribution with `You are an intelligent AI assistant.`

#### Scenario: Existing Claude and Anthropic compatibility is retained
- **WHEN** an Antigravity-bound text part contains the exact known Claude/Anthropic attribution
- **THEN** 9Router removes only that literal attribution as the existing compatibility behavior does

#### Scenario: Similar or unrelated brand text is preserved
- **WHEN** a text part mentions Hermes, Nous, Claude, or Anthropic without containing either complete known attribution
- **THEN** 9Router leaves that text unchanged

### Requirement: Instruction content and structure preservation
9Router SHALL preserve every byte of text outside a matched attribution and SHALL preserve the order and boundaries of `systemInstruction.parts`, including all non-text parts. It SHALL NOT flatten, replace wholesale, or discard the system instruction, behavioral instructions, safety or governance rules, memory, project context, or tool policy.

#### Scenario: Behavioral suffix is preserved
- **WHEN** a matched attribution is followed by behavioral instruction text in the same part
- **THEN** the output contains the selected neutralization followed by the original remaining text byte-for-byte

#### Scenario: Multipart instruction remains multipart
- **WHEN** a system instruction contains multiple text parts and one or more matches
- **THEN** 9Router transforms only matching text values while preserving part count, order, boundaries, and all unmatched text

#### Scenario: Non-text parts are retained
- **WHEN** a system instruction contains non-text fields or parts alongside a matching text part
- **THEN** the non-text content remains unchanged in the transformed request

### Requirement: Deterministic, idempotent, and fail-safe behavior
For the same input and compatibility policy, neutralization SHALL produce the same output, applying it repeatedly SHALL not change an already-neutralized result, and missing or malformed `systemInstruction` data SHALL be a non-throwing no-op.

#### Scenario: Repeated transformation is stable
- **WHEN** the neutralization is applied twice to the same Antigravity instruction
- **THEN** the second result is semantically and structurally identical to the first result

#### Scenario: Unmatched instruction is a no-op
- **WHEN** an Antigravity system instruction contains no complete known attribution
- **THEN** its text and structure remain unchanged

#### Scenario: Missing or malformed instruction does not fail the request
- **WHEN** `systemInstruction`, `parts`, or an individual text value is absent or has an unexpected type
- **THEN** 9Router does not throw and leaves that value unchanged

### Requirement: Caller input immutability and envelope integrity
The Antigravity compatibility transformation SHALL NOT mutate caller-owned input objects. Apart from targeted `systemInstruction.parts[].text` output and existing documented Antigravity normalization, the transformed request SHALL preserve contents, tools, tool configuration, generation configuration, safety handling, session identifiers, request identifiers, model, project, account context, request type, and envelope metadata.

#### Scenario: Input request remains unchanged
- **WHEN** 9Router transforms a caller-owned request containing a known attribution
- **THEN** a deep snapshot of the input taken before transformation remains equal to the input after transformation

#### Scenario: Unrelated Antigravity fields remain equivalent
- **WHEN** the output is compared with the same request processed without a matching attribution
- **THEN** only the targeted text differs and all unrelated output fields remain equivalent

### Requirement: Antigravity-only isolation
Semantic-identity compatibility neutralization SHALL run only for requests dispatched through the Antigravity executor path and SHALL NOT alter requests sent to any other provider.

#### Scenario: Antigravity route applies compatibility policy
- **WHEN** a matching request is dispatched to Antigravity
- **THEN** the outbound Antigravity system-instruction text is neutralized before the upstream call

#### Scenario: Non-Antigravity route is unaffected
- **WHEN** the same matching request is dispatched to another provider
- **THEN** 9Router forwards it according to that provider's existing behavior without this neutralization

### Requirement: Narrow allowlisted policy
The set of source attributions and replacements SHALL be an explicit provider compatibility policy outside executor control flow. Matching SHALL be literal and case-sensitive; 9Router SHALL NOT use broad brand-removal regular expressions or replace the complete system instruction.

#### Scenario: Case or punctuation variation does not match
- **WHEN** an instruction differs from a known attribution by case, punctuation, or wording
- **THEN** the compatibility policy does not neutralize it

#### Scenario: Policy expansion is explicit
- **WHEN** support for another attribution is required
- **THEN** it is added as a discrete source-and-replacement policy entry with focused regression coverage

### Requirement: Prompt and credential confidentiality
The compatibility path SHALL NOT log complete system instructions, prompt fragments, credentials, access tokens, refresh tokens, private project context, or memory content.

#### Scenario: Compatibility processing completes without sensitive logging
- **WHEN** a request is neutralized, skipped, or rejected downstream
- **THEN** compatibility-related logs contain no prompt text or credential material

### Requirement: Verification and production-fix boundary
The change SHALL have focused automated coverage for exact Hermes/Nous and Claude/Anthropic handling, preservation, multipart and non-text structure, malformed input, no-op behavior, idempotency, caller immutability, envelope integrity, and non-Antigravity isolation. A deployment SHALL NOT be classified as a production fix until authorized live verification confirms the rebuilt and restarted service succeeds on the intended Antigravity model and account without primary-turn admission rejection or fallback.

#### Scenario: Focused and regression checks pass before deployment
- **WHEN** the implementation is prepared for release
- **THEN** focused Antigravity tests, existing Claude compatibility tests, and the repository no-regression baseline complete without a new regression

#### Scenario: Authorized live verification proves runtime behavior
- **WHEN** the rebuilt change is deployed and the 9Router service is restarted with authorization
- **THEN** at least three fresh strict Agent4070 Hermes turns return the intended Gemini model through the intended Antigravity account, show the expected live request fingerprint, produce no primary `RESOURCE_EXHAUSTED`, and activate no fallback

#### Scenario: Auxiliary traffic is evaluated separately
- **WHEN** live verification also emits title, memory, or other auxiliary JSON requests
- **THEN** those requests are classified separately from the strict primary turns and do not substitute for primary-turn evidence
