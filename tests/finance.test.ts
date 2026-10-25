import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { addMonths, allocate, DEFAULT_MULTIPLIERS } from "../lib/finance";

test("weighted allocation reconciles every cent and credits zero-game payer after charging", () => {
  const players = [
    { id: "a", name: "Zero", gamesPlayed: 0, creditCents: 4500 },
    { id: "b", name: "One", gamesPlayed: 1, creditCents: 0 },
    { id: "c", name: "Seven", gamesPlayed: 7, creditCents: 0 },
  ];
  const rows = allocate(129500, players, DEFAULT_MULTIPLIERS);
  assert.equal(rows.reduce((n, row) => n + row.chargeCents, 0), 129500);
  assert.equal(rows.reduce((n, row) => n + row.creditCents, 0), 4500);
  assert.equal(rows[0].chargeCents, 0);
  assert.equal(rows[0].balanceCents, -4500);
  assert.equal(rows[1].multiplier, 0.5);
  assert.equal(rows[2].multiplier, 1.25);
});

test("largest remainder uses stable player ID tie-breaker", () => {
  const rows = allocate(1, [
    { id: "b", name: "B", gamesPlayed: 1, creditCents: 0 },
    { id: "a", name: "A", gamesPlayed: 1, creditCents: 0 },
  ]);
  assert.equal(rows.find((row) => row.id === "a")?.chargeCents, 1);
  assert.equal(rows.find((row) => row.id === "b")?.chargeCents, 0);
});

test("claim deadline uses calendar months and clamps month-end", () => {
  assert.equal(addMonths("2026-10-10", 3), "2027-01-10");
  assert.equal(addMonths("2026-11-30", 3), "2027-02-28");
});

test("port matches all 80 Python settlement player goldens", () => {
  const readJsonl = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  const runs = readJsonl("./fixtures/settlements.jsonl");
  const expectedRows = readJsonl("./fixtures/settlement_players.jsonl");
  assert.equal(expectedRows.length, 80);
  for (const run of runs) {
    const goldens = expectedRows.filter((row) => row.settlement_run_id === run.settlement_run_id);
    const actual = allocate(run.team_season_pool_cents, goldens.map((row) => ({ id: row.player_id, name: row.player_id, gamesPlayed: row.games_played, creditCents: row.player_reimbursement_credit_cents })));
    for (const row of goldens) {
      const match = actual.find((item) => item.id === row.player_id);
      assert.equal(match?.chargeCents, row.player_charge_cents, `${run.team} ${run.season} ${row.player_id}`);
      assert.equal(match?.balanceCents, row.player_net_balance_cents);
    }
  }
});
