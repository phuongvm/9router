// Free OpenCode models that don't use the "-free" id suffix
const KNOWN_FREE_OPENCODE_MODELS = ["big-pickle"];

export const FILTERS = {
  "openrouter-free": (models) =>
    models
      .filter(
        (m) =>
          m.pricing?.prompt === "0" &&
          m.pricing?.completion === "0" &&
          m.context_length >= 200000
      )
      .map((m) => ({ id: m.id, name: m.name, contextLength: m.context_length }))
      .sort((a, b) => b.contextLength - a.contextLength),

  "opencode-free": (models) =>
    models
      .filter((m) => m.id?.endsWith("-free") || KNOWN_FREE_OPENCODE_MODELS.includes(m.id))
      .map((m) => ({ id: m.id, name: m.id })),

  // models.dev returns a large catalog; keep only mimo models
  "mimo-free": (models) =>
    (Array.isArray(models) ? models : [])
      .filter((m) => m.id?.startsWith("mimo") || m.name?.toLowerCase().includes("mimo"))
      .map((m) => ({ id: m.id, name: m.name || m.id })),

  "nous": (models) =>
    (Array.isArray(models) ? models : [])
      .map((m) => {
        // Resolve model kind from API metadata (type, kind, architecture, or modalities)
        const outputMods = m.output_modalities || m.architecture?.output_modalities || [];
        const modality = m.architecture?.modality || "";
        const isEmbedding =
          m.kind === "embedding" ||
          m.type === "embedding" ||
          outputMods.includes("embedding") ||
          outputMods.includes("embeddings") ||
          modality.includes("embedding") ||
          modality.includes("embeddings");

        const isImage =
          m.kind === "image" ||
          m.type === "image" ||
          outputMods.includes("image") ||
          modality.includes("image");

        let kind = "llm";
        if (isEmbedding) {
          kind = "embedding";
        } else if (isImage) {
          kind = "image";
        }

        return {
          id: m.id,
          name: m.name || m.id,
          kind: kind,
          contextLength: m.context_length || m.context_window || 0,
        };
      })
      .filter((m) => m.kind === "embedding" || m.kind === "image" || m.contextLength >= 200000)
      .sort((a, b) => b.contextLength - a.contextLength),
};
