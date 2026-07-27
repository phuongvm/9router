# Tasks: Add Nous Research Provider Integration

## 1. Provider and routing integration
- [x] Register the `nous` provider and provider alias in the open-sse registry.
- [x] Configure the Nous inference, model-catalog, OAuth device-code, token, and embedding endpoints.
- [x] Register Nous with the OpenAI-compatible embedding adapter.
- [x] Keep the static Nous registry free of embedding-model entries.

## 2. OAuth and credential lifecycle
- [x] Implement the Nous device authorization flow through the shared OAuth provider infrastructure.
- [x] Persist access token, refresh token, expiry, and available account metadata through the connection repository.
- [x] Route Nous refresh through the provider-specific `refreshNousToken` protocol.
- [x] Proactively refresh an expired or near-expiry Nous credential before loading the dynamic model catalog.
- [x] Preserve refresh-token rotation through the shared credential update path.

## 3. Dynamic model catalog
- [x] Fetch the Nous catalog through the authenticated `suggested-models` API.
- [x] Restrict catalog targets to exact registered `modelsFetcher` URL/type pairs.
- [x] Resolve active credentials without selecting credentials from another provider.
- [x] Classify model kind from upstream metadata rather than model-name keywords.
- [x] Filter LLM models to reported context length >= 200000 while preserving embedding/image models.
- [x] Propagate upstream catalog failures to the dashboard.

## 4. Embedding dashboard and Example
- [x] Render dynamic Nous embedding models in `ModelsCard` without hardcoding the catalog.
- [x] Deduplicate dynamic models against built-in models.
- [x] Share the merged dynamic embedding list with `EmbeddingExampleCard`.
- [x] Populate the Example model selector after the asynchronous catalog load.
- [x] Preserve static-model fallback behavior for providers without a dynamic catalog.

## 5. Verification
- [x] Verify zero hardcoded Nous embedding models through focused tests.
- [x] Verify provider-specific refresh dispatch, proactive catalog refresh, credential isolation, SSRF rejection, and error propagation through focused tests.
- [x] Verify the Embedding Example receives the dynamic catalog through focused tests and Chrome CDP.
- [x] Verify the live Example selector contains 25 catalog-derived embedding options and enables Run.
- [x] Run refresh/embedding regression tests (22/22 passed).
- [x] Run ESLint on modified implementation and test files (exit 0).
- [x] Run the production build with an isolated Windows HOME/USERPROFILE (exit 0).
- [x] Validate the OpenSpec change with `openspec validate add-nous-provider-integration --strict`.
- [x] Defer long-duration observation of automatic refresh after a newly authorized token expires; Commander explicitly accepted observing this after the apply phase.
