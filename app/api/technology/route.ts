import { env } from "cloudflare:workers";
import { NextRequest, NextResponse } from "next/server";
import { actorFor } from "../../../lib/data";

export const runtime = "edge";

export async function GET(request: NextRequest) {
  try {
    await actorFor(request);
    return NextResponse.json({ provider: "Nebius Token Factory", chatModel: env.NEBIUS_MODEL || "Not configured", visionModel: env.NEBIUS_MODEL || "Not configured", embeddingModel: env.NEBIUS_EMBEDDING_MODEL || "Not configured", receiptTypes: ["PNG", "JPEG", "PDF page 1"], pdfExtraction: true, retrieval: env.NEBIUS_EMBEDDING_MODEL ? "Nebius semantic vectors; lexical fallback" : "D1 lexical search", orchestration: "LangGraph JS audit nodes; D1 human-review state" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Sign in to view configuration" }, { status: 401 });
  }
}
