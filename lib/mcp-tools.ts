import { Actor, HttpError, ensureCurrentPolicySeed, policySearch, rows, settlementPreview, teamDetail, teamsFor } from "./data";
import { runPolicyQuestion } from "./policy-qa";

export const readToolNames = ["list_team_seasons", "get_team_overview", "get_team_settlement", "get_team_roster", "search_policy_sections"] as const;
export type ReadToolName = typeof readToolNames[number];

export const mcpTools = [
  { name: "list_team_seasons", description: "List configured Eagles team-seasons visible to this member, including current league and umpire fees.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_team_overview", description: "Read expense pools and claim counts for visible team-seasons.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "get_team_settlement", description: "Read authorized, calculated player balances for one team-season.", inputSchema: { type: "object", properties: { teamSeasonId: { type: "string" } }, required: ["teamSeasonId"], additionalProperties: false } },
  { name: "get_team_roster", description: "Read rostered player names and games played for one authorized team-season; no emails.", inputSchema: { type: "object", properties: { teamSeasonId: { type: "string" } }, required: ["teamSeasonId"], additionalProperties: false } },
  { name: "search_policy_sections", description: "Retrieve ranked synthetic policy sections with section IDs and retrieval metadata.", inputSchema: { type: "object", properties: { question: { type: "string" } }, required: ["question"], additionalProperties: false } },
  { name: "list_policy_sections", description: "Read all versioned synthetic Eagles policy sections.", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
  { name: "answer_policy_question", description: "Answer a policy-only question using retrieved sections with validated citations.", inputSchema: { type: "object", properties: { question: { type: "string" } }, required: ["question"], additionalProperties: false } },
  { name: "answer_club_question", description: "Select authorized read-only tools for a policy, team, roster, or settlement question and answer from their evidence.", inputSchema: { type: "object", properties: { question: { type: "string" }, teamSeasonId: { type: "string" } }, required: ["question"], additionalProperties: false } },
];

export async function executeReadTool(name: ReadToolName, actor: Actor, args: Record<string, unknown>): Promise<unknown> {
  if (name === "list_team_seasons") return teamsFor(actor);
  if (name === "get_team_overview") {
    const visible = await teamsFor(actor);
    return Promise.all(visible.map(async (team) => {
      const detail = await teamDetail(actor, team.id);
      const preview = await settlementPreview(actor, team.id);
      return { team, poolCents: preview.totalPoolCents, approvedClaims: detail.claims.filter((claim) => claim.status === "APPROVED").length, pendingClaims: detail.claims.filter((claim) => !["APPROVED", "REJECTED"].includes(claim.status)).length, rosterCount: detail.roster.length };
    }));
  }
  if (name === "get_team_settlement") {
    if (typeof args.teamSeasonId !== "string") throw new HttpError(400, "teamSeasonId required");
    return settlementPreview(actor, args.teamSeasonId);
  }
  if (name === "get_team_roster") {
    if (typeof args.teamSeasonId !== "string") throw new HttpError(400, "teamSeasonId required");
    const detail = await teamDetail(actor, args.teamSeasonId);
    return { team: { id: detail.team.id, name: detail.team.team_name, season: detail.team.season_kind, year: detail.team.season_year }, players: detail.roster.map((member) => ({ id: member.player_id, name: member.name, gamesPlayed: member.games_played })) };
  }
  if (name === "search_policy_sections") {
    if (typeof args.question !== "string" || !args.question.trim()) throw new HttpError(400, "question required");
    return policySearch(args.question.slice(0, 500));
  }
  throw new HttpError(404, "Unknown read-only tool");
}

export async function executeMcpTool(name: string | undefined, actor: Actor, args: Record<string, unknown>): Promise<unknown> {
  if (readToolNames.includes(name as ReadToolName)) return executeReadTool(name as ReadToolName, actor, args);
  if (name === "list_policy_sections") { await ensureCurrentPolicySeed(); return rows("SELECT section_id,title,body,policy_type,version FROM policies ORDER BY section_id"); }
  if (name === "answer_policy_question") {
    if (typeof args.question !== "string" || !args.question.trim()) throw new HttpError(400, "question required");
    return runPolicyQuestion(args.question);
  }
  if (name === "answer_club_question") {
    if (typeof args.question !== "string" || !args.question.trim()) throw new HttpError(400, "question required");
    const { runClubQuestion } = await import("./club-qa");
    return runClubQuestion(args.question, actor, typeof args.teamSeasonId === "string" ? args.teamSeasonId : undefined);
  }
  throw new HttpError(404, "Unknown tool");
}
