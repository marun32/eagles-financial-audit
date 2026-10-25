import { answerGroundedQuestion, answerPolicy, planQuestionTools } from "./ai";
import { Actor, Team, teamsFor } from "./data";
import { executeReadTool, ReadToolName, readToolNames } from "./mcp-tools";
import type { PolicySource } from "./policy-qa";

export type ClubQaProgress = { stage: string; status: "running" | "complete" | "fallback"; detail: string; sources?: PolicySource[]; retrieval?: string; issue?: string };
export type ClubQaResult = { answer: string; citations: string[]; sources: PolicySource[]; retrieval: string; modelStatus: string; modelIssue?: string; toolsUsed: ReadToolName[]; selectionMethod: "nebius" | "rules_fallback"; teamSeasonId?: string };
type PolicyRow = { section_id: string; title: string; body: string; version: number; score: number; selection: string; retrieval_method: string };

export function fallbackTools(question: string): ReadToolName[] {
  const q = question.toLowerCase();
  const selected: ReadToolName[] = [];
  if (/\b(balance|owe|owed|charge|credit|reimburse|multiplier|weighted|settlement|games played)\b/.test(q)) selected.push("get_team_settlement");
  if (/\b(roster|players? on|who plays|attendance|team members)\b/.test(q)) selected.push("get_team_roster");
  if (/\b(pool|spending|expenses by team|pending claims|claim counts)\b/.test(q)) selected.push("get_team_overview");
  if (/\b(team|season|league fee|umpire fee|l c c l|w m c l|lccl|wmcl)\b/.test(q) && !selected.includes("get_team_overview")) selected.push("list_team_seasons");
  if (/\b(policy|rule|approve|approval|threshold|maximum|limit|allowed|eligible|receipt|alcohol|why|how is|how are|league)\b/.test(q) || !selected.length) selected.push("search_policy_sections");
  return [...new Set(selected)].slice(0, 3);
}

function selectTeam(question: string, teams: Team[], selectedId?: string): Team | undefined {
  const league = /\b(?:eagles[- ]?)?lccl\b/i.test(question) ? "Eagles-LCCL" : /\b(?:eagles[- ]?)?wmcl\b/i.test(question) ? "Eagles-WMCL" : null;
  const season = /\bspring\b/i.test(question) ? "Spring" : /\bfall\b/i.test(question) ? "Fall" : null;
  const year = question.match(/\b20\d{2}\b/)?.[0];
  if (league || season || year) {
    const matches = teams.filter((team) => (!league || team.team_name === league) && (!season || team.season_kind === season) && (!year || team.season_year === Number(year)));
    if (!matches.length) return undefined;
    return matches.find((team) => team.id === selectedId) ?? (matches.length === 1 ? matches[0] : undefined);
  }
  return teams.find((team) => team.id === selectedId) ?? (teams.length === 1 ? teams[0] : undefined);
}

export async function runClubQuestion(question: string, actor: Actor, selectedTeamId?: string, onProgress?: (event: ClubQaProgress) => void | Promise<void>): Promise<ClubQaResult> {
  const input = question.trim().slice(0, 500);
  if (!input) throw new Error("Question required");
  const emit = async (event: ClubQaProgress) => { await onProgress?.(event); };
  await emit({ stage: "planner", status: "running", detail: "Nebius selecting from read-only MCP-exposed tools" });
  let tools: ReadToolName[];
  let selectionMethod: "nebius" | "rules_fallback" = "nebius";
  try {
    const planned = await planQuestionTools(input);
    tools = planned.filter((name): name is ReadToolName => readToolNames.includes(name as ReadToolName));
    if (!tools.length) throw new Error("No permitted tools selected");
    await emit({ stage: "planner", status: "complete", detail: `Nebius selected: ${tools.join(", ")}` });
  } catch (error) {
    tools = fallbackTools(input);
    selectionMethod = "rules_fallback";
    await emit({ stage: "planner", status: "fallback", detail: `Model routing unavailable; bounded rules selected: ${tools.join(", ")}`, issue: error instanceof Error ? error.message : "Planner unavailable" });
  }
  const visibleTeams = await teamsFor(actor);
  const team = selectTeam(input, visibleTeams, selectedTeamId);
  const used: ReadToolName[] = [];
  const evidence: Array<{ citation: string; content: string }> = [];
  let sections: PolicyRow[] = [];
  let sources: PolicySource[] = [];
  let retrieval = "none";
  for (const name of tools) {
    if ((name === "get_team_settlement" || name === "get_team_roster") && !team) {
      await emit({ stage: `tool_${name}`, status: "fallback", detail: "No authorized matching team-season; select one or clarify the question" });
      continue;
    }
    await emit({ stage: `tool_${name}`, status: "running", detail: `Calling MCP-exposed ${name}` });
    try {
      if (name === "search_policy_sections") await emit({ stage: "retrieval", status: "running", detail: "Ranking synthetic policy sections" });
      const data = await executeReadTool(name, actor, name === "search_policy_sections" ? { question: input } : { teamSeasonId: team?.id });
      used.push(name);
      if (name === "search_policy_sections") {
        sections = data as PolicyRow[];
        sources = sections.map((section) => ({ section_id: section.section_id, title: section.title, version: section.version, score: Number(section.score.toFixed(3)), selection: section.selection }));
        retrieval = sections[0]?.retrieval_method ?? "none";
        evidence.push(...sections.map((section) => ({ citation: section.section_id, content: `${section.title}: ${section.body}` })));
        await emit({ stage: "retrieval", status: "complete", detail: `${retrieval} retrieval found ${sections.length} sections`, sources, retrieval });
      } else evidence.push({ citation: `MCP:${name}`, content: JSON.stringify(data) });
      await emit({ stage: `tool_${name}`, status: "complete", detail: name === "search_policy_sections" ? `${sections.length} citable policy sections` : `Authorized result for ${team?.team_name ?? "visible team-seasons"}` });
    } catch (error) {
      console.error("club_qa_tool_failed", name, error instanceof Error ? error.name : "UnknownError");
      await emit({ stage: `tool_${name}`, status: "fallback", detail: "Tool failed; no data used", issue: "TOOL_ERROR" });
    }
  }
  await emit({ stage: "model", status: "running", detail: "Nebius answering only from returned evidence" });
  const model = evidence.length && used.length === 1 && used[0] === "search_policy_sections" ? await answerPolicy(input, sections) : await answerGroundedQuestion(input, evidence);
  await emit({ stage: "model", status: model.modelStatus === "generated" ? "complete" : "fallback", detail: model.modelStatus === "generated" ? "Evidence citations verified" : model.issue ?? "Insufficient evidence", issue: model.issue });
  return { answer: model.answer, citations: model.citations, sources, retrieval, modelStatus: model.modelStatus, ...(model.issue ? { modelIssue: model.issue } : {}), toolsUsed: used, selectionMethod, ...(team ? { teamSeasonId: team.id } : {}) };
}
