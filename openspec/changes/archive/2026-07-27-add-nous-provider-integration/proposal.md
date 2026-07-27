# Proposal: Add Nous Research Provider Integration

## Problem

9Router did not have a first-class Nous Research provider. Users could not connect a Nous account through the dashboard, route chat or embedding requests through the Nous inference API, or select the runtime model catalog without maintaining static model lists.

Two lifecycle requirements are essential:

1. Nous uses OAuth device authorization and rotating refresh tokens, so persisted credentials must refresh before expiry and preserve returned token rotation.
2. Nous publishes its model catalog dynamically, so embedding models must not be hardcoded in the provider registry.

## Proposed solution

Add `nous` as an OpenAI-compatible provider with:

- OAuth device authorization through the shared OAuth provider route and connection repository;
- provider-specific access-token refresh through the Nous token endpoint;
- chat and embedding routing through `https://inference-api.nousresearch.com/v1`;
- an authenticated dynamic model-catalog proxy using the provider-declared `modelsFetcher`;
- metadata-driven model-kind classification;
- selectable LLM filtering at reported context length >= 200000;
- dynamic embedding models shared by the Models card and Embedding Example selector;
- exact catalog-target validation and observable upstream failures.

## Scope

### In scope

- Nous provider registration and display metadata.
- OAuth device-code request, polling, credential persistence, expiry, and refresh-token rotation.
- Proactive refresh before catalog loading.
- OpenAI-compatible chat and embedding routing.
- Dynamic model catalog, filtering, deduplication, and UI rendering.
- Example selector population from the same dynamic embedding list.
- Focused tests, lint, production build, Chrome CDP UI verification, and OpenSpec validation.

### Out of scope

- Custom request/response translation for Nous; the inference API is OpenAI-compatible.
- A static copy of the Nous embedding catalog.
- Waiting for a newly authorized token to expire naturally during the apply session. Commander accepted observing this later; protocol and persistence behavior remain test-covered.

## Risks and mitigations

- **Expired access token:** refresh through `refreshNousToken` and persist refreshed credentials through the shared token-refresh service.
- **Refresh-token rotation loss:** preserve the rotated token returned by Nous in the connection update.
- **Cross-provider credential leakage:** query only active `nous` connections before catalog access.
- **Catalog SSRF:** accept only exact URL/type pairs declared by a registered provider.
- **Catalog drift:** load runtime metadata rather than hardcoding embedding models.
- **Silent catalog failure:** propagate non-success status and render the dashboard error.
- **Divergent UI model sources:** lift merged model state to the media-provider detail page and pass it to the Example card.
