import { createErrorResult, parseUpstreamError, formatProviderError } from "../utils/error.js";
import { HTTP_STATUS, FETCH_CONNECT_TIMEOUT_MS } from "../config/runtimeConfig.js";
import { PROVIDER_MEDIA } from "../providers/index.js";
import { getModelMeta, getModelUpstreamId } from "../config/providerModels.js";
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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * Validate System One request payload at the trust boundary.
 * Decision models (Clef, Jev, Drex) take `questions`; extraction models such as
 * Cloudflare `@cf/cloudflare/clairic` declare `payloadShape: "fields"` and take
 * `fields` instead. Unregistered custom models accept either map shape.
 */
export function validateSystemonePayload(body, provider, model, customPayloadShape = null) {
  if (!body || body.state === undefined || body.state === null) {
    return "Missing required field: state";
  }
  const meta = provider && model ? getModelMeta(provider, model) : null;
  const shape = customPayloadShape || meta?.payloadShape || (meta ? "questions" : null);
  if (shape === "fields") {
    if (!isPlainObject(body.fields)) {
      return "Missing required field: fields";
    }
    return null;
  }
  if (shape === "questions") {
    if (!isPlainObject(body.questions)) {
      return "Missing required field: questions";
    }
    return null;
  }
  if (!isPlainObject(body.questions) && !isPlainObject(body.fields)) {
    return "Missing required field: questions";
  }
  return null;
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
 * are forwarded untouched (decision models have no chat translation layer), except that
 * Cloudflare's { result } envelope is unwrapped.
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
  const { provider, model, upstreamModelId: customUpstreamModelId, payloadShape: customPayloadShape } = modelInfo;
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

  // Validate input at the trust boundary; field/question schema details are upstream's job.
  const payloadError = validateSystemonePayload(body, provider, model, customPayloadShape);
  if (payloadError) {
    return createErrorResult(HTTP_STATUS.BAD_REQUEST, payloadError);
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
  // Cloudflare validates the body model as a short selector (e.g. "clef", "clef-omni", "clairic"), not the full id.
  const customSelector = typeof customUpstreamModelId === "string" && customUpstreamModelId.trim()
    ? customUpstreamModelId.trim()
    : null;
  const requestBody = { ...body, model: customSelector || getModelUpstreamId(provider, model) || model };

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

  // Cloudflare's REST API wraps the answer as { result: {...}, success, errors, messages }.
  // Callers speak System One, so hand them the inner result like any other provider's.
  if (responseBody?.result?.answers && !responseBody.answers) {
    responseBody = responseBody.result;
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
