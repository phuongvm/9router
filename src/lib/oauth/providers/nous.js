import { NOUS_CONFIG } from "../constants/oauth.js";
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
      throw new Error(`Nous device code request failed: ${error}`);
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

    let data;
    try {
      data = await response.json();
    } catch {
      const text = await response.text().catch(() => "");
      data = { error: "invalid_response", error_description: text };
    }

    if (response.ok && data?.access_token) {
      // Best-effort profile fetch to get user email (e.g. user@nousresearch.com) for connection name
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

    const pending =
      data?.error === "authorization_pending" ||
      data?.error === "slow_down";
    return {
      ok: response.ok || pending,
      data,
    };
  },
  postExchange: async (tokens) => {
    try {
      const response = await fetch(NOUS_CONFIG.agentKeyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${tokens.access_token}`,
        },
        body: JSON.stringify({
          min_ttl_seconds: 7200,
        }),
      });

      if (!response.ok) {
        const error = await response.text().catch(() => "");
        console.warn(`[oauth] Nous agent key mint failed (${response.status}): ${error}`);
        return { agentKey: null };
      }

      const data = await response.json();
      return {
        agentKey: data.api_key || null,
        agentKeyId: data.key_id || null,
        agentKeyExpiresAt: data.expires_at || null,
        agentKeyExpiresIn: data.expires_in || null,
      };
    } catch (err) {
      console.warn(`[oauth] Nous agent key mint error: ${err?.message || err}`);
      return { agentKey: null };
    }
  },
  mapTokens: (tokens, extra) => {
    const email =
      tokens._userEmail ||
      tokens.email ||
      tokens.user_email ||
      tokens.user?.email ||
      null;
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresIn: tokens.expires_in,
      scope: tokens.scope,
      email,
      apiKey: extra?.agentKey || tokens.access_token,
      providerSpecificData: {
        inferenceBaseUrl: NOUS_CONFIG.inferenceBaseUrl,
        ...(extra?.agentKeyId ? { agentKeyId: extra.agentKeyId } : {}),
        ...(extra?.agentKeyExpiresAt ? { agentKeyExpiresAt: extra.agentKeyExpiresAt } : {}),
      },
    };
  },
};

export default nous;
