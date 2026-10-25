import { NextRequest, NextResponse } from "next/server";
import { actorFor } from "../../../../../../lib/data";
import { executeClaimAudit } from "../../../../../../lib/claim-audit-service";

export const runtime = "edge";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const actor = await actorFor(request);
    const { id } = await context.params;
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        try {
          const result = await executeClaimAudit(id, actor, (progress) => send({ type: "progress", ...progress }));
          send({ type: "result", data: result });
        } catch (error) {
          send({ type: "error", message: error instanceof Error ? error.message : "Audit failed" });
        } finally { controller.close(); }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Sign in to audit a claim" }, { status: 401 });
  }
}
