// System One (decision models) routing config — consumed by handlers/systemoneCore.js

/**
 * Local System One failover chain: ollaya -> laya/typed-decisions -> opencode-zen/jev-1.13-free.
 * Keyed by the provider that failed. A hop is taken on a connection error or on one of
 * `statuses` from the local engine; client errors (4xx) are returned as-is.
 * Ollaya reports load/inference failures as HTTP 500. The laya hop is 9ROUTER-INV-7.
 */
export const SYSTEMONE_FAILOVER = {
  ollaya: {
    label: "Ollaya",
    statuses: [500, 502, 503, 504],
    next: { provider: "laya", model: "typed-decisions", credentials: null },
  },
  laya: {
    label: "Laya",
    statuses: [502, 503, 504],
    // noAuth free lane: accessToken "public" is the credential stub.
    next: { provider: "opencode-zen", model: "jev-1.13-free", credentials: { accessToken: "public" } },
  },
};

// Zen lanes expect the official client session header (x-opencode-session).
export const SYSTEMONE_OPENCODE_PROVIDERS = new Set(["opencode", "opencode-zen"]);
