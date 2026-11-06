import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import * as authService from "@/sse/services/auth.js";
import * as modelService from "@/sse/services/model.js";
import * as tokenRefreshService from "@/sse/services/tokenRefresh.js";
import * as localDb from "@/lib/localDb";
import * as usageDb from "@/lib/usageDb.js";
import * as logger from "@/sse/utils/logger.js";
import * as systemoneCore from "open-sse/handlers/systemoneCore.js";
import { resolveSmartChoice } from "@/sse/services/systemoneRouter.js";
import { handleSystemone } from "@/sse/handlers/systemone.js";

const OLLAYA_HOST = "192.168.100.130:11435";
const ZEN_URL = "opencode.ai/zen/v1/systemone";

function createAbortablePendingFetch(onSignal) {
  return (_url, init) => {
    onSignal?.(init?.signal);
    return new Promise((_, reject) => {
      const makeAbortError = () => {
        const reason = init?.signal?.reason;
        if (reason instanceof Error) return reason;
        const err = new Error("The operation was aborted.");
        err.name = "AbortError";
        return err;
      };
      if (init?.signal?.aborted) {
        reject(makeAbortError());
        return;
      }
      init?.signal?.addEventListener("abort", () => reject(makeAbortError()), { once: true });
    });
  };
}

describe("Smart Router NoAuth & Ollaya Dispatch (Ticket 01)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
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
      servedBy: {
        provider: "ollaya",
        model: "pplx-decider:flash-fp16",
        failover: false,
      },
      response: new Response("{}", { status: 200 }),
    });

    const result = await resolveSmartChoice({
      body: { messages: [{ role: "user", content: "Optimize this CUDA kernel" }] },
      models: ["cx/gpt-5-mini", "ds/deepseek-v4"],
      routerModel: "ollaya/pplx-decider:flash-fp16",
      log: mockLog,
    });

    expect(authService.getProviderCredentials).not.toHaveBeenCalled();
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
        meta: {
          servedBy: "ollaya/pplx-decider:flash-fp16",
          failover: false,
        },
      })
    );
    expect(mockDetailSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollaya",
        model: "pplx-decider:flash-fp16",
        status: "success",
        meta: {
          servedBy: "ollaya/pplx-decider:flash-fp16",
          failover: false,
        },
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

  it("aborts the AbortSignal passed to handleSystemoneCore on resolveSmartChoice timeout without leaking zombie failover", async () => {
    const mockLog = { debug: vi.fn(), warn: vi.fn(), info: vi.fn() };
    vi.spyOn(modelService, "getModelInfo").mockResolvedValue({
      provider: "ollaya",
      model: "pplx-decider:flash-fp16",
    });

    let capturedFetchSignal;
    const fetchMock = vi.fn((url, init) => {
      if (url.includes(OLLAYA_HOST)) {
        return createAbortablePendingFetch((sig) => { capturedFetchSignal = sig; })(url, init);
      }
      throw new Error(`zombie failover should not be called: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveSmartChoice({
      body: { messages: [{ role: "user", content: "Route this prompt" }] },
      models: ["cx/gpt-5-mini", "ds/deepseek-v4"],
      routerModel: "ollaya/pplx-decider:flash-fp16",
      log: mockLog,
      timeoutMs: 40,
    });

    expect(result).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedFetchSignal?.aborted).toBe(true);
    expect(mockLog.warn).toHaveBeenCalledWith(
      "COMBO",
      expect.stringContaining("smart-router: evaluation aborted (System One router timed out after 40ms)")
    );
    expect(mockLog.warn).not.toHaveBeenCalledWith(
      "SYSTEMONE",
      expect.stringContaining("Failing over to")
    );
  });

  it("records opencode-zen/jev-1.13-free servedBy telemetry when resolveSmartChoice fails over from local ollaya", async () => {
    const mockLog = { debug: vi.fn(), warn: vi.fn(), info: vi.fn() };
    vi.spyOn(modelService, "getModelInfo").mockResolvedValue({
      provider: "ollaya",
      model: "pplx-decider:flash-fp16",
    });
    const mockUsageSave = vi.spyOn(usageDb, "saveRequestUsage").mockResolvedValue({});
    const mockDetailSave = vi.spyOn(usageDb, "saveRequestDetail").mockResolvedValue({});

    const fetchMock = vi.fn(async (url) => {
      if (url.includes(OLLAYA_HOST)) {
        throw new Error(`connect ECONNREFUSED ${OLLAYA_HOST}`);
      }
      if (url.includes(ZEN_URL)) {
        return new Response(
          JSON.stringify({
            model: "jev-1.13-free",
            answers: {
              route: {
                type: "choice",
                choice: "ds/deepseek-v4",
                confidence: 0.91,
                probabilities: { "ds/deepseek-v4": 0.91, "cx/gpt-5-mini": 0.09 },
              },
            },
            usage: { input_tokens: 55, output_tokens: 12 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await resolveSmartChoice({
      body: { messages: [{ role: "user", content: "Route after local failover" }] },
      models: ["cx/gpt-5-mini", "ds/deepseek-v4"],
      routerModel: "ollaya/pplx-decider:flash-fp16",
      log: mockLog,
      timeoutMs: 2000,
    });

    expect(result?.choice).toBe("ds/deepseek-v4");
    const expectedMeta = {
      servedBy: "opencode-zen/jev-1.13-free",
      failover: true,
      requestedProvider: "ollaya",
      requestedModel: "pplx-decider:flash-fp16",
      failoverReason: expect.stringContaining("unreachable at"),
    };
    expect(mockUsageSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "opencode-zen",
        model: "jev-1.13-free",
        endpoint: "/internal/smart-router",
        status: "success",
        meta: expectedMeta,
      })
    );
    expect(mockDetailSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "opencode-zen",
        model: "jev-1.13-free",
        status: "success",
        meta: expectedMeta,
      })
    );
  });

  it("aborts handleSystemone(request) on client disconnect for noAuth ollaya without zombie failover or warnings", async () => {
    vi.spyOn(localDb, "getSettings").mockResolvedValue({ requireApiKey: false });
    vi.spyOn(modelService, "getModelInfo").mockResolvedValue({
      provider: "ollaya",
      model: "pplx-decider:flash-fp16",
    });
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const markUnavailSpy = vi.spyOn(authService, "markAccountUnavailable").mockResolvedValue({ shouldFallback: false });

    let capturedFetchSignal;
    const fetchMock = vi.fn((url, init) => {
      if (url.includes(OLLAYA_HOST)) {
        return createAbortablePendingFetch((sig) => { capturedFetchSignal = sig; })(url, init);
      }
      throw new Error(`opencode-zen failover must not run on client abort: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const clientController = new AbortController();
    const req = new Request("http://localhost:20128/v1/systemone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "ollaya/pplx-decider:flash-fp16",
        state: "Client disconnects at 10s",
        questions: { q: { type: "noul", instructions: "Assess" } },
      }),
      signal: clientController.signal,
    });

    const responsePromise = handleSystemone(req);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(capturedFetchSignal?.aborted).toBe(false);

    clientController.abort(new Error("OpenJevClient 10s timeout"));
    const response = await responsePromise;

    expect(capturedFetchSignal?.aborted).toBe(true);
    expect(response.status).toBe(408);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(markUnavailSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalledWith("SYSTEMONE", expect.stringContaining("Failing over to"));
  });

  it("aborts handleSystemone(request) on client disconnect for credentialed openrouter without calling markAccountUnavailable", async () => {
    vi.spyOn(localDb, "getSettings").mockResolvedValue({ requireApiKey: false });
    vi.spyOn(modelService, "getModelInfo").mockResolvedValue({
      provider: "openrouter",
      model: "typesafe/jev-1.13",
    });
    vi.spyOn(authService, "getProviderCredentials").mockResolvedValue({
      connectionId: "conn-or-1",
      connectionName: "openrouter-primary",
      apiKey: "sk-or-test-redacted",
    });
    vi.spyOn(tokenRefreshService, "checkAndRefreshToken").mockImplementation(async (_p, creds) => creds);
    const warnSpy = vi.spyOn(logger, "warn").mockImplementation(() => {});
    const markUnavailSpy = vi.spyOn(authService, "markAccountUnavailable").mockResolvedValue({ shouldFallback: true });

    let capturedFetchSignal;
    const fetchMock = vi.fn(createAbortablePendingFetch((sig) => { capturedFetchSignal = sig; }));
    vi.stubGlobal("fetch", fetchMock);

    const clientController = new AbortController();
    const req = new Request("http://localhost:20128/v1/systemone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openrouter/typesafe/jev-1.13",
        state: "Credentialed client disconnect",
        questions: { q: { type: "noul", instructions: "Assess" } },
      }),
      signal: clientController.signal,
    });

    const responsePromise = handleSystemone(req);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(capturedFetchSignal?.aborted).toBe(false);

    clientController.abort(new Error("Client disconnected"));
    const response = await responsePromise;

    expect(capturedFetchSignal?.aborted).toBe(true);
    expect(response.status).toBe(408);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(markUnavailSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalledWith("SYSTEMONE", expect.stringContaining("Failing over to"));
  });

  it("records opencode-zen/jev-1.13-free servedBy telemetry when handleSystemone fails over from local ollaya", async () => {
    vi.spyOn(localDb, "getSettings").mockResolvedValue({ requireApiKey: false });
    vi.spyOn(modelService, "getModelInfo").mockResolvedValue({
      provider: "ollaya",
      model: "pplx-decider:flash-fp16",
    });
    const mockUsageSave = vi.spyOn(usageDb, "saveRequestUsage").mockResolvedValue({});
    const mockDetailSave = vi.spyOn(usageDb, "saveRequestDetail").mockResolvedValue({});

    const fetchMock = vi.fn(async (url) => {
      if (url.includes(OLLAYA_HOST)) throw new Error(`connect ECONNREFUSED ${OLLAYA_HOST}`);
      if (url.includes(ZEN_URL)) {
        return new Response(
          JSON.stringify({
            model: "jev-1.13-free",
            answers: { q: { type: "noul", noul: 0.88 } },
            usage: { input_tokens: 33, output_tokens: 9 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost:20128/v1/systemone", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "ollaya/pplx-decider:flash-fp16",
        state: "Direct endpoint failover",
        questions: { q: { type: "noul", instructions: "Assess" } },
      }),
    });

    const response = await handleSystemone(req);
    expect(response.status).toBe(200);

    const expectedMeta = {
      servedBy: "opencode-zen/jev-1.13-free",
      failover: true,
      requestedProvider: "ollaya",
      requestedModel: "pplx-decider:flash-fp16",
      failoverReason: expect.stringContaining("unreachable at"),
    };
    expect(mockUsageSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "opencode-zen",
        model: "jev-1.13-free",
        endpoint: "/v1/systemone",
        status: "success",
        meta: expectedMeta,
      })
    );
    expect(mockDetailSave).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "opencode-zen",
        model: "jev-1.13-free",
        status: "success",
        meta: expectedMeta,
      })
    );
  });
});

