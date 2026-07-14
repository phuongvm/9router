import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const TOKEN_HTML = 'params_AbusePreventionHelper = ["test-key","test-token",';
const VOICE = "vi-VN-NamMinhNeural";
let edgeTts;

function makeAudioResponse() {
  return new Response(new Uint8Array(2048), {
    status: 200,
    headers: { "Content-Type": "audio/mpeg" },
  });
}

function makeTokenResponse() {
  return new Response(TOKEN_HTML, { status: 200 });
}

async function synthesizeAndReadSsml(text) {
  const result = await edgeTts.synthesize(text, VOICE);
  expect(result.format).toBe("mp3");
  expect(result.base64.length).toBeGreaterThan(100);
  const [, request] = vi.mocked(fetch).mock.lastCall;
  return new URLSearchParams(request.body).get("ssml");
}

describe("Edge TTS SSML text encoding", () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeTokenResponse()));
    ({ default: edgeTts } = await import("../../open-sse/handlers/ttsProviders/edgeTts.js"));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("encodes every XML-reserved character in client text", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeTokenResponse())
      .mockResolvedValueOnce(makeAudioResponse());

    const ssml = await synthesizeAndReadSsml(`A & B < C > D \"quoted\" Tom's`);

    expect(ssml).toContain(
      "A &amp; B &lt; C &gt; D &quot;quoted&quot; Tom&apos;s"
    );
    expect(ssml).not.toContain("A & B < C > D \"quoted\" Tom's");
  });

  it("encodes literal entity-like input exactly once", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeTokenResponse())
      .mockResolvedValueOnce(makeAudioResponse());

    const ssml = await synthesizeAndReadSsml("already &amp; encoded");

    expect(ssml).toContain("already &amp;amp; encoded");
    expect(ssml).not.toContain("already &amp; encoded</prosody>");
  });

  it("preserves ordinary Vietnamese text and the existing SSML wrapper", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(makeTokenResponse())
      .mockResolvedValueOnce(makeAudioResponse());

    const ssml = await synthesizeAndReadSsml("Xin chào, đây là tiếng Việt.");

    expect(ssml).toBe(
      "<speak version='1.0' xml:lang='vi-VN'><voice xml:lang='vi-VN' xml:gender='Female' name='vi-VN-NamMinhNeural'><prosody rate='0.00%'>Xin chào, đây là tiếng Việt.</prosody></voice></speak>"
    );
  });
});
