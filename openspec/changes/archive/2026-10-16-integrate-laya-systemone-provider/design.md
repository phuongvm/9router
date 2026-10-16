## Context

9Router (`oss/9router`) is the centralized AI gateway routing requests across LLM, vision, audio, and System One providers. Hermes Nerve reflex systems connect to 9Router's `/v1/systemone` endpoint using the `openjev` client. Currently, 9Router delegates System One requests to remote cloud providers (`opencode-zen` or `openrouter`), incurring 200–550ms round-trip WAN latency.

Laya System One (`oss/laya-system-one`) is now containerized and running with NVIDIA GPU acceleration on `AGENT-4070` (`192.168.100.130:8000`), delivering ~25–35ms non-autoregressive decision inference. Integrating Laya as a native provider in 9Router completes the zero-token-cost, sub-40ms reflex loop for the workspace while preserving cloud failover.

## Goals / Non-Goals

**Goals:**
- Register `laya` provider in `open-sse/providers/registry/laya.js` with `serviceKinds: ["systemone"]` and `authType: "none"`.
- Support models: `laya-auto` (default dynamic router), `english` (ModernBERT-large 421M), `multilingual` (mmBERT-base 322M), and `typed-decisions` (fine-tuned).
- Configure default endpoint to `http://192.168.100.130:8000/v1/systemone`, overridable via `LAYA_SYSTEMONE_URL` or providerSpecificData.
- Implement automated failover in `open-sse/handlers/systemoneCore.js` to `opencode/jev-1.13-free` if the local host is unreachable or down.
- Maintain zero authentication overhead for local LAN calls, avoiding Headroom Proxy-style authentication failure loops.

**Non-Goals:**
- Routing chat completions through Laya (Laya is an encoder-only decision engine; chat traffic routes to LLM providers).
- Requiring API keys on the local LAN interface.

## Decisions

### 1. Dedicated Provider File (`open-sse/providers/registry/laya.js`)
- **Rationale**: Follows 9Router's standard provider registry pattern (e.g. `opencode-zen.js`, `v1m.js`, `nous.js`).
- **Configuration**:
  ```javascript
  export default {
    id: "laya",
    name: "Laya System One (Local)",
    kind: "systemone",
    serviceKinds: ["systemone"],
    category: "custom",
    authType: "none",
    systemoneConfig: {
      baseUrl: process.env.LAYA_SYSTEMONE_URL || "http://192.168.100.130:8000/v1/systemone",
    },
    models: [
      { id: "laya-auto", name: "Laya Dynamic Auto-Router", kind: "systemone" },
      { id: "english", name: "Laya English (ModernBERT 421M)", kind: "systemone" },
      { id: "multilingual", name: "Laya Multilingual (mmBERT 8k Context)", kind: "systemone" },
      { id: "typed-decisions", name: "Laya Typed Decisions (Fine-Tuned)", kind: "systemone" },
    ],
  };
  ```

### 2. Automatic Cloud Failover in `systemoneCore.js`
- **Rationale**: If `AGENT-4070` is powered off or `laya-serve` container is restarting, agents should not experience hard failures (502 Bad Gateway).
- **Implementation**: When `fetch(targetUrl)` throws a network connection error (e.g. `ECONNREFUSED`, `ETIMEDOUT`, `ENOTFOUND`) on a `laya` model, catch the exception, log an operational audit fallback line, and re-dispatch the payload to `opencode-zen` (`opencode/jev-1.13-free`).

### 3. Pure Unauthenticated LAN Dispatch
- **Rationale**: Commander identified that enforcing unnecessary tokens on private subnets led to painful authentication failure regressions with Headroom Proxy. With `ai-gateway.ptdev.vip` removed from Cloudflare Tunnel on `AGENT-4070`, port 8000 is 100% private. `authType: "none"` guarantees zero header collision.

## Risks / Trade-offs

- **[Risk] LAN IP drift if AGENT-4070 IP changes**  
  → *Mitigation*: The base URL is configurable via environment variable `LAYA_SYSTEMONE_URL`. If the IP shifts, it can be updated in `.env` without code changes. In addition, AGENT-4070 has a static DHCP lease on `192.168.100.130`.
- **[Risk] Failover latency**  
  → *Mitigation*: If the local host is down, the connection timeout is bounded by `FETCH_CONNECT_TIMEOUT_MS`, after which the cloud fallback immediately engages.
