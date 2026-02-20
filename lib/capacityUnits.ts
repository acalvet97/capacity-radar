/**
 * Canonical capacity unit is hours per week.
 * DB stores hours_per_cycle for a fixed 4-week cycle.
 */

export const BASE_WEEKS_PER_CYCLE = 4;

/**
 * Convert cycle capacity (hours per 4-week cycle) to weekly capacity.
 */
export function cycleToWeekly(hoursPerCycle: number): number {
  if (!Number.isFinite(hoursPerCycle) || hoursPerCycle < 0) return 0;
  return normalize(hoursPerCycle / BASE_WEEKS_PER_CYCLE);
}

/**
 * Convert weekly capacity to cycle capacity (hours per 4-week cycle) for DB storage.
 */
export function weeklyToCycle(hoursPerWeek: number): number {
  if (!Number.isFinite(hoursPerWeek) || hoursPerWeek < 0) return 0;
  return normalize(hoursPerWeek * BASE_WEEKS_PER_CYCLE);
}

/**
 * Round to avoid float artifacts (2 decimal places).
 */
export function normalize(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}
