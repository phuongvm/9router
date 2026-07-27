import { beforeEach, describe, expect, it, vi } from "vitest";

const getProviderConnections = vi.fn();
const checkAndRefreshToken = vi.fn();

vi.mock("@/models", () => ({ getProviderConnections }));
vi.mock("@/sse/services/tokenRefresh.js", () => ({ checkAndRefreshToken }));

const { GET } = await import("../../src/app/api/providers/suggested-models/route.js");

const catalogUrl = "https://inference-api.nousresearch.com/v1/models";

function request(url = catalogUrl, type = "nous") {
  const params = new URLSearchParams({ url, type });
  return new Request(`http://localhost/api/providers/suggested-models?${params}`);
}

describe("Nous suggested models route", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    getProviderConnections.mockReset();
    checkAndRefreshToken.mockReset();
  });

  it("loads only active Nous credentials and uses apiKey as an OAuth-token fallback", async () => {
    getProviderConnections.mockResolvedValue([{ apiKey: "fixture-token" }]);
    checkAndRefreshToken.mockImplementation(async (_provider, connection) => connection);
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        data: [{
          id: "dynamic/embed",
          architecture: { output_modalities: ["embeddings"] },
          context_length: 8192,
        }],
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    );

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(getProviderConnections).toHaveBeenCalledWith({ provider: "nous", isActive: true });
    expect(fetchMock).toHaveBeenCalledWith(catalogUrl, {
      headers: { Authorization: "Bearer fixture-token" },
    });
    expect(body.data).toEqual([
      expect.objectContaining({ id: "dynamic/embed", kind: "embedding" }),
    ]);
  });

  it("refreshes the active Nous credential before requesting the catalog", async () => {
    const connection = {
      id: "nous-connection",
      accessToken: "expired-token",
      refreshToken: "refresh-token",
      expiresAt: new Date(Date.now() - 60_000).toISOString(),
    };
    getProviderConnections.mockResolvedValue([connection]);
    checkAndRefreshToken.mockResolvedValue({ ...connection, accessToken: "fresh-token" });
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(checkAndRefreshToken).toHaveBeenCalledWith("nous", connection);
    expect(fetchMock).toHaveBeenCalledWith(catalogUrl, {
      headers: { Authorization: "Bearer fresh-token" },
    });
  });

  it("rejects catalog URLs that are not declared by a provider", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const response = await GET(request("https://example.com/models"));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propagates an upstream catalog failure", async () => {
    getProviderConnections.mockResolvedValue([]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("unauthorized", { status: 401 }));

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Upstream model catalog returned 401");
  });
});
