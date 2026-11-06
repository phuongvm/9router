import {
  getProviderCredentials,
  markAccountUnavailable,
  clearAccountError,
  extractApiKey,
  isValidApiKey,
} from "../services/auth.js";
import { getSettings } from "@/lib/localDb";
import { getModelInfo } from "../services/model.js";
import { getKeyAccessContext, enforceKeyAccessResolved } from "../services/keyAccess.js";
import { handleSystemoneCore } from "open-sse/handlers/systemoneCore.js";
import { errorResponse, unavailableResponse } from "open-sse/utils/error.js";
import { HTTP_STATUS } from "open-sse/config/runtimeConfig.js";
import * as log from "../utils/logger.js";
import { checkAndRefreshToken } from "../services/tokenRefresh.js";
import { saveRequestUsage, saveRequestDetail } from "@/lib/usageDb.js";
import { AI_PROVIDERS } from "@/shared/constants/providers.js";

function persistSystemoneTelemetry({
  result,
  requestedProvider,
  requestedModel,
  connectionId,
  apiKey,
  endpoint,
  body,
  start,
}) {
  const latencyMs = Date.now() - start;
  const prompt_tokens = result.usage?.prompt_tokens ?? result.usage?.input_tokens ?? (body?.state ? Math.max(1, Math.ceil(body.state.length / 4)) : 1);
  const completion_tokens = result.usage?.completion_tokens ?? result.usage?.output_tokens ?? 0;
  const tokens = {
    prompt_tokens,
    completion_tokens,
    total_tokens: prompt_tokens + completion_tokens,
  };

  const servedProvider = result.servedBy?.provider || requestedProvider;
  const servedModel = result.servedBy?.model || requestedModel;
  const didFailover = Boolean(result.servedBy?.failover);
  const effectiveConnectionId = didFailover ? undefined : connectionId;
  const meta = didFailover
    ? {
        servedBy: `${servedProvider}/${servedModel}`,
        failover: true,
        requestedProvider: result.servedBy?.failoverFrom?.provider || requestedProvider,
        requestedModel: result.servedBy?.failoverFrom?.model || requestedModel,
        failoverReason: result.servedBy?.failoverFrom?.reason || null,
      }
    : {
        servedBy: `${servedProvider}/${servedModel}`,
        failover: false,
      };

  saveRequestUsage({
    provider: servedProvider,
    model: servedModel,
    connectionId: effectiveConnectionId,
    apiKey,
    endpoint,
    tokens,
    status: "success",
    meta,
  }).catch(() => {});

  saveRequestDetail({
    provider: servedProvider,
    model: servedModel,
    connectionId: effectiveConnectionId,
    apiKey,
    timestamp: new Date().toISOString(),
    latency: { ttft: latencyMs, total: latencyMs },
    tokens,
    request: body,
    response: result.responseBody || {},
    status: "success",
    meta,
  }).catch(() => {});
}

/**
 * Handle System One (Jev) decision requests for the Next.js server.
 * Follows the same auth + account-fallback pattern as handleEmbeddings.
 *
 * @param {Request} request
 */
