export default {
  id: "laya",
  priority: 50,
  alias: "laya",
  aliases: ["laya-system-one", "laya-decision"],
  uiAlias: "laya",
  display: {
    name: "Laya System One (Local GPU)",
    icon: "psychology",
    color: "#10B981",
    textIcon: "LY",
    website: "http://192.168.100.130:8000",
    notice: {
      text: "Laya on-device System-1 decision engine on AGENT-4070 (RTX 4070 Ti SUPER). Sub-40ms non-autoregressive decisions.",
      apiKeyUrl: "http://192.168.100.130:8000",
    },
  },
  category: "apikey",
  authType: "none",
  noAuth: true,
  hasProviderSpecificData: true,
  models: [
    { id: "laya-auto", name: "Laya Dynamic Auto-Router", kind: "systemone" },
    { id: "english", name: "Laya English (ModernBERT 421M)", kind: "systemone" },
    { id: "multilingual", name: "Laya Multilingual (mmBERT 8k Context)", kind: "systemone" },
    { id: "typed-decisions", name: "Laya Typed Decisions (Fine-Tuned)", kind: "systemone" },
  ],
  serviceKinds: ["systemone"],
  systemoneConfig: {
    baseUrl: process.env.LAYA_SYSTEMONE_URL || "http://192.168.100.130:8000/v1/systemone",
  },
};
