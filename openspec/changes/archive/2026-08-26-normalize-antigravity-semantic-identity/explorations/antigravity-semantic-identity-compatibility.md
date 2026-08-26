# Exploration: Antigravity Semantic Identity Compatibility

**Status:** Proposal-ready exploration
**Project:** 9router
**Date:** 2026-08-26
**Mode:** Explore only — no implementation performed

## Problem statement

9Router normalizes Antigravity transport identity (`User-Agent`, envelope `userAgent`, `requestType`, provider account/project), but forwards client-derived semantic identity in `request.systemInstruction`.

Google Antigravity rejects a primary Gemini stream when the instruction begins with the Hermes/Nous attribution:

```text
You are Hermes Agent, an intelligent AI assistant created by Nous Research.
```

The upstream response is `429 RESOURCE_EXHAUSTED`, after which 9Router locks the selected model/account briefly and Hermes falls back to another model. This response is an admission rejection for the demonstrated request, not ordinary numerical quota exhaustion.

## Causal evidence

A same-host, same-commit, same-CWD adjacent A/B test ran on Agent4070 with the same:

- Hermes home and source commit;
- model and 9Router provider route;
- Antigravity account;
- 2-message streaming shape;
- 46 tools;
- high reasoning;
- one-turn limit;
- `--ignore-rules` request assembly.

Only the opening semantic identity sentence changed.

| Arm | Semantic identity | Primary outcome |
|---|---|---|
| A | Hermes Agent, created by Nous Research | Antigravity 429 → fallback |
| B | Neutral intelligent AI assistant | Antigravity Gemini success |

Canonical session rows and 9Router logs independently confirmed the response model and upstream result. Earlier HTTP `User-Agent` controls did not change admission; semantic identity is a separate layer.

## Current request flow

```text
OpenAI-compatible client request
        |
        v
openai-to-gemini translator
  system message -> systemInstruction.parts[].text
        |
        v
AntigravityExecutor.transformRequest
  - schema cleanup
  - tool normalization
  - current one-string competitive prompt rewrite
        |
        v
Antigravity v1internal streamGenerateContent
```

Relevant code:

- `open-sse/translator/request/openai-to-gemini.js:102-106`
- `open-sse/executors/antigravity.js:245-258`
- `tests/translator/bugs-antigravity.test.js`
- `tests/unit/antigravity-retry-hook.test.js`

## Existing compatibility behavior

The Antigravity executor already documents this provider behavior and strips one exact Claude/Anthropic attribution:

```text
You are a Claude agent, built on Anthropic's Claude Agent SDK.
```

The implementation does not cover the demonstrated Hermes/Nous attribution. The problem is therefore an incomplete provider-specific compatibility policy, not a need to globally change Hermes identity assembly.

## Design constraints

1. Apply only to the Antigravity provider path.
2. Preserve behavioral instructions, governance, safety, memory, project context, and tool policy.
3. Neutralize only exact provider/creator attribution known to trigger admission rejection.
4. Do not use broad regexes that remove ordinary mentions of Hermes, Nous, Claude, or Anthropic elsewhere in the prompt.
5. Preserve non-text parts and multi-part `systemInstruction` structure.
6. Avoid mutating caller-owned nested request objects unexpectedly.
7. Keep compatibility phrases/config outside executor control flow, consistent with `open-sse/AGENTS.md` config-driven/no-hardcode convention.
8. Never log full prompts, credentials, tokens, or private context.
9. Do not alter non-Antigravity routes.

## Options considered

### Option A — Change Hermes global default identity

**Rejected.** It changes all providers, makes Hermes core dependent on an undocumented Antigravity policy, and does not protect other clients routed through 9Router.

### Option B — User-managed neutral `SOUL.md`

Useful as a temporary client-side workaround, but not a router fix. It is profile-specific, easy to regress under `--ignore-rules`, and fails to provide one canonical upstream policy for all clients.

### Option C — Narrow Antigravity compatibility sanitizer in 9Router

