import assert from "node:assert";
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";

// Plain `node` does not know the jsconfig/vitest aliases (`open-sse/*`, `@/*`) that
// src/shared/constants/providers.js imports through, so map them here before loading
// any app module (static imports would be hoisted above the hook registration).
const ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..", "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "open-sse" || specifier.startsWith("open-sse/")) {
      return nextResolve(pathToFileURL(resolvePath(ROOT, specifier)).href, context);
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(pathToFileURL(resolvePath(ROOT, "src", specifier.slice(2))).href, context);
    }
    return nextResolve(specifier, context);
  },
});

const { default: REGISTRY } = await import("../../open-sse/providers/registry/index.js");
const { PROVIDER_MEDIA } = await import("../../open-sse/providers/index.js");
const { getProvidersByKind } = await import("../../src/shared/constants/providers.js");
const { handleSystemoneCore } = await import("../../open-sse/handlers/systemoneCore.js");

console.log("=== Verifying Laya Provider in 9Router ===");

// 1. Verify Registry entry
const entry = REGISTRY.find((e) => e.id === "laya");
assert.ok(entry, "Provider 'laya' must be in REGISTRY");
console.log("✓ Found provider 'laya' in REGISTRY");
assert.strictEqual(entry.category, "apikey");
assert.deepStrictEqual(entry.serviceKinds, ["systemone"]);
assert.strictEqual(entry.authType, "none");
assert.strictEqual(entry.noAuth, true);
console.log("✓ Verified provider category, serviceKinds, and authType");

// 2. Verify PROVIDER_MEDIA registration
const media = PROVIDER_MEDIA["laya"];
assert.ok(media, "PROVIDER_MEDIA['laya'] must be defined");
assert.ok(media.systemoneConfig?.baseUrl, "systemoneConfig.baseUrl must be defined");
console.log(`✓ PROVIDER_MEDIA baseUrl: ${media.systemoneConfig.baseUrl}`);

// 3. Verify getProvidersByKind
const systemOneProviders = getProvidersByKind("systemone");
const found = systemOneProviders.find((p) => p.id === "laya");
assert.ok(found, "laya must appear in getProvidersByKind('systemone')");
assert.strictEqual(found.alias, "laya");
console.log("✓ Found laya in getProvidersByKind('systemone')");

// 4. Verify Models
const modelIds = (entry.models || []).map((m) => m.id);
assert.ok(modelIds.includes("laya-auto"), "Must contain model laya-auto");
assert.ok(modelIds.includes("english"), "Must contain model english");
assert.ok(modelIds.includes("multilingual"), "Must contain model multilingual");
assert.ok(modelIds.includes("typed-decisions"), "Must contain model typed-decisions");
console.log(`✓ Verified 4 models in registry: ${modelIds.join(", ")}`);

// 5. Verify Failover mechanics
console.log("\n=== Testing Failover to OpenCode Zen on Connection Failure ===");
const originalFetch = global.fetch;
let failoverTriggered = false;
let warningLogged = false;

const mockLog = {
  warn: (tag, msg) => {
    warningLogged = true;
    console.log(`[MockLog WARN] [${tag}] ${msg}`);
  },
  debug: () => {},
};

try {
  global.fetch = async (url, options) => {
    // If calling local laya endpoint, simulate connection failure
    if (url.includes("192.168.100.130") || url.includes(":8000")) {
      throw new Error("connect ECONNREFUSED 192.168.100.130:8000");
    }
    // If calling opencode-zen fallback, succeed
    if (url.includes("opencode.ai/zen/v1/systemone")) {
      failoverTriggered = true;
      return new Response(
        JSON.stringify({
          model: "jev-1.13-free",
          answers: { test_q: { type: "noul", noul: 0.99 } },
          usage: { input_tokens: 15, output_tokens: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }
    return originalFetch(url, options);
  };

  const res = await handleSystemoneCore({
    body: {
      state: "Simulated failure for offline local host",
      questions: { test_q: { type: "noul", instructions: "Is this test?" } },
    },
    modelInfo: { provider: "laya", model: "laya-auto" },
    credentials: null,
    log: mockLog,
  });

  assert.strictEqual(res.success, true, "Failover request must succeed");
  assert.strictEqual(failoverTriggered, true, "Failover to opencode-zen must be called");
  assert.strictEqual(warningLogged, true, "Warning must be logged on failover");
  assert.ok(res.responseBody, "Response body must be present");
  assert.strictEqual(res.usage?.prompt_tokens, 15, "Prompt tokens must match");
  assert.strictEqual(res.usage?.completion_tokens, 0, "Completion tokens must match");
  assert.strictEqual(res.usage?.total_tokens, 15, "Total tokens must match");
  console.log("✓ Verified responseBody and normalized usage { prompt_tokens, completion_tokens, total_tokens }");
  console.log("✓ Verified automated failover to opencode-zen on connection refusal");
} finally {
  global.fetch = originalFetch;
}

console.log("\nALL VERIFICATION CHECKS PASSED!");
