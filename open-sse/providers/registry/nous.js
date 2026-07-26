export default {
  id: "nous",
  priority: 250,
  alias: "nous",
  display: {
    name: "Nous Research",
    icon: "/providers/nous.png",
    color: "#8A2BE2",
    textIcon: "NR",
    baseUrl: "https://inference-api.nousresearch.com/v1",
    notice: {
      text: "Sign in with your Nous Portal account via device code.",
      signupUrl: "https://portal.nousresearch.com",
    },
  },
  category: "oauth",
  authModes: ["oauth"],
  hasOAuth: true,
  thinkingConfig: {
    options: ["auto", "low", "medium", "high"],
    defaultMode: "auto",
  },
  transport: {
    baseUrl: "https://inference-api.nousresearch.com/v1/chat/completions",
    format: "openai",
  },
  modelsFetcher: { url: "https://inference-api.nousresearch.com/v1/models", type: "nous" },
  passthroughModels: true,
  models: [
    { id: "nousresearch/hermes-4-70b", name: "Nous Hermes 4 70B" },
    { id: "nousresearch/hermes-4-405b", name: "Nous Hermes 4 405B" },
    { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
    { id: "google/gemini-3.5-flash", name: "Gemini 3.5 Flash" },
    { id: "deepseek/deepseek-v4-pro", name: "DeepSeek V4 Pro" },
  ],
  oauth: {
    clientId: "hermes-cli",
    deviceCodeUrl: "https://portal.nousresearch.com/api/oauth/device/code",
    tokenUrl: "https://portal.nousresearch.com/api/oauth/token",
    scope: "inference:invoke",
  },
};
