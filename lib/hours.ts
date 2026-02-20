/**
 * Minimum allowed hours for work items (product disallows zero-hour items).
 */
const MIN_HOURS = 0.5;

/** All hours inputs use 0.5 increments (step=0.5). */
export const HOURS_STEP = 0.5;

/**
 * Round a number to the nearest 0.5.
 * Uses integer math to avoid floating-point issues.
 * Tie-break: exactly between two multiples (e.g. 3.25) rounds up (to 3.5).
 */
export function roundToHalfHour(value: number): number {
  if (!Number.isFinite(value)) return MIN_HOURS;
  const halfUnits = value * 2; // convert to "half-hour" units
  const roundedUnits = Math.floor(halfUnits + 0.5); // tie goes up
  const rounded = roundedUnits / 2;
  return Math.max(0, rounded);
}

/**
 * Parse raw input (string or number), round to 0.5h, and clamp to minimum.
 * Returns MIN_HOURS for NaN, empty, or invalid input.
 */
export function sanitizeHoursInput(raw: string | number): number {
  const num = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (!Number.isFinite(num)) return MIN_HOURS;
  const rounded = roundToHalfHour(num);
  return Math.max(MIN_HOURS, rounded);
}

/**
 * Like sanitizeHoursInput but allows 0 (e.g. for team capacity or reserved capacity when disabled).
 * Rounds to nearest 0.5; returns 0 for NaN/empty/invalid or negative.
 */
export function sanitizeHoursInputAllowZero(raw: string | number): number {
  const num = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (!Number.isFinite(num) || num < 0) return 0;
  return roundToHalfHour(num);
}

/**
 * Format hours for display (0.5h increments). Rounds to nearest 0.5 then shows
 * without trailing .0 (e.g. 3.5 → "3.5", 3 → "3").
 */
export function formatHoursForDisplay(hours: number): string {
  if (!Number.isFinite(hours)) return "0";
  const rounded = roundToHalfHour(hours);
  return rounded % 1 === 0 ? String(Math.round(rounded)) : String(rounded);
}
