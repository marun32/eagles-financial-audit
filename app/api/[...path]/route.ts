import { NextRequest, NextResponse } from "next/server";
import { extractReceipt } from "../../../lib/ai";
import { Actor, Claim, HttpError, actorFor, addMonths, assertTeamAccess, bucket, claimOr404, clubToday, database, ensureCurrentPolicySeed, first, requireRole, rows, run, safeText, seedDemo, settlementPreview, teamDetail, teamOr404, teamsFor, uuid } from "../../../lib/data";
import { allocate } from "../../../lib/finance";
import { executeClaimAudit } from "../../../lib/claim-audit-service";
import { runPolicyQuestion } from "../../../lib/policy-qa";

export const runtime = "edge";
type Context = { params: Promise<{ path: string[] }> };
const json = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });
const fail = (error: unknown) => json({ error: error instanceof Error ? error.message : "Unexpected error" }, error instanceof HttpError ? error.status : 500);
async function body(request: Request): Promise<Record<string, unknown>> { try { const data = await request.json(); if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(); return data as Record<string, unknown>; } catch { throw new HttpError(400, "Expected a JSON object"); } }
function integer(value: unknown, name: string, minimum = 0): number { if (!Number.isSafeInteger(value) || (value as number) < minimum) throw new HttpError(400, `Invalid ${name}`); return value as number; }
function date(value: unknown, name: string): string { if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(`${value}T12:00:00Z`))) throw new HttpError(400, `Invalid ${name}`); return value; }
const now = () => new Date().toISOString();

