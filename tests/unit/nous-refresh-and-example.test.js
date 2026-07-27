import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Nous OAuth refresh", () => {
  it("uses the Nous refresh-token protocol through refreshProviderCredentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        access_token: "fresh-access",
        refresh_token: "rotated-refresh",
        expires_in: 3600,
      }), { status: 200, headers: { "Content-Type": "application/json" } })
    );
    globalThis.fetch = fetchMock;

    const { refreshProviderCredentials } = await import(
      "../../open-sse/services/oauthCredentialManager.js"
    );
    const result = await refreshProviderCredentials("nous", {
      connectionId: "nous-refresh-test",
      refreshToken: "old-refresh",
    });

    expect(result).toEqual(expect.objectContaining({
      accessToken: "fresh-access",
      refreshToken: "rotated-refresh",
      expiresIn: 3600,
    }));
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://portal.nousresearch.com/api/oauth/token");
    expect(options.body.get("grant_type")).toBe("refresh_token");
    expect(options.body.get("client_id")).toBe("hermes-cli");
  });
});

describe("Embedding Example dynamic models", () => {
  it("shares ModelsCard dynamic embedding models with EmbeddingExampleCard", () => {
    const detailPage = fs.readFileSync(
      path.join(repoRoot, "src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/page.js"),
      "utf8"
    );
    const modelsCard = fs.readFileSync(
      path.join(repoRoot, "src/app/(dashboard)/dashboard/providers/components/ModelsCard.js"),
      "utf8"
    );
    const exampleCard = fs.readFileSync(
      path.join(repoRoot, "src/app/(dashboard)/dashboard/media-providers/[kind]/[id]/components/EmbeddingExampleCard.js"),
      "utf8"
    );

    expect(detailPage).toContain("onModelsChange={setAvailableModels}");
    expect(detailPage).toContain("models={availableModels}");
    expect(modelsCard).toContain("onModelsChange");
    expect(exampleCard).toContain("models = []");
  });
});
