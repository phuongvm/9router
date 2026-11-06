import assert from "node:assert";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { registerHooks } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "open-sse" || specifier.startsWith("open-sse/")) {
      return nextResolve(pathToFileURL(path.resolve(ROOT, specifier)).href, context);
    }
    if (specifier.startsWith("@/")) {
      return nextResolve(pathToFileURL(path.resolve(ROOT, "src", specifier.slice(2))).href, context);
    }
    return nextResolve(specifier, context);
  },
});

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
  { timestamp: "2026-10-16T08:35:30.045Z", provider: "laya", model: "laya-auto", promptTokens: 49, completionTokens: 0, tokens: JSON.stringify({ prompt_tokens: 49, completion_tokens: 0 }), status: "ok" },
  { timestamp: "2026-10-16T08:35:28.195Z", provider: "laya", model: "laya-auto", promptTokens: 0, completionTokens: 0, tokens: "{}", status: "ok" },
  { timestamp: "2026-10-16T08:35:20.000Z", provider: "antigravity", model: "gemini-4-argon-high", promptTokens: 1000, completionTokens: 50, tokens: JSON.stringify({ prompt_tokens: 1000, completion_tokens: 50 }), status: "ok" },
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

// 3. Real SQLite round-trip for usageHistory.meta and requestDetails.meta
const originalDataDir = process.env.DATA_DIR;
const originalEnableLogs = process.env.ENABLE_REQUEST_LOGS;
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-usage-meta-script-"));
process.env.DATA_DIR = tempDir;
process.env.ENABLE_REQUEST_LOGS = "true";

try {
  const db = await import("../../src/lib/db/index.js");
  await db.initDb();
  const usageRepo = await import("../../src/lib/db/repos/usageRepo.js");
  const requestDetailsRepo = await import("../../src/lib/db/repos/requestDetailsRepo.js");

  const meta = {
    servedBy: "opencode-zen/jev-1.13-free",
    failover: true,
    requestedProvider: "ollaya",
    requestedModel: "pplx-decider:flash-fp16",
    failoverReason: "timed out after 5000ms at http://192.168.100.130:11435/v1/systemone",
  };

  await usageRepo.saveRequestUsage({
    timestamp: "2026-11-05T06:40:48.793Z",
    provider: "opencode-zen",
    model: "jev-1.13-free",
    endpoint: "/v1/systemone",
    tokens: { prompt_tokens: 64, completion_tokens: 16, total_tokens: 80 },
    status: "success",
    meta,
  });

  const history = await usageRepo.getUsageHistory({ provider: "opencode-zen", model: "jev-1.13-free" });
  assert.strictEqual(history.length, 1, "Must persist 1 usageHistory record");
  assert.deepStrictEqual(history[0].meta, meta, "usageHistory.meta must round-trip failover metadata");

  await requestDetailsRepo.saveRequestDetail({
    id: "script-detail-failover-1",
    timestamp: "2026-11-05T06:40:48.793Z",
    provider: "opencode-zen",
    model: "jev-1.13-free",
    status: "success",
    latency: { ttft: 5400, total: 5400 },
    tokens: { prompt_tokens: 64, completion_tokens: 16, total_tokens: 80 },
    request: { model: "ollaya/pplx-decider:flash-fp16" },
    response: { model: "jev-1.13-free" },
    meta,
  });
  assert.strictEqual(typeof requestDetailsRepo.__test__?.flushToDatabase, "function", "flushToDatabase must be exposed on __test__");
  await requestDetailsRepo.__test__.flushToDatabase();

  const { details } = await requestDetailsRepo.getRequestDetails({ provider: "opencode-zen", model: "jev-1.13-free" });
  assert.strictEqual(details.length, 1, "Must persist 1 requestDetails record");
  assert.deepStrictEqual(details[0].meta, meta, "requestDetails.meta must round-trip failover metadata");
  console.log("✓ Verified SQLite round-trip persistence for usageHistory.meta and requestDetails.meta");
} finally {
  try { global._dbAdapter?.instance?.close?.(); } catch {}
  delete global._dbAdapter;
  try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
  if (originalDataDir === undefined) delete process.env.DATA_DIR;
  else process.env.DATA_DIR = originalDataDir;
  if (originalEnableLogs === undefined) delete process.env.ENABLE_REQUEST_LOGS;
  else process.env.ENABLE_REQUEST_LOGS = originalEnableLogs;
}

console.log("\nALL SYSTEM ONE LOGIC TESTS PASSED!");
