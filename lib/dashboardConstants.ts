// Shared UI constants and helpers for dashboard and evaluate screens.
// Single source of truth for exposure bucket display (DRY).

export type Bucket = "low" | "medium" | "high";

/**
 * Committed hours as a percentage of capacity, unrounded.
 *
 * Zero capacity yields 0, not NaN: a team with no confirmed hours is a real
 * state (before onboarding finishes, or with every member's schedule empty),
 * and the unguarded division rendered "NaN%" on the dashboard.
 */
export function utilizationPct(
  committedHours: number,
  capacityHours: number
): number {
  if (!(capacityHours > 0)) return 0;
  return (committedHours / capacityHours) * 100;
}

/** Single source of truth: map utilization % to exposure bucket. */
export function exposureBucketFromUtilization(pct: number): Bucket {
  if (pct < 80) return "low";
  if (pct <= 90) return "medium";
  return "high";
}

/** View key to human-readable label. */
export type ViewKey = "month" | "4w" | "12w" | "quarter" | "6m";

/** Stable order for selects and URL parsing fallbacks. */
export const VIEW_ORDER: ViewKey[] = ["month", "4w", "12w", "quarter", "6m"];

export const VIEW_LABELS: Record<ViewKey, string> = {
  month: "Current month",
  "4w": "Next 4 weeks",
  "12w": "Next 12 weeks",
  quarter: "Current Quarter",
  "6m": "6 months",
};

export function getViewLabel(view: ViewKey): string {
  return VIEW_LABELS[view];
}

/** Tailwind classes for exposure bar fill by bucket. */
export const EXPOSURE_BAR_FILL: Record<Bucket, string> = {
  low: "bg-emerald-600",
  medium: "bg-amber-600",
  high: "bg-rose-600",
};

/** Badge style classes for exposure (e.g. LOW / MEDIUM / HIGH). */
export const EXPOSURE_BADGE_STYLES: Record<Bucket, string> = {
  low: "bg-emerald-600/10 text-emerald-700 border-emerald-600/20",
  medium: "bg-amber-600/10 text-amber-700 border-amber-600/20",
  high: "bg-rose-600/10 text-rose-700 border-rose-600/20",
};

export function exposureBucketLabel(bucket: Bucket): string {
  return bucket === "low" ? "LOW" : bucket === "medium" ? "MEDIUM" : "HIGH";
}
