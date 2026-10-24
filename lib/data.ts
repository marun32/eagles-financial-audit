import { env } from "cloudflare:workers";
import { addMonths, allocate, clubToday, DEFAULT_MULTIPLIERS } from "./finance";
import policySections from "./policy-seed.json";

export type Actor = { user_id: string; email: string; role: "admin" | "treasurer" | "player"; player_id: string | null };
export type Team = { id: string; team_name: string; season_kind: string; season_year: number; league_fee_cents: number; umpire_fee_cents: number; scheduled_games: number; season_start: string; season_end: string; multipliers_json: string; claim_deadline: string | null; status: string; config_version: number };
export type Claim = { id: string; team_season_id: string; claimant_id: string; payer_id: string; revision: number; category: string; vendor: string; description: string; expense_date: string; amount_cents: number; alcohol: number; status: string; receipt_key: string | null; receipt_name: string | null; receipt_type: string | null; receipt_extraction_json: string | null; route: string | null; findings_json: string; policy_citations_json: string; approved_amount_cents: number | null; decision_reason: string | null; created_at: string; updated_at: string };

export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }
export function database(): D1Database { if (!env.DB) throw new Error("D1 is unavailable"); return env.DB; }
export function bucket(): R2Bucket { if (!env.BUCKET) throw new Error("R2 is unavailable"); return env.BUCKET; }
export async function rows<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  const result = await database().prepare(sql).bind(...params).all<T>();
  return result.results ?? [];
}
export async function first<T>(sql: string, ...params: unknown[]): Promise<T | null> { return await database().prepare(sql).bind(...params).first<T>(); }
export async function run(sql: string, ...params: unknown[]): Promise<void> { await database().prepare(sql).bind(...params).run(); }

