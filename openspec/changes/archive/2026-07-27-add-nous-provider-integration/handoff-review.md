# Nous Research Provider Integration — Apply Handoff

**Project:** 9Router
**OpenSpec change:** `add-nous-provider-integration`
**Apply status:** Complete; ready for OpenSpec verification
**Runtime observation:** Long-duration token-expiry observation deferred by Commander

## Scope delivered

1. Nous OAuth device authorization and credential persistence.
2. Provider-specific OAuth refresh dispatch with refresh-token rotation support.
3. Proactive credential refresh before the dynamic model-catalog request.
4. Runtime model-catalog loading with exact registered-target validation.
5. Metadata-driven model-kind classification and >= 200000 context filtering for LLM models.
6. OpenAI-compatible Nous embedding routing.
7. Dynamic Nous embedding models in both the Models card and Embedding Example selector.
8. Zero hardcoded embedding-model entries in the Nous provider registry.

## Key implementation files

| File | Responsibility |
|---|---|
| `open-sse/providers/registry/nous.js` | Nous provider metadata, OAuth endpoints, catalog declaration, embedding configuration, and zero-hardcode registry invariant. |
| `open-sse/services/tokenRefresh.js` | Dispatches Nous refresh to `refreshNousToken`. |
| `open-sse/services/tokenRefresh/providers.js` | Implements the Nous refresh-token form request and maps rotated credentials. |
| `open-sse/handlers/embeddingProviders/index.js` | Registers Nous with the OpenAI-compatible embedding adapter. |
| `src/app/api/providers/suggested-models/route.js` | Validates the catalog target, selects only active Nous credentials, proactively refreshes credentials, and propagates upstream failures. |
| `src/app/api/providers/suggested-models/filters.js` | Classifies upstream metadata and applies the LLM context threshold. |
| `src/app/(dashboard)/dashboard/providers/components/ModelsCard.js` | Fetches, filters, deduplicates, renders, and emits the dynamic model list. |
| `src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/page.js` | Owns the merged model state shared between the Models and Example cards. |
| `src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/EmbeddingExampleCard.js` | Renders the dynamic embedding selector with static fallback behavior. |

## Root causes remediated

### Expired Nous tokens were not refreshed

`REFRESH_HANDLERS.nous` used the generic `refreshAccessToken` path. Nous exposes its token endpoint through provider OAuth metadata and already had a dedicated `refreshNousToken` implementation, so the generic path could not resolve the correct refresh configuration and returned no usable credentials.

The handler now dispatches to `refreshNousToken`. The catalog route also invokes `checkAndRefreshToken` before sending its upstream request, preventing the dashboard from using an expired persisted access token.

### Embedding Example had an empty model selector

`ModelsCard` fetched the dynamic catalog into component-local state, while `EmbeddingExampleCard` independently read only static registry models. Because the Nous registry intentionally contains no static embedding models, the Example selector remained empty.

The media-provider detail page now owns the available-model state. `ModelsCard` emits its merged catalog through `onModelsChange`, and `EmbeddingExampleCard` receives the same list through its `models` prop. Providers without dynamic catalogs retain the static fallback.

## Verification evidence

### Focused feature tests

```text
Test Files  3 passed (3)
Tests       9 passed (9)
```

Coverage includes:
- zero hardcoded Nous embedding models;
- metadata-driven embedding classification;
- credential isolation to active Nous connections;
- proactive credential refresh before catalog fetch;
- API-key storage fallback;
- registered-target/SSRF rejection;
- upstream status propagation;
- provider-specific refresh protocol;
- Models-to-Example dynamic state sharing.

### Broader refresh and embedding regression

```text
Test Files  6 passed (6)
Tests       22 passed (22)
```

### Static quality gates

```text
ESLint: exit 0
git diff --check: exit 0
```

### Production build

The ordinary Windows environment traversed legacy profile junctions and failed with `EPERM`. Re-running the same build with repository-local `HOME` and `USERPROFILE` isolated Next tracing from those junctions:

```text
npm run build
exit code: 0
```

The generated route inventory includes `/api/v1/embeddings` and `/dashboard/media-providers/[kind]/[id]`.

### Chrome CDP UI receipt

At `/dashboard/media-providers/embedding/nous`:

```text
Example present: true
Embedding selector option count: 25
Run disabled: false
Default selected model: qwen/qwen3-embedding-8b
```

The option values were catalog-derived and included Qwen, Perplexity, Google, BAAI, Mistral, OpenAI, Intfloat, and Sentence Transformers models.

### OpenSpec validation

```text
openspec validate add-nous-provider-integration --strict
Change 'add-nous-provider-integration' is valid
```

## Deferred observation

A fresh-token, long-duration wait until natural expiry was not repeated during apply. Commander explicitly accepted observing automatic refresh later. The refresh protocol and persistence behavior are covered by focused tests; apply completion does not claim a post-expiry live observation that was not performed.

## Reviewer checks

1. Confirm `open-sse/providers/registry/nous.js` contains no static embedding model entries.
2. Confirm `REFRESH_HANDLERS.nous` dispatches to `refreshNousToken`.
3. Confirm the suggested-model route calls `checkAndRefreshToken` after selecting an active Nous connection.
4. Confirm dynamic model state flows from `ModelsCard` through the detail page into `EmbeddingExampleCard`.
5. Run the focused and broader test commands recorded in this handoff.
6. Treat natural-expiry runtime observation as explicitly deferred, not as completed evidence.
