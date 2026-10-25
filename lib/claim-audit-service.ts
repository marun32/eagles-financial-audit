import { runClaimAuditGraph } from "./audit-graph";
import { Actor, HttpError, assertTeamAccess, claimOr404, database, first, uuid } from "./data";

export type AuditProgress = { stage: string; status: "running" | "complete"; detail: string; findings?: string[]; citations?: string[]; route?: string };

export async function executeClaimAudit(claimId: string, actor: Actor, onProgress?: (event: AuditProgress) => void | Promise<void>) {
  const emit = async (event: AuditProgress) => { await onProgress?.(event); };
  await emit({ stage: "claim_lookup", status: "running", detail: "Loading saved claim and checking access" });
  const claim = await claimOr404(claimId);
  await assertTeamAccess(actor, claim.team_season_id);
  if (actor.role === "player" && actor.player_id !== claim.claimant_id) throw new HttpError(403, "Claim access denied");
  await emit({ stage: "claim_lookup", status: "complete", detail: `Claim ${claim.id} is ${claim.status}` });
  if (["APPROVED", "REJECTED"].includes(claim.status)) return { id: claim.id, status: claim.status, route: claim.route, graphSteps: [] };

  await emit({ stage: "duplicate_check", status: "running", detail: "Comparing payer, amount, vendor, date, and team-season" });
  // Keep rejected claims for audit history, but they must not block a later valid submission.
  const duplicate = await first("SELECT id FROM claims WHERE id<>? AND team_season_id=? AND payer_id=? AND amount_cents=? AND vendor=? AND expense_date=? AND status<>'REJECTED' LIMIT 1", claim.id, claim.team_season_id, claim.payer_id, claim.amount_cents, claim.vendor, claim.expense_date);
  await emit({ stage: "duplicate_check", status: "complete", detail: duplicate ? "Possible duplicate found; review required" : "No matching claim found" });
  const extraction = claim.receipt_extraction_json ? JSON.parse(claim.receipt_extraction_json) as { status?: string; fields?: Record<string, unknown> } : null;
  const { result, steps } = await runClaimAuditGraph(claim, !!duplicate, extraction, async ({ node, findings, citations, route }) => {
    await emit({ stage: node, status: "complete", detail: node.replaceAll("_", " "), findings, citations, route });
  });
  const status = result.route === "AUTO_APPROVE" ? "APPROVED" : "NEEDS_REVIEW";
  const runId = uuid();
  const timestamp = new Date().toISOString();
  await emit({ stage: "persist_decision", status: "running", detail: "Saving claim route and audit run" });
  await database().batch([
    database().prepare("UPDATE claims SET status=?,route=?,findings_json=?,policy_citations_json=?,approved_amount_cents=?,updated_at=? WHERE id=?").bind(status, result.route, JSON.stringify(result.findings), JSON.stringify(result.citations), status === "APPROVED" ? claim.amount_cents : null, timestamp, claim.id),
    database().prepare("INSERT INTO audit_runs (id,claim_id,stage,route,findings_json,created_at,resolved_at) VALUES (?,?,?,?,?,?,?)").bind(runId, claim.id, status === "APPROVED" ? "COMPLETE" : "WAITING_FOR_TREASURER", result.route, JSON.stringify(result.findings), timestamp, status === "APPROVED" ? timestamp : null),
  ]);
  await emit({ stage: "persist_decision", status: "complete", detail: status === "APPROVED" ? "Auto-approval saved" : "Treasurer review queued", findings: result.findings, citations: result.citations, route: result.route });
  return { id: claim.id, runId, status, graphSteps: steps, ...result };
}
