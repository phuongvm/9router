## Context

See `proposal.md` for motivation and `specs/antigravity-request-compatibility/spec.md` for the behavior contract. The OpenAI-to-Gemini translator places client system messages into `request.systemInstruction.parts[].text`. `AntigravityExecutor.transformRequest` then normalizes the provider request and currently removes one hardcoded Claude/Anthropic sentence by mutating nested part text through a shallow request copy. The adjacent A/B evidence proves the demonstrated Hermes/Nous opening is causal for that request shape; it does not justify general brand censorship or reclassifying every 429.

The design must follow `open-sse/AGENTS.md`: compatibility constants live under `open-sse/config/`, executor control flow remains provider-focused, and request translation preserves multipart structures. Existing Antigravity request normalization and Claude compatibility must continue.

## Goals / Non-Goals

**Goals:**
- Centralize exact Antigravity semantic-identity compatibility policy outside executor control flow.
- Apply a pure, deterministic, idempotent, copy-on-write transformation to `systemInstruction`.
- Preserve all unmatched text, part boundaries, non-text data, and unrelated envelope fields.
- Prevent the compatibility change from mutating caller-owned request data.
- Provide focused automated evidence and a distinct authorized production-runtime gate.

**Non-Goals:**
- Changing Hermes identity assembly, user profiles, or `SOUL.md`.
- General prompt censorship, fuzzy matching, case folding, arbitrary brand removal, or complete prompt replacement.
- Reclassifying Antigravity 429 responses or changing retry, backoff, account selection, quota rotation, OAuth, or fallback behavior.
- Changing translator behavior or any non-Antigravity executor.
- Deploying, restarting, or making live provider calls during proposal or implementation without separate authorization.

## Decisions

### 1. Invoke a provider-local helper from the Antigravity executor

The standard non-image Antigravity path will call a dedicated pure helper after provider-format translation has produced `systemInstruction` and before the outbound `transformedRequest` is assembled. The executor remains the ownership boundary because the compatibility rule is an Antigravity admission concern, while the helper keeps text policy and traversal out of executor control flow.

Alternative rejected: changing the OpenAI-to-Gemini translator would affect other Gemini-format providers. Changing Hermes globally would not protect other 9Router clients and would couple Hermes identity to an undocumented provider policy.

### 2. Store a frozen literal replacement table in Antigravity configuration

Create an Antigravity-specific configuration module under `open-sse/config/` that exports ordered, immutable source/replacement entries:

- `You are Hermes Agent, an intelligent AI assistant created by Nous Research.` → `You are an intelligent AI assistant.`
- `You are a Claude agent, built on Anthropic's Claude Agent SDK.` → an empty string, preserving current behavior.

Matching is literal and case-sensitive. Each complete source occurrence in a text part is replaced; no regex, normalization, tokenization, case folding, or brand dictionary is used. Policy order is fixed, and entries are non-overlapping, making output deterministic. Future entries require an explicit configuration addition and focused tests.

Alternatives rejected: broad regular expressions risk deleting ordinary project context; a single canonical replacement prompt destroys user intent; keeping literals inline in the executor violates the configuration convention and repeats the current design debt.

### 3. Use structural copy-on-write for system instructions

Create a helper under `open-sse/utils/` with a contract equivalent to `sanitizeAntigravitySystemInstruction(systemInstruction, replacements)`. It will:

1. Return the original value for absent/malformed instructions or non-array `parts`.
2. Inspect only parts whose `text` is a string.
3. Apply the ordered literal table to each text independently.
4. Return the original object when no text changes.
5. When a match occurs, clone only changed part objects, the parts array, and the containing system-instruction object; preserve all other properties and non-text parts.

The neutral Hermes replacement contains none of the source attributions and the Claude replacement removes its source, so a second application is identical. No trimming, whitespace cleanup, joining, splitting of parts, or removal of empty part objects occurs.

Alternative rejected: deep-cloning the entire request on every call is simple but needlessly changes object identity and cost for large tool/prompt payloads. In-place edits violate the caller-immutability requirement.

### 4. Stop compatibility-path edits from mutating the caller body

Within `transformRequest`, perform top-level and `request` copy-on-write before any deletion or blacklist normalization used to construct the outbound Antigravity request. Feed the copied `systemInstruction` through the helper and assign its result only to the outbound request. Existing normalization results remain the same, but deletions and targeted text changes no longer alter caller-owned input.

