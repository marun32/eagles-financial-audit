"use client";

import { useEffect, useState } from "react";
import { callMcpTool } from "./mcp-client";

type Destination = "claims" | "policy" | "settlement";

const capabilities: Array<{
  business: string;
  implementation: string;
  boundary: string;
  status: "Live" | "Reference only" | "Planned";
}> = [
  {
    business: "Player submits a season expense",
    implementation: "One submit action creates the D1 claim, stores an optional receipt privately in R2, and runs the audit.",
    boundary: "ChatGPT sign-in and server-side roster checks limit who may submit.",
    status: "Live",
  },
  {
    business: "Read a receipt and check the claim",
    implementation: "Nebius vision extracts facts from optional PNG/JPEG receipts stored privately in R2. TypeScript rules compare date, vendor, amount, alcohol, duplicates, and the $50 threshold.",
    boundary: "New PDF uploads are not accepted. Historical PDFs remain available for review but never auto-approve. The model never approves a claim.",
    status: "Live",
  },
  {
    business: "Route a claim and involve the treasurer",
    implementation: "LangGraph JS runs rule evaluation, receipt verification, D1 policy lookup, and a conditional auto-approval versus treasurer-handoff branch. D1 audit-run records track clarification, revision, and human decision.",
    boundary: "D1 persists the business decision and review state; the hosted graph does not yet have a durable LangGraph checkpointer. Treasurer decisions require a reason.",
    status: "Live",
  },
  {
    business: "Answer policy and club-data questions",
    implementation: "Nebius selects bounded MCP-exposed read tools for policy sections, teams, overview, roster, or settlement. Policy retrieval uses embeddings or keyword fallback; Nebius answers from returned evidence with validated citations.",
    boundary: "Tool selection falls back to bounded rules if Nebius fails. The small policy corpus is embedded on demand, not stored in Pinecone. Financial calculations stay deterministic.",
    status: "Live",
  },
  {
    business: "Calculate what each player owes",
    implementation: "Deterministic TypeScript allocates integer-cent season costs using games played and weight multipliers, then applies approved claim credits.",
    boundary: "The LLM never calculates balances or changes fee configuration.",
    status: "Live",
  },
  {
    business: "Let an agent query club information",
    implementation: "Authenticated /mcp exposes read-only team, overview, roster, settlement, policy-search, and answer tools. The club assistant selects from these shared tool implementations.",
    boundary: "External MCP clients use JSON-RPC at /mcp. The streaming Q&A bridge uses the same authorized tool implementations but is not MCP transport. Financial writes remain protected application APIs.",
    status: "Live",
  },
  {
    business: "Demonstrate LangGraph orchestration",
    implementation: "Hosted LangGraph JS runs claim-audit nodes, calls D1 policy lookup, and branches to automatic approval or human handoff. The separate local Python/PostgreSQL backend has a more complete checkpointed graph with human interrupts.",
    boundary: "Hosted LangGraph nodes run live, but human approval resumes through application/D1 state rather than a graph checkpoint.",
    status: "Live",
  },
  {
    business: "Show each workflow step to an evaluator",
    implementation: "Submission and re-audit stream actual LangGraph node completions. Club Q&A streams model tool selection, tool calls, retrieval metadata, and answer status.",
    boundary: "These live views are not durable per-claim or per-question execution histories. The process map above remains illustrative.",
    status: "Live",
  },
];

