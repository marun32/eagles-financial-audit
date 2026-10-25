"use client";

export type WorkflowStep = { stage: string; status: "running" | "complete" | "fallback"; detail: string; findings?: string[]; citations?: string[]; route?: string; sources?: Array<{ section_id: string; title: string; version: number; score: number; selection: string }>; retrieval?: string; issue?: string };

export default function WorkflowTracker({ title, steps, active }: { title: string; steps: WorkflowStep[]; active: boolean }) {
  if (!steps.length) return null;
  const latest = new Map<string, WorkflowStep>();
  for (const step of steps) latest.set(step.stage, step);
  const entries = [...latest.values()];
  return <div className="workflow-tracker" aria-live="polite"><div className="workflow-heading"><strong>{title}</strong><span>{active ? "Running live" : "Completed"}</span></div><div className="workflow-track" role="list">{entries.map((step, index) => <div role="listitem" className={`workflow-step ${step.status}`} key={step.stage}><span className="workflow-number">{step.status === "running" ? "…" : index + 1}</span><strong>{step.stage.replaceAll("_", " ")}</strong><small>{step.detail}</small>{step.findings?.length ? <small>Findings: {step.findings.join(", ")}</small> : null}{step.citations?.length ? <small>Policy: {step.citations.join(", ")}</small> : null}{step.sources?.length ? <details><summary>{step.sources.length} retrieved sections · {step.retrieval}</summary><ul>{step.sources.map((source) => <li key={source.section_id}><code>{source.section_id}</code> {source.title} · v{source.version} · {source.selection.replaceAll("_", " ")} · score {source.score.toFixed(3)}</li>)}</ul></details> : null}{step.issue ? <small>Model status: {step.issue}</small> : null}</div>)}</div></div>;
}
