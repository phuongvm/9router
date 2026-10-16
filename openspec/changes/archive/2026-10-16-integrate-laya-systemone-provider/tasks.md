## 1. Provider Registry Definition

- [x] 1.1 Create `open-sse/providers/registry/laya.js` with `serviceKinds: ["systemone"]`, `authType: "none"`, and default baseUrl `http://192.168.100.130:8000/v1/systemone`
- [x] 1.2 Register model IDs (`laya-auto`, `english`, `multilingual`, `typed-decisions`) in `open-sse/config/providerModels.js`
- [x] 1.3 Update/regenerate `open-sse/providers/registry/index.js` to statically import and register `laya.js`

## 2. System One Handler & Failover Logic

- [x] 2.1 Enhance `open-sse/handlers/systemoneCore.js` to catch network connection failures on `laya` and dispatch fallback to `opencode-zen` (`opencode/jev-1.13-free`)
- [x] 2.2 Add operational fallback logging with provider and model context

## 3. Unit Testing & Verification

- [x] 3.1 Create unit test in `tests/unit/laya-systemone-provider.test.js` validating provider registration, model discovery, and failover mechanics
- [x] 3.2 Run test suite via `npx vitest run unit/laya-systemone-provider.test.js` and verify PASS
- [x] 3.3 Validate OpenSpec change with `openspec validate integrate-laya-systemone-provider --strict`