export async function actorFor(request: Request): Promise<Actor> {
  const userId = request.headers.get("oai-authenticated-user-id");
  const email = request.headers.get("oai-authenticated-user-email")?.toLowerCase();
  if (!userId || !email) throw new HttpError(401, "Sign in with ChatGPT to continue");
  let actor = await first<Actor>("SELECT * FROM actors WHERE user_id = ?", userId);
  if (actor) return actor;
  const count = await first<{ n: number }>("SELECT COUNT(*) AS n FROM actors");
  if (count?.n === 0) {
    const localPreview = ["127.0.0.1", "localhost"].includes(new URL(request.url).hostname);
    const ownerEmail = env.EAGLES_ADMIN_EMAIL?.toLowerCase() ?? (localPreview ? "seedy@sites.test" : "");
    if (!ownerEmail || email !== ownerEmail) throw new HttpError(403, "Club admin has not been provisioned");
    await run("INSERT OR IGNORE INTO actors (user_id,email,role,player_id,created_at) VALUES (?,?,?,?,?)", userId, email, "admin", null, new Date().toISOString());
  } else {
    const invitation = await first<Actor>("SELECT * FROM actors WHERE email = ? AND user_id LIKE 'invite:%'", email);
    if (!invitation) throw new HttpError(403, "You are not yet on the Eagles access list");
    await run("UPDATE actors SET user_id = ? WHERE user_id = ?", userId, invitation.user_id);
  }
  actor = await first<Actor>("SELECT * FROM actors WHERE user_id = ?", userId);
  if (!actor) throw new HttpError(403, "Access not available");
  return actor;
}
export function requireRole(actor: Actor, ...roles: Actor["role"][]): void {
  if (!roles.includes(actor.role)) throw new HttpError(403, "This action requires treasurer or admin access");
}
export async function teamOr404(id: string): Promise<Team> {
  const team = await first<Team>("SELECT * FROM team_seasons WHERE id = ?", id);
  if (!team) throw new HttpError(404, "Team-season not found");
  return team;
}
export async function claimOr404(id: string): Promise<Claim> {
  const claim = await first<Claim>("SELECT * FROM claims WHERE id = ?", id);
  if (!claim) throw new HttpError(404, "Claim not found");
  return claim;
}
export async function assertTeamAccess(actor: Actor, teamId: string): Promise<void> {
  if (actor.role !== "player") return;
  if (!actor.player_id) throw new HttpError(403, "Your account is not linked to a rostered player");
  const member = await first("SELECT player_id FROM roster WHERE team_season_id = ? AND player_id = ?", teamId, actor.player_id);
  if (!member) throw new HttpError(403, "You are not on this team-season roster");
}
export async function teamsFor(actor: Actor): Promise<Team[]> {
  if (actor.role === "player") {
    if (!actor.player_id) return [];
    return rows<Team>("SELECT t.* FROM team_seasons t JOIN roster r ON r.team_season_id=t.id WHERE r.player_id=? ORDER BY t.season_year DESC,CASE t.season_kind WHEN 'Fall' THEN 1 ELSE 0 END DESC,t.team_name", actor.player_id);
  }
  return rows<Team>("SELECT * FROM team_seasons ORDER BY season_year DESC,CASE season_kind WHEN 'Fall' THEN 1 ELSE 0 END DESC,team_name");
}
export async function teamDetail(actor: Actor, id: string) {
  const team = await teamOr404(id);
  await assertTeamAccess(actor, id);
  const [roster, games, claims, expenses, history] = await Promise.all([
    rows<{ player_id: string; name: string; email: string; games_played: number }>("SELECT r.player_id,p.name,p.email,COUNT(a.match_id) AS games_played FROM roster r JOIN players p ON p.id=r.player_id LEFT JOIN attendance a ON a.team_season_id=r.team_season_id AND a.player_id=r.player_id WHERE r.team_season_id=? GROUP BY r.player_id,p.name,p.email ORDER BY p.name", id),
    rows<{ id: string; match_number: number; played_date: string | null; status: string }>("SELECT * FROM matches WHERE team_season_id=? ORDER BY match_number", id),
    rows<Claim & { claimant_name: string; payer_name: string }>("SELECT c.*,p.name AS claimant_name,pp.name AS payer_name FROM claims c JOIN players p ON p.id=c.claimant_id JOIN players pp ON pp.id=c.payer_id WHERE c.team_season_id=? ORDER BY c.created_at DESC", id),
    rows<{ id: string; category: string; amount_cents: number; match_id: string | null }>("SELECT * FROM system_expenses WHERE team_season_id=? ORDER BY category,id", id),
    rows<{ version: number; changes_json: string; created_at: string }>("SELECT version,changes_json,created_at FROM config_history WHERE team_season_id=? ORDER BY version DESC", id),
  ]);
  const visibleClaims = actor.role === "player" ? claims.filter((claim) => claim.claimant_id === actor.player_id || claim.payer_id === actor.player_id) : claims;
  return { team, roster, games, claims: visibleClaims, expenses, history };
}
export async function settlementPreview(actor: Actor, id: string) {
  const team = await teamOr404(id);
  await assertTeamAccess(actor, id);
  const roster = await rows<{ id: string; name: string; games_played: number }>("SELECT p.id,p.name,COUNT(a.match_id) AS games_played FROM roster r JOIN players p ON p.id=r.player_id LEFT JOIN attendance a ON a.team_season_id=r.team_season_id AND a.player_id=r.player_id WHERE r.team_season_id=? GROUP BY p.id,p.name ORDER BY p.id", id);
  const club = await first<{ total: number }>("SELECT COALESCE(SUM(amount_cents),0) AS total FROM system_expenses WHERE team_season_id=?", id);
  const approved = await first<{ total: number }>("SELECT COALESCE(SUM(approved_amount_cents),0) AS total FROM claims WHERE team_season_id=? AND status='APPROVED'", id);
  const credits = await rows<{ payer_id: string; total: number }>("SELECT payer_id,SUM(approved_amount_cents) AS total FROM claims WHERE team_season_id=? AND status='APPROVED' GROUP BY payer_id", id);
  const creditMap = new Map(credits.map((row) => [row.payer_id, row.total]));
  const totalPoolCents = (club?.total ?? 0) + (approved?.total ?? 0);
  const allocations = allocate(totalPoolCents, roster.map((p) => ({ id: p.id, name: p.name, gamesPlayed: p.games_played, creditCents: creditMap.get(p.id) ?? 0 })), JSON.parse(team.multipliers_json));
  const visible = actor.role === "player" ? allocations.filter((p) => p.id === actor.player_id) : allocations;
  return { teamId: id, totalPoolCents, clubPaidCents: club?.total ?? 0, approvedClaimsCents: approved?.total ?? 0, rows: visible, provisional: team.status !== "FINALIZED", rounding: "largest remainder, player ID tie-breaker" };
}

export function evaluateClaim(claim: Claim, duplicate: boolean) {
  const findings: string[] = [];
  if (!claim.receipt_key) findings.push("RECEIPT_MISSING");
  if (claim.alcohol || /alcohol|beer|wine|liquor/i.test(`${claim.category} ${claim.description}`)) findings.push("ALCOHOL_REVIEW");
  if (claim.amount_cents >= 5000) findings.push("ABOVE_AUTO_APPROVAL_THRESHOLD");
  if (claim.claimant_id !== claim.payer_id) findings.push("DIFFERENT_PAYER");
  if (duplicate) findings.push("POSSIBLE_DUPLICATE");
  const route = findings.length ? "REVIEW" : "AUTO_APPROVE";
  const citations = findings.map((code) => code === "RECEIPT_MISSING" ? "EXP-6" : code === "ALCOHOL_REVIEW" ? "EXP-6" : code === "ABOVE_AUTO_APPROVAL_THRESHOLD" ? "EXP-5" : "EXP-6");
  if (!citations.length) citations.push("EXP-5");
  return { route, findings, citations: [...new Set(citations)] };
}