**Recommended.** Extend the existing executor-level behavior into a small tested compatibility concern/config:

```text
client semantic instruction
        |
        v
exact attribution replacement table
        |
        +-- known Claude attribution -> neutral/empty attribution
        +-- known Hermes/Nous attribution -> neutral attribution
        |
        v
preserved remainder of systemInstruction
```

The Hermes phrase should become a neutral opening sentence rather than deleting the whole instruction. Existing Claude behavior must remain compatible unless the proposal deliberately changes it and tests the change.

### Option D — Replace all system instructions with a canonical Antigravity prompt

**Rejected.** It destroys user intent, governance, safety, and tenant isolation, and risks prompt-cache contamination.

## Recommended design shape

Create a pure Antigravity semantic-identity compatibility helper and configuration-owned replacement table. The executor invokes it after provider-format translation and before outbound request construction.

Desired properties:

- pure or copy-on-write transformation;
- deterministic exact-string replacement;
- idempotent output;
- no changes when no known attribution occurs;
- no full-prompt logging;
- provider-local invocation only.

Illustrative contract (not implementation):

```text
sanitizeAntigravitySystemInstruction(systemInstruction)
  -> sanitized clone or original-equivalent value
```

## Required tests

### Unit tests

1. Hermes/Nous attribution is replaced with a neutral identity.
2. Existing Claude/Anthropic attribution remains sanitized.
3. Behavioral text after attribution is preserved byte-for-byte.
4. Unrelated mentions of Hermes/Nous remain unchanged.
5. Multiple text parts are handled without flattening.
6. Non-text parts remain unchanged.
7. Missing/malformed `systemInstruction` is a no-op and does not throw.
8. Transformation is idempotent.
9. Input object is not unexpectedly mutated.
10. Antigravity envelope metadata, tools, contents, generation config, and IDs remain unchanged apart from the targeted text.

### Regression verification

- Run the focused Antigravity translator/executor tests with Vitest.
- Run the repository no-regression baseline appropriate to this checkout.
- Confirm existing Claude compatibility behavior remains green.

### Runtime verification after an authorized deployment

Use the real Agent4070 Hermes route and verify at least three fresh strict turns:

- primary response model is Gemini, not fallback;
- 9Router logs show `STREAM · 2 MSG · 46 TOOL` (or the expected live fingerprint);
- intended Antigravity account/model succeeds;
- no `RESOURCE_EXHAUSTED` for the primary turn;
- no fallback activation;
- auxiliary JSON/title/memory traffic is classified separately.

A source patch or passing unit test is not a production fix until the image is rebuilt, service restarted, and live turns pass.

## Proposed capability and change name

Suggested change name:

```text
normalize-antigravity-semantic-identity
```

Suggested capability:

```text
antigravity-request-compatibility
```

## Proposal-ready requirements

1. 9Router SHALL neutralize known competitive provider/creator attribution only on Antigravity-bound `systemInstruction` text.
2. 9Router SHALL preserve all non-attribution behavioral instruction content.
3. 9Router SHALL leave requests without known attribution semantically unchanged.
4. 9Router SHALL avoid unexpected mutation of the caller-owned translated request.
5. 9Router SHALL retain existing Claude/Anthropic compatibility behavior.
6. 9Router SHALL provide focused regression tests for Hermes/Nous, Claude/Anthropic, no-op, preservation, idempotency, and immutability.
7. 9Router SHALL NOT expose full system instructions or credentials in logs.
8. Non-Antigravity providers SHALL remain unaffected.

## Out of scope

- Changing Hermes global identity.
- General prompt censorship or arbitrary brand removal.
- Changes to OAuth account selection or quota rotation.
- Broad retry/backoff redesign.
- Production deployment or restart in this exploration phase.

## Exit state

The exploration has crystallized into a decision to modify 9Router's Antigravity request compatibility layer. The next formal step is `/opsx-propose normalize-antigravity-semantic-identity` using this document as the proposal input package.
