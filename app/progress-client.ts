"use client";

export async function streamWorkflow<T, P>(url: string, body: unknown, onProgress: (event: P) => void): Promise<T> {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), cache: "no-store" });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(failure.error ?? `Request failed (${response.status})`);
  }
  if (!response.body) throw new Error("Live progress stream unavailable");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  let result: T | undefined;
  const consume = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as { type: string; data?: T; message?: string } & P;
    if (event.type === "progress") onProgress(event);
    else if (event.type === "result") result = event.data;
    else if (event.type === "error") throw new Error(event.message ?? "Workflow failed");
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) consume(line);
  }
  pending += decoder.decode();
  consume(pending);
  if (!result) throw new Error("Workflow ended without a result");
  return result;
}
