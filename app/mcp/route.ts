import { NextRequest, NextResponse } from "next/server";
import { actorFor, HttpError, policySearch, rows, settlementPreview, teamDetail, teamsFor } from "../../lib/data";
import { answerPolicy } from "../../lib/ai";

export const runtime = "edge";
const VERSION = "2026-07-28";
const tools = [
  { name: "list_team_seasons", description: "List Eagles team-seasons visible to the signed-in member.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_team_overview", description: "Read claim counts and expense pools for visible team-seasons.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_team_settlement", description: "Get the current weighted settlement preview for an authorized team-season.", inputSchema: { type: "object", properties: { teamSeasonId: { type: "string" } }, required: ["teamSeasonId"], additionalProperties: false } },
  { name: "list_policy_sections", description: "Read the versioned synthetic Eagles policy sections.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "answer_policy_question", description: "Answer an Eagles policy question with source section IDs.", inputSchema: { type: "object", properties: { question: { type: "string" } }, required: ["question"], additionalProperties: false } },
];

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
    else if (rpc.method === "tools/list") result = { tools };
    else if (rpc.method === "tools/call") {
      const name = rpc.params?.name; const args = rpc.params?.arguments ?? {};
      let data: unknown;
      if (name === "list_team_seasons") data = await teamsFor(actor);
      else if (name === "get_team_overview") {
        const visible = await teamsFor(actor);
        data = await Promise.all(visible.map(async (team) => {
          const detail = await teamDetail(actor, team.id);
          const preview = await settlementPreview(actor, team.id);
          return { team, poolCents: preview.totalPoolCents, approvedClaims: detail.claims.filter((claim) => claim.status === "APPROVED").length, pendingClaims: detail.claims.filter((claim) => !["APPROVED", "REJECTED"].includes(claim.status)).length, rosterCount: detail.roster.length };
        }));
      }
      else if (name === "get_team_settlement") {
        if (typeof args.teamSeasonId !== "string") throw new HttpError(400, "teamSeasonId required");
        data = await settlementPreview(actor, args.teamSeasonId);
      } else if (name === "list_policy_sections") {
        data = await rows("SELECT section_id,title,body,policy_type,version FROM policies ORDER BY section_id");
      } else if (name === "answer_policy_question") {
        if (typeof args.question !== "string" || !args.question.trim()) throw new HttpError(400, "question required");
        const sections = await policySearch(args.question.slice(0, 500));
        data = { answer: await answerPolicy(args.question.slice(0, 500), sections), citations: sections.map((s) => s.section_id) };
      } else throw new HttpError(404, "Unknown tool");
      result = { content: [{ type: "text", text: JSON.stringify(data) }] };
    } else return NextResponse.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });
    return NextResponse.json({ jsonrpc: "2.0", id, result });
  } catch (error) {
    if (method === "tools/call" && !(error instanceof HttpError && error.status === 401)) return NextResponse.json({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: error instanceof Error ? error.message : "Server error" }], isError: true } });
    return NextResponse.json({ jsonrpc: "2.0", id, error: { code: error instanceof HttpError ? -32001 : -32603, message: error instanceof Error ? error.message : "Server error" } });
  }
}