Verification will deep-snapshot a representative input and compare it after transformation. A paired matched/unmatched fixture will assert that envelope metadata, contents, tools, generation configuration, IDs, model, project, and request type are equivalent except for targeted text.

Alternative rejected: limiting immutability to the helper while continuing to delete fields from the original top-level body would leave the stated caller-body guarantee incomplete.

### 5. Emit no compatibility prompt telemetry

The helper has no logger and returns no match text. The executor will not log source phrases, replacements, prompt fragments, or credentials. Existing operational logs may continue to report non-sensitive route/model/status metadata.

Alternative rejected: logging hashes or match identifiers adds observability but creates a new prompt-derived signal not required to solve or verify the issue.

### 6. Separate automated regression evidence from production verification

Add a focused unit suite for the helper and executor integration, while retaining existing Antigravity translator/retry suites. Run the focused Vitest files using the repository test configuration, then run the repository no-regression baseline rather than treating unrelated known failures as regressions.

After explicit deployment authorization, rebuild the serving artifact, restart the actual service, and run at least three fresh strict Agent4070 Hermes turns. Evidence must identify the intended Antigravity account/model, primary Gemini response, expected message/tool fingerprint, absence of primary `RESOURCE_EXHAUSTED`, and absence of fallback. Auxiliary title/memory/JSON traffic is recorded separately. Until this gate passes, report the result as locally verified, not production-fixed.

Alternative rejected: treating a source patch, unit test, or one live turn as sufficient would not prove the running image or repeatability.

### 7. Make execution ownership and completion phase-explicit

The local implementation worker owns tasks 1.1–3.4 (OpenSpec apply task IDs 1–12) and may hand off for independent implementation review when those twelve tasks are verified. That 12/16 state is a valid local implementation handoff, not completion of the OpenSpec change.

Independent implementation review gates all production work. After approval, the Intel NUC deployment worker owns task 4.1 (ID 13). Independent production QA owns tasks 4.2–4.4 (IDs 14–16). Tasks 13–16 remain in the checklist for end-to-end traceability, but they are post-review downstream acceptance tasks and are not coder-local apply acceptance.

The OpenSpec change remains in progress at 12/16 and SHALL NOT be archived or declared complete until tasks 13–16 have been independently executed, verified, and checked. Local code and test success is not production completion; deployment success alone is not a verified production fix.

Alternative rejected: assigning all sixteen tasks to the local implementation worker would either bypass independent review and deployment gates or force a false completion report while production work remains outstanding.

## Risks / Trade-offs

- [Upstream policy may change or reject a different phrase] → Keep a narrow explicit table, capture new causal A/B evidence, and add a separately reviewed entry rather than broadening matching.
- [Exact matching may miss harmless textual variations] → Accept false negatives by design; preserving user content is safer than fuzzy censorship.
- [An empty Claude replacement can leave an empty text part] → Preserve the current effective behavior and multipart structure; do not remove or coalesce parts in this change.
- [Copy-on-write refactoring could alter existing normalization] → Use paired fixtures and existing Antigravity translator/executor tests to compare every unrelated output field.
- [Live verification may encounter real quota or unrelated transient failures] → Record account/model/status evidence, classify auxiliary and transient traffic separately, and do not claim production success until three strict primary turns pass.
- [Policy literals are sensitive implementation knowledge] → Keep them in source configuration and tests only; never emit them in runtime logs.

## Migration Plan

1. Add the configuration-owned literal replacement table and pure copy-on-write helper.
2. Integrate the helper into the standard non-image Antigravity request path and remove the inline Claude rewrite while preserving its behavior.
3. Make the affected transform path operate on copies rather than deleting or rewriting caller-owned input.
4. Add and run focused helper/executor tests, existing Antigravity regression tests, and the repository no-regression baseline.
5. Review the output diff to confirm only Antigravity compatibility code, configuration, and tests changed.
6. With separate authorization, rebuild the deployment image/artifact, restart the serving service, and execute the three-turn live verification protocol.
7. Roll back by restoring the prior deployed artifact and restarting the service if automated regression checks fail, admission failures increase, or unrelated Antigravity request fields change. The compatibility policy introduces no data migration or persistent-state change.
