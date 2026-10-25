# Eagles Financial Audit — ChatGPT Site

One private Site serves the React interface, Worker API, D1 records, R2 receipts, policy Q&A, a LangGraph JS claim audit, and a read-only MCP endpoint. The existing Python/PostgreSQL app remains a separate reference implementation; FastAPI is not deployed in the Site.

## Hosted setup

The Site manifest declares `DB`, `BUCKET`, and the `mcp` capability. Sites provisions D1/R2 and applies the generated Drizzle migration on deployment. Runtime variables are configured through Sites, never committed:

- `EAGLES_ADMIN_EMAIL`: only this signed-in email may initialize the club admin account.
- `NEBIUS_API_KEY`: secret for model calls.
- `NEBIUS_MODEL`: selected Nebius chat/vision model.
- `NEBIUS_EMBEDDING_MODEL`: selected Nebius embedding model for policy retrieval (currently `Qwen/Qwen3-Embedding-8B`).

The first authenticated admin selects **Load synthetic demo data**. This inserts the two Eagles teams for Spring and Fall 2026, ten completed games per team-season, mixed/overlapping rosters, system league/umpire expenses, and the synthetic policy corpus. No real member data is migrated. The Site is owner-private by default. An admin can record an invitation in D1, but the member must also be granted Site access before they can sign in.

The player expense form accepts an optional receipt and submits, uploads when supplied, and audits from one button. The claim queue retains receipt replacement and re-audit controls for recovery and revisions. The hosted LangGraph JS graph evaluates rules, verifies receipt facts, looks up cited policy sections in D1, and branches to auto-approval or treasurer handoff; D1 persists human decisions, but LangGraph checkpoint/resume is not yet hosted. Policy Q&A and the policy library use the same authenticated JSON-RPC MCP handler through `/api/mcp` in the browser; external MCP clients connect to `/mcp`. Claim, treasurer-decision, and admin writes remain protected API operations, not MCP tools.

## Local checks

```sh
npm run db:generate
npx tsc --noEmit
./node_modules/.bin/tsx --test tests/finance.test.ts
npm run build
```

Use the Sites workflow's install and build helpers for setup/publication. Local D1 and hosted D1 are separate. Local development sign-in uses the starter's `seedy@sites.test` mock account; hosted sign-in is ChatGPT-owned.

The financial tests compare all 80 player balances in the existing Python golden dataset. Local HTTP smoke checks cover sign-in, seed, claim submission, missing-receipt review, treasurer decision, clarification/resubmission with archived receipt access, R2 upload/download, settlement, fee impact preview, Q&A, and MCP discovery.

## Important boundaries

- Claims under $50 auto-approve only when extracted image receipt facts are complete and agree with the claim, with no alcohol or other flags. Missing/unverified evidence goes to review, not rejection.
- PNG/JPEG images are sent to the Nebius vision model for factual extraction. A PDF's first page is rendered to PNG in the browser for extraction while its original is stored unchanged in R2. Since a client-rendered preview is not server-verified against the PDF and later pages are not analyzed, every PDF claim requires treasurer review; it cannot auto-approve. If rendering fails, the original PDF is still stored for manual review.
- Policy retrieval ranks D1 sections with Nebius embeddings and cosine similarity. Embeddings are cached only per Worker isolate, not in a durable vector database; if embedding calls fail, lexical retrieval is used and the response reports which method ran.
- The Site includes clarification/revision and a read-only fee/multiplier impact preview. Its confirmation path is simpler than the Python backend's version/hash/idempotency-checked confirmation flow, so it is not full API parity yet.
- The Site runs LangGraph JS nodes, but its D1 audit-run state is not a LangGraph checkpoint saver. Describe that distinction accurately in the project submission.
- A first-user admin bootstrap is restricted to `EAGLES_ADMIN_EMAIL`; sign-in alone never grants club membership afterward.
