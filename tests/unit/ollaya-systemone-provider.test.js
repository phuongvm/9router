import { afterEach, describe, expect, it, vi } from "vitest";
import REGISTRY from "../../open-sse/providers/registry/index.js";
import { PROVIDER_MEDIA } from "../../open-sse/providers/index.js";
import { getProvidersByKind } from "@/shared/constants/providers";
import { handleSystemoneCore } from "../../open-sse/handlers/systemoneCore.js";

const OLLAYA_HOST = "192.168.100.130:11435";
const LAYA_HOST = "192.168.100.130:8000";
const ZEN_URL = "opencode.ai/zen/v1/systemone";

const body = { state: "test state", questions: { q: { type: "noul", instructions: "test" } } };
const ok = (payload) =>
  new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });

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

describe("Ollaya failover chain: ollaya -> laya/typed-decisions -> opencode-zen/jev-1.13-free", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("forwards to Ollaya with the tag as body.model and no Authorization header", async () => {
    const fetchMock = vi.fn(async () => ok({ model: "pplx-decider:flash-fp16", answers: {} }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await handleSystemoneCore({
      body,
      modelInfo: { provider: "ollaya", model: "pplx-decider:flash-fp16" },
      credentials: null,
    });
    expect(res.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`http://${OLLAYA_HOST}/v1/systemone`);
    expect(JSON.parse(init.body).model).toBe("pplx-decider:flash-fp16");
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("fails over to laya/typed-decisions when Ollaya is unreachable", async () => {
    const log = { warn: vi.fn(), debug: vi.fn() };
    const fetchMock = vi.fn(async (url) => {
      if (url.includes(OLLAYA_HOST)) throw new Error(`connect ECONNREFUSED ${OLLAYA_HOST}`);
      if (url.includes(LAYA_HOST)) return ok({ model: "typed-decisions", answers: {}, usage: { input_tokens: 7, output_tokens: 0 } });
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
    const layaCall = fetchMock.mock.calls.find(([u]) => u.includes(LAYA_HOST));
    expect(JSON.parse(layaCall[1].body).model).toBe("typed-decisions");
    expect(log.warn).toHaveBeenCalledWith("SYSTEMONE", expect.stringContaining("Failing over to laya/typed-decisions"));
  });

  it.each([500, 502, 503, 504])("fails over to laya/typed-decisions on Ollaya HTTP %i", async (status) => {
    const fetchMock = vi.fn(async (url) => {
      if (url.includes(OLLAYA_HOST)) return new Response(JSON.stringify({ error: "x", code: "MODEL_LOAD_FAILED" }), { status });
      if (url.includes(LAYA_HOST)) return ok({ model: "typed-decisions", answers: {} });
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
    expect(fetchMock.mock.calls.map(([u]) => u.includes(LAYA_HOST))).toEqual([false, true]);
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

  it("falls through to opencode-zen/jev-1.13-free when Ollaya and Laya are both down", async () => {
    const log = { warn: vi.fn(), debug: vi.fn() };
    const fetchMock = vi.fn(async (url, init) => {
      if (url.includes(OLLAYA_HOST)) throw new Error("connect ECONNREFUSED ollaya");
      if (url.includes(LAYA_HOST)) return new Response("bad gateway", { status: 502 });
      if (url.includes(ZEN_URL)) return ok({ model: "jev-1.13-free", answers: {}, usage: { input_tokens: 3, output_tokens: 0 } });
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
    const hosts = fetchMock.mock.calls.map(([u]) => (u.includes(OLLAYA_HOST) ? "ollaya" : u.includes(LAYA_HOST) ? "laya" : "zen"));
    expect(hosts).toEqual(["ollaya", "laya", "zen"]);
    const zenCall = fetchMock.mock.calls[2];
    expect(JSON.parse(zenCall[1].body).model).toBe("jev-1.13-free");
    expect(log.warn).toHaveBeenCalledWith("SYSTEMONE", expect.stringContaining("Failing over to opencode-zen/jev-1.13-free"));
  });
});
