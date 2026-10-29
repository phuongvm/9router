import { getModelInfo } from "../services/model.js";
import { getProviderCredentials } from "../services/auth.js";
import { checkAndRefreshToken } from "../services/tokenRefresh.js";
import { handleSystemoneCore } from "open-sse/handlers/systemoneCore.js";
import { saveRequestUsage, saveRequestDetail } from "@/lib/usageDb.js";
import { AI_PROVIDERS } from "@/shared/constants/providers.js";
import { DEFAULT_SYSTEMONE_ROUTER_MODEL } from "open-sse/config/systemoneConfig.js";
import {
  DEFAULT_SYSTEMONE_TIMEOUT_MS,
  extractPromptState,
  buildChoiceCriteria,
  parseSystemOneRouteAnswer,
} from "open-sse/services/systemoneRouter.js";

/**
 * Dispatch an in-process System One decision evaluation for a combo request.
 * Resolves the configured router model's provider and credentials, sends the choice
 * query with a short timeout, and returns the parsed routing decision.
 *
 * Never throws: on missing credentials, timeout, or upstream failure, returns null
 * so combo dispatch fails open to standard model ordering.
 *
 * @param {object} opts
 * @param {object} opts.body - Client request body
 * @param {string[]} opts.models - Combo model candidate array
 * @param {string} [opts.routerModel] - System One router model (defaults to DEFAULT_SYSTEMONE_ROUTER_MODEL)
 * @param {object} [opts.log] - Logger
 * @param {number} [opts.timeoutMs=DEFAULT_SYSTEMONE_TIMEOUT_MS] - Hard ceiling for router evaluation
 * @returns {Promise<{ choice: string, confidence: number|null, probabilities: Record<string, number>|null } | null>}
 */
export async function resolveSmartChoice({
  body,
  models,
  routerModel = DEFAULT_SYSTEMONE_ROUTER_MODEL,
  log,
  timeoutMs = DEFAULT_SYSTEMONE_TIMEOUT_MS,
}) {
  if (!Array.isArray(models) || models.length <= 1) return null;

  const targetModel = (typeof routerModel === "string" && routerModel.trim())
    ? routerModel.trim()
    : DEFAULT_SYSTEMONE_ROUTER_MODEL;

  const state = extractPromptState(body);
  if (!state) {
    log?.debug?.("COMBO", "smart-router: empty prompt state, skipping classification");
    return null;
  }

  const criteria = buildChoiceCriteria(models);
  if (Object.keys(criteria).length === 0) return null;

  try {
    const modelInfo = await getModelInfo(targetModel);
    if (!modelInfo?.provider) {
      log?.warn?.("COMBO", `smart-router: unrecognized router model "${targetModel}"`);
      return null;
    }

    const { provider, model } = modelInfo;
    const resolvedProvider = AI_PROVIDERS[provider];
    const isNoAuth = !!(resolvedProvider?.noAuth || resolvedProvider?.authType === "none");

    const credentials = isNoAuth ? null : await getProviderCredentials(provider, new Set(), model);
    if (!credentials && !isNoAuth) {
      log?.warn?.("COMBO", `smart-router: no credentials available for router provider "${provider}"`);
      return null;
    }
    if (credentials?.allRateLimited) {
      log?.warn?.("COMBO", `smart-router: all credentials rate limited for router provider "${provider}"`);
      return null;
    }

    const refreshedCredentials = credentials ? await checkAndRefreshToken(provider, credentials) : null;
    const systemoneBody = {
      model,
      state,
      questions: {
        route: {
          type: "choice",
          instructions: "Which of these configured models is the most appropriate for this request?",
          criteria,
        },
      },
    };

    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(`System One router timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    const start = Date.now();
    const corePromise = handleSystemoneCore({
      body: systemoneBody,
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      onRequestSuccess: () => {},
    });

    let result;
    try {
      result = await Promise.race([corePromise, timeoutPromise]);
    } finally {
      clearTimeout(timeoutId);
    }

    if (!result?.success || !result.response) {
      log?.warn?.("COMBO", `smart-router: evaluation failed (${result?.status || "error"})`);
      return null;
    }

    const latencyMs = Date.now() - start;
    const prompt_tokens = result.usage?.prompt_tokens ?? result.usage?.input_tokens ?? (state ? Math.max(1, Math.ceil(state.length / 4)) : 1);
    const completion_tokens = result.usage?.completion_tokens ?? result.usage?.output_tokens ?? 0;
    const tokens = {
      prompt_tokens,
      completion_tokens,
      total_tokens: prompt_tokens + completion_tokens,
    };

    const json = result.responseBody || (await result.response.json());
    const route = parseSystemOneRouteAnswer(json);
    // Persist telemetry only after validating the route: "success" means a usable decision.
    const status = route?.choice ? "success" : "error";

    saveRequestUsage({
      provider,
      model,
      connectionId: refreshedCredentials?.connectionId,
      endpoint: "/internal/smart-router",
      tokens,
      status,
    }).catch(() => {});

    saveRequestDetail({
      provider,
      model,
      connectionId: refreshedCredentials?.connectionId,
      timestamp: new Date().toISOString(),
      latency: { ttft: latencyMs, total: latencyMs },
      tokens,
      request: systemoneBody,
      response: json || {},
      status,
    }).catch(() => {});

    if (!route?.choice) {
      log?.warn?.("COMBO", "smart-router: response missing valid route choice");
      return null;
    }

    return route;
  } catch (err) {
    log?.warn?.("COMBO", `smart-router: evaluation aborted (${err?.message || String(err)})`);
    return null;
  }
}
