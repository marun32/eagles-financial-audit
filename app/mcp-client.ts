"use client";

type McpResponse = {
  error?: { message?: string };
  result?: { content?: Array<{ type: string; text?: string }>; isError?: boolean };
};

export async function callMcpTool<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/mcp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: crypto.randomUUID(), method: "tools/call", params: { name, arguments: args } }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as McpResponse;
  const content = payload.result?.content?.find((item) => item.type === "text")?.text;
  if (!response.ok || payload.error || payload.result?.isError) throw new Error(payload.error?.message ?? content ?? `MCP request failed (${response.status})`);
  if (!content) throw new Error("The MCP tool returned no data");
  try { return JSON.parse(content) as T; }
  catch { throw new Error("The MCP tool returned invalid JSON"); }
}
