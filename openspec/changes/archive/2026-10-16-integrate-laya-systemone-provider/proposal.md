## Why

Autonomous agent supervisory routines and quality gating (such as Hermes Nerve reflex checks) execute hundreds of micro-decisions per hour. Currently, 9Router routes System One requests to external cloud endpoints (OpenCode Zen or OpenRouter), incurring WAN latency (200–550ms) and token quota constraints.

By registering Laya System One (`oss/laya-system-one`) as a native, first-class provider in 9Router, local agents can route typed decisions to an on-device, GPU-accelerated Laya Docker container (`http://192.168.100.130:8000/v1/systemone`) running on `AGENT-4070` (RTX 4070 Ti SUPER). This delivers sub-40ms decision latency, 100+ language support, and zero token expense, while preserving automated cloud failover to OpenCode Zen when the local GPU host is offline.

## What Changes

- **New Provider Registry (`open-sse/providers/registry/laya.js`)**: Register `laya` as a native System One provider in 9Router (`serviceKinds: ["systemone"]`, `authType: "none"`), exposing models `laya/laya-auto`, `laya/english`, `laya/multilingual`, and `laya/typed-decisions`.
- **Model Catalog Registration (`open-sse/config/providerModels.js`)**: Add `laya` model definitions and aliases into 9Router's model catalog.
- **Provider Registry Auto-Generation**: Re-generate `open-sse/providers/registry/index.js` to include `laya.js` statically.
- **Automated Cloud Failover in System One Core (`open-sse/handlers/systemoneCore.js`)**: Implement graceful connection failure detection; if the local Laya endpoint is unreachable (connection refused, network timeout, host offline), 9Router transparently falls back to `opencode-zen` (`opencode/jev-1.13-free`) without disrupting the calling agent.
- **Dashboard & Media Provider Alignment**: Enable Laya under 9Router Dashboard's System One media providers page with interactive probe and test capabilities.

## Capabilities

### New Capabilities
- `laya-provider`: Native Laya System One decision provider in 9Router with configurable base URL, zero-auth local LAN support, model aliases, and automatic fallback to cloud Jev.

### Modified Capabilities
<!-- None: existing provider requirements remain unchanged -->

## Impact

- **Affected Systems**: `open-sse/providers/registry/laya.js` (new), `open-sse/providers/registry/index.js` (updated), `open-sse/config/providerModels.js` (updated), `open-sse/handlers/systemoneCore.js` (failover enhancement).
- **Network Boundaries**: Connects over trusted local LAN (`http://192.168.100.130:8000/v1/systemone` or configurable env `LAYA_SYSTEMONE_URL`) with fallback to WAN `https://opencode.ai/zen/v1/systemone`.
- **Security & Auth**: Operates with `authType: "none"` internally, requiring no local API key and preventing authentication mismatch issues.
