import { answerPolicy } from "./ai";
import { policySearch } from "./data";

export type PolicySource = { section_id: string; title: string; version: number; score: number; selection: string };
export type PolicyQaProgress = { stage: "mcp_tool" | "retrieval" | "model"; status: "running" | "complete" | "fallback"; detail: string; sources?: PolicySource[]; retrieval?: string; modelStatus?: string; issue?: string };
export type PolicyQaResult = { answer: string; citations: string[]; sources: PolicySource[]; retrieval: string; modelStatus: string; modelIssue?: string };

export async function runPolicyQuestion(question: string, onProgress?: (event: PolicyQaProgress) => void | Promise<void>): Promise<PolicyQaResult> {
  const input = question.trim().slice(0, 500);
  await onProgress?.({ stage: "mcp_tool", status: "running", detail: "answer_policy_question" });
  await onProgress?.({ stage: "mcp_tool", status: "complete", detail: "Authenticated read-only policy tool" });
  await onProgress?.({ stage: "retrieval", status: "running", detail: "Ranking policy sections" });
  const sections = await policySearch(input);
  const sources = sections.map((section) => ({ section_id: section.section_id, title: section.title, version: section.version, score: Number(section.score.toFixed(3)), selection: section.selection }));
  const retrieval = sections[0]?.retrieval_method ?? "none";
  await onProgress?.({ stage: "retrieval", status: "complete", detail: retrieval === "vector" ? "Semantic vectors with policy-intent anchors" : retrieval === "lexical" ? "Keyword fallback with policy-intent anchors" : "No sections found", sources, retrieval });
  await onProgress?.({ stage: "model", status: "running", detail: "Generating an answer from retrieved evidence" });
  const model = await answerPolicy(input, sections);
  await onProgress?.({ stage: "model", status: model.modelStatus === "generated" ? "complete" : "fallback", detail: model.modelStatus === "generated" ? "Citations verified" : model.issue ?? "No sufficient evidence", modelStatus: model.modelStatus, issue: model.issue });
  return { answer: model.answer, citations: model.citations, sources, retrieval, modelStatus: model.modelStatus, ...(model.issue ? { modelIssue: model.issue } : {}) };
}
