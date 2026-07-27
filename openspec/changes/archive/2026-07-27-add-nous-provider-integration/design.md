# Technical Design: Nous Research Provider Integration

## Architecture

The implementation uses existing 9Router extension points rather than a provider-specific parallel stack.

```text
Dashboard OAuth modal
  -> /api/oauth/[provider]/[action]
  -> src/lib/oauth/providers.js (nous adapter)
  -> Nous Portal device-code/token endpoints
  -> providerConnections repository

Dashboard ModelsCard
  -> /api/providers/suggested-models
  -> exact registry modelsFetcher validation
  -> active Nous connection selection
  -> checkAndRefreshToken("nous", connection)
  -> Nous model catalog
  -> metadata classification/filtering
  -> ModelsCard merged list
  -> media-provider detail page state
  -> EmbeddingExampleCard selector

/v1/chat/completions or /v1/embeddings
  -> existing 9Router routing pipeline
  -> OpenAI-compatible Nous inference endpoint
```

## Provider registry

`open-sse/providers/registry/nous.js` is metadata-only and declares:

- provider id and aliases;
- OAuth device-code and token endpoints;
- inference/chat transport endpoint;
- `serviceKinds: ["llm", "embedding"]`;
- embedding endpoint configuration;
- runtime `modelsFetcher` URL/type;
- only a small static LLM seed list.

The registry contains no static embedding-model entries.

## OAuth device authorization

The shared OAuth provider adapter requests:

```text
POST https://portal.nousresearch.com/api/oauth/device/code
```

It polls:

```text
POST https://portal.nousresearch.com/api/oauth/token
```

with the device-code grant and `client_id=hermes-cli`. Pending and slow-down responses remain non-fatal polling states. A successful response is mapped to the shared connection shape, including access token, refresh token, expiry, and account metadata when available.

## Credential refresh

`REFRESH_HANDLERS.nous` dispatches to `refreshNousToken`, which sends a form request with:

```text
grant_type=refresh_token
client_id=hermes-cli
refresh_token=<persisted value>
```

The mapped result includes `accessToken`, rotated `refreshToken`, and `expiresIn`. `checkAndRefreshToken` applies the configured refresh window and persists refreshed credentials through the existing credential update path.

The dynamic catalog route invokes this lifecycle before its upstream request. This prevents the UI from continuing to use an expired persisted access token.

## Dynamic model catalog

The catalog route accepts `url` and `type`, but fetches only when they exactly match a provider registry `modelsFetcher`. This is the SSRF boundary.

For Nous, the route:

1. selects only active Nous connections;
2. refreshes the selected credential when required;
3. attaches the refreshed access token or API-key storage fallback as Bearer auth;
4. fetches `https://inference-api.nousresearch.com/v1/models`;
5. propagates upstream non-success status;
6. applies metadata-driven classification and filtering.

Embedding classification comes from upstream kind/type/architecture/output-modality metadata. Model-name keyword matching is not used. LLM entries require reported context length >= 200000; embedding and image entries bypass that LLM-only threshold.

## Embedding UI state

`ModelsCard` owns catalog fetching and computes a deduplicated merged model list. It emits that list through `onModelsChange`.

The media-provider detail page owns `availableModels` and passes it into `EmbeddingExampleCard`. The Example card uses the dynamic list when available and retains static registry fallback for providers without dynamic catalogs. The selected model derives from the first asynchronous option until the user explicitly chooses another model, avoiding a state-update effect loop.

## Embedding routing

Nous is registered in the OpenAI-compatible embedding provider set. A request using `nous/<model-id>` is routed to the configured Nous embeddings endpoint and returns the upstream OpenAI-compatible response through the existing `/v1/embeddings` handler.

## Verification strategy

- focused tests for zero-hardcode, metadata classification, credential isolation, proactive refresh, rotated refresh mapping, SSRF rejection, upstream error propagation, and dynamic Example state sharing;
- broader refresh/embedding regression tests;
- ESLint and `git diff --check`;
- production Next.js build with isolated Windows HOME/USERPROFILE to avoid legacy profile junction traversal;
- Chrome CDP inspection of the live embedding Example selector;
- strict OpenSpec validation.

Natural-expiry observation of a newly authorized token is explicitly deferred by Commander and is not represented as completed live evidence.