export async function seedDemo(): Promise<{ created: boolean }> {
  for (const policy of policySections) await run("INSERT INTO policies (section_id,title,body,policy_type,version) VALUES (?,?,?,?,?) ON CONFLICT(section_id) DO UPDATE SET title=excluded.title,body=excluded.body,policy_type=excluded.policy_type,version=excluded.version", policy.section_id, policy.title, policy.body, policy.policy_type, policy.version);
  const exists = await first("SELECT id FROM team_seasons LIMIT 1");
  if (exists) {
    // Bring the earlier local synthetic preview forward without touching non-demo records.
    const demoRoster = await rows<{ team_season_id: string; player_id: string; games_played: number }>("SELECT team_season_id,player_id,games_played FROM roster WHERE player_id LIKE 'player-%' AND team_season_id LIKE 'eagles-%-2026'");
    for (const member of demoRoster) {
      const completed = await rows<{ id: string }>("SELECT id FROM matches WHERE team_season_id=? AND status='COMPLETED' ORDER BY match_number LIMIT ?", member.team_season_id, member.games_played);
      for (const game of completed) await run("INSERT OR IGNORE INTO attendance (team_season_id,match_id,player_id) VALUES (?,?,?)", member.team_season_id, game.id, member.player_id);
    }
    return { created: false };
  }
  const now = new Date().toISOString();
  const names = ["Avery Shah", "Jordan Lee", "Morgan Patel", "Taylor Brooks", "Casey Rivera", "Riley Chen", "Sam Wilson", "Alex Kim", "Jamie Singh", "Drew Martin", "Skyler Davis", "Parker Jones"];
  for (let i = 0; i < names.length; i++) await run("INSERT INTO players (id,name,email,active) VALUES (?,?,?,1)", `player-${String(i + 1).padStart(2, "0")}`, names[i], `player${i + 1}@eagles.example`);
  for (const kind of ["Spring", "Fall"]) for (const [teamName, leagueFee] of [["Eagles-LCCL", 65000], ["Eagles-WMCL", 97500]] as const) {
    const id = `${teamName.toLowerCase()}-${kind.toLowerCase()}-2026`;
    const start = kind === "Spring" ? "2026-03-01" : "2026-08-01";
    const end = kind === "Spring" ? "2026-06-30" : "2026-11-30";
    const lastGame = kind === "Spring" ? "2026-06-14" : "2026-10-10";
    await run("INSERT INTO team_seasons (id,team_name,season_kind,season_year,league_fee_cents,umpire_fee_cents,scheduled_games,season_start,season_end,multipliers_json,claim_deadline,status,config_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)", id, teamName, kind, 2026, leagueFee, 6000, 10, start, end, JSON.stringify(DEFAULT_MULTIPLIERS), addMonths(lastGame, 3), "OPEN");
    await run("INSERT INTO system_expenses (id,team_season_id,match_id,category,amount_cents,created_at) VALUES (?,?,?,?,?,?)", `${id}-league`, id, null, "LEAGUE_FEE", leagueFee, now);
    for (let game = 1; game <= 10; game++) {
      const gameId = `${id}-game-${game}`;
      const gameDate = new Date(`${lastGame}T12:00:00Z`); gameDate.setUTCDate(gameDate.getUTCDate() - (10 - game) * 7);
      await run("INSERT INTO matches (id,team_season_id,match_number,played_date,status) VALUES (?,?,?,?,?)", gameId, id, game, gameDate.toISOString().slice(0, 10), "COMPLETED");
      await run("INSERT INTO system_expenses (id,team_season_id,match_id,category,amount_cents,created_at) VALUES (?,?,?,?,?,?)", `${gameId}-umpire`, id, gameId, "UMPIRE_FEE", 6000, now);
    }
    const offset = teamName === "Eagles-LCCL" ? 0 : 3;
    const appearances = [0, 1, 2, 3, 4, 5, 6, 7, 8, 10];
    for (let i = 0; i < 10; i++) {
      const playerId = `player-${String(((i + offset) % 12) + 1).padStart(2, "0")}`;
      await run("INSERT INTO roster (team_season_id,player_id,games_played) VALUES (?,?,?)", id, playerId, appearances[i]);
      for (let game = 1; game <= appearances[i]; game++) await run("INSERT INTO attendance (team_season_id,match_id,player_id) VALUES (?,?,?)", id, `${id}-game-${game}`, playerId);
    }
  }
  return { created: true };
}

export async function policySearch(question: string) {
  const tokens = question.toLowerCase().match(/[a-z0-9]+/g)?.filter((word) => word.length > 2) ?? [];
  const policies = await rows<{ section_id: string; title: string; body: string; version: number }>("SELECT section_id,title,body,version FROM policies");
  return policies.map((p) => ({ ...p, score: tokens.reduce((n, token) => n + ((`${p.title} ${p.body}`).toLowerCase().includes(token) ? 1 : 0), 0) }))
    .filter((p) => p.score > 0).sort((a, b) => b.score - a.score || a.section_id.localeCompare(b.section_id)).slice(0, 4);
}
export function safeText(value: unknown, max = 500): string { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
export function uuid(): string { return crypto.randomUUID(); }
export { clubToday, addMonths };
