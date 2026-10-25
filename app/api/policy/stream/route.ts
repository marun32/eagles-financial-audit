import { NextRequest, NextResponse } from "next/server";
import { actorFor } from "../../../../lib/data";
import { runPolicyQuestion } from "../../../../lib/policy-qa";

export const runtime = "edge";

export async function POST(request: NextRequest) {
  try {
    await actorFor(request);
    const input = await request.json() as { question?: unknown };
    if (typeof input.question !== "string" || !input.question.trim()) return NextResponse.json({ error: "Question required" }, { status: 400 });
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        try {
          const result = await runPolicyQuestion(input.question as string, (progress) => send({ type: "progress", ...progress }));
          send({ type: "result", data: result });
        } catch (error) {
          send({ type: "error", message: error instanceof Error ? error.message : "Policy question failed" });
        } finally { controller.close(); }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  } catch {
    return NextResponse.json({ error: "Sign in to ask a policy question" }, { status: 401 });
  }
}
