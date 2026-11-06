import { describe, expect, it, vi } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDER_MEDIA } from "../../open-sse/providers/index.js";
import { getProvidersByKind } from "@/shared/constants/providers";
import { handleSystemoneCore } from "../../open-sse/handlers/systemoneCore.js";

describe("Laya Local System One provider", () => {
  const entry = REGISTRY.find((e) => e.id === "laya");

  it("is registered as a System One local provider", () => {
    expect(entry).toBeDefined();
    expect(entry.category).toBe("apikey");
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

  it("fails over to opencode-zen when local laya throws connection error and reports servedBy provenance", async () => {
    const mockLog = { warn: vi.fn(), debug: vi.fn() };
    const originalFetch = global.fetch;

    try {
      global.fetch = vi.fn().mockImplementation((url) => {
        if (url.includes("192.168.100.130") || url.includes("8000")) {
          return Promise.reject(new Error("connect ECONNREFUSED 192.168.100.130:8000"));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({
            model: "jev-1.13-free",
            answers: { test: { type: "noul", noul: 1.0 } },
            usage: { input_tokens: 10, output_tokens: 0 },
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
      expect(res.servedBy).toEqual({
        provider: "opencode-zen",
        model: "jev-1.13-free",
        failover: true,
        failoverFrom: {
          provider: "laya",
          model: "laya-auto",
          reason: expect.stringContaining("unreachable at"),
        },
      });
      expect(mockLog.warn).toHaveBeenCalledWith(
        "SYSTEMONE",
        expect.stringContaining("Failing over to opencode-zen")
      );
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("aborts in-flight local laya fetch on caller AbortSignal without triggering failover or warnings", async () => {
    const mockLog = { warn: vi.fn(), debug: vi.fn() };
    const originalFetch = global.fetch;
    const callerController = new AbortController();
    let fetchCalls = 0;

    try {
      global.fetch = vi.fn().mockImplementation((_url, init) => {
        fetchCalls += 1;
        return new Promise((_, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
        });
      });

      const promise = handleSystemoneCore({
        body: { state: "test state", questions: { test: { type: "noul", instructions: "test" } } },
        modelInfo: { provider: "laya", model: "laya-auto" },
        credentials: null,
        log: mockLog,
        signal: callerController.signal,
      });

      callerController.abort();
      const res = await promise;

      expect(res.success).toBe(false);
      expect(res.aborted).toBe(true);
      expect(fetchCalls).toBe(1);
      expect(mockLog.warn).not.toHaveBeenCalled();
    } finally {
      global.fetch = originalFetch;
    }
  });
});
