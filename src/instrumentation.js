export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { initConsoleLogCapture } = await import("@/lib/consoleLogBuffer");
    initConsoleLogCapture();

    // Start proactive OAuth token refresh at server boot. The custom-server.js
    // listening hook cannot run in the Docker standalone image (its raw dynamic
    // import of src/sse/services/backgroundTokenRefresh.js misses traced-only
    // relative imports), and the dashboard bootstrap only fires on an
    // authenticated page render. instrumentation.js is bundled by webpack, so
    // aliases resolve and deps are traced. The module is idempotent and
    // skips itself during build phases (isNonServerRuntime).
    import("@/sse/services/backgroundTokenRefresh.js")
      .then(({ startBackgroundTokenRefresh }) => startBackgroundTokenRefresh())
      .catch((e) => console.error("[Instrumentation] background token refresh start failed:", e?.message ?? e));
  }
}
