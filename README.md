# Eagles Financial Audit

An agentic AI prototype for a sports-club treasurer: players submit expenses with optional receipt images, a LangGraph audit checks evidence and policy, and a treasurer resolves claims that need human review. Club Q&A combines authorized read-only tools with policy retrieval and a grounded model answer.

**Live demo:** https://eagles-financial-audit.vastseed12.chatgpt.site — the Site is owner-private; viewers need Site access. The submitted video demonstrates the app for evaluators without access.

This repository is the **hosted Site implementation only**. It does not run the separate Python/PostgreSQL prototype. The React UI and Worker API share one deployment; Cloudflare D1 holds structured records and R2 holds uploaded receipts.

## What to show in the demo

1. Sign in, select a team-season, and submit a claim with a PNG or JPEG receipt. The live trace shows claim save, receipt extraction, duplicate check, LangGraph nodes, policy citations, and the persisted approval/review route.
2. For a flagged claim, show the treasurer's recorded decision and its effect on the provisional weighted settlement. A different claimant and payer always require review.
3. Ask Club Q&A a policy or team question. The trace shows model-directed tool choice, the actual read-only tool(s), policy section IDs and retrieval method where applicable, then the grounded answer.
4. Open **AI / Agentic AI** for the implementation map and the read-only MCP playground.

The claim graph is implemented in [`lib/audit-graph.ts`](lib/audit-graph.ts); the Q&A planner is in [`lib/club-qa.ts`](lib/club-qa.ts). Q&A is a bounded tool orchestrator, **not** a second LangGraph graph or autonomous agent-to-agent messaging. The UI progress route uses the same authorized tool implementations exposed by the JSON-RPC MCP server at `/mcp`; the progress route itself is not MCP transport.

## Data and boundaries

**Load synthetic demo data** runs [`seedDemo()`](lib/data.ts) once against D1. It creates the Eagles teams, 2026 Spring/Fall seasons, rosters, attendance, league and umpire fees, and 39 synthetic policy sections from [`lib/policy-seed.json`](lib/policy-seed.json). Admin edits and new claims are stored in D1; uploaded image bytes are stored privately in R2. The hosted app does **not** import CSV files. See [`docs/datasets.md`](docs/datasets.md) for precise seed and test-fixture provenance.

The Site accepts optional PNG/JPEG receipts up to 5 MB, not new PDF uploads. Receipt vision extraction supplies facts, not approval decisions. Under-$50 claims can auto-approve only with a readable, matching receipt and no other flags; otherwise they go to treasurer review. Claim amounts and settlement math are calculated by deterministic code, not the LLM.

Policy Q&A uses Nebius embeddings to rank D1 policy sections, with lexical fallback. Embedding vectors are cached per Worker isolate, not stored in Pinecone or a durable vector index. A model failure yields an explicit fallback rather than an invented answer. The D1 audit-run record is **not** a durable LangGraph checkpoint saver.

## Run locally

Requires Node.js 22.13+ and npm. From this repository root:

```sh
npm ci
npm run build
```

For a fresh local D1 database, apply the committed migrations in order. These commands affect only local `.wrangler/state`, not the hosted database:

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_misty_christian_walker.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_lovely_miek.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0002_chemical_martin_li.sql
npm run dev
```

Open `http://127.0.0.1:5173/signin-with-chatgpt?return_to=/`. The loopback preview uses a mock `seedy@sites.test` admin identity; hosted sign-in is ChatGPT-owned. Select **Load synthetic demo data** once. Do not rerun migrations against an already migrated local D1 database.

Nebius is optional for building and deterministic tests. To exercise live Q&A, embeddings, and receipt vision locally, create an **ignored** `.dev.vars` containing `NEBIUS_API_KEY`, `NEBIUS_MODEL` (a model supporting chat and images), and `NEBIUS_EMBEDDING_MODEL`. Use model IDs available in your Nebius account. Never commit `.dev.vars` or an API key. Without a configured model, the app uses its labeled fallbacks; it cannot demonstrate full model extraction or answering.

## Verify

```sh
npx tsc --noEmit
node --import tsx --test tests/finance.test.ts
npm run build
```

The settlement test checks all 80 player outcomes in a compact copy of the independently generated offline goldens under [`tests/fixtures/`](tests/fixtures/). Those fixtures test the allocation algorithm; they are not the hosted D1 demo records.

## Hosted configuration

The tracked [`.openai/hosting.json`](.openai/hosting.json) declares D1 (`DB`), R2 (`BUCKET`), and MCP. Its project ID is not a secret, but deploying to that Site requires owner authorization. Runtime values are configured in Sites, not committed: `EAGLES_ADMIN_EMAIL`, `NEBIUS_API_KEY`, `NEBIUS_MODEL`, and `NEBIUS_EMBEDDING_MODEL`. The first authenticated user must match `EAGLES_ADMIN_EMAIL` to bootstrap the club admin. Later users need both Site access and an application invitation.

This is a synthetic educational prototype, not a production accounting or payment system. The hosted graph persists audit events and treasurer decisions in D1, but does not yet use a durable LangGraph checkpoint saver. Its fee-change confirmation and model-failure handling are simpler than a production financial control workflow.
