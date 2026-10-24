# Eagles Financial Audit — ChatGPT Site

One private Site serves the React interface, Worker API, D1 records, R2 receipts, policy Q&A, and a read-only MCP endpoint. The existing Python/PostgreSQL app remains unchanged as the reference implementation; this is a TypeScript port, not a deployment of FastAPI or LangGraph.

## Hosted setup

The Site manifest declares `DB`, `BUCKET`, and the `mcp` capability. Sites provisions D1/R2 and applies the generated Drizzle migration on deployment. Runtime variables are configured through Sites, never committed:

- `EAGLES_ADMIN_EMAIL`: only this signed-in email may initialize the club admin account.
- `NEBIUS_API_KEY`: secret for model calls.
- `NEBIUS_MODEL`: selected Nebius chat/vision model.

The first authenticated admin selects **Load synthetic demo data**. This inserts the two Eagles teams for Spring and Fall 2026, ten completed games per team-season, mixed/overlapping rosters, system league/umpire expenses, and the full 39-section synthetic policy corpus. No real member data is migrated. The Site is owner-private by default. An admin can record an invitation in D1, but the member must also be granted Site access before they can sign in.

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
- PDF receipts can be stored and reviewed but are not model-extracted in the Worker port. They cannot auto-approve.
- The Site includes clarification/revision and a read-only fee/multiplier impact preview. Its confirmation path is simpler than the Python backend's version/hash/idempotency-checked confirmation flow, so it is not full API parity yet.
- The Site's audit-run state persists in D1 but is not the Python LangGraph checkpoint implementation; do not describe it as LangGraph in the project submission.
- A first-user admin bootstrap is restricted to `EAGLES_ADMIN_EMAIL`; sign-in alone never grants club membership afterward.
