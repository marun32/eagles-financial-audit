export type AllocationPlayer = { id: string; name: string; gamesPlayed: number; creditCents: number };
export type SettlementRow = AllocationPlayer & { multiplier: number; weightedUnits: number; chargeCents: number; balanceCents: number };

export const DEFAULT_MULTIPLIERS = [0, 0.5, 0.75, 0.75, 1, 1, 1, 1.25, 1.25, 1.25, 1.25];

export function allocate(poolCents: number, players: AllocationPlayer[], multipliers: number[] = DEFAULT_MULTIPLIERS): SettlementRow[] {
  if (!Number.isSafeInteger(poolCents) || poolCents < 0) throw new Error("Invalid expense pool");
  const units = players.map((p) => {
    const multiplier = multipliers[p.gamesPlayed];
    if (!Number.isFinite(multiplier) || multiplier < 0) throw new Error("No valid multiplier for games played");
    const weightedUnits = Math.round(p.gamesPlayed * multiplier * 100);
    return { ...p, multiplier, weightedUnits };
  });
  const totalUnits = units.reduce((sum, p) => sum + p.weightedUnits, 0);
  if (totalUnits <= 0) throw new Error("At least one player must have weighted appearances");
  const shares = units.map((p) => ({ ...p, numerator: poolCents * p.weightedUnits, chargeCents: Math.floor(poolCents * p.weightedUnits / totalUnits) }));
  let remaining = poolCents - shares.reduce((sum, p) => sum + p.chargeCents, 0);
  const order = shares.map((p, index) => ({ index, remainder: p.numerator % totalUnits, id: p.id }))
    .sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  for (const item of order) {
    if (remaining-- <= 0) break;
    shares[item.index].chargeCents++;
  }
  return shares.map(({ numerator: _numerator, ...p }) => ({ ...p, weightedUnits: p.weightedUnits / 100, balanceCents: p.chargeCents - p.creditCents }));
}

export function addMonths(date: string, months: number): string {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) throw new Error("Invalid date");
  const first = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(day, lastDay)).padStart(2, "0")}`;
}

export function clubToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
