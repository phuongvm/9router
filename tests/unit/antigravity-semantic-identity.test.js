import { describe, expect, it } from "vitest";
import { sanitizeAntigravitySystemInstruction } from "../../open-sse/utils/antigravitySemanticIdentity.js";

const HERMES = "You are Hermes Agent, an intelligent AI assistant created by Nous Research.";
const NEUTRAL = "You are an intelligent AI assistant.";
const CLAUDE = "You are a Claude agent, built on Anthropic's Claude Agent SDK.";

describe("sanitizeAntigravitySystemInstruction", () => {
  it("neutralizes exact known attributions and preserves the behavioral suffix byte-for-byte", () => {
    const suffix = "\n\nSafety: retain  two spaces.\r\nTool policy: unchanged.";
    const input = { parts: [{ text: HERMES + suffix }, { text: CLAUDE + suffix }] };

    const result = sanitizeAntigravitySystemInstruction(input);

    expect(result.parts[0].text).toBe(NEUTRAL + suffix);
    expect(result.parts[1].text).toBe(suffix);
  });

  it.each([
    "You are hermes Agent, an intelligent AI assistant created by Nous Research.",
    "You are Hermes Agent, an intelligent AI assistant created by Nous Research!",
    "Hermes and Nous Research are discussed as project context.",
    "Claude uses Anthropic tooling in this repository.",
  ])("leaves wording, case, punctuation, and unrelated near misses unchanged: %s", (text) => {
    const input = { parts: [{ text }] };
    expect(sanitizeAntigravitySystemInstruction(input)).toBe(input);
  });

  it.each([undefined, null, "text", 42, {}, { parts: null }, { parts: {} }])(
    "returns malformed instruction unchanged without throwing: %j",
    (input) => {
      expect(() => sanitizeAntigravitySystemInstruction(input)).not.toThrow();
      expect(sanitizeAntigravitySystemInstruction(input)).toBe(input);
    }
  );

  it("preserves multipart boundaries, non-text parts, properties, and caller input", () => {
    const nonTextPart = { inlineData: { mimeType: "application/octet-stream", data: "AAEC" }, metadata: { private: true } };
    const unchangedPart = { text: "governance and memory remain unchanged", marker: 1 };
    const changedPart = { text: `prefix ${HERMES} suffix`, marker: 2 };
    const input = {
      role: "system",
      parts: [unchangedPart, nonTextPart, changedPart, { text: 17 }, null],
      metadata: { tenant: "private-project" },
    };
    const snapshot = structuredClone(input);

    const result = sanitizeAntigravitySystemInstruction(input);

    expect(input).toEqual(snapshot);
    expect(result).not.toBe(input);
    expect(result.parts).not.toBe(input.parts);
    expect(result.parts).toHaveLength(input.parts.length);
    expect(result.parts[0]).toBe(unchangedPart);
    expect(result.parts[1]).toBe(nonTextPart);
    expect(result.parts[2]).not.toBe(changedPart);
    expect(result.parts[2]).toEqual({ ...changedPart, text: `prefix ${NEUTRAL} suffix` });
    expect(result.parts[3]).toBe(input.parts[3]);
    expect(result.parts[4]).toBe(input.parts[4]);
    expect(result.metadata).toBe(input.metadata);
  });

  it("returns the original instruction and nested identities when no text changes", () => {
    const input = { parts: [{ text: "unmatched" }, { custom: true }] };
    expect(sanitizeAntigravitySystemInstruction(input)).toBe(input);
  });

  it.each([
    HERMES,
    `${HERMES} ${HERMES}`,
    `${HERMES}\n${CLAUDE}`,
    "unmatched",
  ])("is deterministic and idempotent: %s", (text) => {
    const input = { parts: [{ text }] };
    const first = sanitizeAntigravitySystemInstruction(input);
    const second = sanitizeAntigravitySystemInstruction(first);
    const independent = sanitizeAntigravitySystemInstruction(structuredClone(input));

    expect(second).toEqual(first);
    expect(independent).toEqual(first);
  });
});
