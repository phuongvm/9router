// Custom/local provider filters that are not part of upstream 9router
// Keeping them in this dedicated file avoids merge conflicts when upstream updates filters.js
export const CUSTOM_FILTERS = {
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
