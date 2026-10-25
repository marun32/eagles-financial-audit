"use client";

import { useState } from "react";
import { streamWorkflow } from "./progress-client";
import WorkflowTracker, { WorkflowStep } from "./workflow-tracker";

export type PolicyResult = { answer: string; citations: string[]; sources: Array<{ section_id: string; title: string; version: number; score: number; selection: string }>; retrieval: string; modelStatus: string; modelIssue?: string };
type Policy = { section_id: string; title: string; body: string; policy_type: string };

export default function PolicyQaPanel({ policies }: { policies: Policy[] }) {
  const [question, setQuestion] = useState("");
  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [answer, setAnswer] = useState<PolicyResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function ask() {
    setBusy(true); setError(""); setAnswer(null); setSteps([{ stage: "question", status: "complete", detail: question.trim() }]);
    try {
      setAnswer(await streamWorkflow<PolicyResult, WorkflowStep>("/api/policy/stream", { question }, (event) => setSteps((current) => [...current, event])));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Question failed"); }
    finally { setBusy(false); }
  }
  return <div className="grid-two"><section className="card"><div className="card-head"><div><span className="section-kicker">CITED POLICY ASSISTANT · MCP-COMPATIBLE TOOL</span><h2>Ask about club rules</h2></div></div><p className="muted">Answers use synthetic Eagles MVP policies. The live progress bridge runs the same <code>answer_policy_question</code> implementation exposed at <code>/mcp</code>.</p><form onSubmit={(event) => { event.preventDefault(); void ask(); }}><textarea placeholder="Who approves expenses, and is there a maximum claim amount?" required value={question} onChange={(event) => setQuestion(event.target.value)} /><button className="primary" disabled={busy}>{busy ? "Checking policy…" : "Ask policy assistant"}</button></form>{error && <div className="alert error" role="alert">{error}</div>}<WorkflowTracker title="Policy question progress" steps={steps} active={busy} />{answer && <div className="answer"><span className="section-kicker">ANSWER · {answer.modelStatus === "generated" ? "NEBIUS VERIFIED" : "MODEL FALLBACK"}</span><p>{answer.answer}</p>{answer.modelIssue && <small>Model issue: {answer.modelIssue}. Retrieved evidence is shown in the tracker; no answer was fabricated.</small>}<small>Cited sections: {answer.citations.join(", ") || "None"}</small></div>}</section><section className="card"><div className="card-head"><div><span className="section-kicker">SOURCE LIBRARY</span><h2>Policy sections</h2></div></div><div className="policy-list">{policies.length ? policies.map((policy) => <details key={policy.section_id}><summary><code>{policy.section_id}</code> {policy.title}</summary><p>{policy.body}</p></details>) : <p className="muted">No policy sections loaded. Ask an admin to load the synthetic demo data.</p>}</div></section></div>;
}
