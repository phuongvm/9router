import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import * as authService from "@/sse/services/auth.js";
import * as modelService from "@/sse/services/model.js";
import * as usageDb from "@/lib/usageDb.js";
import * as systemoneCore from "open-sse/handlers/systemoneCore.js";
import { resolveSmartChoice } from "@/sse/services/systemoneRouter.js";

describe("Smart Router NoAuth & Ollaya Dispatch (Ticket 01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies ollaya and laya have noAuth enabled in AI_PROVIDERS", () => {
    expect(AI_PROVIDERS.ollaya).toBeDefined();
    expect(AI_PROVIDERS.ollaya.noAuth).toBe(true);
    expect(AI_PROVIDERS.ollaya.authType).toBe("none");

    expect(AI_PROVIDERS.laya).toBeDefined();
    expect(AI_PROVIDERS.laya.noAuth).toBe(true);
    expect(AI_PROVIDERS.laya.authType).toBe("none");
  });

  it("dispatches resolveSmartChoice for ollaya without requiring database credentials", async () => {
    const mockLog = { debug: vi.fn(), warn: vi.fn(), info: vi.fn() };
    vi.spyOn(modelService, "getModelInfo").mockResolvedValue({
      provider: "ollaya",
      model: "pplx-decider:flash-fp16",
    });
    // getProviderCredentials returns null for unconfigured local engines
    vi.spyOn(authService, "getProviderCredentials").mockResolvedValue(null);

    const mockUsageSave = vi.spyOn(usageDb, "saveRequestUsage").mockResolvedValue({});
    const mockDetailSave = vi.spyOn(usageDb, "saveRequestDetail").mockResolvedValue({});

    vi.spyOn(systemoneCore, "handleSystemoneCore").mockResolvedValue({
      success: true,
      responseBody: {
        model: "pplx-decider:flash-fp16",
        answers: {
          route: {
            type: "choice",
            choice: "ds/deepseek-v4",
            confidence: 0.95,
            probabilities: { "ds/deepseek-v4": 0.95, "cx/gpt-5-mini": 0.05 },
          },
        },
        usage: { input_tokens: 42, output_tokens: 0 },
      },
      response: new Response("{}", { status: 200 }),
    });

    const result = await resolveSmartChoice({
      body: { messages: [{ role: "user", content: "Optimize this CUDA kernel" }] },
      models: ["cx/gpt-5-mini", "ds/deepseek-v4"],
      routerModel: "ollaya/pplx-decider:flash-fp16",
      log: mockLog,
    });

    expect(result).toBeDefined();
    expect(result.choice).toBe("ds/deepseek-v4");
    expect(result.confidence).toBe(0.95);
    expect(mockLog.warn).not.toHaveBeenCalledWith(
      "COMBO",
      expect.stringContaining("no credentials available")
    );
    expect(mockUsageSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollaya",
        model: "pplx-decider:flash-fp16",
        endpoint: "/internal/smart-router",
        status: "success",
      })
    );
    expect(mockDetailSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollaya",
        model: "pplx-decider:flash-fp16",
        status: "success",
      })
    );
  });

  it("aborts and returns null when router provider requires credentials but none exist", async () => {
    const mockLog = { debug: vi.fn(), warn: vi.fn(), info: vi.fn() };
    vi.spyOn(modelService, "getModelInfo").mockResolvedValue({
      provider: "openrouter",
      model: "typesafe/jev-1.13",
    });
    vi.spyOn(authService, "getProviderCredentials").mockResolvedValue(null);

    const result = await resolveSmartChoice({
      body: { messages: [{ role: "user", content: "Hello" }] },
      models: ["modelA", "modelB"],
      routerModel: "openrouter/typesafe/jev-1.13",
      log: mockLog,
    });

    expect(result).toBeNull();
    expect(mockLog.warn).toHaveBeenCalledWith(
      "COMBO",
      expect.stringContaining("no credentials available for router provider \"openrouter\"")
    );
  });

  it("does not record success telemetry when the router response lacks a valid route choice (W-02)", async () => {
    const mockLog = { debug: vi.fn(), warn: vi.fn(), info: vi.fn() };
    vi.spyOn(modelService, "getModelInfo").mockResolvedValue({
      provider: "ollaya",
      model: "pplx-decider:flash-fp16",
    });
    vi.spyOn(authService, "getProviderCredentials").mockResolvedValue(null);
    const mockUsageSave = vi.spyOn(usageDb, "saveRequestUsage").mockResolvedValue({});
    const mockDetailSave = vi.spyOn(usageDb, "saveRequestDetail").mockResolvedValue({});

    vi.spyOn(systemoneCore, "handleSystemoneCore").mockResolvedValue({
      success: true,
      responseBody: { model: "pplx-decider:flash-fp16", answers: {} },
      usage: { input_tokens: 10, output_tokens: 0 },
      response: new Response("{}", { status: 200 }),
    });

    const result = await resolveSmartChoice({
      body: { messages: [{ role: "user", content: "Hello" }] },
      models: ["cx/gpt-5-mini", "ds/deepseek-v4"],
      routerModel: "ollaya/pplx-decider:flash-fp16",
      log: mockLog,
    });

    expect(result).toBeNull();
    expect(mockUsageSave).not.toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
    expect(mockDetailSave).not.toHaveBeenCalledWith(expect.objectContaining({ status: "success" }));
    expect(mockUsageSave).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "ollaya", endpoint: "/internal/smart-router", status: "error" })
    );
    expect(mockDetailSave).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "ollaya", status: "error" })
    );
  });
});

