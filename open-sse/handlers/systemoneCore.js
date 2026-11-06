import { createErrorResult, parseUpstreamError, formatProviderError } from "../utils/error.js";
import { HTTP_STATUS, FETCH_CONNECT_TIMEOUT_MS } from "../config/runtimeConfig.js";
import { PROVIDER_MEDIA } from "../providers/index.js";
import { getModelUpstreamId } from "../config/providerModels.js";
import { generateSessionId } from "../executors/opencode-zen.js";
import { SYSTEMONE_FAILOVER, SYSTEMONE_OPENCODE_PROVIDERS } from "../config/systemoneConfig.js";

function createAttemptSignal(callerSignal, timeoutMs) {
  const controller = new AbortController();
  let timedOut = false;
  let timer = null;

  const onCallerAbort = () => {
    controller.abort(callerSignal?.reason || new Error("System One request aborted by caller"));
  };

  if (callerSignal) {
    if (callerSignal.aborted) {
      onCallerAbort();
    } else {
      callerSignal.addEventListener("abort", onCallerAbort, { once: true });
    }
  }

  if (!controller.signal.aborted && Number.isFinite(timeoutMs) && timeoutMs > 0) {
    timer = setTimeout(() => {
      timedOut = true;
      const err = new Error(`The operation was aborted due to timeout (${timeoutMs}ms)`);
      err.name = "TimeoutError";
      controller.abort(err);
    }, timeoutMs);
    timer?.unref?.();
  }

  return {
    signal: controller.signal,
    didTimeout: () => timedOut,
    cleanup: () => {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
      if (callerSignal) {
        callerSignal.removeEventListener("abort", onCallerAbort);
      }
    },
  };
}

// Take the configured next hop (config/systemoneConfig.js) for a failed local engine.
function failover({ provider, model, reason, body, log, onRequestSuccess, signal, failoverFrom }) {
  const { label, next } = SYSTEMONE_FAILOVER[provider];
  log?.warn?.("SYSTEMONE", `Local ${label} ${reason}. Failing over to ${next.provider}/${next.model}`);
  return handleSystemoneCore({
    body: { ...body, model: next.model },
    modelInfo: { provider: next.provider, model: next.model },
    credentials: next.credentials,
    log,
    onRequestSuccess,
    signal,
    failoverFrom: failoverFrom || { provider, model, reason },
  });
}

/**
 * Resolve the System One URL. A saved host override is joined with the registry
 * `path` (e.g. "/v1/systemone") without doubling a "/v1" or "/v1/systemone" the
 * user already included. Without `path`, the override is used as a full URL.
 */
export function buildSystemoneUrl(override, cfg) {
  const base = override?.trim();
  if (!base) return cfg?.baseUrl;
  if (!cfg?.path) return base;
  const host = base.replace(/\/+$/, "");
  const path = cfg.path.replace(/\/+$/, "");
  if (host.endsWith(path)) return host;
  const prefix = path.slice(0, path.lastIndexOf("/"));
  if (prefix && host.endsWith(prefix)) return host + path.slice(prefix.length);
  return host + path;
}

/**
 * Core System One (Jev) handler — native decision payload pass-through.
 * URL/headers come from the registry's systemoneConfig; body and JSON response
 * are forwarded untouched (decision models have no chat translation layer).
 *
 * @returns {Promise<{ success: boolean, response: Response, usage?: object, servedBy?: object, aborted?: boolean, status?: number, error?: string }>}
 */
