import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AntigravityExecutor } from "../../open-sse/executors/antigravity.js";
import { BaseExecutor } from "../../open-sse/executors/base.js";

const HERMES = "You are Hermes Agent, an intelligent AI assistant created by Nous Research.";
const NEUTRAL = "You are an intelligent AI assistant.";
const CLAUDE = "You are a Claude agent, built on Anthropic's Claude Agent SDK.";
const credentials = {
  projectId: "project-1",
  connectionId: "connection-1",
  accessToken: "private-access-token",
  refreshToken: "private-refresh-token",
};

function makeBody(systemText) {
  return {
    model: "gemini-3-flash",
    requestId: "agent/11111111-1111-5111-8111-111111111111/1/22222222-2222-5222-8222-222222222222/1",
    requestType: "client-value",
    userAgent: "client-agent",
    project: "client-project",
    accountContext: { account: "account-1" },
    envelopeMetadata: { trace: "trace-1" },
    thinking: { budget: 1 },
    request: {
      sessionId: "session-1",
      contents: [{ role: "user", parts: [{ text: "hello" }] }],
      systemInstruction: {
        role: "system",
        parts: [
          { text: systemText, marker: "target" },
          { inlineData: { mimeType: "application/octet-stream", data: "AAEC" } },
        ],
        metadata: { tenant: "private-project" },
      },
      tools: [{
        functionDeclarations: [{
          name: "lookup",
          parameters: { type: "object", properties: { query: { type: "string" } } },
        }],
      }],
      toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      generationConfig: { temperature: 0.25, maxOutputTokens: 2048 },
      safetySettings: [{ category: "example", threshold: "example" }],
      requestMetadata: { private: "preserve-shape" },
      reasoning_effort: "high",
    },
  };
}

function transform(body, stream = true) {
  return new AntigravityExecutor().transformRequest("gemini-3-flash", body, stream, credentials);
}

describe("Antigravity semantic identity executor integration", () => {
  it.each([
    [HERMES, NEUTRAL],
    [CLAUDE, ""],
  ])("applies the exact policy only on the standard Antigravity path", (source, replacement) => {
    const suffix = "\n\nKeep safety, governance, memory, project, and tool policy unchanged.";
    const body = makeBody(source + suffix);
    const snapshot = structuredClone(body);

    const result = transform(body);

    expect(result.request.systemInstruction.parts[0].text).toBe(replacement + suffix);
    expect(result.request.systemInstruction.parts[1]).toEqual(snapshot.request.systemInstruction.parts[1]);
    expect(body).toEqual(snapshot);
  });

  it.each([
    [HERMES, "matched"],
    ["Hermes and Nous remain ordinary project context.", "unmatched"],
  ])("does not mutate caller-owned %s input during existing normalization", (systemText) => {
    const body = makeBody(systemText);
    body.stream_options = { include_usage: true };
    const snapshot = structuredClone(body);

    transform(body, false);

    expect(body).toEqual(snapshot);
  });

  it("changes only targeted system text relative to an already-neutral fixture", () => {
    const matched = transform(makeBody(`${HERMES}\nbehavior`));
    const neutral = transform(makeBody(`${NEUTRAL}\nbehavior`));

    expect(matched).toEqual(neutral);
    expect(matched).toMatchObject({
      project: "project-1",
      model: "gemini-3-flash",
      requestType: "agent",
      requestId: expect.stringMatching(/^agent\//),
      accountContext: { account: "account-1" },
      envelopeMetadata: { trace: "trace-1" },
      request: {
        sessionId: "session-1",
        contents: [{ role: "user", parts: [{ text: "hello" }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 2048 },
        requestMetadata: { private: "preserve-shape" },
      },
    });
  });

  it("preserves an absent systemInstruction without adding an undefined property", () => {
    const body = makeBody(HERMES);
    delete body.request.systemInstruction;

    const result = transform(body);

    expect(Object.hasOwn(result.request, "systemInstruction")).toBe(false);
  });

  it("does not apply semantic identity policy to the Antigravity image path", () => {
    const body = makeBody(HERMES);
    body.stream_options = { include_usage: true };
    const snapshot = structuredClone(body);

    const result = new AntigravityExecutor().transformRequest("gemini-3.1-flash-image", body, false, credentials);

    expect(body).toEqual(snapshot);
    expect(result.request.systemInstruction).toBeUndefined();
    expect(snapshot.request.systemInstruction.parts[0].text).toBe(HERMES);
  });

  it("leaves a non-Antigravity executor request untouched", () => {
    const body = makeBody(HERMES);
    const result = new BaseExecutor("other-provider", {}).transformRequest("model", body, true, credentials);

    expect(result).toBe(body);
    expect(result.request.systemInstruction.parts[0].text).toBe(HERMES);
  });

  it("adds no prompt- or credential-derived logging to the compatibility path", () => {
    const helperSource = readFileSync(new URL("../../open-sse/utils/antigravitySemanticIdentity.js", import.meta.url), "utf8");
    const executorSource = readFileSync(new URL("../../open-sse/executors/antigravity.js", import.meta.url), "utf8");
    const transformSource = executorSource.slice(
      executorSource.indexOf("  transformRequest("),
      executorSource.indexOf("  async refreshCredentials(")
    );

    for (const source of [helperSource, transformSource]) {
      expect(source).not.toMatch(/console\.|\bdbg\(|\blog\?\.|\blogger\./);
    }
    expect(helperSource).not.toContain("accessToken");
    expect(helperSource).not.toContain("refreshToken");
  });
});
