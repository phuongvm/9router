import { describe, expect, it } from "vitest";
import cursorProvider from "../../open-sse/providers/registry/cursor.js";
import { buildCursorHeaders } from "../../open-sse/utils/cursorChecksum.js";

const REQUIRED_CURSOR_CLIENT_VERSION = "3.9.16";

describe("Cursor client version contract", () => {
  it("uses the supported client version in registry metadata and wire headers", () => {
    expect(cursorProvider.transport.clientVersion).toBe(REQUIRED_CURSOR_CLIENT_VERSION);
    expect(cursorProvider.oauth.clientVersion).toBe(REQUIRED_CURSOR_CLIENT_VERSION);

    const headers = buildCursorHeaders("test-token", "00000000-0000-0000-0000-000000000000");
    expect(headers["x-cursor-client-version"]).toBe(REQUIRED_CURSOR_CLIENT_VERSION);
  });
});