export async function handleSystemoneCore({
  body,
  modelInfo,
  credentials,
  log,
  onRequestSuccess,
  signal,
  failoverFrom = null,
}) {
  const { provider, model } = modelInfo;
  const cfg = PROVIDER_MEDIA[provider]?.systemoneConfig;
  let targetUrl = buildSystemoneUrl(credentials?.providerSpecificData?.baseUrl, cfg);
  if (!targetUrl) {
    return createErrorResult(
      HTTP_STATUS.BAD_REQUEST,
      `Provider '${provider}' does not support System One.`
    );
  }
  // Cloudflare-style endpoints embed the account and model in the path.
  if (targetUrl.includes("{accountId}")) {
    const accountId = credentials?.providerSpecificData?.accountId;
    if (!accountId) {
      return createErrorResult(
        HTTP_STATUS.BAD_REQUEST,
        `Provider '${provider}' requires accountId in providerSpecificData.`
      );
    }
    targetUrl = targetUrl.replace("{accountId}", accountId);
  }
  if (targetUrl.includes("{model}")) {
    targetUrl = targetUrl.replace(/\{model\}/g, model);
  }

  // Validate input at the trust boundary; question-level shape is upstream's job.
  if (body.state === undefined || body.state === null) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, "Missing required field: state");
  }
  if (!body.questions || typeof body.questions !== "object" || Array.isArray(body.questions)) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, "Missing required field: questions");
  }

  if (signal?.aborted) {
    log?.debug?.("SYSTEMONE", "Request aborted by caller before fetch");
    return {
      ...createErrorResult(HTTP_STATUS.REQUEST_TIMEOUT, "System One request aborted"),
      aborted: true,
    };
  }

  // noAuth free lanes carry accessToken from the credential stub.
  const token = credentials?.apiKey || credentials?.accessToken;
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(cfg.headers || {}),
    // Zen lanes expect the official client session header; other providers don't need it.
    ...(SYSTEMONE_OPENCODE_PROVIDERS.has(provider) ? { "x-opencode-session": generateSessionId() } : {}),
  };
  // Cloudflare validates the body model as a short selector (e.g. "clef-flash"), not the full id.
  const requestBody = { ...body, model: getModelUpstreamId(provider, model) || model };

  log?.debug?.("SYSTEMONE", `${provider.toUpperCase()} | ${model}`);

  const failoverCfg = SYSTEMONE_FAILOVER[provider];
  const providerTimeoutMs = failoverCfg?.timeoutMs ?? FETCH_CONNECT_TIMEOUT_MS;
  const attempt = createAttemptSignal(signal, providerTimeoutMs);

  let providerResponse;
  try {
    providerResponse = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
      signal: attempt.signal,
    });
  } catch (error) {
    if (signal?.aborted) {
      log?.debug?.("SYSTEMONE", "Request aborted by caller");
      return {
        ...createErrorResult(
          HTTP_STATUS.REQUEST_TIMEOUT,
          error?.message || "System One request aborted"
        ),
        aborted: true,
      };
    }
    if (failoverCfg) {
      const isTimeout = attempt.didTimeout() || error?.name === "TimeoutError";
      const reason = isTimeout
        ? `timed out after ${providerTimeoutMs}ms at ${targetUrl}`
        : `unreachable at ${targetUrl} (${error.message})`;
      return failover({
        provider,
        model,
        reason,
        body,
        log,
        onRequestSuccess,
        signal,
        failoverFrom,
      });
    }
    const errMsg = formatProviderError(error, provider, model, HTTP_STATUS.BAD_GATEWAY);
    log?.debug?.("SYSTEMONE", `Fetch error: ${errMsg}`);
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, errMsg);
  } finally {
    attempt.cleanup();
  }

  if (!providerResponse.ok) {
    if (signal?.aborted) {
      return {
        ...createErrorResult(HTTP_STATUS.REQUEST_TIMEOUT, "System One request aborted"),
        aborted: true,
      };
    }
    if (failoverCfg?.statuses.includes(providerResponse.status)) {
      return failover({
        provider,
        model,
        reason: `returned status ${providerResponse.status}`,
        body,
        log,
        onRequestSuccess,
        signal,
        failoverFrom,
      });
    }
    const { statusCode, message } = await parseUpstreamError(providerResponse);
    const errMsg = formatProviderError(new Error(message), provider, model, statusCode);
    log?.debug?.("SYSTEMONE", `Provider error: ${errMsg}`);
    return createErrorResult(statusCode, errMsg);
  }

  let responseBody;
  try {
    responseBody = await providerResponse.json();
  } catch {
    return createErrorResult(HTTP_STATUS.BAD_GATEWAY, `Invalid JSON response from ${provider}`);
  }

  if (onRequestSuccess) await onRequestSuccess();

  const usage = responseBody?.usage;
  const prompt_tokens = usage?.input_tokens ?? usage?.prompt_tokens ?? (body?.state ? Math.max(1, Math.ceil(body.state.length / 4)) : 1);
  const completion_tokens = usage?.output_tokens ?? usage?.completion_tokens ?? 0;
  return {
    success: true,
    responseBody,
    usage: {
      prompt_tokens,
      completion_tokens,
      total_tokens: prompt_tokens + completion_tokens,
    },
    servedBy: {
      provider,
      model,
      failover: Boolean(failoverFrom),
      ...(failoverFrom ? { failoverFrom } : {}),
    },
    response: new Response(JSON.stringify(responseBody), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }),
  };
}
