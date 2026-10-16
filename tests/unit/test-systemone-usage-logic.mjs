import assert from "node:assert";

console.log("=== Testing System One Usage & Recent Requests Logic ===");

// 1. Test token normalization logic
function normalizeSystemOneTokens(usage, state) {
  const prompt_tokens = usage?.input_tokens ?? usage?.prompt_tokens ?? (state ? Math.max(1, Math.ceil(state.length / 4)) : 1);
  const completion_tokens = usage?.output_tokens ?? usage?.completion_tokens ?? 0;
  return {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
  };
}

// Laya format (input_tokens / output_tokens)
const layaUsage = { input_tokens: 49, output_tokens: 0 };
const norm1 = normalizeSystemOneTokens(layaUsage, "Hello world");
assert.strictEqual(norm1.prompt_tokens, 49);
assert.strictEqual(norm1.completion_tokens, 0);
assert.strictEqual(norm1.total_tokens, 49);
console.log("✓ Correctly normalized Laya usage format");

// OpenRouter/Jev format (prompt_tokens / completion_tokens)
const jevUsage = { prompt_tokens: 573, completion_tokens: 40 };
const norm2 = normalizeSystemOneTokens(jevUsage, "State");
assert.strictEqual(norm2.prompt_tokens, 573);
assert.strictEqual(norm2.completion_tokens, 40);
assert.strictEqual(norm2.total_tokens, 613);
console.log("✓ Correctly normalized OpenRouter usage format");

// Missing usage fallback
const norm3 = normalizeSystemOneTokens(null, "Testing fallback estimation");
assert.ok(norm3.prompt_tokens >= 1);
assert.strictEqual(norm3.completion_tokens, 0);
console.log("✓ Correctly estimated tokens when usage is missing");

// 2. Test recentRequests filtering logic from usageRepo.js
const mockRecentRows = [
  // Laya request with normalized tokens
  { timestamp: "2026-10-16T08:35:30.045Z", provider: "laya", model: "laya-auto", promptTokens: 49, completionTokens: 0, tokens: JSON.stringify({ prompt_tokens: 49, completion_tokens: 0 }), status: "ok" },
  // Laya request with 0 tokens but valid model
  { timestamp: "2026-10-16T08:35:28.195Z", provider: "laya", model: "laya-auto", promptTokens: 0, completionTokens: 0, tokens: "{}", status: "ok" },
  // Normal LLM request
  { timestamp: "2026-10-16T08:35:20.000Z", provider: "antigravity", model: "gemini-4-argon-high", promptTokens: 1000, completionTokens: 50, tokens: JSON.stringify({ prompt_tokens: 1000, completion_tokens: 50 }), status: "ok" },
  // Empty background ping with no model and no tokens
  { timestamp: "2026-10-16T08:35:10.000Z", provider: "", model: "", promptTokens: 0, completionTokens: 0, tokens: "{}", status: "ok" },
];

const seen = new Set();
const recentRequests = mockRecentRows
  .map((r) => {
    let t = {};
    try { t = JSON.parse(r.tokens); } catch {}
    const promptTokens = t.prompt_tokens ?? t.input_tokens ?? r.promptTokens ?? 0;
    const completionTokens = t.completion_tokens ?? t.output_tokens ?? r.completionTokens ?? 0;
    return {
      timestamp: r.timestamp,
      model: r.model,
      provider: r.provider || "",
      promptTokens,
      completionTokens,
      status: r.status || "ok",
    };
  })
  .filter((e) => {
    // Drop only if zero tokens AND no model
    if (e.promptTokens === 0 && e.completionTokens === 0 && !e.model) return false;
    const minute = e.timestamp ? e.timestamp.slice(0, 16) : "";
    const key = `${e.model}|${e.provider}|${e.promptTokens}|${e.completionTokens}|${minute}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

assert.strictEqual(recentRequests.length, 3, "Must keep the 3 valid model requests and drop the empty ping");
assert.ok(recentRequests.some((r) => r.provider === "laya" && r.promptTokens === 49), "Laya request with 49 tokens must be included");
assert.ok(recentRequests.some((r) => r.provider === "laya" && r.promptTokens === 0), "Laya request with 0 tokens must still be included if model exists");
console.log("✓ Verified recentRequests filtering logic keeps Laya System One requests");

console.log("\nALL SYSTEM ONE LOGIC TESTS PASSED!");