export default function TechnologyOverview({ teamId, onNavigate }: { teamId: string; onNavigate: (target: Destination) => void }) {
  const [modelInfo, setModelInfo] = useState<{ provider: string; chatModel: string; visionModel: string; embeddingModel: string; receiptTypes: string[]; pdfExtraction: boolean; retrieval: string; orchestration: string } | null>(null);
  useEffect(() => { void fetch("/api/technology", { cache: "no-store" }).then((response) => response.ok ? response.json() : null).then((value) => setModelInfo(value as typeof modelInfo)).catch(() => setModelInfo(null)); }, []);
  return <div className="stack technology-page">
    <section className="card technology-intro">
      <div><span className="section-kicker">BUSINESS WORKFLOW × TECH STACK</span><h2>What is actually running?</h2><p>Follow the club process from expense intake to settlement, and see where AI, retrieval, MCP, and human judgment participate. “Live” means implemented in this hosted Site—not merely described in the design.</p></div>
      <div className="technology-status"><span className="tech-badge live">Live Site</span><strong>React + Worker API + D1 + R2 + Nebius</strong><small>Hosted together in one ChatGPT Site</small></div>
    </section>

    <section className="card"><div className="card-head"><div><span className="section-kicker">MODEL & RUNTIME</span><h2>Current AI configuration</h2></div></div>{modelInfo ? <div className="info-list"><div><span>Provider</span><strong>{modelInfo.provider}</strong></div><div><span>Policy Q&A model</span><strong>{modelInfo.chatModel}</strong></div><div><span>Receipt image model</span><strong>{modelInfo.visionModel}</strong></div><div><span>Embeddings</span><strong>{modelInfo.embeddingModel}</strong></div><div><span>Receipt extraction</span><strong>{modelInfo.receiptTypes.join(", ")}; PDF {modelInfo.pdfExtraction ? "enabled" : "not yet supported"}</strong></div><div><span>Retrieval</span><strong>{modelInfo.retrieval}</strong></div><div><span>Orchestration</span><strong>{modelInfo.orchestration}</strong></div></div> : <p className="muted">Model configuration is available after sign-in.</p>}</section>

    <section className="card"><div className="card-head"><div><span className="section-kicker">PROCESS MAP</span><h2>Expense to reimbursement</h2></div></div><div className="technology-flow" aria-label="Expense workflow"><span>Claim + optional receipt</span><span>Receipt fact extraction</span><span>LangGraph audit</span><span>Human review if flagged</span><span>Weighted settlement</span></div><p className="footnote">This map is illustrative; Claims & audit shows actual live node completions for the current run. A durable per-claim graph trace is planned.</p><button className="outline" onClick={() => onNavigate("claims")}>Explore claims & audit →</button></section>

    <section className="card"><div className="card-head"><div><span className="section-kicker">IMPLEMENTATION MAP</span><h2>How the technology serves the club</h2></div></div><div className="table-wrap"><table className="technology-table"><thead><tr><th>Business step</th><th>Current implementation</th><th>Safety / scope boundary</th><th>Status</th></tr></thead><tbody>{capabilities.map((item) => <tr key={item.business}><td><strong>{item.business}</strong></td><td>{item.implementation}</td><td>{item.boundary}</td><td><span className={`tech-badge ${item.status === "Live" ? "live" : item.status === "Planned" ? "planned" : "reference"}`}>{item.status}</span></td></tr>)}</tbody></table></div></section>

    <div className="grid-two"><section className="card"><div className="card-head"><div><span className="section-kicker">TOOL-ROUTED Q&A</span><h2>Question → tool choice → evidence → answer</h2></div></div><p className="muted">Nebius first selects read-only tools. Policy questions use vector retrieval with keyword fallback; live roster and settlement questions use authorized D1-backed tools. Answer generation uses only returned evidence and reports tool and citation status.</p><button className="outline" onClick={() => onNavigate("policy")}>Try club Q&A →</button></section><section className="card"><div className="card-head"><div><span className="section-kicker">MCP & AGENT COMMUNICATION</span><h2>Tools, not peer agents</h2></div></div><p className="muted">The MCP server exposes read-only tools to authorized clients. Use the panel below to make a real MCP call. The MVP has no agent-to-agent communication protocol.</p><button className="outline" onClick={() => onNavigate("settlement")}>View settlement data →</button></section></div>
    <McpPlayground teamId={teamId} />
  </div>;
}

const mcpTools = ["list_team_seasons", "get_team_overview", "get_team_settlement", "get_team_roster", "search_policy_sections", "list_policy_sections", "answer_policy_question", "answer_club_question"] as const;
type McpTool = typeof mcpTools[number];

function McpPlayground({ teamId }: { teamId: string }) {
  const [tool, setTool] = useState<McpTool>("list_team_seasons");
  const [question, setQuestion] = useState("Can an alcohol expense under $50 be auto-approved?");
  const [selectedTeam, setSelectedTeam] = useState(teamId);
  const [request, setRequest] = useState<Record<string, unknown> | null>(null);
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const args = tool === "get_team_settlement" || tool === "get_team_roster" ? { teamSeasonId: selectedTeam || teamId } : tool === "answer_club_question" ? { question, teamSeasonId: selectedTeam || teamId } : tool === "answer_policy_question" || tool === "search_policy_sections" ? { question } : {};

  return <section className="card"><div className="card-head"><div><span className="section-kicker">REAL MCP INTERACTION</span><h2>Read-only tool playground</h2></div><span className="tech-badge live">POST /api/mcp</span></div><p className="muted">Choose a tool and run an actual authenticated JSON-RPC call. For live sub-step progress and agent-directed routing, use the Club Q&A tab.</p>
    <form className="mcp-controls" onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(""); setResponse(null); setRequest({ method: "tools/call", params: { name: tool, arguments: args } }); void callMcpTool(tool, args).then(setResponse).catch((cause) => setError(cause instanceof Error ? cause.message : "MCP call failed")).finally(() => setBusy(false)); }}>
      <label>Tool<select value={tool} onChange={(event) => setTool(event.target.value as McpTool)}>{mcpTools.map((name) => <option key={name}>{name}</option>)}</select></label>
      {(tool === "get_team_settlement" || tool === "get_team_roster" || tool === "answer_club_question") && <label>Team-season ID<input value={selectedTeam || teamId} onChange={(event) => setSelectedTeam(event.target.value)} required /></label>}
      {(tool === "answer_policy_question" || tool === "answer_club_question" || tool === "search_policy_sections") && <label>Question<input value={question} onChange={(event) => setQuestion(event.target.value)} required /></label>}
      <button className="primary" disabled={busy}>{busy ? "Calling tool…" : "Run MCP tool"}</button>
    </form>
    {error && <div className="alert error" role="alert">{error}</div>}
    {(tool === "answer_policy_question" || tool === "answer_club_question") && response !== null && <div className="answer"><span className="section-kicker">GROUNDED ANSWER · {(response as { modelStatus: string }).modelStatus}</span><p>{(response as { answer: string }).answer}</p><small>Citations: {(response as { citations: string[] }).citations.join(", ") || "None"}</small></div>}
    {(request !== null || response !== null) && <div className="mcp-results"><div><span className="section-kicker">REQUEST</span><pre>{JSON.stringify(request, null, 2)}</pre></div><div><span className="section-kicker">TOOL RESPONSE</span><pre>{response !== null ? JSON.stringify(response, null, 2) : busy ? "Waiting for MCP response…" : "No response"}</pre></div></div>}
  </section>;
}
