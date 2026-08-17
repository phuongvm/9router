import { describe, it, expect, vi } from "vitest";
import { getProvider, getProviderNames, requestDeviceCode, pollForToken } from "../../src/lib/oauth/providers/index.js";

describe("Nous OAuth provider integration", () => {
  it("registers nous in getProviderNames and getProvider", () => {
    expect(getProviderNames()).toContain("nous");
    const provider = getProvider("nous");
    expect(provider).toBeDefined();
    expect(provider.flowType).toBe("device_code");
    expect(provider.config.deviceCodeUrl).toBe("https://portal.nousresearch.com/api/oauth/device/code");
    expect(provider.config.tokenUrl).toBe("https://portal.nousresearch.com/api/oauth/token");
  });

  it("requests device code with expected shape and params", async () => {
    const fakeFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        device_code: "dev_12345",
        user_code: "ABCD-1234",
        verification_uri: "https://portal.nousresearch.com/device",
        verification_uri_complete: "https://portal.nousresearch.com/device?user_code=ABCD-1234",
        expires_in: 300,
        interval: 5,
      }),
    });
    vi.stubGlobal("fetch", fakeFetch);

    const deviceData = await requestDeviceCode("nous", undefined, {});
    expect(deviceData.device_code).toBe("dev_12345");
    expect(deviceData.user_code).toBe("ABCD-1234");
    expect(deviceData.verification_uri).toBe("https://portal.nousresearch.com/device");
    expect(deviceData.verification_uri_complete).toBe("https://portal.nousresearch.com/device?user_code=ABCD-1234");

    expect(fakeFetch).toHaveBeenCalledWith(
      "https://portal.nousresearch.com/api/oauth/device/code",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("polls token and maps credentials with user email", async () => {
    const fakeFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "nous_access_token_xyz",
          refresh_token: "nous_refresh_token_abc",
          expires_in: 86400,
          scope: "inference:invoke",
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: {
            email: "testuser@nousresearch.com",
          },
        }),
      });
    vi.stubGlobal("fetch", fakeFetch);

    const result = await pollForToken("nous", "dev_12345", null, null);
    expect(result.success).toBe(true);
    expect(result.tokens.accessToken).toBe("nous_access_token_xyz");
    expect(result.tokens.refreshToken).toBe("nous_refresh_token_abc");
    expect(result.tokens.email).toBe("testuser@nousresearch.com");
  });
});
