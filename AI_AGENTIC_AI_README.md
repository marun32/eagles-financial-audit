# Eagles Financial Audit: AI and agentic workflows

This visual guide follows **what our hosted Eagles project actually does**. The separate local Python/PostgreSQL prototype is not the hosted app.

## The project in one picture

~~~mermaid
flowchart LR
  A["Admin configures teams,<br/>rosters, games, fees, policies"] --> B["Player submits season expense<br/>+ optional receipt image"]
  B --> C["AI extracts receipt facts<br/>if image attached"]
  C --> D["LangGraph audits the claim"]
  D -->|Clean and eligible| E["Auto-approve"]
  D -->|Flagged| F["Treasurer decides"]
  E --> G["Approved costs enter pool"]
  F -->|Approve| G
  F -->|Reject or unresolved| H["Excluded from pool"]
  G --> I["Weighted settlement<br/>calculated by code"]
  J["Member asks a question"] --> K["AI selects read-only tools"]
  K --> L["Club data and/or<br/>policy retrieval"]
  L --> M["Evidence-based answer<br/>with checked citations"]
~~~

| Term | What it means **in Eagles** |
| --- | --- |
| **LangGraph** | The actual claim-audit flow: named steps share state and branch to auto-approval or treasurer handoff. |
| **RAG** | For policy questions, retrieve relevant synthetic policy sections first; then ask the model to answer from those sections. |
| **MCP** | A standard authenticated interface through which an AI client can call our read-only club tools. |

These are different jobs. AI helps read and explain evidence; **rules and code** decide approval eligibility and calculate money.

## Journey 1 — submit and audit an expense

Imagine a rostered Eagles-LCCL player paid **$42 for team supplies** during Spring. They enter the amount, vendor, date, category, payer, and description, optionally attach a PNG/JPEG receipt, then press **Submit expense** once.

~~~mermaid
flowchart TD
  A["Player submits claim<br/>+ optional receipt"] --> B["Save claim in D1"]
  B --> C{"Image attached?"}
  C -->|Yes| D["Store privately in R2;<br/>Nebius vision extracts facts"]
  C -->|No| E["Record missing receipt"]
  D --> F["Check for possible duplicate"]
  E --> F
  F --> G1
  subgraph GRAPH["Actual LangGraph audit"]
    direction TD
    G1["1. Evaluate rules"] --> G2["2. Verify receipt"]
    G2 --> G3["3. Route review"]
    G3 --> G4["4. Check cited policy IDs"]
    G4 --> G5{"Eligible for<br/>auto-approval?"}
    G5 -->|Yes| G6["5a. Auto-approve branch"]
    G5 -->|No| G7["5b. Treasurer handoff branch"]
  end
  G6 --> H["Save result and audit run in D1"]
  G7 --> H
  H --> I["Show live tracker and result"]
~~~

**Important distinction:** Save, image extraction, duplicate check, and final persistence are application actions **around** the graph. The numbered steps inside the box are the actual LangGraph nodes. The UI displays progress from both.

| Step seen in the tracker | What it does for Eagles | Who or what performs it? |
| --- | --- | --- |
| **Save claim** | Checks roster membership, season window, payer, and expense date. A rostered player may claim even with **zero games played**. | Application validation, not AI. |
| **Read receipt** | If an image exists, extracts vendor, date, total, readability, and alcohol indication. Failure does not prevent submission but does prevent auto-approval. | Nebius vision extracts facts; it does **not** approve. |
| **Duplicate check** | Looks for another non-rejected claim with the same team-season, payer, amount, vendor, and date. | Database check; a match flags review, not rejection. |
| **1. Evaluate rules** | Checks missing receipt, alcohol, the $50 threshold, different payer, and duplicate flag. | Deterministic LangGraph node. |
| **2. Verify receipt** | Compares extracted facts with the amount, vendor, and date typed by the player; also checks readability and alcohol. | Deterministic LangGraph node using AI-extracted evidence. |
| **3. Route review** | A finding keeps the claim on the human-review path. | Deterministic LangGraph node. |
| **4. Check cited policy IDs** | Confirms that the policy section IDs used to explain the route exist in D1. **This is not Q&A vector search.** | D1 lookup inside LangGraph. |
| **5a / 5b. Branch** | Sends a clean eligible claim to auto-approval; otherwise hands it to a treasurer. | LangGraph conditional edge, not an LLM judgment. |
| **Save outcome** | Persists status, findings, policy IDs, and audit-run state. | Application/D1 step outside the graph. |

