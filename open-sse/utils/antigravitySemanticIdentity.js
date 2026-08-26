import { ANTIGRAVITY_SEMANTIC_IDENTITY_REPLACEMENTS } from "../config/antigravityCompatibility.js";

export function sanitizeAntigravitySystemInstruction(
  systemInstruction,
  replacements = ANTIGRAVITY_SEMANTIC_IDENTITY_REPLACEMENTS
) {
  if (!systemInstruction || typeof systemInstruction !== "object" || !Array.isArray(systemInstruction.parts)) {
    return systemInstruction;
  }

  let changed = false;
  const parts = systemInstruction.parts.map(part => {
    if (!part || typeof part !== "object" || typeof part.text !== "string") return part;

    let text = part.text;
    for (const { source, replacement } of replacements) {
      text = text.split(source).join(replacement);
    }

    if (text === part.text) return part;
    changed = true;
    return { ...part, text };
  });

  return changed ? { ...systemInstruction, parts } : systemInstruction;
}
