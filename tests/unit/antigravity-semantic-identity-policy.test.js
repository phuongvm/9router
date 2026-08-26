import { describe, expect, it } from "vitest";
import * as policyModule from "../../open-sse/config/antigravityCompatibility.js";

const EXPECTED_POLICY = [
  {
    source: "You are Hermes Agent, an intelligent AI assistant created by Nous Research.",
    replacement: "You are an intelligent AI assistant.",
  },
  {
    source: "You are a Claude agent, built on Anthropic's Claude Agent SDK.",
    replacement: "",
  },
];

describe("Antigravity semantic identity policy", () => {
  it("exports only the complete ordered literal replacement table", () => {
    expect(Object.keys(policyModule)).toEqual(["ANTIGRAVITY_SEMANTIC_IDENTITY_REPLACEMENTS"]);
    expect(policyModule.ANTIGRAVITY_SEMANTIC_IDENTITY_REPLACEMENTS).toEqual(EXPECTED_POLICY);
    expect(policyModule.ANTIGRAVITY_SEMANTIC_IDENTITY_REPLACEMENTS.every(({ source }) => typeof source === "string")).toBe(true);
  });

  it("freezes the table and every policy entry", () => {
    const policy = policyModule.ANTIGRAVITY_SEMANTIC_IDENTITY_REPLACEMENTS;

    expect(Object.isFrozen(policy)).toBe(true);
    expect(policy.every(Object.isFrozen)).toBe(true);
  });
});
