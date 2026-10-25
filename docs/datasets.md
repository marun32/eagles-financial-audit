# Hosted Site datasets and provenance

All club, player, receipt, and policy examples in this project are synthetic. No real league publication, member roster, or financial record is bundled.

## Runtime seed

The hosted Site does **not** read CSV files at runtime. The administrator's **Load synthetic demo data** action invokes `seedDemo()` in [`lib/data.ts`](../lib/data.ts), which inserts the following records into D1 when no team-season exists:

| Data | Synthetic seed |
| --- | --- |
| Club and teams | Eagles; Eagles-LCCL and Eagles-WMCL |
| Seasons | Spring and Fall 2026 for each team (four team-seasons) |
| Players and rosters | 12 named demo players; 10 roster memberships per team-season, with overlaps between teams |
| Matches and attendance | 10 completed matches per team-season; deterministic appearances of 0, 1, 2, 3, 4, 5, 6, 7, 8, and 10 games |
| Club-paid fees | $650 LCCL or $975 WMCL league fee per season; $60 umpire fee per completed match |
| Allocation | Versioned multipliers: 0 games 0×, 1 game 0.5×, 2–3 games 0.75×, 4–6 games 1×, 7–10 games 1.25× |
| Policy corpus | 39 synthetic expense, settlement, and league sections from [`lib/policy-seed.json`](../lib/policy-seed.json) |
| New claims and receipts | None preloaded; submitted claims enter D1 and uploaded PNG/JPEG bytes enter R2 |

Currency is USD; deadlines use `America/New_York`. The seed uses fixed Spring/Fall dates and match dates so a fresh local preview is reproducible. The seed is not a reset button: once a team-season exists, it does not overwrite live clubs, rosters, fees, claims, or treasurer decisions. Later administration changes are D1 records, not edits to this source file.

The policy JSON is the hosted Q&A and audit source. Sections have stable `section_id` values and version fields. The original Markdown policies and CSV fixture set from the separate Python/PostgreSQL prototype are not loaded by this hosted Site; their scope and receipt rules may differ. Do not describe them as the Site's runtime database.

## Regression fixture subset

[`tests/fixtures/settlements.jsonl`](../tests/fixtures/settlements.jsonl) and [`tests/fixtures/settlement_players.jsonl`](../tests/fixtures/settlement_players.jsonl) are compact, field-selected copies of the independent offline settlement goldens. They contain four settlement totals and 80 player outcomes for testing the deterministic allocation algorithm. They are **not** the D1 seed or a snapshot of the live Site, which has 10 rostered players per team-season.

The original full fixture files were `data/expected/settlements.jsonl` (SHA-256 `5db41896ca949a5a5ff4eb26a461e33fd01a9ce11c6eaba830bf953f05ebe1fd`) and `data/expected/settlement_players.jsonl` (SHA-256 `5dd5ccc9bb562f98cd7cb264b9cd28019f456efb4051eb21624862fda65c3854`). The compact copies retain only fields read by the Site's finance test. This repository intentionally does not include the full Python dataset manifest, because that manifest references backend-only catalogs and artifacts outside this Site.

## Model inputs

Policy Q&A retrieves policy sections from D1 and sends only selected evidence to Nebius. The embedding cache is transient per Worker isolate. Receipt vision receives an uploaded image and extracts merchant, date, total, alcohol presence, and readability; the deterministic audit checks those facts against the submitted claim. Runtime user uploads, model responses, and D1/R2 state are not committed to Git.
