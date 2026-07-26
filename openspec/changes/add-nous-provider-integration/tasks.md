# 📋 Tasks: Add Nous Research Provider Integration

## 1. Routing Engine (`open-sse`)
- [x] Add `NOUS` constant and mapping to `open-sse/config/providers.js`.
- [x] Add Nous models to `open-sse/config/providerModels.js`.
- [x] Create `open-sse/providers/registry/nous.js` with the standard OpenAI executor.
- [x] Run `scripts/migrate-registry.mjs` to auto-update the registry index.

## 2. Next.js Service Layer
- [x] Create `src/lib/services/nousOAuthService.js` with `getDeviceCode`, `pollToken`, and `refreshToken` methods.
- [x] Handle 400 `authorization_pending` logic gracefully in `pollToken`.
- [x] Persist `llm_url` in `extra_data` when creating the token in `pollToken`.
- [x] Update `src/lib/oauth/config.js` to enable `autoRefresh` for `nous`.
- [x] Update `src/lib/oauth/manager.js` to link the `nous` refresh service.

## 3. Next.js API Routes
- [x] Create `src/app/api/oauth/nous/device-code/route.js`.
- [x] Create `src/app/api/oauth/nous/poll-token/route.js`.

## 4. Frontend Integration
- [x] Modify `src/shared/components/OAuthModal.js` to set `deviceCodeProviders` to include `nous`.

## 5. Verification
- [ ] Start the Next.js dev server.
- [ ] Attempt to add a Nous Research account via the Dashboard.
- [ ] Verify the Device Code Modal appears.
- [ ] Verify polling works and successful authorization creates an account + token in SQLite.
- [ ] Test a chat completion through the gateway using the newly added Nous account.