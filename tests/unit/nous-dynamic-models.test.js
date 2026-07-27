import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FILTERS } from "../../src/app/api/providers/suggested-models/filters.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

describe("Nous dynamic model catalog", () => {
  it("classifies embeddings from upstream metadata and preserves them below 200k context", () => {
    const models = FILTERS.nous([
      {
        id: "dynamic/embed",
        architecture: { output_modalities: ["embeddings"] },
        context_length: 8192,
      },
      { id: "dynamic/high-context", context_length: 200000 },
      { id: "dynamic/low-context", context_length: 199999 },
    ]);

    expect(models.map((model) => model.id)).toEqual([
      "dynamic/high-context",
      "dynamic/embed",
    ]);
    expect(models.find((model) => model.id === "dynamic/embed")?.kind).toBe("embedding");
  });

  it("does not hardcode embedding models in the Nous registry", () => {
    const registry = fs.readFileSync(
      path.join(repoRoot, "open-sse/providers/registry/nous.js"),
      "utf8"
    );

    expect(registry).not.toMatch(/kind:\s*["']embedding["']/);
    expect(registry).toContain("modelsFetcher");
  });

  it("loads and merges the configured catalog in ModelsCard", () => {
    const modelsCard = fs.readFileSync(
      path.join(repoRoot, "src/app/(dashboard)/dashboard/providers/components/ModelsCard.js"),
      "utf8"
    );

    expect(modelsCard).toContain("AI_PROVIDERS[providerId]?.modelsFetcher");
    expect(modelsCard).toContain("/api/providers/suggested-models?");
    expect(modelsCard).toContain("return [...builtInModels, ...dynamicModels]");
  });
});