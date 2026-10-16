# Design: System One Usage Analytics Pipeline

## Architecture Overview
System One requests arrive via Next.js route `/api/v1/systemone` or `/v1/systemone`, invoking `handleSystemone` in `src/sse/handlers/systemone.js`.
The request executes via `handleSystemoneCore` in `open-sse/handlers/systemoneCore.js`, which returns:
- `response`: HTTP `Response` object returned to client.
- `responseBody`: Parsed JSON payload containing model outcome, confidence, and provider usage metadata.
- `usage`: Normalized token counters.

## Detailed Component Design

### 1. `open-sse/handlers/systemoneCore.js`
Extract token metrics with multi-schema fallback:
```javascript
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
  response: new Response(...),
};
```

### 2. `src/sse/handlers/systemone.js`
Before calling core, mark start timestamp: `const start = Date.now();`.
After receiving `result.success`:
```javascript
const latencyMs = Date.now() - start;
const prompt_tokens = result.usage?.prompt_tokens ?? result.usage?.input_tokens ?? (body?.state ? Math.max(1, Math.ceil(body.state.length / 4)) : 1);
const completion_tokens = result.usage?.completion_tokens ?? result.usage?.output_tokens ?? 0;
const tokens = {
  prompt_tokens,
  completion_tokens,
  total_tokens: prompt_tokens + completion_tokens,
};

saveRequestUsage({
  provider,
  model,
  apiKey,
  endpoint: url.pathname,
  tokens,
  status: "success",
}).catch(() => {});

saveRequestDetail({
  provider,
  model,
  apiKey,
  connectionId: credentials?.connectionId,
  timestamp: new Date().toISOString(),
  latency: { ttft: latencyMs, total: latencyMs },
  tokens,
  request: body,
  response: result.responseBody || {},
  status: "success",
}).catch(() => {});
```

### 3. `src/lib/db/repos/usageRepo.js`
In `saveRequestUsage`:
Normalize `entry.tokens` from `promptTokens` or `entry.tokens` so SQLite column `tokens` receives valid JSON rather than `{}`.
In `recentRequests` mapper and filter:
Extract `promptTokens = t.prompt_tokens ?? t.input_tokens ?? r.promptTokens ?? 0` and allow requests with valid `model` to pass the filter.
