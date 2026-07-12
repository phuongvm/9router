import { describe, it, expect, beforeEach } from "vitest";

import {
  isTrustedApiPeer,
  shouldEnforceApiKey,
} from "../../src/sse/services/trustedApiPeer.js";

function request(headers = {}) {
  return { headers: new Headers(headers) };
}

describe("trusted API peer policy", () => {
  beforeEach(() => {
    delete process.env.TRUSTED_API_CIDRS;
  });

  it("trusts a Docker bridge peer inside the configured CIDR", () => {
    process.env.TRUSTED_API_CIDRS = "172.20.0.0/16";

    expect(isTrustedApiPeer(request({ "x-9r-real-ip": "172.20.0.24" }))).toBe(true);
  });

  it("trusts IPv4-mapped Docker bridge addresses", () => {
    process.env.TRUSTED_API_CIDRS = "172.20.0.0/16";

    expect(isTrustedApiPeer(request({ "x-9r-real-ip": "::ffff:172.20.0.24" }))).toBe(true);
  });

  it("does not trust peers outside the configured CIDR", () => {
    process.env.TRUSTED_API_CIDRS = "172.20.0.0/16";

    expect(isTrustedApiPeer(request({ "x-9r-real-ip": "10.204.111.34" }))).toBe(false);
  });

  it("does not trust Host-only requests without the socket-derived peer IP", () => {
    process.env.TRUSTED_API_CIDRS = "172.20.0.0/16";

    expect(isTrustedApiPeer(request({ host: "9router:20128" }))).toBe(false);
  });

  it("ignores malformed CIDR entries", () => {
    process.env.TRUSTED_API_CIDRS = "not-a-cidr,172.20.0.0/33";

    expect(isTrustedApiPeer(request({ "x-9r-real-ip": "172.20.0.24" }))).toBe(false);
  });

  it("disables API-key enforcement for trusted API peers only", () => {
    process.env.TRUSTED_API_CIDRS = "172.20.0.0/16";

    expect(shouldEnforceApiKey({ requireApiKey: true }, request({ "x-9r-real-ip": "172.20.0.24" }))).toBe(false);
    expect(shouldEnforceApiKey({ requireApiKey: true }, request({ "x-9r-real-ip": "10.204.111.34" }))).toBe(true);
    expect(shouldEnforceApiKey({ requireApiKey: false }, request({ "x-9r-real-ip": "10.204.111.34" }))).toBe(false);
  });
});
