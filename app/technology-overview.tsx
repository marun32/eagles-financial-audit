"use client";

type Destination = "claims" | "policy" | "settlement";

const capabilities: Array<{
  business: string;
  implementation: string;
  boundary: string;
  status: "Live" | "Reference only" | "Planned";
}> = [
  {
    business: "Player submits a season expense",
    implementation: "React form → Worker API → D1 claim record; optional receipt stored privately in R2.",
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
    implementation: "Authenticated /mcp endpoint exposes read-only tools for team-seasons, settlement previews, and policy answers.",
    boundary: "The current dashboard uses its own API; it does not call the MCP endpoint. An interactive MCP demo panel is planned.",
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
    implementation: "One-click expense submission plus a visible step-by-step audit trace, policy retrieval trace, and MCP tool playground.",
    boundary: "These are follow-up UI tasks; the current screens do not provide a unified trace.",
    status: "Planned",
  },
];

export default function TechnologyOverview({ onNavigate }: { onNavigate: (target: Destination) => void }) {
  return <div className="stack technology-page">
    <section className="card technology-intro">
      <div><span className="section-kicker">BUSINESS WORKFLOW × TECH STACK</span><h2>What is actually running?</h2><p>Follow the club process from expense intake to settlement, and see where AI, retrieval, MCP, and human judgment participate. “Live” means implemented in this hosted Site—not merely described in the design.</p></div>
      <div className="technology-status"><span className="tech-badge live">Live Site</span><strong>React + Worker API + D1 + R2 + Nebius</strong><small>Hosted together in one ChatGPT Site</small></div>
    </section>

    <section className="card"><div className="card-head"><div><span className="section-kicker">PROCESS MAP</span><h2>Expense to reimbursement</h2></div></div><div className="technology-flow" aria-label="Expense workflow"><span>Claim + optional receipt</span><span>Receipt fact extraction</span><span>Deterministic audit</span><span>Human review if flagged</span><span>Weighted settlement</span></div><p className="footnote">This is a process map, not a live LangGraph execution trace. A per-claim progress view is planned.</p><button className="outline" onClick={() => onNavigate("claims")}>Explore claims & audit →</button></section>

    <section className="card"><div className="card-head"><div><span className="section-kicker">IMPLEMENTATION MAP</span><h2>How the technology serves the club</h2></div></div><div className="table-wrap"><table className="technology-table"><thead><tr><th>Business step</th><th>Current implementation</th><th>Safety / scope boundary</th><th>Status</th></tr></thead><tbody>{capabilities.map((item) => <tr key={item.business}><td><strong>{item.business}</strong></td><td>{item.implementation}</td><td>{item.boundary}</td><td><span className={`tech-badge ${item.status === "Live" ? "live" : item.status === "Planned" ? "planned" : "reference"}`}>{item.status}</span></td></tr>)}</tbody></table></div></section>

    <div className="grid-two"><section className="card"><div className="card-head"><div><span className="section-kicker">RETRIEVAL-AUGMENTED Q&A</span><h2>Question → sources → answer</h2></div></div><p className="muted">Policy Q&A retrieves synthetic Eagles policy sections from D1, sends only those sections to Nebius, and displays an answer with section IDs. It is a bounded RAG-style flow, not a general web search.</p><button className="outline" onClick={() => onNavigate("policy")}>Try policy Q&A →</button></section><section className="card"><div className="card-head"><div><span className="section-kicker">MCP & AGENT COMMUNICATION</span><h2>Tools, not peer agents</h2></div></div><p className="muted">The MCP server exposes three read-only tools to authorized clients. This Site does not yet include an MCP interaction panel, and the MVP has no agent-to-agent communication protocol.</p><button className="outline" onClick={() => onNavigate("settlement")}>View settlement data →</button></section></div>
  </div>;
}
