import { describe, expect, it, vi } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDER_MEDIA } from "../../open-sse/providers/index.js";
import { getProvidersByKind } from "@/shared/constants/providers";
import { handleSystemoneCore } from "../../open-sse/handlers/systemoneCore.js";

describe("Laya Local System One provider", () => {
  const entry = REGISTRY.find((e) => e.id === "laya");

  it("is registered as a System One local provider", () => {
    expect(entry).toBeDefined();
    expect(entry.category).toBe("custom");
    expect(entry.serviceKinds).toEqual(["systemone"]);
    expect(entry.authType).toBe("none");
    expect(PROVIDER_MEDIA["laya"]?.systemoneConfig?.baseUrl).toBeDefined();
  });

  it("appears in getProvidersByKind('systemone')", () => {
    const list = getProvidersByKind("systemone");
    const found = list.find((p) => p.id === "laya");
    expect(found).toBeDefined();
    expect(found.alias).toBe("laya");
    expect(found.systemoneConfig?.baseUrl).toContain("/v1/systemone");
  });

  it("exposes expected laya decision models", () => {
    const ids = (entry.models || []).map((m) => m.id);
    expect(ids).toContain("laya-auto");
    expect(ids).toContain("english");
    expect(ids).toContain("multilingual");
    expect(ids).toContain("typed-decisions");
  });

  it("fails over to opencode-zen when local laya throws connection error", async () => {
    // Test failover behavior when fetch to targetUrl fails
    const mockLog = { warn: vi.fn(), debug: vi.fn() };
    const originalFetch = global.fetch;

    try {
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes("192.168.100.130") || url.includes("8000")) {
          return Promise.reject(new Error("connect ECONNREFUSED 192.168.100.130:8000"));
        }
        // Fallback endpoint succeeds
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            model: "jev-1.13-free",
            answers: { test: { type: "noul", noul: 1.0 } },
            usage: { input_tokens: 10, output_tokens: 0 }
          }),
        });
      });

      const res = await handleSystemoneCore({
        body: { state: "test state", questions: { test: { type: "noul", instructions: "test" } } },
        modelInfo: { provider: "laya", model: "laya-auto" },
        credentials: null,
        log: mockLog,
      });

      expect(res.success).toBe(true);
      expect(mockLog.warn).toHaveBeenCalledWith(
        "SYSTEMONE",
        expect.stringContaining("Failing over to opencode-zen")
      );
    } finally {
      global.fetch = originalFetch;
    }
  });
});