describe("SQLite persistence round-trip for usageHistory.meta and requestDetails.meta", () => {
  const originalDataDir = process.env.DATA_DIR;
  const originalEnableLogs = process.env.ENABLE_REQUEST_LOGS;
  let tempDir;
  let sqliteDb;
  let usageRepo;
  let requestDetailsRepo;

  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "9router-systemone-meta-"));
    process.env.DATA_DIR = tempDir;
    process.env.ENABLE_REQUEST_LOGS = "true";
    try { global._dbAdapter?.instance?.close?.(); } catch {}
    delete global._dbAdapter;
    vi.resetModules();
    sqliteDb = await import("@/lib/db/index.js");
    await sqliteDb.initDb();
    usageRepo = await import("@/lib/db/repos/usageRepo.js");
    requestDetailsRepo = await import("@/lib/db/repos/requestDetailsRepo.js");
  });

  afterAll(() => {
    try { global._dbAdapter?.instance?.close?.(); } catch {}
    delete global._dbAdapter;
    if (tempDir) {
      try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch {}
    }
    if (originalDataDir === undefined) delete process.env.DATA_DIR;
    else process.env.DATA_DIR = originalDataDir;
    if (originalEnableLogs === undefined) delete process.env.ENABLE_REQUEST_LOGS;
    else process.env.ENABLE_REQUEST_LOGS = originalEnableLogs;
  });

  it("persists and retrieves failover meta in both usageHistory and requestDetails SQLite tables", async () => {
    const failoverMeta = {
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
      tokens: { prompt_tokens: 120, completion_tokens: 87, total_tokens: 207 },
      status: "success",
      meta: failoverMeta,
    });

    const history = await usageRepo.getUsageHistory({ provider: "opencode-zen", model: "jev-1.13-free" });
    expect(history).toHaveLength(1);
    expect(history[0].provider).toBe("opencode-zen");
    expect(history[0].model).toBe("jev-1.13-free");
    expect(history[0].meta).toEqual(failoverMeta);

    await requestDetailsRepo.saveRequestDetail({
      id: "detail-systemone-failover-1",
      timestamp: "2026-11-05T06:40:48.793Z",
      provider: "opencode-zen",
      model: "jev-1.13-free",
      status: "success",
      latency: { ttft: 5620, total: 5620 },
      tokens: { prompt_tokens: 120, completion_tokens: 87, total_tokens: 207 },
      request: { model: "ollaya/pplx-decider:flash-fp16", state: "test" },
      response: { model: "jev-1.13-free", answers: {} },
      meta: failoverMeta,
    });

    expect(typeof requestDetailsRepo.__test__?.flushToDatabase).toBe("function");
    await requestDetailsRepo.__test__.flushToDatabase();

    const { details } = await requestDetailsRepo.getRequestDetails({ provider: "opencode-zen", model: "jev-1.13-free" });
    expect(details).toHaveLength(1);
    expect(details[0].provider).toBe("opencode-zen");
    expect(details[0].model).toBe("jev-1.13-free");
    expect(details[0].meta).toEqual(failoverMeta);
  });
});