Why enter the amount **and** upload the receipt? The amount is the player's claim; the image is independent supporting evidence. Receipt verification compares the two. Duplicate checking instead compares this claim with **other claims**. Rejected claims do not count as duplicate blockers.

### Auto-approval rule

~~~text
Strictly under $50
AND readable, matching receipt
AND claimant = payer
AND no alcohol indication
AND no duplicate suspicion or other finding
           → auto-approve

Anything else → treasurer review
~~~

Exactly **$50** requires review. A receipt is optional for *submission* but necessary for *automatic approval*. Alcohol is not prohibited; it requires review. A different payer requires review even if the receipt matches.

New uploads accept PNG/JPEG images under 5 MB, not PDFs. Claims apply to the **whole season**, not a specific game. The claim window closes three calendar months after the last completed game, using the club's America/New_York date.

### When a human takes over

~~~mermaid
flowchart LR
  A["Graph flags claim"] --> B["Treasurer/admin reviews<br/>receipt, findings and policy IDs"]
  B --> C{"Decision with a reason"}
  C -->|Approve all or part| D["Approved amount enters pool;<br/>payer gets credit"]
  C -->|Reject| E["No pool amount or credit"]
  C -->|Ask for clarification| F["Player revises claim"]
  F --> G["Audit runs again"]
~~~

An unresolved claim may also be re-audited after adding or replacing a receipt. Final approved/rejected claims cannot. The graph **hands off** to the treasurer; human decisions are recorded through the application in D1, not by an LLM or a resumed graph checkpoint.

## Journey 2 — ask a club or policy question

Example: **“Who approves expenses, and is there a maximum claim amount?”** That needs policy evidence. **“What does Avery owe in Eagles-WMCL Fall?”** needs authorized settlement data. The assistant chooses the right read-only tools for the question.

~~~mermaid
flowchart TD
  A["Member asks question"] --> B["Nebius chooses up to 3<br/>allowlisted read-only tools"]
  B --> C{"Evidence needed?"}
  C -->|Policy| D["Search D1 policy sections"]
  C -->|Club facts| E["Read authorized team,<br/>roster or settlement data"]
  C -->|Both| D
  C -->|Both| E
  D --> F["Semantic vector ranking<br/>or keyword fallback"]
  F --> G["Up to 5 policy sections<br/>with IDs and metadata"]
  G --> I["Nebius drafts answer<br/>from returned evidence only"]
  E --> I
  I --> J{"Citations and amounts<br/>supported by evidence?"}
  J -->|Yes| K["Show answer, citations,<br/>and live progress"]
  J -->|No or model unavailable| L["Explicit fallback;<br/>do not invent an answer"]
~~~

| Live step | What an evaluator can see | Why it matters |
| --- | --- | --- |
| **Tool choice** | The model-selected tool names. If planning fails, bounded keyword rules choose from the same allowlist. | AI decides **what to read**, not what records to change. |
| **Policy retrieval / RAG** | Retrieval method (vector or lexical), section IDs such as EXP-5, and metadata. | Policy answers are traceable to our synthetic documents, not model memory. |
| **Club-data tool** | Named team, roster, overview, or settlement tool; response is access-filtered. | Live balances and players come from D1, not a policy document. |
| **Grounded answer** | Citations to returned sections or tool results. Invalid citations are rejected; mixed answers reject dollar amounts absent from evidence. | A fluent unsupported answer is treated as a failure. |
| **Fallback** | Labeled model/tool issue and available evidence. | Provider failure or output-budget exhaustion does not become a fabricated answer. |

Policy sections live in D1. Nebius embeddings rank them when available; keyword search is the fallback. Vectors are cached temporarily in a Worker instance, **not** stored in Pinecone. Q&A is a bounded TypeScript tool workflow, **not a second LangGraph graph**.

## Where MCP fits

~~~mermaid
flowchart LR
  A["External MCP client or<br/>in-app playground"] -->|JSON-RPC tools/call| B["Authenticated /mcp"]
  C["In-app Club Q&A"] -->|same implementations| D["Read-only tool layer"]
  B --> D
  D --> E["Authorized D1 club data<br/>and policy search"]
  D --> F["Optional model-based<br/>answer tools"]
~~~

MCP is the **tool interface**, not the audit graph or the RAG algorithm. The eight exposed tools are:

| Business need | MCP tool |
| --- | --- |
| Configured teams and fees | list_team_seasons |
| Pools and claim counts | get_team_overview |
| Calculated player balances | get_team_settlement |
| Roster and games played | get_team_roster |
| Ranked policy evidence | search_policy_sections |
| Full policy library | list_policy_sections |
| Policy-only answer | answer_policy_question |
| Club-data and/or policy answer | answer_club_question |

