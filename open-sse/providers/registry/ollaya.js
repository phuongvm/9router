export default {
  id: "ollaya",
  priority: 49,
  alias: "ollaya",
  aliases: ["ollaya-local", "ollaya-system-one"],
  uiAlias: "ollaya",
  display: {
    name: "Ollaya System One (Local GPU)",
    icon: "psychology",
    color: "#6366F1",
    textIcon: "OY",
    website: "http://192.168.100.130:11435",
    notice: {
      text: "Ollaya Jev-compatible decision server on AGENT-4070 (RTX 4070 Ti SUPER, CUDA). Fails over to laya/typed-decisions, then opencode-zen/jev-1.13-free.",
      apiKeyUrl: "http://192.168.100.130:11435",
    },
  },
  category: "apikey",
  authType: "none",
  noAuth: true,
  hasProviderSpecificData: true,
  models: [
    { id: "pplx-decider:flash-fp16", name: "pplx-decider Flash (fp16, Perplexity Qwen3.5-4B)", kind: "systemone" },
    { id: "jeb:4b", name: "Jebadiah 4B (Qwen3.5 GGUF)", kind: "systemone" },
    { id: "d1:3b", name: "Liquid d1 3B (LFM2.5)", kind: "systemone" },
    { id: "d3:mini", name: "Decision 3.0 Mini", kind: "systemone" },
    { id: "credence:e4b-calibrated", name: "Credence E4B Calibrated (Winnow-E4B)", kind: "systemone" },
  ],
  serviceKinds: ["systemone"],
  systemoneConfig: {
    baseUrl: process.env.OLLAYA_SYSTEMONE_URL || "http://192.168.100.130:11435/v1/systemone",
  },
};