export async function handleSystemone(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    log.warn("SYSTEMONE", "Invalid JSON body");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid JSON body");
  }

  const url = new URL(request.url);
  const modelStr = body.model;

  log.request("POST", `${url.pathname} | ${modelStr}`);

  // Log API key (masked)
  const apiKey = extractApiKey(request);
  if (apiKey) {
    log.debug("AUTH", `API Key: ${log.maskKey(apiKey)}`);
  } else {
    log.debug("AUTH", "No API key provided (local mode)");
  }

  // Enforce API key if enabled in settings
  const settings = await getSettings();
  if (settings.requireApiKey) {
    if (!apiKey) {
      log.warn("AUTH", "Missing API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Missing API key");
    }
    const valid = await isValidApiKey(apiKey);
    if (!valid) {
      log.warn("AUTH", "Invalid API key (requireApiKey=true)");
      return errorResponse(HTTP_STATUS.UNAUTHORIZED, "Invalid API key");
    }
  }

  if (!modelStr) {
    log.warn("SYSTEMONE", "Missing model");
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing model");
  }
  if (body.state === undefined || body.state === null) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: state");
  }
  if (!body.questions || typeof body.questions !== "object" || Array.isArray(body.questions)) {
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Missing required field: questions");
  }

  const modelInfo = await getModelInfo(modelStr);
  if (!modelInfo.provider) {
    log.warn("SYSTEMONE", "Invalid model format", { model: modelStr });
    return errorResponse(HTTP_STATUS.BAD_REQUEST, "Invalid model format");
  }

  const { provider, model } = modelInfo;

  // Per-key access control: checked before any credential lookup.
  const keyAccessDenied = await enforceKeyAccessResolved(await getKeyAccessContext(request), modelStr, provider, model);
  if (keyAccessDenied) return keyAccessDenied;

  if (modelStr !== `${provider}/${model}`) {
    log.info("ROUTING", `${modelStr} → ${provider}/${model}`);
  } else {
    log.info("ROUTING", `Provider: ${provider}, Model: ${model}`);
  }

  // noAuth providers (e.g. local laya / ollaya) — no stored connection/credentials needed
  const resolvedProvider = AI_PROVIDERS[provider];
  if (resolvedProvider?.noAuth || resolvedProvider?.authType === "none") {
    const start = Date.now();
    const result = await handleSystemoneCore({
      body,
      modelInfo: { provider, model },
      credentials: null,
      log,
      signal: request?.signal,
    });
    if (result.aborted || request?.signal?.aborted) {
      return errorResponse(HTTP_STATUS.REQUEST_TIMEOUT, result.error || "System One request aborted");
    }
    if (result.success) {
      persistSystemoneTelemetry({
        result,
        requestedProvider: provider,
        requestedModel: model,
        connectionId: undefined,
        apiKey,
        endpoint: url.pathname,
        body,
        start,
      });
      return result.response;
    }
    return errorResponse(result.status || HTTP_STATUS.BAD_GATEWAY, result.error || "System One request failed");
  }

  // Credential + fallback loop (mirrors handleEmbeddings)
  const excludeConnectionIds = new Set();
  let lastError = null;
  let lastStatus = null;

  while (true) {
    if (request?.signal?.aborted) {
      return errorResponse(HTTP_STATUS.REQUEST_TIMEOUT, "System One request aborted");
    }

    const credentials = await getProviderCredentials(provider, excludeConnectionIds, model);

    // All accounts unavailable
    if (!credentials || credentials.allRateLimited) {
      if (credentials?.allRateLimited) {
        const errorMsg = lastError || credentials.lastError || "Unavailable";
        const status = lastStatus || Number(credentials.lastErrorCode) || HTTP_STATUS.SERVICE_UNAVAILABLE;
        log.warn("SYSTEMONE", `[${provider}/${model}] ${errorMsg} (${credentials.retryAfterHuman})`);
        return unavailableResponse(status, `[${provider}/${model}] ${errorMsg}`, credentials.retryAfter, credentials.retryAfterHuman);
      }
      if (excludeConnectionIds.size === 0) {
        log.error("AUTH", `No credentials for provider: ${provider}`);
        return errorResponse(HTTP_STATUS.BAD_REQUEST, `No credentials for provider: ${provider}`);
      }
      log.warn("SYSTEMONE", "No more accounts available", { provider });
      return errorResponse(lastStatus || HTTP_STATUS.SERVICE_UNAVAILABLE, lastError || "All accounts unavailable");
    }

    log.info("AUTH", `\x1b[32mUsing ${provider} account: ${credentials.connectionName}\x1b[0m`);

    const refreshedCredentials = await checkAndRefreshToken(provider, credentials);
    const start = Date.now();

    const result = await handleSystemoneCore({
      body,
      modelInfo: { provider, model },
      credentials: refreshedCredentials,
      log,
      signal: request?.signal,
      onRequestSuccess: async () => {
        await clearAccountError(credentials.connectionId, credentials, model);
      },
    });

    if (result.aborted || request?.signal?.aborted) {
      return errorResponse(HTTP_STATUS.REQUEST_TIMEOUT, result.error || "System One request aborted");
    }

    if (result.success) {
      persistSystemoneTelemetry({
        result,
        requestedProvider: provider,
        requestedModel: model,
        connectionId: credentials.connectionId,
        apiKey,
        endpoint: url.pathname,
        body,
        start,
      });
      return result.response;
    }

    const { shouldFallback } = await markAccountUnavailable(credentials.connectionId, result.status, result.error, provider, model);

    if (shouldFallback) {
      log.warn("AUTH", `Account ${credentials.connectionName} unavailable (${result.status}), trying fallback`);
      excludeConnectionIds.add(credentials.connectionId);
      lastError = result.error;
      lastStatus = result.status;
      continue;
    }

    return result.response;
  }
}
