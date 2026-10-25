import { NextRequest, NextResponse } from "next/server";
import { actorFor, HttpError } from "../../lib/data";
import { executeMcpTool, mcpTools } from "../../lib/mcp-tools";

export const runtime = "edge";
const VERSION = "2026-07-28";

export async function POST(request: NextRequest) {
  let id: unknown = null;
  let method: string | undefined;
  try {
    const rpc = await request.json() as { id?: unknown; method?: string; params?: { name?: string; arguments?: Record<string, unknown> } };
    id = rpc.id ?? null;
    method = rpc.method;
    const actor = await actorFor(request);
    let result: unknown;
    if (rpc.method === "server/discover") result = { supportedVersions: [VERSION], capabilities: { tools: {} } };
    else if (rpc.method === "tools/list") result = { tools: mcpTools };
    else if (rpc.method === "tools/call") {
      const name = rpc.params?.name; const args = rpc.params?.arguments ?? {};
      const data = await executeMcpTool(name, actor, args);
      result = { content: [{ type: "text", text: JSON.stringify(data) }] };
    } else return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    return NextResponse.json({ jsonrpc: "2.0", id, result });
  } catch (error) {
    if (method === "tools/call" && !(error instanceof HttpError && error.status === 401)) return NextResponse.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: error instanceof Error ? error.message : "Server error" }], isError: true } });
    return NextResponse.json({ jsonrpc: "2.0", id, error: { code: error instanceof HttpError ? -32001 : -32603, message: error instanceof Error ? error.message : "Server error" } });
  }
}
