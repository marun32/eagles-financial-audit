import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { Claim, evaluateClaim } from "./data";

type Extraction = { status?: string; fields?: Record<string, unknown> } | null;
type Result = ReturnType<typeof evaluateClaim>;

const AuditState = Annotation.Root({
  claim: Annotation<Claim>(),
  duplicate: Annotation<boolean>(),
  extraction: Annotation<Extraction>(),
  result: Annotation<Result>(),
  steps: Annotation<string[]>({ reducer: (left, right) => [...left, ...right], default: () => [] }),
});

const auditGraph = new StateGraph(AuditState)
  .addNode("evaluate_rules", (state) => ({ result: evaluateClaim(state.claim, state.duplicate), steps: ["evaluate_rules"] }))
  .addNode("verify_receipt", (state) => {
    const result: Result = { ...state.result, findings: [...state.result.findings], citations: [...state.result.citations] };
    const { claim, extraction } = state;
    if (claim.receipt_key && extraction?.status !== "EXTRACTED") result.findings.push("RECEIPT_EXTRACTION_UNVERIFIED");
    if (claim.receipt_type === "application/pdf") result.findings.push("PDF_PREVIEW_REQUIRES_REVIEW");
    if (extraction?.status === "EXTRACTED") {
      const facts = extraction.fields ?? {};
      if (facts.readability !== "CLEAR" || typeof facts.vendor !== "string" || typeof facts.transaction_date !== "string" || !Number.isSafeInteger(facts.total_cents) || typeof facts.alcohol_present !== "boolean") result.findings.push("RECEIPT_EXTRACTION_INCOMPLETE");
      if (facts.alcohol_present === true && !result.findings.includes("ALCOHOL_REVIEW")) result.findings.push("ALCOHOL_REVIEW");
      if (facts.total_cents !== claim.amount_cents) result.findings.push("RECEIPT_TOTAL_MISMATCH");
      if (typeof facts.vendor === "string" && facts.vendor.trim().toLowerCase() !== claim.vendor.trim().toLowerCase()) result.findings.push("RECEIPT_VENDOR_MISMATCH");
      if (facts.transaction_date !== claim.expense_date) result.findings.push("RECEIPT_DATE_MISMATCH");
    }
    return { result, steps: ["verify_receipt"] };
  })
  .addNode("route_review", (state) => {
    const result: Result = { ...state.result, findings: [...state.result.findings], citations: [...state.result.citations] };
    if (result.findings.length) result.route = "REVIEW";
    if (result.findings.some((finding) => finding.startsWith("RECEIPT_") || finding === "ALCOHOL_REVIEW" || finding === "PDF_PREVIEW_REQUIRES_REVIEW") && !result.citations.includes("EXP-6")) result.citations.push("EXP-6");
    return { result, steps: ["route_review"] };
  })
  .addEdge(START, "evaluate_rules")
  .addEdge("evaluate_rules", "verify_receipt")
  .addEdge("verify_receipt", "route_review")
  .addEdge("route_review", END)
  .compile();

export async function runClaimAuditGraph(claim: Claim, duplicate: boolean, extraction: Extraction): Promise<{ result: Result; steps: string[] }> {
  const output = await auditGraph.invoke({ claim, duplicate, extraction });
  return { result: output.result, steps: output.steps };
}
