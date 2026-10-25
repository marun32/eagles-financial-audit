"use client";

import { useState } from "react";
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
    implementation: "Nebius extracts facts from PNG/JPEG images; TypeScript rules compare date, vendor, amount, alcohol, duplicates, and the $50 threshold.",
    boundary: "The model extracts facts only. Unclear or conflicting evidence goes to review; PDF is stored but not model-extracted.",
    status: "Live",
  },
  {
    business: "Route a claim and involve the treasurer",
    implementation: "D1 audit-run records track auto-approval, review, clarification, revision, and human decision.",
    boundary: "The hosted workflow is a custom TypeScript state machine, not LangGraph. Treasurer decisions require a reason.",
    status: "Live",
  },
  {
    business: "Explain an Eagles policy",
    implementation: "D1 policy-section search retrieves relevant text; Nebius answers with validated section-ID citations.",
    boundary: "This is lightweight lexical retrieval, not a Pinecone or vector-embedding index. Missing evidence is not invented.",
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
    implementation: "Authenticated /mcp endpoint exposes read-only tools for team-seasons, overview, settlement, policy sections, and cited policy answers.",
    boundary: "Policy Q&A and the playground call MCP directly. Claim, decision, and configuration writes stay on the protected application API.",
    status: "Live",
  },
  {
    business: "Demonstrate LangGraph orchestration",
    implementation: "The separate local Python/PostgreSQL backend contains a LangGraph claim-audit workflow with checkpointing and human interrupts.",
    boundary: "It is not running inside this hosted Site and must not be presented as a live Site capability.",
    status: "Reference only",
  },
  {
    business: "Show each workflow step to an evaluator",
    implementation: "A per-claim audit trace and a policy retrieval trace with real step statuses.",
    boundary: "These visual traces are still planned; the process map above is illustrative, not live LangGraph execution.",
    status: "Planned",
  },
];

export default function TechnologyOverview({ teamId, onNavigate }: { teamId: string; onNavigate: (target: Destination) => void }) {
  return <div className="stack technology-page">
    <section className="card technology-intro">
      <div><span className="section-kicker">BUSINESS WORKFLOW × TECH STACK</span><h2>What is actually running?</h2><p>Follow the club process from expense intake to settlement, and see where AI, retrieval, MCP, and human judgment participate. “Live” means implemented in this hosted Site—not merely described in the design.</p></div>
      <div className="technology-status"><span className="tech-badge live">Live Site</span><strong>React + Worker API + D1 + R2 + Nebius</strong><small>Hosted together in one ChatGPT Site</small></div>
    </section>

    <section className="card"><div className="card-head"><div><span className="section-kicker">PROCESS MAP</span><h2>Expense to reimbursement</h2></div></div><div className="technology-flow" aria-label="Expense workflow"><span>Claim + optional receipt</span><span>Receipt fact extraction</span><span>Deterministic audit</span><span>Human review if flagged</span><span>Weighted settlement</span></div><p className="footnote">This is a process map, not a live LangGraph execution trace. A per-claim progress view is planned.</p><button className="outline" onClick={() => onNavigate("claims")}>Explore claims & audit →</button></section>

    <section className="card"><div className="card-head"><div><span className="section-kicker">IMPLEMENTATION MAP</span><h2>How the technology serves the club</h2></div></div><div className="table-wrap"><table className="technology-table"><thead><tr><th>Business step</th><th>Current implementation</th><th>Safety / scope boundary</th><th>Status</th></tr></thead><tbody>{capabilities.map((item) => <tr key={item.business}><td><strong>{item.business}</strong></td><td>{item.implementation}</td><td>{item.boundary}</td><td><span className={`tech-badge ${item.status === "Live" ? "live" : item.status === "Planned" ? "planned" : "reference"}`}>{item.status}</span></td></tr>)}</tbody></table></div></section>

    <div className="grid-two"><section className="card"><div className="card-head"><div><span className="section-kicker">RETRIEVAL-AUGMENTED Q&A</span><h2>Question → sources → answer</h2></div></div><p className="muted">Policy Q&A retrieves synthetic Eagles policy sections from D1, sends only those sections to Nebius, and displays an answer with section IDs. It is a bounded RAG-style flow, not a general web search.</p><button className="outline" onClick={() => onNavigate("policy")}>Try policy Q&A →</button></section><section className="card"><div className="card-head"><div><span className="section-kicker">MCP & AGENT COMMUNICATION</span><h2>Tools, not peer agents</h2></div></div><p className="muted">The MCP server exposes read-only tools to authorized clients. Use the panel below to make a real MCP call. The MVP has no agent-to-agent communication protocol.</p><button className="outline" onClick={() => onNavigate("settlement")}>View settlement data →</button></section></div>
    <McpPlayground teamId={teamId} />
  </div>;
}

const mcpTools = ["list_team_seasons", "get_team_overview", "get_team_settlement", "list_policy_sections", "answer_policy_question"] as const;
type McpTool = typeof mcpTools[number];

function McpPlayground({ teamId }: { teamId: string }) {
  const [tool, setTool] = useState<McpTool>("list_team_seasons");
  const [question, setQuestion] = useState("Can an alcohol expense under $50 be auto-approved?");
  const [selectedTeam, setSelectedTeam] = useState(teamId);
  const [request, setRequest] = useState<Record<string, unknown> | null>(null);
  const [response, setResponse] = useState<unknown>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const args = tool === "get_team_settlement" ? { teamSeasonId: selectedTeam || teamId } : tool === "answer_policy_question" ? { question } : {};

  return <section className="card"><div className="card-head"><div><span className="section-kicker">REAL MCP INTERACTION</span><h2>Read-only tool playground</h2></div><span className="tech-badge live">POST /mcp</span></div><p className="muted">Choose a tool and run it as your signed-in club role. The result comes from the deployed MCP endpoint, with the same access rules as the application.</p>
    <form className="mcp-controls" onSubmit={(event) => { event.preventDefault(); setBusy(true); setError(""); setResponse(null); setRequest({ method: "tools/call", params: { name: tool, arguments: args } }); void callMcpTool(tool, args).then(setResponse).catch((cause) => setError(cause instanceof Error ? cause.message : "MCP call failed")).finally(() => setBusy(false)); }}>
      <label>Tool<select value={tool} onChange={(event) => setTool(event.target.value as McpTool)}>{mcpTools.map((name) => <option key={name}>{name}</option>)}</select></label>
      {tool === "get_team_settlement" && <label>Team-season ID<input value={selectedTeam || teamId} onChange={(event) => setSelectedTeam(event.target.value)} required /></label>}
      {tool === "answer_policy_question" && <label>Question<input value={question} onChange={(event) => setQuestion(event.target.value)} required /></label>}
      <button className="primary" disabled={busy}>{busy ? "Calling tool…" : "Run MCP tool"}</button>
    </form>
    {error && <div className="alert error" role="alert">{error}</div>}
    {(request !== null || response !== null) && <div className="mcp-results"><div><span className="section-kicker">REQUEST</span><pre>{JSON.stringify(request, null, 2)}</pre></div><div><span className="section-kicker">TOOL RESPONSE</span><pre>{response !== null ? JSON.stringify(response, null, 2) : busy ? "Waiting for MCP response…" : "No response"}</pre></div></div>}
  </section>;
}
