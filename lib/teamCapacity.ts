import { cycleToWeekly, normalize } from "@/lib/capacityUnits";

/**
 * Sum members' capacity as total weekly capacity (canonical unit).
 */
export function getTotalWeeklyCapacityFromMembers(
  members: { hours_per_cycle: number }[]
): number {
  const total = (members ?? []).reduce(
    (sum, m) => sum + cycleToWeekly(Number(m.hours_per_cycle ?? 0)),
    0
  );
  return normalize(total);
}

/**
 * Weekly available capacity after reserved (structural) capacity.
 * When reserved is disabled, returns totalWeekly.
 */
export function getWeeklyAvailableCapacity(
  totalWeekly: number,
  reservedWeekly: number,
  enabled: boolean
): number {
  if (!enabled || reservedWeekly <= 0) return normalize(totalWeekly);
  return normalize(Math.max(0, totalWeekly - reservedWeekly));
}

/**
 * Total capacity for a horizon of N weeks (weekly available × weeks).
 */
export function getTotalCapacityForHorizonWeeks(
  weeklyAvailable: number,
  weeks: number
): number {
  if (!Number.isFinite(weeks) || weeks < 0) return 0;
  return normalize(weeklyAvailable * weeks);
}
