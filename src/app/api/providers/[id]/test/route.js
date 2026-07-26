import { NextResponse } from "next/server";
import { testSingleConnection } from "./testUtils.js";

// POST /api/providers/[id]/test - Test connection
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const result = await testSingleConnection(id);

    if (result.error === "Connection not found") {
      return NextResponse.json({ valid: false, error: "Connection not found" }, { status: 404 });
    }

    if (result.error === "Provider test not supported") {
      return NextResponse.json(
        { valid: false, error: "Provider test not supported", refreshed: false },
        { status: 501 }
      );
    }

    if (!result.valid) {
      return NextResponse.json(
        {
          valid: false,
          error: result.error || "Connection test failed",
          refreshed: result.refreshed || false,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      valid: result.valid,
      error: result.error,
      refreshed: result.refreshed || false,
    });
  } catch (error) {
    console.log("Error testing connection:", error);
    return NextResponse.json({ valid: false, error: "Test failed" }, { status: 500 });
  }
}
