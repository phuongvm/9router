# 🚀 Proposal: Add Nous Research Provider Integration

## 1. Problem & Context
9Router currently supports over 40 upstream providers but lacks native integration for the Nous Research AI Platform (`api.nousresearch.com`). 

With the increasing reliance on Nous Research's infrastructure (via `portal.nousresearch.com`), 9Router needs a direct path to route models (like `hermes-3-llama-3.1-405b` and `nous-hermes-2-theta`) to the official Nous endpoints.

The Nous Research platform uses the **OAuth 2.0 Device Authorization Grant** (Device Code Flow) rather than standard API keys, meaning 9Router must manage polling, token storage, and automatic token refreshes in the background, similar to the logic implemented in the Hermes Agent CLI.

## 2. Proposed Solution
Add a native `nous` provider to the 9Router ecosystem with the following scope:

### A. Routing & Translation (`open-sse`)
- **API Standard:** Nous Research provides a 100% OpenAI-compatible endpoint (`/v1/chat/completions`). No custom translation layer is needed.
- **Executor:** Use the standard `default.js` OpenAI-compatible executor.
- **Registry:** Register `nous` in `open-sse/config/providers.js` and add its official models to `providerModels.js`.

### B. OAuth Device Code Flow (`src/lib/services`, `src/app/api`)
- **Backend Service:** Build `nousOAuthService.js` to handle `POST /api/v1/auth/device/code` (start flow) and `POST /api/v1/auth/device/token` (poll/refresh).
- **Persistence:** Save tokens (Access Token, Refresh Token) to the SQLite `authTokensRepo` and bind them to a managed account in `accountsRepo`.
- **Auto-Refresh:** Integrate with `OAuthManager` for background token renewal before expiration.
- **Next.js Routes:** Expose `/api/oauth/nous/device-code` and `/api/oauth/nous/poll-token` for the frontend.

### C. UI / Dashboard Integration (`src/components/providers`)
- Add `nous` to the `isDeviceFlow` condition in `ProviderCard.js`.
- This ensures the UI automatically pops up the `DeviceCodeModal` when a user attempts to add an account for "Nous Research", bypassing the manual API key input.

## 3. Scope & Constraints
- **In Scope:** Full end-to-end routing, Device Code OAuth flow, token persistence, and UI integration for the Nous provider.
- **Out of Scope:** Modifications to core OpenAI translation schemas. We assume 100% upstream compliance from `api.nousresearch.com`.
- **Constraint:** The polling loop must gracefully handle `400 Bad Request` (`authorization_pending`, `slow_down`) without crashing the service.

## 4. Risks & Mitigations
- **Risk:** Access tokens expire mid-stream, breaking long generations.
  - **Mitigation:** The `OAuthManager` automatically intercepts 401s and attempts a refresh. We will ensure the `refreshBufferSeconds` is set generously (e.g., 5 minutes).
- **Risk:** Upstream returns custom URLs for the inference endpoint.
  - **Mitigation:** Parse any `llm_url` returned from the token endpoint and persist it in the `extra_data` field of the auth token.