import { NextResponse } from "next/server";
import { FILTERS } from "./filters.js";
import { getProviderConnections } from "@/models";
import { AI_PROVIDERS } from "@/shared/constants/providers";
import { checkAndRefreshToken } from "@/sse/services/tokenRefresh.js";

export const dynamic = "force-dynamic";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url");
  const type = searchParams.get("type");

  if (!url || !type) {
    return NextResponse.json({ error: "Missing url or type" }, { status: 400 });
  }

  const filter = FILTERS[type];
  if (!filter) {
    return NextResponse.json({ error: "Unknown filter type" }, { status: 400 });
  }

  const configuredFetcher = Object.values(AI_PROVIDERS)
    .map((provider) => provider.modelsFetcher)
    .find((fetcher) => fetcher?.type === type && fetcher?.url === url);
  if (!configuredFetcher) {
    return NextResponse.json({ error: "Model catalog is not configured" }, { status: 400 });
  }

  try {
    const fetchHeaders = {};
    if (type === "nous" || url.includes("nousresearch")) {
      try {
        const conns = await getProviderConnections({ provider: "nous", isActive: true });
        const activeConn = conns?.find((c) => c.accessToken || c.apiKey);
        const credentials = activeConn
          ? await checkAndRefreshToken("nous", activeConn)
          : null;
        const token = credentials?.accessToken || credentials?.apiKey;
        if (token) {
          fetchHeaders["Authorization"] = `Bearer ${token}`;
        }
      } catch {}
    }

    const res = await fetch(url, { headers: fetchHeaders });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Upstream model catalog returned ${res.status}` },
        { status: res.status }
      );
    }
    const json = await res.json();
    const raw = json.data ?? json.models ?? json;
    const data = filter(Array.isArray(raw) ? raw : []);
    return NextResponse.json({ data });
  } catch (error) {
    return NextResponse.json(
      { error: error?.message || "Failed to load model catalog" },
      { status: 502 }
    );
  }
}
