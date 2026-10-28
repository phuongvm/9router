# 9Router Smart Router & Ollaya System One Integration Exploration (2026-10-28)

**Project:** `9router` (`O:\workspaces\oss\9router`) · **Upstream Feature:** Combos Smart Router (`systemoneRouter.js`) · **Target Engine:** `ollaya` (`http://192.168.100.130:11435/v1/systemone`, `pplx-decider:flash-fp16`)

---

## 1. Context & Problem Statement

Upstream `9router` introduced the **Smart Router** strategy for Combos (`fallbackStrategy: "smart"`), which queries a System One decision model before generation to pick the optimal candidate model and supports three prompt-cache retention policies:
- **Smart Switch (`smart` / `custom`)**: Adaptive hysteresis (retains the sticky session model unless System One selects a different model with confidence $\ge$ threshold, default 80%).
- **Strict Lock (`strict`)**: Evaluates System One on Turn 1, then locks the chosen model for the entire session (`+0ms` latency on Turn 2+, 100% prompt-cache retention).
- **Per-Turn (`per-turn`)**: Evaluates System One independently on every turn (`sessionSticky: false`).

We want to configure Smart Router to use our on-device CUDA System One setup (**Ollaya** on `AGENT-4070` RTX 4070 Ti SUPER at `192.168.100.130:11435`, primary model `ollaya/pplx-decider:flash-fp16`, with automatic 1-hop failover to `opencode-zen/jev-1.13-free`).

Applying Matt Pocock's **`codebase-design`** (*Module, Interface, Depth, Seam, Adapter, Leverage, Locality, Deletion Test*) and **`diagnosing-bugs`** (*Empirical Root-Cause Reproduction*) across the producer, interception, and consumer seams revealed **5 architectural and runtime defects** that currently prevent or degrade `ollaya` under Smart Router.

---

## 2. Empirical Findings Across Five Seams

### Seam 1 (Backend Dispatch & Telemetry Seam — Shallow Duplicate): `src/sse/services/systemoneRouter.js`
- **Code Evidence**:
  - `open-sse/providers/registry/ollaya.js:18-20` and `laya.js` register `ollaya` and `laya` with `category: "apikey"`, `authType: "none"`, `noAuth: true` (preserving `9ROUTER-INV-7` and `openspec/specs/laya-provider/spec.md`).
  - `src/sse/handlers/systemone.js:91-133` (the `POST /v1/systemone` handler) checks `resolvedProvider?.noAuth || resolvedProvider?.authType === "none"`, dispatches `handleSystemoneCore` with `credentials: null`, and persists telemetry via `saveRequestUsage` and `saveRequestDetail` (required by `openspec/specs/systemone-usage-logs/spec.md`).
  - However, upstream's `src/sse/services/systemoneRouter.js:58-65` bypasses `systemone.js` and calls `getProviderCredentials(provider, new Set(), model)` directly.
  - Because `getProviderCredentials` (`src/sse/services/auth.js:47`) only synthesizes a virtual `"noauth"` connection for `FREE_PROVIDERS[providerId]?.noAuth` (`category === "free"`), `getProviderCredentials("ollaya")` queries `localDb`, finds 0 stored connections, and returns `null`.
- **Failure Mode**:
  - `resolveSmartChoice` logs `smart-router: no credentials available for router provider "ollaya"` and returns `null`, silently disabling Smart Router and falling back to static model order.
  - Furthermore, `resolveSmartChoice` never calls `saveRequestUsage` or `saveRequestDetail`, making Smart Router evaluations invisible in 9Router usage analytics (violating `openspec/specs/systemone-usage-logs/spec.md`).

### Seam 2 (Frontend Picker Seam — `FREE_PROVIDERS` Leak): `src/shared/components/ModelSelectModal.js`
- **Code Evidence**:
  - `src/shared/components/ModelSelectModal.js:23` defines:
    ```js
    const NO_AUTH_PROVIDER_IDS = Object.keys(FREE_PROVIDERS).filter(id => FREE_PROVIDERS[id].noAuth);
    ```
  - Meanwhile, on `/dashboard/media-providers/systemone/ollaya` (`src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/page.js:161`), `provider.noAuth` renders `<NoAuthProxyCard />` instead of `<ConnectionsCard />`, so no DB connection row is ever created for `ollaya` or `laya`.
- **Failure Mode**:
  - When opening **Select System One Router Model** (`kindFilter="systemone"`) on `/dashboard/combos`, `ollaya/*` and `laya/*` are excluded from `noAuthIds` and `activeConnectionIds`, so they do not appear in the UI selector at all.

### Seam 3 (Prompt State Producer Seam): `open-sse/services/systemoneRouter.js`
- **Code Evidence**:
  - `extractPromptState` (`open-sse/services/systemoneRouter.js:27-76`) inspects `body.messages` and `body.input`, calling `extractTextFromContent(msg.content ?? msg.text)`.
  - `extractTextFromContent` (`line 69`) only extracts array blocks where `part?.type === "text"`.
- **Failure Mode**:
  - **OpenAI Responses API (`/v1/responses`, Codex CLI)**: User message content blocks use `{ type: "input_text", text: "..." }`. `extractTextFromContent` returns `""`.
  - **Gemini Native (`/v1beta/models/...:generateContent`)**: Request payload uses `body.contents` with `parts: [{ text: "..." }]` (no `type` field). `extractPromptState` returns `""`.
  - In both formats, Smart Router logs `smart-router: empty prompt state, skipping classification` and fails open to static ordering.