async function dispatch(request: NextRequest, path: string[], actor: Actor): Promise<Response> {
  const method = request.method;
  if (method === "GET" && path.join("/") === "me") return json(actor);
  if (method === "GET" && path.join("/") === "teams") return json(await teamsFor(actor));
  if (method === "GET" && path.join("/") === "overview") {
    const teams = await teamsFor(actor);
    const summaries = [];
    for (const team of teams) {
      const detail = await teamDetail(actor, team.id);
      const preview = await settlementPreview(actor, team.id);
      summaries.push({ team, poolCents: preview.totalPoolCents, approvedClaims: detail.claims.filter((c) => c.status === "APPROVED").length, pendingClaims: detail.claims.filter((c) => !["APPROVED", "REJECTED"].includes(c.status)).length, rosterCount: detail.roster.length });
    }
    return json(summaries);
  }
  if (method === "GET" && path[0] === "teams" && path.length === 2) return json(await teamDetail(actor, path[1]));
  if (method === "GET" && path[0] === "teams" && path[2] === "settlement") return json(await settlementPreview(actor, path[1]));
  if (method === "GET" && path.join("/") === "policies") { await ensureCurrentPolicySeed(); return json(await rows("SELECT section_id,title,body,policy_type,version FROM policies ORDER BY section_id")); }
  if (method === "GET" && path.join("/") === "admin/actors") { requireRole(actor, "admin"); return json(await rows("SELECT user_id,email,role,player_id FROM actors ORDER BY email")); }
  if (method === "GET" && path.join("/") === "admin/players") { requireRole(actor, "admin", "treasurer"); return json(await rows("SELECT * FROM players ORDER BY name")); }
  if (method === "GET" && path[0] === "claims" && path[2] === "revisions" && path[4] === "receipt") {
    const claim = await claimOr404(path[1]); await assertTeamAccess(actor, claim.team_season_id);
    if (actor.role === "player" && actor.player_id !== claim.claimant_id && actor.player_id !== claim.payer_id) throw new HttpError(403, "Claim access denied");
    const revision = Number(path[3]);
    if (!Number.isSafeInteger(revision) || revision < 1) throw new HttpError(400, "Invalid revision");
    const stored = await first<{ snapshot_json: string }>("SELECT snapshot_json FROM claim_revisions WHERE claim_id=? AND revision=?", claim.id, revision);
    if (!stored) throw new HttpError(404, "Revision not found");
    const snapshot = JSON.parse(stored.snapshot_json) as Claim;
    if (!snapshot.receipt_key) throw new HttpError(404, "No receipt for this revision");
    const object = await bucket().get(snapshot.receipt_key); if (!object) throw new HttpError(404, "Receipt file missing");
    return new Response(object.body, { headers: { "Content-Type": snapshot.receipt_type ?? "application/octet-stream", "Content-Disposition": `attachment; filename="${(snapshot.receipt_name ?? "receipt").replace(/[^a-zA-Z0-9._-]/g, "_")}"`, "Cache-Control": "private, no-store" } });
  }
  if (method === "GET" && path[0] === "claims" && path[2] === "revisions") {
    const claim = await claimOr404(path[1]); await assertTeamAccess(actor, claim.team_season_id);
    if (actor.role === "player" && actor.player_id !== claim.claimant_id && actor.player_id !== claim.payer_id) throw new HttpError(403, "Claim access denied");
    const history = await rows<{ revision: number; snapshot_json: string; recorded_at: string }>("SELECT revision,snapshot_json,recorded_at FROM claim_revisions WHERE claim_id=? ORDER BY revision", claim.id);
    return json(history.map((item) => ({ revision: item.revision, snapshot: JSON.parse(item.snapshot_json), recordedAt: item.recorded_at })));
  }
  if (method === "GET" && path[0] === "claims" && path[2] === "receipt") {
    const claim = await claimOr404(path[1]); await assertTeamAccess(actor, claim.team_season_id);
    if (actor.role === "player" && actor.player_id !== claim.claimant_id && actor.player_id !== claim.payer_id) throw new HttpError(403, "Receipt access denied");
    if (!claim.receipt_key) throw new HttpError(404, "No receipt attached");
    const object = await bucket().get(claim.receipt_key);
    if (!object) throw new HttpError(404, "Receipt file missing");
    return new Response(object.body, { headers: { "Content-Type": claim.receipt_type ?? "application/octet-stream", "Content-Disposition": `attachment; filename="${(claim.receipt_name ?? "receipt").replace(/[^a-zA-Z0-9._-]/g, "_")}"`, "Cache-Control": "private, no-store" } });
  }
  if (method !== "POST") throw new HttpError(404, "Route not found");

  if (path.join("/") === "admin/seed") { requireRole(actor, "admin"); return json(await seedDemo()); }
  if (path.join("/") === "admin/invite") {
    requireRole(actor, "admin"); const input = await body(request);
    const email = safeText(input.email, 255).toLowerCase(); const role = safeText(input.role);
    if (!/^\S+@\S+\.\S+$/.test(email) || !["player", "treasurer", "admin"].includes(role)) throw new HttpError(400, "Valid email and role required");
    const playerId = input.playerId ? safeText(input.playerId, 100) : null;
    if (role === "player" && !playerId) throw new HttpError(400, "A player role needs a linked player");
    if (playerId && !await first("SELECT id FROM players WHERE id=?", playerId)) throw new HttpError(404, "Player not found");
    const existing = await first<Actor>("SELECT * FROM actors WHERE email=?", email);
    if (existing) await run("UPDATE actors SET role=?,player_id=? WHERE email=?", role, playerId, email);
    else await run("INSERT INTO actors (user_id,email,role,player_id,created_at) VALUES (?,?,?,?,?)", `invite:${uuid()}`, email, role, playerId, now());
    return json({ email, role, playerId });
  }
  if (path.join("/") === "admin/self-player") {
    requireRole(actor, "admin", "treasurer"); const input = await body(request); const playerId = safeText(input.playerId, 100);
    if (!await first("SELECT id FROM players WHERE id=?", playerId)) throw new HttpError(404, "Player not found");
    await run("UPDATE actors SET player_id=? WHERE user_id=?", playerId, actor.user_id); return json({ playerId });
  }
  if (path.join("/") === "admin/player") {
    requireRole(actor, "admin"); const input = await body(request); const name = safeText(input.name, 100); const email = safeText(input.email, 255).toLowerCase();
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Name and email required");
    const id = uuid(); await run("INSERT INTO players (id,name,email,active) VALUES (?,?,?,1)", id, name, email); return json({ id, name, email }, 201);
  }
  if (path.join("/") === "admin/team") {
    requireRole(actor, "admin"); const input = await body(request);
    const name = safeText(input.teamName, 100); const kind = safeText(input.seasonKind); const year = integer(input.seasonYear, "season year", 2020);
    const leagueFee = integer(input.leagueFeeCents, "league fee"); const umpireFee = integer(input.umpireFeeCents, "umpire fee");
    const start = date(input.seasonStart, "season start"); const end = date(input.seasonEnd, "season end");
    if (!name || !["Spring", "Fall"].includes(kind) || start > end) throw new HttpError(400, "Invalid team-season");
    const id = uuid(); const count = integer(input.scheduledGames, "scheduled games", 1);
    await run("INSERT INTO team_seasons (id,team_name,season_kind,season_year,league_fee_cents,umpire_fee_cents,scheduled_games,season_start,season_end,multipliers_json,status,config_version) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)", id, name, kind, year, leagueFee, umpireFee, count, start, end, JSON.stringify(Array.from({ length: count + 1 }, (_, i) => i === 0 ? 0 : i === 1 ? 0.5 : i <= 3 ? 0.75 : i <= 6 ? 1 : 1.25)), "OPEN");
    await run("INSERT INTO system_expenses (id,team_season_id,match_id,category,amount_cents,created_at) VALUES (?,?,?,?,?,?)", `${id}-league`, id, null, "LEAGUE_FEE", leagueFee, now());
    for (let i = 1; i <= count; i++) await run("INSERT INTO matches (id,team_season_id,match_number,status) VALUES (?,?,?,'SCHEDULED')", `${id}-game-${i}`, id, i);
    return json({ id }, 201);
  }
  if (path[0] === "admin" && path[1] === "teams" && path[3] === "impact") {
    requireRole(actor, "admin", "treasurer"); const team = await teamOr404(path[2]);
    if (team.status === "FINALIZED") throw new HttpError(409, "Season is finalized");
    const input = await body(request); const proposedLeague = integer(input.leagueFeeCents, "league fee"); const proposedUmpire = integer(input.umpireFeeCents, "umpire fee");
    const multipliers = input.multipliers;
    if (!Array.isArray(multipliers) || multipliers.length !== team.scheduled_games + 1 || multipliers.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 3) || multipliers[0] !== 0) throw new HttpError(400, "Invalid multiplier coverage");
    const baseline = await settlementPreview(actor, team.id);
    const completed = await first<{ n: number }>("SELECT COUNT(*) AS n FROM matches WHERE team_season_id=? AND status='COMPLETED'", team.id);
    const proposedPool = baseline.totalPoolCents - team.league_fee_cents - (completed?.n ?? 0) * team.umpire_fee_cents + proposedLeague + (completed?.n ?? 0) * proposedUmpire;
    const proposed = allocate(proposedPool, baseline.rows.map((p) => ({ id: p.id, name: p.name, gamesPlayed: p.gamesPlayed, creditCents: p.creditCents })), multipliers);
    const previous = new Map(baseline.rows.map((p) => [p.id, p]));
    const unresolved = await first<{ n: number }>("SELECT COUNT(*) AS n FROM claims WHERE team_season_id=? AND status NOT IN ('APPROVED','REJECTED')", team.id);
    return json({ configVersion: team.config_version, baselinePoolCents: baseline.totalPoolCents, proposedPoolCents: proposedPool, unresolvedClaims: unresolved?.n ?? 0, rows: proposed.map((p) => ({ playerId: p.id, name: p.name, chargeCents: p.chargeCents, chargeDeltaCents: p.chargeCents - (previous.get(p.id)?.chargeCents ?? 0), balanceCents: p.balanceCents, balanceDeltaCents: p.balanceCents - (previous.get(p.id)?.balanceCents ?? 0) })) });
  }
  if (path[0] === "admin" && path[1] === "teams" && path[3] === "config") {
    requireRole(actor, "admin"); const team = await teamOr404(path[2]); if (team.status === "FINALIZED") throw new HttpError(409, "Finalized seasons require an amendment workflow");
    const input = await body(request); const fee = integer(input.leagueFeeCents, "league fee"); const umpire = integer(input.umpireFeeCents, "umpire fee");
    const multipliers = input.multipliers;
    if (!Array.isArray(multipliers) || multipliers.length !== team.scheduled_games + 1 || multipliers.some((n) => typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 3) || multipliers[0] !== 0) throw new HttpError(400, "Provide a multiplier for every game count, beginning with 0");
    const changes = { leagueFeeCents: fee, umpireFeeCents: umpire, multipliers };
    const version = team.config_version + 1;
    await database().batch([
      database().prepare("UPDATE team_seasons SET league_fee_cents=?,umpire_fee_cents=?,multipliers_json=?,config_version=? WHERE id=?").bind(fee, umpire, JSON.stringify(multipliers), version, team.id),
      database().prepare("UPDATE system_expenses SET amount_cents=? WHERE id=?").bind(fee, `${team.id}-league`),
      database().prepare("UPDATE system_expenses SET amount_cents=? WHERE team_season_id=? AND category='UMPIRE_FEE'").bind(umpire, team.id),
      database().prepare("INSERT INTO config_history (id,team_season_id,version,changed_by,changes_json,created_at) VALUES (?,?,?,?,?,?)").bind(uuid(), team.id, version, actor.user_id, JSON.stringify(changes), now()),
    ]);
    return json({ version, changes });
  }
  if (path[0] === "admin" && path[1] === "teams" && path[3] === "roster") {
    requireRole(actor, "admin", "treasurer"); const team = await teamOr404(path[2]); if (team.status === "FINALIZED") throw new HttpError(409, "Season is finalized");
    const input = await body(request); const playerId = safeText(input.playerId, 100); const games = integer(input.gamesPlayed, "games played");
    if (games > team.scheduled_games || !await first("SELECT id FROM players WHERE id=?", playerId)) throw new HttpError(400, "Invalid player or games played");
    const completed = await rows<{ id: string }>("SELECT id FROM matches WHERE team_season_id=? AND status='COMPLETED' ORDER BY match_number LIMIT ?", team.id, games);
    if (completed.length !== games) throw new HttpError(400, "Games played cannot exceed completed matches");
    await database().batch([
      database().prepare("INSERT INTO roster (team_season_id,player_id,games_played) VALUES (?,?,?) ON CONFLICT(team_season_id,player_id) DO UPDATE SET games_played=excluded.games_played").bind(team.id, playerId, games),
      database().prepare("DELETE FROM attendance WHERE team_season_id=? AND player_id=?").bind(team.id, playerId),
      ...completed.map((game) => database().prepare("INSERT INTO attendance (team_season_id,match_id,player_id) VALUES (?,?,?)").bind(team.id, game.id, playerId)),
    ]);
    return json({ playerId, gamesPlayed: games });
  }
  if (path[0] === "admin" && path[1] === "teams" && path[3] === "attendance") {
    requireRole(actor, "admin", "treasurer"); const team = await teamOr404(path[2]); if (team.status === "FINALIZED") throw new HttpError(409, "Season is finalized");
    const input = await body(request); const playerId = safeText(input.playerId, 100); const matchId = safeText(input.matchId, 100);
    if (typeof input.present !== "boolean") throw new HttpError(400, "Present must be true or false");
    if (!await first("SELECT player_id FROM roster WHERE team_season_id=? AND player_id=?", team.id, playerId)) throw new HttpError(404, "Roster member not found");
    if (!await first("SELECT id FROM matches WHERE id=? AND team_season_id=? AND status='COMPLETED'", matchId, team.id)) throw new HttpError(400, "Attendance requires a completed match");
    if (input.present) await run("INSERT OR IGNORE INTO attendance (team_season_id,match_id,player_id) VALUES (?,?,?)", team.id, matchId, playerId);
    else await run("DELETE FROM attendance WHERE team_season_id=? AND match_id=? AND player_id=?", team.id, matchId, playerId);
    await run("UPDATE roster SET games_played=(SELECT COUNT(*) FROM attendance WHERE attendance.team_season_id=roster.team_season_id AND attendance.player_id=roster.player_id) WHERE team_season_id=? AND player_id=?", team.id, playerId);
    return json({ playerId, matchId, present: input.present });
  }
  if (path[0] === "admin" && path[1] === "teams" && path[3] === "matches" && path[4]) {
    requireRole(actor, "admin", "treasurer"); const team = await teamOr404(path[2]); if (team.status === "FINALIZED") throw new HttpError(409, "Season is finalized");
    const match = await first<{ id: string }>("SELECT id FROM matches WHERE id=? AND team_season_id=?", path[4], team.id); if (!match) throw new HttpError(404, "Match not found");
    const input = await body(request); const status = safeText(input.status); if (!["SCHEDULED", "COMPLETED", "CANCELLED"].includes(status)) throw new HttpError(400, "Invalid match status");
    const playedDate = status === "COMPLETED" ? date(input.playedDate, "played date") : null;
    await run("UPDATE matches SET status=?,played_date=? WHERE id=?", status, playedDate, match.id);
    if (status === "COMPLETED") await run("INSERT OR IGNORE INTO system_expenses (id,team_season_id,match_id,category,amount_cents,created_at) VALUES (?,?,?,?,?,?)", `${match.id}-umpire`, team.id, match.id, "UMPIRE_FEE", team.umpire_fee_cents, now());
    else {
      await database().batch([
        database().prepare("DELETE FROM system_expenses WHERE id=?").bind(`${match.id}-umpire`),
        database().prepare("DELETE FROM attendance WHERE match_id=?").bind(match.id),
      ]);
      await run("UPDATE roster SET games_played=(SELECT COUNT(*) FROM attendance WHERE attendance.team_season_id=roster.team_season_id AND attendance.player_id=roster.player_id) WHERE team_season_id=?", team.id);
    }
    const latest = await first<{ last_date: string | null }>("SELECT MAX(played_date) AS last_date FROM matches WHERE team_season_id=? AND status='COMPLETED'", team.id);
    await run("UPDATE team_seasons SET claim_deadline=? WHERE id=?", latest?.last_date ? addMonths(latest.last_date, 3) : null, team.id);
    return json({ id: match.id, status, claimDeadline: latest?.last_date ? addMonths(latest.last_date, 3) : null });
  }
  if (path.join("/") === "claims") {
    const input = await body(request); const teamId = safeText(input.teamSeasonId, 100); const team = await teamOr404(teamId); await assertTeamAccess(actor, teamId);
    if (!actor.player_id || !await first("SELECT player_id FROM roster WHERE team_season_id=? AND player_id=?", teamId, actor.player_id)) throw new HttpError(403, "Only rostered players may claim");
    if (team.status === "FINALIZED" || (team.claim_deadline && clubToday() > team.claim_deadline)) throw new HttpError(409, "Claim window is closed");
    const amount = integer(input.amountCents, "amount", 1); const expenseDate = date(input.expenseDate, "expense date");
    if (expenseDate < team.season_start || expenseDate > team.season_end) throw new HttpError(400, "Expense date must be within the season");
    const payerId = safeText(input.payerId, 100) || actor.player_id;
    if (!await first("SELECT player_id FROM roster WHERE team_season_id=? AND player_id=?", teamId, payerId)) throw new HttpError(400, "Payer must be on this roster");
    const category = safeText(input.category, 80); const vendor = safeText(input.vendor, 120); const description = safeText(input.description, 500);
    if (!category || !vendor || !description) throw new HttpError(400, "Category, vendor, and description required");
    const id = uuid(); const created = now();
    await run("INSERT INTO claims (id,team_season_id,claimant_id,payer_id,category,vendor,description,expense_date,amount_cents,alcohol,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)", id, teamId, actor.player_id, payerId, category, vendor, description, expenseDate, amount, input.alcohol === true ? 1 : 0, "SUBMITTED", created, created);
    return json({ id, status: "SUBMITTED" }, 201);
  }
  if (path[0] === "claims" && path[2] === "receipt") {
    const claim = await claimOr404(path[1]); await assertTeamAccess(actor, claim.team_season_id);
    if (actor.role === "player" && actor.player_id !== claim.claimant_id) throw new HttpError(403, "Only the claimant can upload a receipt");
    if (["APPROVED", "REJECTED"].includes(claim.status)) throw new HttpError(409, "Claim is already decided");
    const form = await request.formData(); const file = form.get("file");
    if (!(file instanceof File) || !["image/png", "image/jpeg"].includes(file.type) || file.size < 1 || file.size > 5_000_000) throw new HttpError(400, "Use a PNG or JPEG receipt under 5 MB; PDF uploads are no longer accepted");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (file.type === "image/png" && bytes.slice(0, 4).join(",") !== "137,80,78,71") throw new HttpError(400, "Invalid PNG signature");
    if (file.type === "image/jpeg" && (bytes[0] !== 255 || bytes[1] !== 216)) throw new HttpError(400, "Invalid JPEG signature");
    const key = `receipts/${claim.team_season_id}/${claim.id}/${uuid()}`;
    await bucket().put(key, bytes, { httpMetadata: { contentType: file.type } });
    const extraction = await extractReceipt(bytes, file.type);
    await run("UPDATE claims SET receipt_key=?,receipt_name=?,receipt_type=?,receipt_extraction_json=?,status='SUBMITTED',updated_at=? WHERE id=?", key, safeText(file.name, 150), file.type, JSON.stringify(extraction), now(), claim.id);
    return json({ uploaded: true, extraction }, 201);
  }
  if (path[0] === "claims" && path[2] === "audit") {
    return json(await executeClaimAudit(path[1], actor));
  }
  if (path[0] === "claims" && path[2] === "decision") {
    requireRole(actor, "admin", "treasurer"); const claim = await claimOr404(path[1]);
    if (claim.status !== "NEEDS_REVIEW") throw new HttpError(409, "Claim is not waiting for a treasurer decision");
    const input = await body(request); const decision = safeText(input.decision); const reason = safeText(input.reason, 500);
    if (!["APPROVED", "REJECTED", "REQUEST_CLARIFICATION"].includes(decision) || !reason) throw new HttpError(400, "Decision and reason required");
    const approvedAmount = decision === "APPROVED" ? integer(input.approvedAmountCents ?? claim.amount_cents, "approved amount", 1) : null;
    if (approvedAmount !== null && approvedAmount > claim.amount_cents) throw new HttpError(400, "Approved amount cannot exceed submitted amount");
    const status = decision === "REQUEST_CLARIFICATION" ? "NEEDS_CLARIFICATION" : decision;
    await database().batch([
      database().prepare("UPDATE claims SET status=?,approved_amount_cents=?,decision_reason=?,updated_at=? WHERE id=?").bind(status, approvedAmount, reason, now(), claim.id),
      database().prepare("UPDATE audit_runs SET stage=?,resolved_at=? WHERE claim_id=? AND stage='WAITING_FOR_TREASURER'").bind(decision === "REQUEST_CLARIFICATION" ? "WAITING_FOR_PLAYER" : "COMPLETE", decision === "REQUEST_CLARIFICATION" ? null : now(), claim.id),
    ]);
    return json({ id: claim.id, status, approvedAmountCents: approvedAmount });
  }
  if (path[0] === "claims" && path[2] === "resubmit") {
    const claim = await claimOr404(path[1]); await assertTeamAccess(actor, claim.team_season_id);
    if (actor.player_id !== claim.claimant_id) throw new HttpError(403, "Only the claimant may resubmit");
    if (claim.status !== "NEEDS_CLARIFICATION") throw new HttpError(409, "Claim is not waiting for clarification");
    const team = await teamOr404(claim.team_season_id); if (team.status === "FINALIZED") throw new HttpError(409, "Season is finalized");
    const input = await body(request); const amount = integer(input.amountCents, "amount", 1); const expenseDate = date(input.expenseDate, "expense date");
    if (expenseDate < team.season_start || expenseDate > team.season_end) throw new HttpError(400, "Expense date must be within the season");
    const payerId = safeText(input.payerId, 100);
    if (!await first("SELECT player_id FROM roster WHERE team_season_id=? AND player_id=?", team.id, payerId)) throw new HttpError(400, "Payer must be on this roster");
    const category = safeText(input.category, 80); const vendor = safeText(input.vendor, 120); const description = safeText(input.description, 500);
    if (!category || !vendor || !description) throw new HttpError(400, "Category, vendor, and description required");
    await database().batch([
      database().prepare("INSERT INTO claim_revisions (id,claim_id,revision,snapshot_json,recorded_by,recorded_at) VALUES (?,?,?,?,?,?)").bind(uuid(), claim.id, claim.revision, JSON.stringify(claim), actor.user_id, now()),
      database().prepare("UPDATE claims SET revision=revision+1,payer_id=?,category=?,vendor=?,description=?,expense_date=?,amount_cents=?,alcohol=?,status='SUBMITTED',receipt_key=NULL,receipt_name=NULL,receipt_type=NULL,receipt_extraction_json=NULL,route=NULL,findings_json='[]',policy_citations_json='[]',approved_amount_cents=NULL,decision_reason=NULL,updated_at=? WHERE id=?").bind(payerId, category, vendor, description, expenseDate, amount, input.alcohol === true ? 1 : 0, now(), claim.id),
      database().prepare("UPDATE audit_runs SET stage='SUPERSEDED',resolved_at=? WHERE claim_id=? AND stage='WAITING_FOR_PLAYER'").bind(now(), claim.id),
    ]);
    return json({ id: claim.id, revision: claim.revision + 1, status: "SUBMITTED" });
  }
  if (path[0] === "teams" && path[2] === "finalize") {
    requireRole(actor, "admin", "treasurer"); const team = await teamOr404(path[1]);
    if (team.status === "FINALIZED") throw new HttpError(409, "Already finalized");
    if (!team.claim_deadline || clubToday() <= team.claim_deadline) throw new HttpError(409, "Cannot finalize until after the claim deadline");
    const pending = await first<{ n: number }>("SELECT COUNT(*) AS n FROM claims WHERE team_season_id=? AND status NOT IN ('APPROVED','REJECTED')", team.id);
    if (pending?.n) throw new HttpError(409, "Resolve every claim before finalization");
    const preview = await settlementPreview(actor, team.id); const id = uuid();
    await database().batch([
      database().prepare("INSERT INTO settlements (id,team_season_id,status,total_pool_cents,rows_json,created_by,created_at) VALUES (?,?,?,?,?,?,?)").bind(id, team.id, "FINALIZED", preview.totalPoolCents, JSON.stringify(preview.rows), actor.user_id, now()),
      database().prepare("UPDATE team_seasons SET status='FINALIZED' WHERE id=?").bind(team.id),
    ]);
    return json({ id, status: "FINALIZED", totalPoolCents: preview.totalPoolCents, rows: preview.rows });
  }
  if (path.join("/") === "qa") {
    const input = await body(request); const question = safeText(input.question, 500);
    if (!question) throw new HttpError(400, "Question required");
    return json({ ...await runPolicyQuestion(question), source: "synthetic Eagles MVP policy" });
  }
  throw new HttpError(404, "Route not found");
}

async function handle(request: NextRequest, context: Context): Promise<Response> {
  try { const actor = await actorFor(request); const { path } = await context.params; return await dispatch(request, path, actor); }
  catch (error) { return fail(error); }
}
export const GET = handle;
export const POST = handle;
