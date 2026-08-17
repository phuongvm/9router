import { NOUS_CONFIG } from "../constants/oauth.js";
import { extractEmailFromAccessToken } from "../providerHelpers.js";

// Nous Research - OAuth Device Code Flow (Matching 9Router Device Code Contract)
const nous = {
  config: NOUS_CONFIG,
  flowType: "device_code",
  requestDeviceCode: async (config) => {
    const response = await fetch(config.deviceCodeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: config.clientId || "hermes-cli",
        scope: config.scope || "inference:invoke",
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Device code request failed: ${error}`);
    }

    const data = await response.json();
    return {
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri || "https://portal.nousresearch.com/device",
      verification_uri_complete:
        data.verification_uri_complete ||
        (data.user_code
          ? `https://portal.nousresearch.com/device?user_code=${data.user_code}`
          : "https://portal.nousresearch.com/device"),
      expires_in: data.expires_in || 300,
      interval: data.interval || 5,
    };
  },
  pollToken: async (config, deviceCode) => {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
        client_id: config.clientId || "hermes-cli",
        device_code: deviceCode,
      }),
    });

    const data = await response.json();

    if (response.ok && data.access_token) {
      // Best-effort profile fetch to get user email (e.g. vmphuongit@gmail.com) for connection name
      let userEmail = null;
      try {
        const accountRes = await fetch("https://portal.nousresearch.com/api/oauth/account", {
          headers: { Authorization: `Bearer ${data.access_token}` },
        });
        if (accountRes.ok) {
          const accountData = await accountRes.json();
          userEmail = accountData.user?.email || null;
        }
      } catch {}

      return {
        ok: true,
        data: {
          ...data,
          _userEmail: userEmail,
        },
      };
    }

    if (data.error === "authorization_pending" || data.error === "slow_down") {
      return { ok: false, data: { error: "authorization_pending" } };
    }

    return {
      ok: false,
      data: {
        error: data.error || "poll_failed",
        error_description: data.error_description || "Authorization failed",
      },
    };
  },
  mapTokens: (tokens) => {
    const email =
      tokens._userEmail ||
      tokens.email ||
      tokens.user_email ||
      tokens.user?.email ||
      extractEmailFromAccessToken(tokens.access_token) ||
      extractEmailFromAccessToken(tokens.id_token) ||
      null;
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token || "",
      expiresIn: tokens.expires_in || 86400,
      scope: tokens.scope,
      email: email,
      providerSpecificData: {},
    };
  },
};

export default nous;