### Seam 4 (Calibration, Prefix Blindness & Turn-1 Hysteresis Seam): `open-sse/services/combo.js` & `open-sse/services/systemoneRouter.js`
- **Empirical Reproduction on Live `ollaya` (`http://127.0.0.1:11435/v1/systemone`, `pplx-decider:flash-fp16`)**:
  - `buildChoiceCriteria(models)` (`open-sse/services/systemoneRouter.js:86-95`) sets every model's criterion description to `null`: `{"cx/gpt-5-mini": null, "ds/deepseek-v4": null}`.
  - **Probe 1 (Prefixed/post-cutoff IDs with `null` criteria)**:
    - Prompt: `"Write a high-performance Rust SIMD matrix multiplication"`
    - Candidates: `{"cx/gpt-5-mini": null, "ds/deepseek-v4": null}`
    - Result: `choice: "cx/gpt-5-mini"`, `probabilities: {"cx/gpt-5-mini": 0.5433, "ds/deepseek-v4": 0.4567}`, `confidence: 0.0866`.
    - With enriched descriptions (`criteria` populated with model name + capabilities): `choice: "ds/deepseek-v4"`, `probabilities: {"cx/gpt-5-mini": 0.0113, "ds/deepseek-v4": 0.9887}`, `confidence: 0.9774`.
  - **Probe 2 (2-Candidate Confidence Formula vs Turn-1 `switchThreshold` in `combo.js:432`)**:
    - Prompt: `"Translate 'Good morning, how are you?' into Vietnamese."`
    - Candidates: `{"ag/gemini-3-flash": null, "cc/claude-opus-4-6-thinking": null}`
    - Result: `choice: "ag/gemini-3-flash"`, `probabilities: {"ag/gemini-3-flash": 0.888, "cc/claude-opus-4-6-thinking": 0.112}`, `confidence: 0.776` (since binary margin confidence $= p_1 - p_2 = 0.888 - 0.112 = 0.776$).
    - In `open-sse/services/combo.js:432`, **Turn 1** checks `if (switchThreshold > 0 && conf !== null && conf < switchThreshold)`. Under default `Smart Switch` (`switchThreshold = 0.8`), `0.776 < 0.8` rejects an 88.8%-probability Turn-1 decision even though there is no warm prompt cache to protect on Turn 1.
    - With metadata-enriched criteria, `confidence` rises to `0.9791` (`probabilities: 0.9895 vs 0.0105`).

### Seam 5 (Capability Auto-Switch vs Session Stickiness Ordering Seam): `open-sse/services/combo.js`
- **Code Evidence**:
  - In `handleComboChat` (`open-sse/services/combo.js:372-464`), Smart Router runs *before* `detectRequiredCapabilities(body)` / `reorderByCapabilities(rotatedModels, required)` and writes `setStickyComboModel(comboName, sessionId, smartResult.choice)` at `line 438`.
- **Failure Mode**:
  - On a multimodal turn (`vision` / `audioInput` / `pdf`), Smart Router may pick and lock a text-only model into `comboSessionModelStore`, after which `reorderByCapabilities` overrides `rotatedModels[0]` to a vision-capable model for Turn 1. On Turn 2 (text follow-up), `getStickyComboModel` switches the conversation back to the text-only model that never ran Turn 1, thrashing the upstream prompt cache.

---

## 3. Architecture Deepening Plan (Three Tracer-Bullet Slices)

```
┌────────────────────────────────────────────────────────────────────────────┐
│ Slice 1: Unify NoAuth & System One Dispatch Seam (Backend + UI Picker)     │
│   • Deepen noAuth resolution across AI_PROVIDERS (ModelSelectModal,        │
│     systemoneRouter, combos/page) so ollaya/* & laya/* work out-of-the-box │
│   • Unify in-process Smart Router dispatch with usage/detail persistence   │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │ blocks
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Slice 2: Prompt State & Capability-First Routing Seam (open-sse Core)      │
│   • Support Responses API ("input_text") & Gemini ("contents[].parts[]")   │
│   • Enrich buildChoiceCriteria with model name + capabilities metadata     │
│   • Filter/tier by HARD_CAPS before Smart Router & fix Turn-1 threshold    │
└────────────────────────────────────┬───────────────────────────────────────┘
                                     │ blocks
                                     ▼
┌────────────────────────────────────────────────────────────────────────────┐
│ Slice 3: Default Ollaya Router Configuration & Live NUC Verification       │
│   • Set DEFAULT_SYSTEMONE_ROUTER_MODEL = "ollaya/pplx-decider:flash-fp16"  │
│   • Verify 9ROUTER-INV-1..7 + E2E Smart Combo routing on NUC (:20128)      │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Open Decisions (Frontier Round)

1. **Q1 (Default Smart Router Model)**: Set `DEFAULT_SYSTEMONE_ROUTER_MODEL` ("Auto" in Combos UI) to `"ollaya/pplx-decider:flash-fp16"` (with automatic failover to `opencode-zen/jev-1.13-free`), or keep `"oc/jev-1.13-free"` as Auto and select `ollaya/*` per combo? *(Recommended: `"ollaya/pplx-decider:flash-fp16"`)*
2. **Q2 (Criteria Enrichment)**: Enrich `buildChoiceCriteria(models)` automatically from `findModelName` + `getCapabilitiesForModel` so `ollaya` understands 9Router provider prefixes (`cx/`, `cc/`, `ag/`, `ns/`) and model tiers? *(Recommended: Yes)*
3. **Q3 (Smart Router Telemetry Persistence)**: Record in-process Smart Router evaluations via `saveRequestUsage` / `saveRequestDetail` per `openspec/specs/systemone-usage-logs/spec.md`? *(Recommended: Yes)*