The playground makes a **real JSON-RPC MCP call**. Club Q&A reuses those authorized tool implementations and adds live progress, but its browser progress endpoint is not MCP transport. No MCP tool can submit or approve an expense. There is **no agent-to-agent/A2A conversation** in this MVP.

## Journey 3 — turn approved costs into player balances

~~~mermaid
flowchart LR
  A["Configured league fee"] --> D["Team-season expense pool"]
  B["Umpire fee ×<br/>completed games"] --> D
  C["Approved claim amounts"] --> D
  D --> E["Divide by weighted appearances<br/>games played × multiplier"]
  E --> F["Player's charge"]
  G["Approved expense paid<br/>by player"] --> H["Payer credit"]
  F --> I["Balance = charge − credit"]
  H --> I
~~~

This is **deterministic TypeScript accounting, not AI**. Default multipliers are 0 games → 0×, 1 → 0.5×, 2–3 → 0.75×, 4–6 → 1×, and 7–10 → 1.25×. There is no flat player fee. Integer-cent rounding reconciles to the full pool. A payer receives credit **after** the pool is allocated, even if they played zero games. Unapproved claims contribute nothing.

Admin/treasurer can preview a settlement. Finalization waits until after the claim deadline and all claims are resolved. Teams, fees, game status, attendance, and multipliers are maintained in the app, not CSV files.

## What is stored—and what is not

| Component | Used for | Boundary |
| --- | --- | --- |
| **React + Worker API** | One hosted UI and backend. | Server checks identity, role, roster, and team access. |
| **D1** | Club setup, games, attendance, claims, synthetic policies, decisions, settlements. | Structured business source of truth. |
| **R2** | Private receipt images. | Not a public policy/document store. |
| **Nebius chat/vision model** | Tool choice, receipt fact extraction, grounded answers. | Current model ID appears in the signed-in AI / Agentic AI tab; it cannot approve or calculate balances. |
| **Nebius embedding model** | Rank policy sections. | Temporary in-memory vector cache, not a vector database. |
| **LangGraph JS** | Named audit nodes, shared state, and approval/review branch. | D1 audit history is **not** a durable LangGraph checkpointer. |
| **Live trackers** | Show current audit and Q&A stages. | Not a durable replay of all model/tool events. |

“Memory” here means saved **business state** in D1, receipts in R2, and short-lived execution/cache state. The hosted app does **not** implement mem0, long-term conversational memory, LangSmith tracing, autonomous learning, Pinecone, or a separate A2A service. It does not run the separate PostgreSQL backend.

## Five-minute evaluator walkthrough

1. **Scene:** Show Eagles teams and the AI / Agentic AI tab, including current Nebius model IDs.
2. **LangGraph:** Submit an under-$50 claim with a clear receipt. Follow save → image facts → duplicate check → graph nodes → saved result. Point out why receipt verification differs from duplicate checking.
3. **Human control:** Submit a different-payer, alcohol, missing-receipt, or exactly-$50 claim. Show the review branch and a treasurer decision with a reason.
4. **RAG + MCP:** Ask who approves expenses and whether there is a maximum claim amount. Show selected tool, retrieval method, policy IDs, and checked answer or explicit fallback. Then call a tool in the MCP playground to show JSON-RPC.
5. **Business result:** Show weighted settlement and payer credit. Emphasize that AI supplies evidence/explanations; code calculates money.

## Code map for reviewers

The visuals above are the intended first read. Code entry points, grouped in one place:

| Area | Source |
| --- | --- |
| Submission, human decisions, admin setup, finalization | [Application API](app/api/%5B...path%5D/route.ts) |
| Claim graph and live audit | [LangGraph nodes](lib/audit-graph.ts), [audit service](lib/claim-audit-service.ts) |
| Receipt vision, tool planner, answer validation | [Nebius integration](lib/ai.ts) |
| Club Q&A and policy search | [Q&A orchestrator](lib/club-qa.ts), [policy retrieval](lib/data.ts) |
| MCP server and tools | [MCP endpoint](app/mcp/route.ts), [read-only tools](lib/mcp-tools.ts) |
| Weighted settlement | [Finance logic](lib/finance.ts) |
| Data and local run | [Dataset provenance](docs/datasets.md), [main README](README.md) |

Policies and demo data are **synthetic educational assumptions**. The prototype does not move money or replace an audited accounting system.
