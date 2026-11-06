import { afterEach, describe, expect, it, vi } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDER_MEDIA } from "../../open-sse/providers/index.js";
import { getProvidersByKind } from "@/shared/constants/providers";
import { handleSystemoneCore } from "../../open-sse/handlers/systemoneCore.js";
import {
  SYSTEMONE_FAILOVER,
  SYSTEMONE_LOCAL_TIMEOUT_MS,
  resolveSystemoneLocalTimeoutMs,
} from "../../open-sse/config/systemoneConfig.js";
import { readFileSync } from "node:fs";

const OLLAYA_HOST = "192.168.100.130:11435";
const ZEN_URL = "opencode.ai/zen/v1/systemone";

const body = { state: "test state", questions: { q: { type: "noul", instructions: "test" } } };
const ok = (payload) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });

function abortableHangFetch(init) {
  return new Promise((_, reject) => {
    const abortErr = () => {
      const reason = init?.signal?.reason;
      if (reason instanceof Error) return reason;
      const err = new Error("The operation was aborted.");
      err.name = "AbortError";
      return err;
    };
    if (init?.signal?.aborted) {
      reject(abortErr());
      return;
    }
    init?.signal?.addEventListener("abort", () => reject(abortErr()), { once: true });
  });
}

describe("Ollaya System One provider (registry)", () => {
  const entry = REGISTRY.find((e) => e.id === "ollaya");

  it("is registered as a noAuth local System One provider", () => {
    expect(entry).toBeDefined();
    expect(entry.category).toBe("apikey");
    expect(entry.authType).toBe("none");
    expect(entry.noAuth).toBe(true);
    expect(entry.serviceKinds).toEqual(["systemone"]);
    expect(PROVIDER_MEDIA["ollaya"]?.systemoneConfig?.baseUrl).toBe(`http://${OLLAYA_HOST}/v1/systemone`);
  });

  it("appears in getProvidersByKind('systemone') with alias ollaya", () => {
    const found = getProvidersByKind("systemone").find((p) => p.id === "ollaya");
    expect(found).toBeDefined();
    expect(found.alias).toBe("ollaya");
  });

  it("exposes the System-1 decision models", () => {
    const ids = entry.models.map((m) => m.id);
    expect(ids).toEqual([
      "pplx-decider:flash-fp16",
      "jeb:4b",
      "d1:3b",
      "d3:mini",
      "credence:e4b-calibrated",
    ]);
    expect(entry.models.every((m) => m.kind === "systemone")).toBe(true);
  });

  it("keeps laya registered alongside ollaya (9ROUTER-INV-7)", () => {
    expect(REGISTRY.find((e) => e.id === "laya")).toBeDefined();
  });
});

describe("System One failover topology lives in open-sse/config (AGENTS.md: no hardcode outside config/)", () => {
  it("SYSTEMONE_FAILOVER defines 5000ms local timeout and ollaya/laya -> opencode-zen/jev-1.13-free", () => {
    expect(SYSTEMONE_LOCAL_TIMEOUT_MS).toBe(5000);
    expect(SYSTEMONE_FAILOVER.ollaya.timeoutMs).toBe(5000);
    expect(SYSTEMONE_FAILOVER.ollaya.next).toEqual({ provider: "opencode-zen", model: "jev-1.13-free", credentials: { accessToken: "public" } });
    expect(SYSTEMONE_FAILOVER.ollaya.statuses).toEqual([500, 502, 503, 504]);
    expect(SYSTEMONE_FAILOVER.laya.timeoutMs).toBe(5000);
    expect(SYSTEMONE_FAILOVER.laya.next).toEqual({ provider: "opencode-zen", model: "jev-1.13-free", credentials: { accessToken: "public" } });
    expect(SYSTEMONE_FAILOVER.laya.statuses).toEqual([502, 503, 504]);
  });

  it("resolveSystemoneLocalTimeoutMs accepts valid positive integers and falls back to 5000 on invalid inputs", () => {
    expect(resolveSystemoneLocalTimeoutMs("3500")).toBe(3500);
    expect(resolveSystemoneLocalTimeoutMs(4200)).toBe(4200);
    expect(resolveSystemoneLocalTimeoutMs("")).toBe(5000);
    expect(resolveSystemoneLocalTimeoutMs("0")).toBe(5000);
    expect(resolveSystemoneLocalTimeoutMs("-500")).toBe(5000);
    expect(resolveSystemoneLocalTimeoutMs("abc")).toBe(5000);
    expect(resolveSystemoneLocalTimeoutMs("3500ms")).toBe(5000);
    expect(resolveSystemoneLocalTimeoutMs(undefined)).toBe(5000);
  });

  it("systemoneCore.js carries no provider/model literals or failover table", () => {
    const raw = readFileSync(new URL("../../open-sse/handlers/systemoneCore.js", import.meta.url), "utf8");
    const src = raw.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const literal of ['"ollaya"', '"laya"', '"opencode"', '"opencode-zen"', '"typed-decisions"', '"jev-1.13-free"', '"public"']) {
      expect(src).not.toContain(literal);
    }
    expect(src).not.toMatch(/const SYSTEMONE_FAILOVER\s*=/);
    expect(src).toMatch(/from "\.\.\/config\/systemoneConfig\.js"/);
  });
});

