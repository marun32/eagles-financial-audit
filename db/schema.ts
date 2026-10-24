import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const actors = sqliteTable("actors", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  playerId: text("player_id"),
  createdAt: text("created_at").notNull(),
});

export const players = sqliteTable("players", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  active: integer("active").notNull().default(1),
});

export const teamSeasons = sqliteTable("team_seasons", {
  id: text("id").primaryKey(),
  teamName: text("team_name").notNull(),
  seasonKind: text("season_kind").notNull(),
  seasonYear: integer("season_year").notNull(),
  leagueFeeCents: integer("league_fee_cents").notNull(),
  umpireFeeCents: integer("umpire_fee_cents").notNull().default(6000),
  scheduledGames: integer("scheduled_games").notNull().default(10),
  seasonStart: text("season_start").notNull(),
  seasonEnd: text("season_end").notNull(),
  multipliersJson: text("multipliers_json").notNull().default("[0,0.5,0.75,0.75,1,1,1,1.25,1.25,1.25,1.25]"),
  claimDeadline: text("claim_deadline"),
  status: text("status").notNull().default("OPEN"),
  configVersion: integer("config_version").notNull().default(1),
}, (table) => [uniqueIndex("team_season_unique").on(table.teamName, table.seasonKind, table.seasonYear)]);

export const roster = sqliteTable("roster", {
  teamSeasonId: text("team_season_id").notNull().references(() => teamSeasons.id),
  playerId: text("player_id").notNull().references(() => players.id),
  gamesPlayed: integer("games_played").notNull().default(0),
}, (table) => [primaryKey({ columns: [table.teamSeasonId, table.playerId] })]);

export const matches = sqliteTable("matches", {
  id: text("id").primaryKey(),
  teamSeasonId: text("team_season_id").notNull().references(() => teamSeasons.id),
  matchNumber: integer("match_number").notNull(),
  playedDate: text("played_date"),
  status: text("status").notNull().default("SCHEDULED"),
}, (table) => [uniqueIndex("match_team_number_unique").on(table.teamSeasonId, table.matchNumber)]);

export const attendance = sqliteTable("attendance", {
  teamSeasonId: text("team_season_id").notNull().references(() => teamSeasons.id),
  matchId: text("match_id").notNull().references(() => matches.id),
  playerId: text("player_id").notNull().references(() => players.id),
}, (table) => [primaryKey({ columns: [table.matchId, table.playerId] })]);

export const claims = sqliteTable("claims", {
  id: text("id").primaryKey(),
  teamSeasonId: text("team_season_id").notNull().references(() => teamSeasons.id),
  claimantId: text("claimant_id").notNull().references(() => players.id),
  revision: integer("revision").notNull().default(1),
  payerId: text("payer_id").notNull().references(() => players.id),
  category: text("category").notNull(),
  vendor: text("vendor").notNull(),
  description: text("description").notNull(),
  expenseDate: text("expense_date").notNull(),
  amountCents: integer("amount_cents").notNull(),
  alcohol: integer("alcohol").notNull().default(0),
  status: text("status").notNull().default("SUBMITTED"),
  receiptKey: text("receipt_key"),
  receiptName: text("receipt_name"),
  receiptType: text("receipt_type"),
  receiptExtractionJson: text("receipt_extraction_json"),
  route: text("route"),
  findingsJson: text("findings_json").notNull().default("[]"),
  policyCitationsJson: text("policy_citations_json").notNull().default("[]"),
  approvedAmountCents: integer("approved_amount_cents"),
  decisionReason: text("decision_reason"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const claimRevisions = sqliteTable("claim_revisions", {
  id: text("id").primaryKey(),
  claimId: text("claim_id").notNull().references(() => claims.id),
  revision: integer("revision").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  recordedBy: text("recorded_by").notNull(),
  recordedAt: text("recorded_at").notNull(),
}, (table) => [uniqueIndex("claim_revision_unique").on(table.claimId, table.revision)]);

export const systemExpenses = sqliteTable("system_expenses", {
  id: text("id").primaryKey(),
  teamSeasonId: text("team_season_id").notNull().references(() => teamSeasons.id),
  matchId: text("match_id"),
  category: text("category").notNull(),
  amountCents: integer("amount_cents").notNull(),
  createdAt: text("created_at").notNull(),
});

export const auditRuns = sqliteTable("audit_runs", {
  id: text("id").primaryKey(),
  claimId: text("claim_id").notNull().references(() => claims.id),
  stage: text("stage").notNull(),
  route: text("route").notNull(),
  findingsJson: text("findings_json").notNull(),
  createdAt: text("created_at").notNull(),
  resolvedAt: text("resolved_at"),
});

export const policies = sqliteTable("policies", {
  sectionId: text("section_id").primaryKey(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  policyType: text("policy_type").notNull(),
  version: integer("version").notNull().default(1),
});

export const configHistory = sqliteTable("config_history", {
  id: text("id").primaryKey(),
  teamSeasonId: text("team_season_id").notNull().references(() => teamSeasons.id),
  version: integer("version").notNull(),
  changedBy: text("changed_by").notNull(),
  changesJson: text("changes_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const settlements = sqliteTable("settlements", {
  id: text("id").primaryKey(),
  teamSeasonId: text("team_season_id").notNull().references(() => teamSeasons.id),
  status: text("status").notNull(),
  totalPoolCents: integer("total_pool_cents").notNull(),
  rowsJson: text("rows_json").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull(),
});
