import { NextResponse } from "next/server";
import { pingModelByKind } from "./ping";

// POST /api/models/test - Ping a single model via internal completions or embeddings
export async function POST(request) {
  try {
    const { model, kind } = await request.json();
    if (!model) return NextResponse.json({ ok: false, error: "Model required" }, { status: 400 });
    const result = await pingModelByKind(model, kind || "llm");
    if (!result.ok) {
      const match = String(result.error).match(/\[(\d{3})\]/);
      const status = match ? parseInt(match[1], 10) : 400;
      return NextResponse.json(result, { status: Math.min(Math.max(status, 400), 599) });
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
  }
}