describe("Ollaya failover chain, 5000ms local timeout, AbortSignal cancellation & servedBy provenance", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("forwards to Ollaya with tag as body.model, no Authorization header, and direct servedBy provenance", async () => {
    const fetchMock = vi.fn(async () => ok({ model: "pplx-decider:flash-fp16", answers: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleSystemoneCore({
      body,
      modelInfo: { provider: "ollaya", model: "pplx-decider:flash-fp16" },
      credentials: null,
    });
    expect(res.success).toBe(true);
    expect(res.servedBy).toEqual({
      provider: "ollaya",
      model: "pplx-decider:flash-fp16",
      failover: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://${OLLAYA_HOST}/v1/systemone`);
    expect(JSON.parse(init.body).model).toBe("pplx-decider:flash-fp16");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("fails over directly to opencode-zen/jev-1.13-free when Ollaya is unreachable and reports failover servedBy provenance", async () => {
    const log = { warn: vi.fn(), debug: vi.fn() };
    const fetchMock = vi.fn(async (url) => {
      if (url.includes(OLLAYA_HOST)) throw new Error(`connect ECONNREFUSED ${OLLAYA_HOST}`);
      if (url.includes(ZEN_URL)) return ok({ model: "jev-1.13-free", answers: {}, usage: { input_tokens: 7, output_tokens: 0 } });
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleSystemoneCore({
      body,
      modelInfo: { provider: "ollaya", model: "pplx-decider:flash-fp16" },
      credentials: null,
      log,
    });
    expect(res.success).toBe(true);
    expect(res.usage).toEqual({ prompt_tokens: 7, completion_tokens: 0, total_tokens: 7 });
    expect(res.servedBy).toEqual({
      provider: "opencode-zen",
      model: "jev-1.13-free",
      failover: true,
      failoverFrom: {
        provider: "ollaya",
        model: "pplx-decider:flash-fp16",
        reason: `unreachable at http://${OLLAYA_HOST}/v1/systemone (connect ECONNREFUSED ${OLLAYA_HOST})`,
      },
    });
    const zenCall = fetchMock.mock.calls.find(([u]) => u.includes(ZEN_URL));
    expect(JSON.parse(zenCall[1].body).model).toBe("jev-1.13-free");
    expect(log.warn).toHaveBeenCalledWith(
      "SYSTEMONE",
      `Local Ollaya unreachable at http://${OLLAYA_HOST}/v1/systemone (connect ECONNREFUSED ${OLLAYA_HOST}). Failing over to opencode-zen/jev-1.13-free`
    );
  });

  it("aborts stalled local Ollaya at 5000ms, logs 'timed out after 5000ms', and fails over when caller remains active", async () => {
    vi.useFakeTimers();
    const log = { warn: vi.fn(), debug: vi.fn() };
    const fetchMock = vi.fn((url, init) => {
      if (url.includes(OLLAYA_HOST)) return abortableHangFetch(init);
      if (url.includes(ZEN_URL)) return Promise.resolve(ok({ model: "jev-1.13-free", answers: { q: { type: "noul", noul: 0.9 } } }));
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const promise = handleSystemoneCore({
      body,
      modelInfo: { provider: "ollaya", model: "pplx-decider:flash-fp16" },
      credentials: null,
      log,
    });

    await vi.advanceTimersByTimeAsync(4999);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    const res = await promise;

    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(log.warn).toHaveBeenCalledWith(
      "SYSTEMONE",
      `Local Ollaya timed out after 5000ms at http://${OLLAYA_HOST}/v1/systemone. Failing over to opencode-zen/jev-1.13-free`
    );
    expect(res.servedBy).toEqual({
      provider: "opencode-zen",
      model: "jev-1.13-free",
      failover: true,
      failoverFrom: {
        provider: "ollaya",
        model: "pplx-decider:flash-fp16",
        reason: `timed out after 5000ms at http://${OLLAYA_HOST}/v1/systemone`,
      },
    });
  });

  it("retains standard 60000ms connect timeout for cloud System One providers without local failover", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url, init) => abortableHangFetch(init));
    vi.stubGlobal("fetch", fetchMock);

    const promise = handleSystemoneCore({
      body,
      modelInfo: { provider: "opencode-zen", model: "jev-1.13-free" },
      credentials: { accessToken: "public" },
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(55000);
    const res = await promise;
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(res.success).toBe(false);
  });

  it("aborts in-flight local Ollaya fetch immediately on caller AbortSignal and suppresses zombie failover", async () => {
    const log = { warn: vi.fn(), debug: vi.fn() };
    let capturedLocalSignal;
    const fetchMock = vi.fn((url, init) => {
      if (url.includes(OLLAYA_HOST)) {
        capturedLocalSignal = init.signal;
        return abortableHangFetch(init);
      }
      throw new Error(`zombie failover should never be called: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const callerController = new AbortController();
    const promise = handleSystemoneCore({
      body,
      modelInfo: { provider: "ollaya", model: "pplx-decider:flash-fp16" },
      credentials: null,
      log,
      signal: callerController.signal,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(capturedLocalSignal.aborted).toBe(false);

    callerController.abort(new Error("Smart Router 8000ms ceiling reached"));
    const res = await promise;

    expect(capturedLocalSignal.aborted).toBe(true);
    expect(res.success).toBe(false);
    expect(res.aborted).toBe(true);
    expect(res.status).toBe(408);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(log.warn).not.toHaveBeenCalled();
  });

  it("propagates caller AbortSignal cancellation during an active opencode-zen cloud failover hop", async () => {
    vi.useFakeTimers();
    const log = { warn: vi.fn(), debug: vi.fn() };
    let capturedZenSignal;
    const fetchMock = vi.fn((url, init) => {
      if (url.includes(OLLAYA_HOST)) return abortableHangFetch(init);
      if (url.includes(ZEN_URL)) {
        capturedZenSignal = init.signal;
        return abortableHangFetch(init);
      }
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const callerController = new AbortController();
    const promise = handleSystemoneCore({
      body,
      modelInfo: { provider: "ollaya", model: "pplx-decider:flash-fp16" },
      credentials: null,
      log,
      signal: callerController.signal,
    });

    await vi.advanceTimersByTimeAsync(5000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(capturedZenSignal.aborted).toBe(false);

    callerController.abort(new Error("Caller timed out at 8000ms during cloud failover"));
    const res = await promise;

    expect(capturedZenSignal.aborted).toBe(true);
    expect(res.success).toBe(false);
    expect(res.aborted).toBe(true);
    expect(res.status).toBe(408);
  });

  it.each([500, 502, 503, 504])("fails over to opencode-zen/jev-1.13-free on Ollaya HTTP %i", async (status) => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes(OLLAYA_HOST)) return new Response(JSON.stringify({ error: "x", code: "MODEL_LOAD_FAILED" }), { status });
      if (url.includes(ZEN_URL)) return ok({ model: "jev-1.13-free", answers: {} });
      throw new Error(`unexpected url ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleSystemoneCore({
      body,
      modelInfo: { provider: "ollaya", model: "jeb:4b" },
      credentials: null,
      log: { warn: vi.fn(), debug: vi.fn() },
    });
    expect(res.success).toBe(true);
    expect(res.servedBy).toEqual({
      provider: "opencode-zen",
      model: "jev-1.13-free",
      failover: true,
      failoverFrom: {
        provider: "ollaya",
        model: "jeb:4b",
        reason: `returned status ${status}`,
      },
    });
    expect(fetchMock.mock.calls.map(([u]) => u.includes(ZEN_URL))).toEqual([false, true]);
  });

  it("does not fail over on a client error from Ollaya (e.g. 422)", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ error: "bad", code: "INVALID_REQUEST" }), { status: 422 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleSystemoneCore({
      body,
      modelInfo: { provider: "ollaya", model: "d1:3b" },
      credentials: null,
      log: { warn: vi.fn(), debug: vi.fn() },
    });
    expect(res.success).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
