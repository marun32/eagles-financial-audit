"use client";

import { useState } from "react";
import { streamWorkflow } from "./progress-client";
import WorkflowTracker, { WorkflowStep } from "./workflow-tracker";

export type PolicyResult = { answer: string; citations: string[]; sources: Array<{ section_id: string; title: string; version: number; score: number; selection: string }>; retrieval: string; modelStatus: string; modelIssue?: string; toolsUsed: string[]; selectionMethod: string; teamSeasonId?: string };
type Policy = { section_id: string; title: string; body: string; policy_type: string };

export default function PolicyQaPanel({ policies, teamId }: { policies: Policy[]; teamId: string }) {
  const [question, setQuestion] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [answer, setAnswer] = useState<PolicyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function ask() {
    setBusy(true); setError(""); setAnswer(null); setSteps([{ stage: "question", status: "complete", detail: question.trim() }]);
    try {
      setAnswer(await streamWorkflow<PolicyResult, WorkflowStep>("/api/policy/stream", { question, teamSeasonId: teamId }, (event) => setSteps((current) => [...current, event])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Question failed"); }
    finally { setBusy(false); }
  }
  return <div className="grid-two"><section className="card"><div className="card-head"><div><span className="section-kicker">GROUNDED CLUB ASSISTANT · MCP-EXPOSED TOOLS</span><h2>Ask about rules or finances</h2></div></div><p className="muted">Nebius selects read-only policy or live club-data tools. The selected team-season above provides context for roster and balance questions. The progress bridge executes the same authorized tool implementations exposed at <code>/mcp</code>; it is not itself MCP transport.</p><form onSubmit={(event) => { event.preventDefault(); void ask(); }}><textarea placeholder="Who approves expenses? What does a player owe this season?" required value={question} onChange={(event) => setQuestion(event.target.value)} /><button className="primary" disabled={busy}>{busy ? "Checking evidence…" : "Ask club assistant"}</button></form>{error && <div className="alert error" role="alert">{error}</div>}<WorkflowTracker title="Question routing and evidence" steps={steps} active={busy} />{answer && <div className="answer"><span className="section-kicker">ANSWER · {answer.modelStatus === "generated" ? "CITATIONS CHECKED" : "MODEL FALLBACK"}</span><p>{answer.answer}</p><small>Tools used: {answer.toolsUsed.join(", ") || "None"} · Selection: {answer.selectionMethod === "nebius" ? "Nebius" : "rules fallback"}</small>{answer.modelIssue && <small>Model issue: {answer.modelIssue}. No unverified answer was substituted.</small>}<small>Citations: {answer.citations.join(", ") || "None"}</small></div>}</section><section className="card"><div className="card-head"><div><span className="section-kicker">SOURCE LIBRARY</span><h2>Policy sections</h2></div></div><div className="policy-list">{policies.length ? policies.map((policy) => <details key={policy.section_id}><summary><code>{policy.section_id}</code> {policy.title}</summary><p>{policy.body}</p></details>) : <p className="muted">No policy sections loaded. Ask an admin to load the synthetic demo data.</p>}</div></section></div>;
}
